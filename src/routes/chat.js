import { Router } from "express";
import { generateText } from "../lib/openai.js";

const router = Router();

// POST /api/chat
router.post("/chat", async (req, res) => {
  const started = Date.now();
  try {
    const { message, module, wallet, provider } = req.body || {};
    if (!message) return res.status(400).json({ error: "missing_message" });

    let system, maxTokens;

    switch (module) {
      case "chartsage":
        system = `You are ChartSage, an AI Technical Analyst.
Return a concise human narrative. When requested, include ONE fenced JSON block summarizing detected patterns.`;
        maxTokens = 450;
        break;

      case "pulsescout":
        system = `You are PulseScout, a precision-first market radar.
Return ONLY one fenced JSON block ( \`\`\`json ... \`\`\` ) which is an ARRAY of alerts:
{ ts: ISO, source: string, symbol: string, signal: string, validity: number(0..1), side: "long"|"short"|"neutral", notes: string }.
If none, return []. No text outside the JSON.`;
        maxTokens = 350;
        break;

      default:
        system = `You are Kira AI — TradeGPT Companion.
Audience: retail-to-pro crypto/stock traders.
Be concise and actionable; include entry, stop, invalidation when asked for strategy.`;
        maxTokens = 500;
    }

    const user = [
      `Module: ${module || "qa"}`,
      `Wallet: ${wallet || "-"} via ${provider || "-"}`,
      `Query: ${message}`
    ].join("\n");

    const reply = await generateText({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      system, user, temperature: 0.2, max_tokens: maxTokens
    });

    res.json({ reply, elapsedMS: Date.now() - started });
  } catch (err) {
    const isTimeout = String(err?.message || "").includes("timeout");
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? "openai_timeout" : "chat_failed",
      detail: err?.message || String(err),
      elapsedMS: Date.now() - started
    });
  }
});

export default router;
