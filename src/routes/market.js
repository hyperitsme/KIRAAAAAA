// src/lib/market.js
// Live market snapshot with 10s cache. ESM.

const CACHE_TTL_MS = 10_000;
const cache = new Map(); // key -> { ts, data }

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  return null;
}
function cacheSet(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

/** Binance 24hr ticker (e.g., SOLUSDT, BTCUSDT) */
async function binanceTicker(symbol = "SOLUSDT") {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(
    symbol
  )}`;
  const r = await fetch(url, { timeout: 8000 });
  if (!r.ok) throw new Error("binance_http_" + r.status);
  const j = await r.json();
  return {
    ok: true,
    source: "binance",
    symbol: j.symbol || symbol,
    price: num(j.lastPrice),
    change24h: num(j.priceChangePercent) / 100,
    high24h: num(j.highPrice),
    low24h: num(j.lowPrice),
    volume24h: num(j.volume),
    ts: new Date().toISOString(),
  };
}

/** CoinGecko fallback (SOL only or map few ids) */
const CG_ID = { SOLUSDT: "solana", BTCUSDT: "bitcoin", ETHUSDT: "ethereum" };
async function coingeckoSimple(symbol = "SOLUSDT") {
  const id = CG_ID[symbol] || "solana";
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_high=true&include_24hr_low=true&include_24hr_change=true`;
  const r = await fetch(url, { headers: { Accept: "application/json" }, timeout: 8000 });
  if (!r.ok) throw new Error("coingecko_http_" + r.status);
  const j = await r.json();
  const row = j[id] || {};
  return {
    ok: true,
    source: "coingecko",
    symbol,
    price: num(row.usd),
    change24h: num(row.usd_24h_change) / 100,
    high24h: num(row.usd_24h_high),
    low24h: num(row.usd_24h_low),
    volume24h: undefined,
    ts: new Date().toISOString(),
  };
}

/** Public: get market snapshot with cache + fallback */
export async function getMarketSnapshot(symbol = "SOLUSDT") {
  const key = "mkt:" + symbol;
  const hit = cacheGet(key);
  if (hit) return hit;

  try {
    const a = await binanceTicker(symbol);
    cacheSet(key, a);
    return a;
  } catch (_e) {
    const b = await coingeckoSimple(symbol);
    cacheSet(key, b);
    return b;
  }
}

/** Small helper for the prompt */
export function formatSnapshotForPrompt(s) {
  if (!s) return "market_snapshot: unavailable";
  return [
    "market_snapshot:",
    `{`,
    `  symbol: "${s.symbol}",`,
    `  source: "${s.source}",`,
    `  ts_iso: "${s.ts}",`,
    `  price_usd: ${s.price},`,
    `  change_24h: ${s.change24h},`,
    `  high_24h: ${s.high24h},`,
    `  low_24h: ${s.low24h}`,
    `}`,
  ].join("\n");
}
