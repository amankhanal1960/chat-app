import express from "express";
import {
  registerUser,
  verifyEmailOTP,
  resendVerifyEmailOTP,
  loginUser,
} from "./userController.js";
// import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/verify-otp", verifyEmailOTP);
router.post("/resend-otp", resendVerifyEmailOTP);
router.post("/login", loginUser);

// router.get("/dashboard", requireAuth, async (req, res) => {
//   res.json({ user: req.user });
// });

export default router;
