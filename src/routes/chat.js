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

function detectSymbol(text = "") {
  const U = text.toUpperCase();
  const m1 = U.match(/\b([A-Z]{3,5})\s*\/?\s*(USDT|USD|PERP)\b/);
  if (m1 && SYM_MAP[m1[1]]) return m1[1];
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
    "Do NOT output code fences or JSON. Reply in plain text only.",
  ].join("\n");
}

function chartSageSystem({ symbol, spot }) {
  const priceLine = spot
    ? `Current spot (${symbol || "N/A"}/USD): $${spot.toFixed(2)} (CoinGecko, UTC).`
    : `Current spot: unavailable. Do NOT invent exact price. Use relative wording (e.g., 'near recent support/resistance').`;

  return [
    "You are ChartSage — an AI Technical Analyst.",
    priceLine,
    "Your job: multi-timeframe reasoning (15m / 1H / 4H), pattern hints, ATR/volume context, human-grade narrative.",
    "",
    "STRICT OUTPUT FORMAT. Reply in plain text (no code fences, no JSON). Use these sections exactly:",
    "1) **Overview** — 1–2 lines on current structure/volatility.",
    "2) **Multi-TF View** — bullets for 15m, 1H, 4H (trend/structure/flow).",
    "3) **Key Levels** — only if supported by context. If unsure, use relative phrasing; never hallucinate exact levels.",
    "4) **Trade Plan (if-then)** — entry triggers (confirmation), targets/partials, trailing logic.",
    "5) **Risk & Invalidation** — clear stop/invalidation criteria.",
    "6) **Checklist** — 3–5 quick checks (volume/ATR/liquidity sweep/break-retest).",
    "",
    "Hard rules:",
    "- Do not claim real-time data beyond the provided spot.",
    "- Emphasize confirmation over prediction; be actionable but cautious.",
    "- No emojis / hype / filler. No code blocks. No JSON.",
  ].join("\n");
}

function pulseScoutSystem() {
  return [
    "You are PulseScout, a precision-first market radar.",
    "Keep answers short. Do NOT output code fences or JSON unless explicitly requested.",
  ].join("\n");
}

function buildSystem(module, ctx) {
  if (module === "chartsage") return chartSageSystem(ctx || {});
  if (module === "pulsescout") return pulseScoutSystem();
  return qaSystem();
}

// Sanitizer: buang code fences & blok JSON yg nyasar
function cleanReply(s = "") {
  // remove fenced code blocks ```...```
  s = s.replace(/```[\s\S]*?```/g, "");
  // remove lone JSON arrays/objects accidentally appended
  const fenceIdx = s.indexOf("\n{");
  if (fenceIdx > -1) s = s.slice(0, fenceIdx);
  const arrIdx = s.indexOf("\n[");
  if (arrIdx > -1) s = s.slice(0, arrIdx);
  // tidy blank lines
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

const router = Router();

/**
 * POST /api/chat
 * body: { message, module, wallet, provider }
 * - chartsage: deteksi simbol + fetch spot; injeksikan ke system prompt
 * - paksa format narasi profesional & bersihkan code fences
 */
router.post("/chat", async (req, res) => {
  try {
    const { message, module, wallet, provider } = req.body || {};
    if (!message) return res.status(400).json({ error: "Missing 'message'." });

    let symbol = null;
    let spot = null;

    if (module === "chartsage") {
      symbol = detectSymbol(message) || null;
      if (symbol) {
        try { spot = await fetchSpotUSD(symbol); } catch { /* ignore */ }
      }
    }

    const system = buildSystem(module, { symbol, spot });
    const user = [
      symbol ? `Symbol: ${symbol}/USD` : "Symbol: (not detected)",
      wallet ? `Wallet: ${wallet} via ${provider || "-"}` : "Wallet: -",
      `Query: ${message}`,
    ].join("\n");

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const raw = await generateText({ model, system, user });
    const reply = cleanReply(raw);

    res.json({ reply, meta: { module, symbol, spot } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat_failed", detail: err.message });
  }
});

export default router;
