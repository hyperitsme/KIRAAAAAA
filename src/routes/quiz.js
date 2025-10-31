import { Router } from "express";
import { generateJSON } from "../lib/openai.js";
import { suggestDifficulty } from "../lib/rating.js";
import { v4 as uuid } from "uuid";

const router = Router();

router.post("/quiz", async (req, res) => {
  try {
    const { elo = 1200, streak = 0, countToday = 0 } = req.body || {};
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const difficulty = suggestDifficulty(Number(elo));

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["id", "question", "choices", "correctIndex", "explanation", "difficulty"],
      properties: {
        id: { type: "string" },
        question: { type: "string" },
        choices: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
        correctIndex: { type: "integer", minimum: 0, maximum: 5 },
        explanation: { type: "string" },
        difficulty: { type: "integer", minimum: 800, maximum: 2000 }
      }
    };

    const prompt = `
You are Kira AI — an adaptive trading tutor. Create ONE multiple-choice question for a trader.

Constraints:
- Topic domain: trading strategy, technical analysis (order blocks, BOS/CHOCH, supply/demand, S/R, liquidity sweep), risk management, position sizing, psychology.
- Difficulty target (Elo-like): ~${difficulty}. If harder than user's Elo, prefer conceptual reasoning; if easier, prefer definitions/identification.
- choices: 4 options. Only one correct.
- Use concise wording; no images; no code.
- Explanation: 2–4 sentences, include WHY the correct option is right and a quick tip.
- Return STRICT JSON with fields: id, question, choices[], correctIndex, explanation, difficulty.

User context:
- current Elo: ${elo}
- streak: ${streak}
- answered today: ${countToday}
    `.trim();

    const item = await generateJSON({
      model,
      prompt,
      schemaName: "KiraQuizItem",
      schema
    });

    // Ensure fields are valid
    const safe = {
      id: item.id || `q-${uuid()}`,
      question: String(item.question || "").trim(),
      choices: Array.isArray(item.choices) ? item.choices.slice(0, 4).map(String) : [],
      correctIndex: Math.max(0, Math.min(3, Number(item.correctIndex || 0))),
      explanation: String(item.explanation || ""),
      difficulty: Number(item.difficulty || difficulty)
    };

    if (!safe.question || safe.choices.length < 3)
      return res.status(500).json({ error: "bad_question", raw: item });

    res.json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "quiz_failed", detail: err.message });
  }
});

export default router;
