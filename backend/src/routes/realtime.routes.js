import express from "express";

import verifyJwt from "../middleware/logout.auth.js";
import RealtimeData from "../models/RealtimeData.js";

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
    const data = await RealtimeData.find({ userId: String(req.user._id) })
      .sort({ timestamp: -1 })
      .limit(requestedLimit(req.query.limit));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/latest", async (req, res) => {
  try {
    const doc = await RealtimeData.findOne({ userId: String(req.user._id) }).sort({
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
    const period = allowedPeriods.has(req.query.period) ? req.query.period : "weekly";
    const unit = { weekly: "week", monthly: "month", quarterly: "quarter" }[period];
    const from = historyStart(req.query.from);
    if (!from) {
      return res.status(400).json({ success: false, error: "Invalid from date" });
    }

    const result = await RealtimeData.aggregate([
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
          heart_rate: 1,
          stress_level: 1,
          steps: { $ifNull: ["$steps", 0] },
          calories_burned: { $ifNull: ["$calories_burned", 0] },
        },
      },
      {
        $group: {
          _id: { bucket: "$bucket", day: "$day" },
          heartRateSum: { $sum: "$heart_rate" },
          stressSum: { $sum: "$stress_level" },
          totalSteps: { $max: "$steps" },
          totalCaloriesBurned: { $max: "$calories_burned" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.bucket",
          heartRateSum: { $sum: "$heartRateSum" },
          stressSum: { $sum: "$stressSum" },
          totalSteps: { $sum: "$totalSteps" },
          totalCaloriesBurned: { $sum: "$totalCaloriesBurned" },
          count: { $sum: "$count" },
        },
      },
      {
        $project: {
          avgHeartRate: { $divide: ["$heartRateSum", "$count"] },
          avgStress: { $divide: ["$stressSum", "$count"] },
          totalSteps: 1,
          totalCaloriesBurned: 1,
          count: 1,
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
