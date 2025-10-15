import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import userRoutes from "./user/userRoutes.js";
import authRoutes from "./auth/authRoutes.js";
import passwordRoutes from "./reset-password/passwordRoute.js";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        process.env.FRONTEND_URL,
        "https://authenticationclient.vercel.app",
        "http://localhost:3000", // for local development
      ].filter(Boolean); // Remove any undefined values

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
      "X-Requested-With",
    ],
    exposedHeaders: ["Set-Cookie"],
  })
);

app.use(express.json());
app.use(cookieParser());

app.use((err, req, res, next) => {
  console.error("Global error:", err);
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS policy violation" });
  }
  res.status(500).json({ error: "Internal server error" });
});

app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/password", passwordRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(4000, () => {
  console.log("Server listening on http://localhost:4000");
  console.log(
    "Allowed origins:",
    process.env.FRONTEND_URL || "https://authenticationclient.vercel.app"
  );
});
