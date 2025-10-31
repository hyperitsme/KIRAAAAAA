// src/routes/chat.js
import { Router } from "express";
import { generateText } from "../lib/openai.js";

// ===== Helpers: symbol map + price fetch (CoinGecko) =====
const SYM_MAP = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  XRP: "ripple",
  DOGE: "dogecoin",
};

async function fetchSpotUSD(symbol) {
  const id = SYM_MAP[symbol?.toUpperCase?.()] || null;
  if (!id) return null;
  const url = "https://api.coingecko.com/api/v3/simple/price?" +
    new URLSearchParams({ ids: id, vs_currencies: "usd" }).toString();
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();
  const p = j?.[id]?.usd;
  return (typeof p === "number") ? p : null;
}

// Deteksi simbol sederhana dari input user
function detectSymbol(text = "") {
  const U = text.toUpperCase();
  // cari SOL/USDT, BTCUSDT, ETH-PERP, dll
  const m1 = U.match(/\b([A-Z]{3,5})\s*\/?\s*(USDT|USD|PERP)\b/);
  if (m1 && SYM_MAP[m1[1]]) return m1[1];
  // fallback: sebut simbol tunggal
  for (const s of Object.keys(SYM_MAP)) {
    if (U.includes(` ${s} `) || U.startsWith(`${s} `) || U.endsWith(` ${s}`)) return s;
  }
  return null;
}

// ===== System prompts =====
function qaSystem() {
  return [
    "You are Kira AI — TradeGPT Companion.",
    "Audience: retail-to-pro crypto/stock traders.",
    "Style: concise, direct, professional. Use bullet points. Avoid fluff.",
    "Always include risk controls (entry idea, stop, invalidation) if user asks for strategy.",
    "Never invent exact numbers you don't know; prefer ranges if data is missing.",
  ].join("\n");
}

function chartSageSystem({ symbol, spot }) {
  const priceLine = spot
    ? `Current spot (${symbol}/USD): $${spot.toFixed(2)} (CoinGecko, UTC).`
    : `Current spot: unavailable. Do NOT invent exact price. Use relative wording (e.g., 'near recent support/resistance').`;

  return [
    "You are ChartSage — an AI Technical Analyst.",
    priceLine,
    "Your job: multi-timeframe reasoning (15m / 1H / 4H), pattern detection hints, ATR/volume context, and human-grade narrative.",
    "STRICT TEMPLATE. Output must be professional and compact. Use ONLY the following sections in order:",
    "1) **Overview** — 1–2 lines on current structure and volatility.",
    "2) **Multi-TF View** — bullets for 15m, 1H, 4H (trend, structure).",
    "3) **Key Levels** — ONLY if supported by context. Prefer relative phrasing if unsure; never hallucinate exact levels.",
    "4) **Trade Plan (if-then)** — entry triggers (confirmation), targets, partials, and trailing logic.",
    "5) **Risk & Invalidation** — stop criteria and what invalidates the idea.",
    "6) **Checklist** — 3–5 quick checks (volume/ATR/liquidity sweep/break-retest).",
    "",
    "Hard rules:",
    "- Do not claim real-time market data beyond the provided spot. If spot is missing, avoid exact numbers.",
    "- Be actionable but cautious: emphasize confirmation over prediction.",
    "- No emojis, no hype, no filler.",
  ].join("\n");
}

function pulseScoutSystem() {
  return [
    "You are PulseScout, a precision-first market radar.",
    "Return succinct insights about flow/alerts if asked directly. Otherwise keep answers short.",
  ].join("\n");
}

// Build system by module
function buildSystem(module, ctx) {
  if (module === "chartsage") return chartSageSystem(ctx || {});
  if (module === "pulsescout") return pulseScoutSystem();
  return qaSystem();
}

const router = Router();

/**
 * POST /api/chat
 * body: { message, module, wallet, provider }
 * Enhancements:
 * - For chartsage: detect symbol (e.g., SOL) and fetch spot; inject into system.
 * - Enforce professional template via system prompt.
 */
router.post("/chat", async (req, res) => {
  try {
    const { message, module, wallet, provider } = req.body || {};
    if (!message) return res.status(400).json({ error: "Missing 'message'." });

    // Context for chartsage
    let symbol = null;
    let spot = null;

    if (module === "chartsage") {
      symbol = detectSymbol(message) || null;
      if (symbol) {
        try { spot = await fetchSpotUSD(symbol); } catch { /* ignore */ }
      }
    }

    const system = buildSystem(module, { symbol, spot });

    // Compose user message with minimal metadata
    const user = [
      symbol ? `Symbol: ${symbol}/USD` : "Symbol: (not detected)",
      wallet ? `Wallet: ${wallet} via ${provider || "-"}` : "Wallet: -",
      `Query: ${message}`,
    ].join("\n");

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const reply = await generateText({ model, system, user });

    res.json({
      reply,
      meta: { module, symbol, spot },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat_failed", detail: err.message });
  }
});

export default router;
