// src/server.js
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { buildCors } from "./middleware/cors.js";
import { tinyRateLimit } from "./middleware/rateLimit.js";

import chatRoutes from "./routes/chat.js";
import quizRoutes from "./routes/quiz.js";
import marketRoutes from "./routes/market.js";  // <- sekarang default export (fixed)
import pulseRoutes from "./routes/pulse.js";
import priceRoutes from "./routes/price.js";    // <- NEW

const app = express();

app.set("trust proxy", true);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(buildCors());
app.use(express.json({ limit: "1mb" }));
app.use(tinyRateLimit({ windowMs: 10_000, max: 40 }));

app.get("/", (_req, res) =>
  res.json({ ok: true, name: "Kira Backend", version: "1.0.0" })
);
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// API routes
app.use("/api", chatRoutes);
app.use("/api", quizRoutes);
app.use("/api", marketRoutes);
app.use("/api/pulse", pulseRoutes);
app.use("/api", priceRoutes); // <- harga real-time untuk TradeGPT

// 404
app.use((req, res) => res.status(404).json({ error: "not_found", path: req.path }));

// error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled:", err);
  res.status(500).json({ error: "server_error" });
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`Kira backend listening on :${PORT}`);
});
