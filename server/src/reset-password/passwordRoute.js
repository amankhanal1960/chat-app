import express from "express";
import { requestPasswordReset, resetPassword } from "./passwordController.js";

const router = express.Router();

router.post("/request-password-reset", requestPasswordReset);
router.post("/reset", resetPassword);

export default router;
