import express from "express";

import {
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  updateCurrentUser,
} from "../controllers/user.controllers.js";
import verifyJwt from "../middleware/logout.auth.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", verifyJwt, logoutUser);
router.get("/me", verifyJwt, getCurrentUser);
router.patch("/me", verifyJwt, updateCurrentUser);

export default router;
