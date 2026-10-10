const express = require("express");
const cors = require("cors");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
require("dotenv").config();

const connectDB = require("./config/database");
const localStore = require("./services/localStore");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const frontendDirectory = path.join(__dirname, "..");
const trustProxyHops = process.env.TRUST_PROXY_HOPS === undefined
  ? (process.env.NODE_ENV === "production" ? 1 : 0)
  : Number(process.env.TRUST_PROXY_HOPS);

if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
}

app.disable("x-powered-by");
app.set("trust proxy", trustProxyHops);

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    const allowed = !origin || process.env.NODE_ENV !== "production" || allowedOrigins.includes(origin);
    callback(null, allowed);
  }
}));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production" && req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.sendFile(path.join(frontendDirectory, "index.html"));
  }
  res.json({ message: "Loopnex backend is running!", docs: "/api/health" });
});

app.get("/api/health", (req, res) => {
  const mongoose = require("mongoose");
  if (localStore.isLocalMode()) {
    return res.json({ status: "ok", database: "local file storage", shared: false });
  }
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "database_unavailable",
    database: connected ? "connected" : "disconnected"
  });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/listings", require("./routes/listings"));
app.use("/api/transactions", require("./routes/transactions"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/feedback", require("./routes/feedback"));
app.use("/api/ai", require("./routes/ai"));

// Serve the frontend from the same origin in production so its API requests
// use this deployed backend without a laptop-specific localhost URL.
const frontendFiles = {
  "/": "index.html",
  "/index.html": "index.html",
  "/style.css": "style.css",
  "/script.js": "script.js",
  "/loopnex-logo-transparent.png": "loopnex-logo-transparent.png",
  "/loopnex-background.mp4": "loopnex-background.mp4"
};

for (const [url, file] of Object.entries(frontendFiles)) {
  app.get(url, (req, res) => res.sendFile(path.join(frontendDirectory, file)));
}

app.use((req, res) => res.status(404).json({ message: "Route not found." }));

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Request body must be valid JSON." });
  }
  if (error.name === "ValidationError") {
    return res.status(400).json({ message: "Some listing or account details are invalid." });
  }
  if (error.name === "CastError") {
    return res.status(400).json({ message: "A supplied id or value is invalid." });
  }
  console.error("Request error:", error.message);
  return res.status(500).json({ message: "An unexpected server error occurred." });
});

async function startServer() {
  const allowLocalFallback = process.env.LOCAL_DATA_FALLBACK === "true" ||
    (process.env.LOCAL_DATA_FALLBACK !== "false" && process.env.NODE_ENV !== "production");

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    if (process.env.NODE_ENV === "production" && process.env.LOCAL_DATA_FALLBACK === "true") {
      process.env.JWT_SECRET = randomBytes(32).toString("hex");
      console.warn("Using an in-memory demo signing key; sessions will end when this service restarts.");
    } else {
      throw new Error("JWT_SECRET must be configured with at least 32 characters.");
    }
  }

  if (process.env.MONGODB_URI) {
    try {
      await connectDB();
    } catch (error) {
      if (!allowLocalFallback) throw error;
      localStore.setLocalMode(true);
      console.warn(`${error.message}`);
      console.warn(`Using private local data file: ${localStore.getDataFile()}`);
      console.warn("Local fallback data stays on this computer and is not shared with MongoDB Atlas.");
    }
  } else if (allowLocalFallback) {
    localStore.setLocalMode(true);
    console.log(`MongoDB URI not set. Using private local data file: ${localStore.getDataFile()}`);
  } else {
    throw new Error("MONGODB_URI is required when local fallback is disabled.");
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Loopnex API listening on http://${HOST}:${PORT}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Stop the other process or set PORT in .env.`);
    } else {
      console.error("HTTP server failed to start:", error.message);
    }
    process.exitCode = 1;
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer().catch((error) => {
  console.error("Backend startup failed:", error.message);
  process.exitCode = 1;
});
