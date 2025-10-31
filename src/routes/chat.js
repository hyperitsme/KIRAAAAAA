// src/routes/chat.js
import { Router } from "express";
import { generateText } from "../lib/openai.js";

const router = Router();

/* -------------------- LIVE PRICE HELPERS (inline, no extra imports) -------------------- */

const CACHE = new Map(); // key -> {ts,data}
const TTL = 10_000; // 10s

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  return null;
}
function cacheSet(key, data) {
  CACHE.set(key, { ts: Date.now(), data });
}

function asNumber(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

// Abortable fetch (WHATWG fetch tak punya option timeout)
async function fetchWithTimeout(url, ms = 8000, init = {}) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: c.signal });
    return r;
  } finally {
    clearTimeout(id);
  }
}

async function binanceSnapshot(symbol = "SOLUSDT") {
  const u = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
  const r = await fetchWithTimeout(u);
  if (!r.ok) throw new Error("binance_http_" + r.status);
  const j = await r.json();
  return {
    ok: true,
    source: "binance",
    symbol: j.symbol || symbol,
    price: asNumber(j.lastPrice),
    change24h: asNumber(j.priceChangePercent) / 100,
    high24h: asNumber(j.highPrice),
    low24h: asNumber(j.lowPrice),
    volume24h: asNumber(j.volume),
    ts: new Date().toISOString(),
  };
}

const CG_IDS = { SOLUSDT: "solana", BTCUSDT: "bitcoin", ETHUSDT: "ethereum" };
async function coingeckoSnapshot(symbol = "SOLUSDT") {
  const id = CG_IDS[symbol] || "solana";
  const u =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}` +
    `&vs_currencies=usd&include_24hr_high=true&include_24hr_low=true&include_24hr_change=true`;
  const r = await fetchWithTimeout(u, 8000, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("coingecko_http_" + r.status);
  const j = await r.json();
  const row = j[id] || {};
  return {
    ok: true,
    source: "coingecko",
    symbol,
    price: asNumber(row.usd),
    change24h: asNumber(row.usd_24h_change) / 100,
    high24h: asNumber(row.usd_24h_high),
    low24h: asNumber(row.usd_24h_low),
    volume24h: undefined,
    ts: new Date().toISOString(),
  };
}

async function getSnapshot(symbol = "SOLUSDT") {
  const key = "snap:" + symbol;
  const hit = cacheGet(key);
  if (hit) return hit;
  try {
    const a = await binanceSnapshot(symbol);
    cacheSet(key, a);
    return a;
  } catch {
    const b = await coingeckoSnapshot(symbol);
    cacheSet(key, b);
    return b;
  }
}

function formatSnapshot(s) {
  if (!s) return "market_snapshot: unavailable";
  return [
    "market_snapshot:",
    "{",
    `  symbol: "${s.symbol}",`,
    `  source: "${s.source}",`,
    `  ts_iso: "${s.ts}",`,
    `  price_usd: ${s.price},`,
    `  change_24h: ${s.change24h},`,
    `  high_24h: ${s.high24h},`,
    `  low_24h: ${s.low24h}`,
    "}",
  ].join("\n");
}

/* -------------------- SYMBOL DETECTOR -------------------- */

function detectSymbol(text = "") {
  const t = (text || "").toUpperCase();
  if (/\bSOL\b|SOL\/?USDT|\bSOL-?PERP\b/.test(t)) return "SOLUSDT";
  if (/\bBTC\b|BTC\/?USDT|\bBTC-?PERP\b/.test(t)) return "BTCUSDT";
  if (/\bETH\b|ETH\/?USDT|\bETH-?PERP\b/.test(t)) return "ETHUSDT";
  return "SOLUSDT"; // default
}

/* -------------------- ROUTE -------------------- */

router.post("/chat", async (req, res) => {
  try {
    const { message, module, wallet, provider, symbol: symbolFromUI } = req.body || {};
    if (!message) return res.status(400).json({ error: "Missing 'message'." });

    const symbol = (symbolFromUI || detectSymbol(message)).toUpperCase();
    let snap = null;
    try {
      snap = await getSnapshot(symbol);
    } catch {
      // keep null; prompt will forbid numeric guessing
    }

    const system = [
      "You are Kira AI — TradeGPT Companion.",
      "Audience: retail–pro crypto/stock traders.",
      "Style: concise, actionable; use bullet points for plan/levels; ALWAYS include risk controls (entry, stop, invalidation).",
      "",
      "STRICT NUMERIC POLICY:",
      "- Use ONLY numbers/levels present in the provided market_snapshot.",
      "- If snapshot is unavailable, DO NOT invent precise prices; answer qualitatively (e.g., 'near recent swing high').",
      "- Never guess the current price.",
    ].join("\n");

    const context = [
      `module: ${module || "qa"}`,
      `wallet: ${wallet || "-"} via ${provider || "-"}`,
      formatSnapshot(snap),
      "",
      "task:",
      "Answer the user's trading question using that snapshot.",
      "If user requests a plan, include: bias, key levels (from snapshot only), invalidation, risk note.",
      "Keep it ≤ 10 bullet points.",
    ].join("\n");

    const user = `User question:\n${message}`;

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const reply = await generateText({ model, system, user: context + "\n\n" + user });

    res.json({ reply, snapshot: snap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat_failed", detail: err.message });
  }
});

export default router;
