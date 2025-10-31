import { Router } from 'express';
import { generateText } from '../lib/openai.js';

const router = Router();

// POST /api/quiz  -> { elo, streak, countToday }
router.post('/quiz', async (req, res) => {
  try{
    const { elo = 1200, streak = 0, countToday = 0 } = req.body || {};
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    const system = `You generate trading multiple-choice quizzes (no images).
Return a STRICT JSON object (no extra text) with:
{id, question, choices, correctIndex, explanation, difficulty}
- difficulty is an approximate Elo number (1000..2000).
- choices: 4 concise options (A-D like content, but no letters in text).
Keep it focused on real trading concepts (order blocks, liquidity sweep, ATR, R:R, etc.).`;

    const user = `User Elo=${elo}, streak=${streak}, today=${countToday}. Create ONE question appropriate to skill.`;

    const raw = await generateText({ model, system, user, temperature: 0.4 });

    // Best-effort JSON extraction
    const m = raw.match(/```json([\s\S]*?)```/i) || raw.match(/\{[\s\S]*\}$/);
    const txt = m ? (m[1] ? m[1].trim() : m[0]) : raw;
    let q;
    try { q = JSON.parse(txt); }
    catch { throw new Error('LLM did not return parsable JSON'); }

    // minimal guard
    if (!q || !Array.isArray(q.choices) || typeof q.correctIndex !== 'number') {
      throw new Error('Invalid quiz schema');
    }

    res.json({
      id: q.id || crypto.randomUUID?.() || String(Date.now()),
      question: q.question,
      choices: q.choices.slice(0,4),
      correctIndex: q.correctIndex,
      explanation: q.explanation || '',
      difficulty: Number(q.difficulty) || elo
    });
  }catch(e){
    console.error('[quiz]', e.message);
    res.status(500).json({ error: 'quiz_failed', detail: e.message });
  }
});

export default router;
