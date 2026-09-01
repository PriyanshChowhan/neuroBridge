import express from "express";

import { updatePersonalDetails } from "../controllers/personal.controllers.js";
import verifyJwt from "../middleware/logout.auth.js";
import { Personal } from "../models/Personal.js";

const router = express.Router();

router.use(verifyJwt);

router.get("/", async (req, res) => {
  try {
    const personal = await Personal.findOne({ userId: req.user._id });
    res.json({ success: true, personal: personal ? [personal] : [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/me", async (req, res) => {
  try {
    const personal = await Personal.findOne({ userId: req.user._id });
    if (!personal) {
      return res.status(404).json({ success: false, message: "Personal details not found" });
    }
    return res.json({ success: true, data: personal });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/", updatePersonalDetails);
router.put("/me", updatePersonalDetails);

export default router;
