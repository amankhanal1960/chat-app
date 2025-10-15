import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || null;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || null;
const SMTP_PASS = process.env.SMTP_PASS || null;
const FROM = "Authentication_js <amankhanal1960@gmail.com>";
const APP_NAME = process.env.APP_NAME || "Authentication Service";
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 15;
const APP_URL =
  process.env.FRONTEND_URL || "https://authenticationclient.vercel.app";

const escapeHtml = (unsafe) => {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    connectionTimeout: 5000, // 5 seconds
    socketTimeout: 10000, // 10 seconds
  });
} else {
  console.warn("SMTP configuration is incomplete. Emails will not be sent.");
}

export async function sendOTPEmail(email, otp, options = {}) {
  const { name } = options;
  const safeName = escapeHtml(name || "User");
  const safeOtp = escapeHtml(otp);

  try {
    const subject = `${APP_NAME} - Your OTP Code`;

    const html = `<div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #2563eb;">Hello ${safeName},</h2>
        <p>Your verification code is:</p>
        <div style="
          font-size: 24px; 
          font-weight: bold;
          letter-spacing: 2px;
          padding: 15px;
          background: #f3f4f6;
          border-radius: 8px;
          display: inline-block;
          margin: 10px 0;
        ">
          ${safeOtp}
        </div>
        <p>This code will expire in ${OTP_EXPIRY_MINUTES} minutes.</p>
        <p><em>If you didn't request this, please ignore this email.</em></p>
      </div>`;

    const text =
      `Hello ${safeName},\n\n` +
      `Your verification code is: ${otp}\n\n` +
      `This code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\n` +
      `If you didn't request this, please ignore this email.`;

    if (!transporter) {
      console.log("Email transporter is not configured. Cannot send email.");
      return;
    }

    await transporter.sendMail({
      from: FROM,
      to: email,
      subject,
      text,
      html,
    });

    return true;
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return false;
  }
}

export async function sendVerificationSuccessEmail(email, options = {}) {
  const { name } = options;
  const safeName = escapeHtml(name) || "User";
  const safeEmail = escapeHtml(email);
  const loginUrl = `${APP_URL}/login`;

  try {
    const subject = `${APP_NAME} - Email Verified Successfully`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #2563eb;">Congratulations ${safeName}!</h2>
        <p>Your email <strong>${safeEmail}</strong> has been successfully verified.</p>
        <p>You can now access all features of ${APP_NAME}.</p>
        <a href="${loginUrl}" 
          style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 15px 0;
          ">
          Login to Your Account
        </a>
        <p>Or copy this link to your browser:<br>
        <a href="${loginUrl}">${loginUrl}</a></p>
      </div>
    `;

    const text =
      `Hello ${safeName},\n\n` +
      `Your email ${email} has been successfully verified.\n\n` +
      `You can now login at: ${loginUrl}`;

    if (!transporter) {
      console.log(`[DEV EMAIL] Verification success for ${email}`);
      return true;
    }

    await transporter.sendMail({
      from: FROM,
      to: email,
      subject,
      text,
      html,
    });

    return true;
  } catch (err) {
    console.error("sendVerificationSuccessEmail error:", err);
    return false;
  }
}

export async function sendPasswordResetEmail(email, resetUrl, options = {}) {
  const { name } = options;
  const safeName = escapeHtml(name) || "User";
  const { ttlMinutes } = options;
  const safeEmail = escapeHtml(email);
  const safeResetUrl = escapeHtml(resetUrl);
  const ttl = ttlMinutes || OTP_EXPIRY_MINUTES || 60;

  try {
    const subject = `${APP_NAME} - Password Reset Request`;

    const html = ` <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #2563eb;">Hello ${safeName},</h2>
        
        <p>We received a request to reset the password for <strong>${safeEmail}</strong>.</p>
        <p>
          Click the button below to reset your password. This link is valid for ${ttl} minutes.
        </p>
        <p>
          <a href="${safeResetUrl}" style="
              display: inline-block;
              padding: 12px 24px;
              background-color: #2563eb;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              font-weight: bold;
          ">Reset password</a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${safeResetUrl}">${safeResetUrl}</a></p>
        <p><em>If you didn't request this, just ignore this email — no changes were made.</em></p>
      </div>
    `;

    const text =
      `You requested a password reset for ${safeEmail}.\n\n` +
      `Open this link to reset your password (valid for ${ttl} minutes):\n\n` +
      `${resetUrl}\n\n` +
      `If you did not request this, ignore this email.`;

    if (!transporter) {
      console.log(`[DEV EMAIL] Password reset for ${email}: ${resetUrl}`);
      return true;
    }

    await transporter.sendMail({
      from: FROM,
      to: email,
      subject,
      text,
      html,
    });

    return true;
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return false;
  }
}

export async function sendPasswordChangeConfirmationEmail(email, options = {}) {
  const { name } = options;
  const safeName = escapeHtml(name) || "User";
  const safeEmail = escapeHtml(email);
  const loginUrl = `${APP_URL}/auth/login`;

  try {
    const subject = `${APP_NAME} - Your password was changed`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">

        <h2 style="color: #2563eb;">Hi ${safeName},</h2>

        <p>Your password for <strong>${safeEmail}</strong> has just been changed.</p>

        <p>If you made this change, you can safely ignore this email. If you did NOT change your password, please reset it immediately and contact support.</p>
        <p>
          <a href="${loginUrl}" style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
          ">Login</a>
        </p>
      </div>
    `;

    const text =
      `Hello ${safeName},\n\n` +
      `Your password for ${safeEmail} was changed. If this was not you, reset your password immediately or contact support.\n\n` +
      `Login: ${loginUrl}`;

    if (!transporter) {
      console.log(`[DEV EMAIL] Password-change confirmation for ${email}`);
      return true;
    }

    await transporter.sendMail({
      from: FROM,
      to: email,
      subject,
      text,
      html,
    });

    return true;
  } catch (err) {
    console.error("sendPasswordChangeConfirmationEmail error:", err);
    return false;
  }
}

if (transporter) {
  transporter.verify((error) => {
    if (error) {
      console.error("SMTP connection error:", error);
    } else {
      console.log("SMTP server is ready to send emails");
    }
  });
}
