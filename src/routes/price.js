// src/routes/price.js
import { Router } from "express";

const router = Router();

function num(x, d = 0) { const n = Number(x); return Number.isFinite(n) ? n : d; }
async function fetchWithTimeout(url, ms = 8000, init = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

async function binance(symbol = "SOLUSDT") {
  const r = await fetchWithTimeout(
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
    8000
  );
  if (!r.ok) throw new Error("binance_" + r.status);
  const j = await r.json();
  return {
    ok: true, source: "binance", symbol: j.symbol || symbol,
    price: num(j.lastPrice), high24h: num(j.highPrice), low24h: num(j.lowPrice),
    change24h: num(j.priceChangePercent) / 100, volume24h: num(j.volume),
    ts: new Date().toISOString(),
  };
}

const CG_IDS = { SOLUSDT: "solana", BTCUSDT: "bitcoin", ETHUSDT: "ethereum" };
async function coingecko(symbol = "SOLUSDT") {
  const id = CG_IDS[symbol] || "solana";
  const u = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_high=true&include_24hr_low=true&include_24hr_change=true`;
  const r = await fetchWithTimeout(u, 8000, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("coingecko_" + r.status);
  const j = await r.json();
  const row = j[id] || {};
  return {
    ok: true, source: "coingecko", symbol,
    price: num(row.usd), high24h: num(row.usd_24h_high), low24h: num(row.usd_24h_low),
    change24h: num(row.usd_24h_change) / 100, ts: new Date().toISOString(),
  };
}

async function snapshot(symbol = "SOLUSDT") {
  try { return await binance(symbol); } catch { return await coingecko(symbol); }
}

router.get("/price", async (req, res) => {
  const symbol = (req.query.symbol || "SOLUSDT").toString().toUpperCase();
  try { res.json(await snapshot(symbol)); }
  catch (e) { res.status(502).json({ ok: false, error: "price_unavailable", detail: e.message, symbol }); }
});

router.get("/price/:symbol", async (req, res) => {
  const symbol = (req.params.symbol || "SOLUSDT").toString().toUpperCase();
  try { res.json(await snapshot(symbol)); }
  catch (e) { res.status(502).json({ ok: false, error: "price_unavailable", detail: e.message, symbol }); }
});

export default router;
