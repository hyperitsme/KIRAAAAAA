// src/routes/chat.js
import { Router } from "express";
import { generateText } from "../lib/openai.js";

const router = Router();

// NOTE: Kamu SUDAH pakai app.use(express.json()) di server.js,
// jadi di sini TIDAK perlu parsing body lagi.

// POST /api/chat
router.post("/chat", async (req, res) => {
  const started = Date.now();
  try {
    const { message, module, wallet, provider } = req.body || {};
    if (!message) return res.status(400).json({ error: "missing_message" });

    let system = "You are Kira AI — TradeGPT Companion.";
    let maxTokens = 500;

    // Per-module guardrails (biar jawaban ringkas → cepat)
    switch (module) {
      case "chartsage":
        system = `You are ChartSage, an AI Technical Analyst.
Return a concise human narrative. When requested for patterns, include a SINGLE fenced JSON block with patterns summary. Keep answers short.`;
        maxTokens = 450;
        break;

      case "pulsescout":
        system = `You are PulseScout, a precision-first market radar.
Return ONLY a single fenced JSON block (\`\`\`json ... \`\`\`) representing an ARRAY of alert objects:
{ ts: ISO, source: string, symbol: string, signal: string, validity: number(0..1), side: "long"|"short"|"neutral", notes: string }.
If no alerts, return [].
DO NOT add any text outside the JSON block. Keep it short.`;
        maxTokens = 350; // lebih pendek agar cepat
        break;

      default:
        // TradeGPT Q&A (ringkas)
        system = `You are Kira AI — TradeGPT Companion.
Audience: retail-to-pro crypto/stock traders.
Tone: concise, actionable. When asked for strategy, include entry, stop, invalidation, risk. Keep under 12 bullet points.`;
        maxTokens = 500;
    }

    const user = [
      `Module: ${module || "qa"}`,
      `Wallet: ${wallet || "-" } via ${provider || "-"}`,
      `Query: ${message}`
    ].join("\n");

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const reply = await generateText({ model, system, user, temperature: 0.2, max_tokens: maxTokens });

    return res.json({ reply, elapsedMS: Date.now() - started });
  } catch (err) {
    const isTimeout = String(err?.message || "").includes("timeout");
    const code = isTimeout ? 504 : 500;
    console.error("[/api/chat] error:", err?.message || err);
    return res.status(code).json({
      error: isTimeout ? "openai_timeout" : "chat_failed",
      detail: err?.message || String(err),
      elapsedMS: Date.now() - started
    });
  }
});

export default router;
