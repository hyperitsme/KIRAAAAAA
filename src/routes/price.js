// src/routes/price.js
import { Router } from "express";

const router = Router();

// ambil snapshot cepat (pakai helper yang sama di atas agar tanpa duplikasi)
async function quickSnapshot(symbol = "SOLUSDT") {
  const u = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
  try {
    const r = await fetch(u);
    if (!r.ok) throw 0;
    const j = await r.json();
    return {
      ok: true,
      source: "binance",
      symbol: j.symbol || symbol,
      price: Number(j.lastPrice),
      high24h: Number(j.highPrice),
      low24h: Number(j.lowPrice),
      change24h: Number(j.priceChangePercent) / 100,
      ts: new Date().toISOString(),
    };
  } catch {
    return { ok: false, source: "binance", symbol, ts: new Date().toISOString() };
  }
}

router.get("/price", async (req, res) => {
  const symbol = (req.query.symbol || "SOLUSDT").toString().toUpperCase();
  const snap = await quickSnapshot(symbol);
  res.json(snap);
});

export default router;
