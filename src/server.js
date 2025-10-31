// src/server.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";

/* --------- Import helper dengan toleransi ESM/CJS --------- */
let buildCors;
try {
  const mod = await import("./middleware/cors.js");
  // dukung: named export, default.buildCors, atau default function
  buildCors = mod.buildCors || mod.default?.buildCors || mod.default;
  if (typeof buildCors !== "function") throw new Error("buildCors not a function");
} catch (e) {
  console.warn("[CORS] Falling back to permissive CORS:", e?.message);
  // fallback permissive (dev only)
  buildCors = () => (req, res, next) => next();
}

let tinyRateLimit = () => (req, res, next) => next();
try {
  const mod = await import("./middleware/rateLimit.js");
  tinyRateLimit = mod.tinyRateLimit || mod.default?.tinyRateLimit || tinyRateLimit;
} catch (e) {
  console.warn("[RateLimit] Not found, continuing without it.");
}

/* ------------------- Routes utama ------------------- */
import chatRoutes from "./routes/chat.js";
import quizRoutes from "./routes/quiz.js";
import marketRoutes from "./routes/market.js";

/* ------------------- Route Pulse (opsional) ------------------- */
let pulseRoutes;
try {
  const mod = await import("./routes/pulse.js");
  pulseRoutes = mod.default || mod;
} catch (e) {
  console.warn("[Pulse] routes not loaded:", e?.message);
}

const app = express();

/* ------------------- App middleware ------------------- */
app.set("trust proxy", true);
app.disable("x-powered-by");

// Security headers
app.use(helmet({ crossOriginResourcePolicy: false }));

// CORS (ENV: CORS_ORIGINS="https://kiraai.io,https://kiraai.io/tradegpt,https://kiraai.io/pulsescout")
app.use(buildCors());

// Body parser
app.use(express.json({ limit: "1mb" }));

// Tiny rate limit
app.use(tinyRateLimit({ windowMs: 10_000, max: 40 }));

/* ------------------- Health ------------------- */
app.get("/", (_req, res) =>
  res.json({ ok: true, name: "Kira Backend", version: "1.0.0" })
);
app.get("/health", (_req, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() })
);

/* ------------------- Mount routes ------------------- */
app.use("/api", chatRoutes);
app.use("/api", quizRoutes);
app.use("/api", marketRoutes);
if (pulseRoutes) app.use("/api/pulse", pulseRoutes); // /stream, /webhook/:secret, /emit

/* ------------------- 404 ------------------- */
app.use((req, res) =>
  res.status(404).json({ error: "not_found", path: req.path })
);

/* ------------------- Error handler ------------------- */
app.use((err, _req, res, _next) => {
  console.error("Unhandled:", err);
  const code = err.status || 500;
  res.status(code).json({
    error: "server_error",
    // sembunyikan detail di production
    detail:
      process.env.NODE_ENV === "production"
        ? undefined
        : err?.message || String(err),
  });
});

/* ------------------- Start ------------------- */
const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`Kira backend listening on :${PORT}`);
});
