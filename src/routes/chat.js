import { Router } from "express";
import { generateText } from "../lib/openai.js";

const router = Router();

router.post("/chat", async (req, res) => {
  try {
    const { message, module, wallet, provider } = req.body || {};
    if (!message) return res.status(400).json({ error: "Missing 'message'." });

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const system = [
      "You are Kira AI — TradeGPT Companion.",
      "Audience: retail-to-pro crypto/stock traders.",
      "Tone: concise, actionable, cite rules when needed. Use bullet points for steps.",
      "When asked for strategy, include risk controls (entry, stop, invalidation)."
    ].join("\n");

    const user = [
      `Module: ${module || "qa"}`,
      `Wallet: ${wallet || "-" } via ${provider || "-"}`,
      `Query: ${message}`
    ].join("\n");

    const reply = await generateText({ model, system, user });
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat_failed", detail: err.message });
  }
});

export default router;
