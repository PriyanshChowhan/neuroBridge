import express from "express";

import verifyJwt from "../middleware/logout.auth.js";
import DailyData from "../models/DailyData.js";

const router = express.Router();
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_HISTORY_DAYS = 183;

router.use(verifyJwt);

function requestedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function historyStart(value) {
  if (!value) return new Date(Date.now() - DEFAULT_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

router.get("/", async (req, res) => {
  try {
    const data = await DailyData.find({ userId: String(req.user._id) })
      .sort({ timestamp: -1 })
      .limit(requestedLimit(req.query.limit));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/latest", async (req, res) => {
  try {
    const doc = await DailyData.findOne({ userId: String(req.user._id) }).sort({
      timestamp: -1,
    });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/aggregate", async (req, res) => {
  try {
    const allowedPeriods = new Set(["weekly", "monthly", "quarterly"]);
    const period = allowedPeriods.has(req.query.period) ? req.query.period : "monthly";
    const unit = { weekly: "week", monthly: "month", quarterly: "quarter" }[period];
    const from = historyStart(req.query.from);
    if (!from) {
      return res.status(400).json({ success: false, error: "Invalid from date" });
    }

    const result = await DailyData.aggregate([
      {
        $match: {
          userId: String(req.user._id),
          timestamp: { $gte: from },
        },
      },
      {
        $project: {
          bucket: { $dateTrunc: { date: "$timestamp", unit, timezone: "UTC" } },
          day: { $dateTrunc: { date: "$timestamp", unit: "day", timezone: "UTC" } },
          timestamp: 1,
          sleepDuration: "$sleep.duration",
          energy: "$energy_score",
          calories: "$nutrition.calories",
          water: "$water_intake",
        },
      },
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id: { bucket: "$bucket", day: "$day" },
          sleepDuration: { $last: "$sleepDuration" },
          energy: { $last: "$energy" },
          calories: { $last: "$calories" },
          water: { $last: "$water" },
        },
      },
      {
        $group: {
          _id: "$_id.bucket",
          avgSleepDuration: { $avg: "$sleepDuration" },
          avgEnergy: { $avg: "$energy" },
          avgCalories: { $avg: "$calories" },
          totalWater: { $sum: "$water" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
