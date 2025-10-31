import { Router } from 'express';
import { generateText } from '../lib/openai.js';

const router = Router();
router.use((req, _res, next) => {
  // body parser for JSON
  if (req.is('application/json') || req.method === 'POST') {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
      next();
    });
  } else next();
});

// POST /api/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, module, wallet, provider } = req.body || {};
    if (!message) return res.status(400).json({ error: "Missing 'message'." });

    let system = 'You are Kira AI — TradeGPT Companion.';
    // Module-specific guardrails
    if (module === 'chartsage') {
      system = `You are ChartSage, an AI Technical Analyst.
Return concise human narrative AND when requested include a single fenced JSON block with patterns summary.`;
    } else if (module === 'pulsescout') {
      system = `You are PulseScout, a precision-first market radar.
Return ONLY a single fenced JSON block (\`\`\`json ... \`\`\`) representing an ARRAY of alert objects:
{ ts: ISO string, source: string, symbol: string, signal: string,
  validity: number(0..1), side: "long"|"short"|"neutral", notes: string }.
If no alerts, return [].
Do not add any text outside the JSON block.`;
    }

    const user = [
      `Module: ${module || 'qa'}`,
      `Wallet: ${wallet || '-' } via ${provider || '-'}`,
      `Query: ${message}`
    ].join('\n');

    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const reply = await generateText({ model, system, user, temperature: 0.2 });
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'chat_failed', detail: err.message });
  }
});

export default router;
