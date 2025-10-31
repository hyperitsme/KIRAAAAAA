// src/lib/price.js
// Simple, fast spot-price fetcher with cache (Binance -> CoinGecko fallback).

const CACHE_MS = 10_000; // 10s per symbol
const cache = new Map(); // key: "SOL", value: { ts, price, source }

const MAP = {
  SOL: { binance: "SOLUSDT", coingecko: "solana" },
  BTC: { binance: "BTCUSDT", coingecko: "bitcoin" },
  ETH: { binance: "ETHUSDT", coingecko: "ethereum" },
  BNB: { binance: "BNBUSDT", coingecko: "binancecoin" },
  XRP: { binance: "XRPUSDT", coingecko: "ripple" },
  MATIC: { binance: "MATICUSDT", coingecko: "matic-network" },
  DOGE: { binance: "DOGEUSDT", coingecko: "dogecoin" },
};

function normSym(s) {
  return (s || "").toUpperCase().replace(/[^A-Z]/g, "");
}

export async function getSpot(symbolRaw) {
  const symbol = normSym(symbolRaw || "SOL");
  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && now - hit.ts < CACHE_MS) return hit;

  const map = MAP[symbol];
  if (!map) throw new Error(`unsupported_symbol:${symbol}`);

  // 1) Binance (no key)
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${map.binance}`, { method: "GET" });
    if (r.ok) {
      const j = await r.json();
      const price = Number(j.price);
      if (Number.isFinite(price)) {
        const out = { symbol, price, source: "binance", ts: now };
        cache.set(symbol, out);
        return out;
      }
    }
  } catch {}

  // 2) CoinGecko fallback
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${map.coingecko}&vs_currencies=usd`, { method: "GET" });
    if (r.ok) {
      const j = await r.json();
      const price = Number(j[map.coingecko]?.usd);
      if (Number.isFinite(price)) {
        const out = { symbol, price, source: "coingecko", ts: now };
        cache.set(symbol, out);
        return out;
      }
    }
  } catch {}

  throw new Error(`price_fetch_failed:${symbol}`);
}

export function detectSymbolFromText(text = "") {
  // crude detector: SOL, BTC, ETH, etc.
  const upper = text.toUpperCase();
  const keys = Object.keys(MAP);
  for (const k of keys) {
    if (upper.includes(k)) return k;
  }
  // try “SOL/USDT” style
  const m = upper.match(/\b([A-Z]{2,6})\/USDT\b/);
  if (m) return normSym(m[1]);
  return "SOL"; // default
}
