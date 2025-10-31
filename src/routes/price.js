// src/routes/price.js
import { Router } from "express";
import { getSpot } from "../lib/price.js";

const router = Router();

// GET /api/price/SOL
router.get("/price/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const spot = await getSpot(symbol);
    res.json(spot);
  } catch (e) {
    res.status(400).json({ error: "price_error", detail: String(e.message || e) });
  }
});

// GET /api/price?symbols=SOL,ETH
router.get("/price", async (req, res) => {
  try {
    const symbols = String(req.query.symbols || "SOL")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const out = {};
    for (const s of symbols) {
      try { out[s.toUpperCase()] = await getSpot(s); }
      catch (e) { out[s.toUpperCase()] = { error: String(e.message || e) }; }
    }
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: "price_error", detail: String(e.message || e) });
  }
});

export default router;
