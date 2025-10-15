import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../lib/db.js";

const ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || "15m";
const REFRESH_TOKEN_TLL_DAYS = Number(process.env.REFRESH_TOKEN_TLL_DAYS || 30);

//takes some input and returns its SHA-256 hash in hexadecimal format
function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

//generates a random token of 48 bytes
function makeRandomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("hex");
}

//generate the access token
export function generateAccessToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role || "user",
  };

  return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES,
  });
}
//verify access token
export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

//create and store refresh token
export async function generateRefreshToken(user, meta = {}) {
  const raw = makeRandomToken();

  const tokenHash = sha256Hex(raw);

  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TLL_DAYS * 24 * 60 * 60 * 1000
  );

  await db.refreshToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt,
      revoked: false,
      userAgent: meta.userAgent || null,
      ipAddress: meta.ip || null,
    },
  });

  return raw;
}

//verify refresh token
export async function verifyRefreshToken(raw) {
  if (!raw) return null;

  const tokenHash = sha256Hex(raw);
  const rec = await db.refreshToken.findFirst({
    where: {
      tokenHash,
      revoked: false,
      expiresAt: { gte: new Date() },
    },
    include: { user: true },
  });

  return rec || null;
}

//rotate refresh token
export async function rotateRefreshToken(oldRaw, meta = {}) {
  const oldHash = sha256Hex(oldRaw);

  return await db.$transaction(async (tx) => {
    await tx.refreshToken.updateMany({
      where: {
        tokenHash: oldHash,
        revoked: false,
      },
      data: {
        revoked: true,
      },
    });

    const newRaw = makeRandomToken(48);
    const newhash = sha256Hex(newRaw);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TLL_DAYS * 24 * 60 * 60 * 1000
    );

    await tx.refreshToken.create({
      data: {
        tokenHash: newhash,
        userId: meta.userId,
        expiresAt,
        revoked: false,
        userAgent: meta.userAgent || null,
        ipAddress: meta.ip || null,
      },
    });

    return newRaw;
  });
}

//cookie options for refresh token
export function refreshTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_TOKEN_TLL_DAYS * 24 * 60 * 60 * 1000, // in milliseconds
  };
}
