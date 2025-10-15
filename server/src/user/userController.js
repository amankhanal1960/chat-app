import bcrypt from "bcrypt";
import crypto from "crypto";
import db from "../lib/db.js";
import {
  sendOTPEmail,
  sendVerificationSuccessEmail,
} from "../services/emailService.js";
import {
  generateAccessToken,
  generateRefreshToken,
  refreshTokenCookieOptions,
} from "../utils/tokens.js";
import { createSession } from "../utils/session.js";

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 15;
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
const MAX_OTP_ATTEMPTS = 5;

function makeOtp() {
  const buffer = crypto.randomBytes(4); // <--- first (and only) arg is number of bytes
  const hex = buffer.toString("hex");
  const num = parseInt(hex, 16);
  const otp = (num % 1_000_000).toString().padStart(6, "0"); // 6 digits
  return otp;
}

// Generate OTP and store it in the database
export async function generateOTP(userId, email, options = {}) {
  const { name } = options;
  const normalizedEmail = email.toLowerCase();
  const otp = makeOtp();

  const otpHash = await bcrypt.hash(otp, BCRYPT_SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  await db.emailOTP.create({
    data: {
      email: normalizedEmail,
      otpHash,
      expiresAt,
      userId,
    },
  });

  //send email with the OTP
  await sendOTPEmail(normalizedEmail, otp, { name });

  return otp;
}

// Register a new user
export async function registerUser(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required!" });
    }
    const normalizedEmail = email.toLowerCase();

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.$transaction(async (tx) => {
      const newUser = await db.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: hashedPassword,
          isEmailVerified: false,
        },
      });

      await tx.account.create({
        data: {
          provider: "credentials",
          providerAccountId: newUser.email,
          userId: newUser.id,
        },
      });
      return newUser;
    });

    //send OTp outside the transaction
    try {
      await generateOTP(result.id, result.email, { name: result.name });
    } catch (emailError) {
      console.error("Failed to send the OTP email:", emailError);

      await db.emailOTP.updateMany({
        where: { userId: result.id, used: false, revoked: false },
        data: { revoked: true },
      });

      return res.status(500).json({ error: "Failed to send OTP email" });
    }
    return res.status(201).json({
      message:
        "User registered successfully! Please check your email for the OTP.",
      user: { id: result.id, email: result.email },
    });
  } catch (err) {
    if (
      err &&
      err.code === "P2002" &&
      err.meta &&
      err.meta.target?.includes("email")
    ) {
      return res.status(409).json({ error: "User already exists" });
    }
    console.error("Registration error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Generate OTP for email verification
export async function verifyEmailOTP(req, res) {
  try {
    const { otp, email, userId } = req.body;
    console.log("REQ BODY RECEIVED:", req.body);
    if (!otp || !email || !userId) {
      return res
        .status(400)
        .json({ error: "OTP, email, and userId are required!" });
    }

    const normalizedEmail = email.toLowerCase();

    const OTPRecord = await db.emailOTP.findFirst({
      where: {
        email: normalizedEmail,
        userId: userId,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!OTPRecord) {
      return res.status(400).json({ error: "Invalid or expired OTP!" });
    }

    if (OTPRecord.attempts >= MAX_OTP_ATTEMPTS) {
      return res
        .status(429)
        .json({ error: "Too many failed attempts. Request a new OTP." });
    }

    const isValid = await bcrypt.compare(otp, OTPRecord.otpHash);
    if (!isValid) {
      //Track failed attempts
      await db.emailOTP.update({
        where: { id: OTPRecord.id },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ error: "Invalid OTP!" });
    }

    await db.$transaction([
      db.emailOTP.update({
        where: { id: OTPRecord.id },
        data: { used: true, attempts: 0 }, // Mark as used and reset attempts
      }),
      db.user.update({
        where: { id: userId },
        data: { isEmailVerified: true },
      }),
    ]);

    //get the user details
    const user = await db.user.findUnique({
      where: { id: userId },

      select: { name: true, email: true },
    });

    try {
      await sendVerificationSuccessEmail(user.email, { name: user.name });
    } catch (mailErr) {
      console.error("Failed to send verification success email:", mailErr);
    }

    return res.status(200).json({ message: "Email verified successfully!" });
  } catch (err) {
    console.error("Email verification error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Resend OTP for email verification
export async function resendVerifyEmailOTP(req, res) {
  try {
    const { email, userId } = req.body;

    if (!email || !userId) {
      return res.status(400).json({ error: "Email and userId are required!" });
    }
    const normalizedEmail = email.toLowerCase();
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found!" });
    }
    if (user.isEmailVerified) {
      return res.status(400).json({ error: "Email already verified!" });
    }

    await db.emailOTP.updateMany({
      where: { email: normalizedEmail, userId, used: false, revoked: false },
      data: { revoked: true },
    });

    await generateOTP(user.id, user.email, { name: user.name });

    return res.status(200).json({ message: "New OTP sent successfully!" });
  } catch (err) {
    console.error("Resend OTP error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Login user
export async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required!" });
    }

    const normalizedEmail = email.toLowerCase();

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.password) {
      return res.status(404).json({ error: "Invalid email or password." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        error: "Email not verified. Please verify your email first.",
      });
    }

    const meta = {
      userAgent: req.get("User-Agent") || null,
      ip: req.ip || req.headers["x-forwarded-for"] || null,
    };

    const refreshTokenRaw = await generateRefreshToken(user, meta);

    const accessToken = generateAccessToken(user);

    createSession(user, res);

    res.cookie("refreshToken", refreshTokenRaw, refreshTokenCookieOptions());

    return res.status(200).json({
      message: "Login successful",
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isEmailVerified: !!user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
