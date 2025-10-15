import crypto from "crypto";
import bcrypt from "bcrypt";
import {
  sendPasswordChangeConfirmationEmail,
  sendPasswordResetEmail,
} from "../services/emailService.js";
import db from "../lib/db.js";

const RESET_TOKEN_TTL_MINUTES = 60;

export async function requestPasswordReset(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.toLowerCase();

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    if (user) {
      await db.passwordReset.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      await db.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          used: false,
          userAgent: req.get("User-Agent") || null,
          ipAddress:
            (req.headers["x-forwarded-for"] || req.ip || "")
              .toString()
              .split(",")[0]
              .trim() || null,
        },
      });

      const frontend = "https://authenticationclient.vercel.app";
      const resetUrl = `${frontend.replace(
        /\/$/,
        ""
      )}/reset-password?token=${encodeURIComponent(
        rawToken
      )}&email=${encodeURIComponent(normalizedEmail)}`;

      const displayName =
        (user?.name && String(user.name).trim()) ||
        (user?.email ? user.email.split("@")[0] : "User");

      try {
        await sendPasswordResetEmail(normalizedEmail, resetUrl, {
          ttlMinutes: RESET_TOKEN_TTL_MINUTES,
          name: displayName,
        });
      } catch (error) {
        console.error("Error sending password reset email:", error);
      }

      if (!process.env.SMTP_HOST) {
        console.log(
          `[DEV] Password reset token for ${normalizedEmail}: ${rawToken} (valid ${RESET_TOKEN_TTL_MINUTES}m)`
        );
      }
    }

    return res.json({
      message: "If that email is registered, a reset link has been sent.",
    });
  } catch (error) {
    console.error("requestPasswordReset error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ error: "Token and new password are required" });
    }

    if (String(newPassword).length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters long" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const resetRecord = await db.passwordReset.findFirst({
      where: { tokenHash },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    if (
      !resetRecord ||
      resetRecord.used ||
      resetRecord.expiresAt < new Date()
    ) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const user = resetRecord.user;

    if (!user) {
      return res.status(400).json({ error: "Invalid token" });
    }

    const newHashed = await bcrypt.hash(newPassword, 10);

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { password: newHashed },
      }),
      db.passwordReset.update({
        where: { id: resetRecord.id },
        data: { used: true },
      }),
      db.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true },
      }),
    ]);

    try {
      await sendPasswordChangeConfirmationEmail(user.email, {
        name: user.name,
      });
    } catch (mailerror) {
      console.error(
        "Failed to send password change confirmation email:",
        mailerror
      );
    }

    return res.json({
      message:
        "password has been reset successfully. Please login with your new password.",
    });
  } catch (error) {
    console.error("resetPassword error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
