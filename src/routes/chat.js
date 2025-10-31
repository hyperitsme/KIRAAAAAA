// src/routes/chat.js
import { Router } from "express";
import { generateText } from "../lib/openai.js";
import { detectSymbolFromText, getSpot } from "../lib/price.js";

const router = Router();

router.post("/chat", async (req, res) => {
  try {
    const { message, module, wallet, provider } = req.body || {};
    if (!message) return res.status(400).json({ error: "Missing 'message'." });

    // detect symbol & fetch live spot
    const symbol = detectSymbolFromText(message);
    let spot = null;
    try { spot = await getSpot(symbol); } catch {}

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const priceLine = spot
      ? `Live price snapshot: ${spot.symbol} = $${spot.price.toFixed(2)} (source: ${spot.source}, ts: ${new Date(spot.ts).toISOString()}).`
      : `Live price snapshot: unavailable. Do NOT guess a number.`;

    const guardRails = [
      "Rules:",
      "1) Use the provided live price snapshot verbatim for any price reference.",
      "2) If snapshot is unavailable, avoid numeric price targets; use % moves or structural levels (support/resistance) without hard numbers.",
      "3) Be explicit about entry, stop, invalidation, and risk per trade.",
      "4) Keep answers concise and professional; bullet points preferred.",
    ].join("\n");

    const system = [
      "You are Kira AI — TradeGPT Companion.",
      "Audience: retail-to-pro crypto/stock traders.",
      priceLine,
      guardRails
    ].join("\n");

    const user = [
      `Module: ${module || "qa"}`,
      `Wallet: ${wallet || "-" } via ${provider || "-"}`,
      `Query: ${message}`
    ].join("\n");

    const reply = await generateText({ model, system, user });
    res.json({ reply, symbol, spot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat_failed", detail: err.message });
  }
});

export default router;
