// src/routes/market.js
import { Router } from "express";

const router = Router();

/**
 * Minimal route agar import default di server.js tidak error.
 * (Tambahkan endpoint market kamu di sini.)
 */
router.get("/market/health", (_req, res) => {
  res.json({ ok: true, route: "market", ts: new Date().toISOString() });
});

export default router;
