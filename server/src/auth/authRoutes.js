import express from "express";
import {
  logoutUser,
  refreshAccessToken,
  handleGoogleOAuth,
  handleGitHubOAuth,
} from "./authController.js";

const router = express.Router();

router.post("/google", handleGoogleOAuth);
router.post("/github", handleGitHubOAuth);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logoutUser);

export default router;
