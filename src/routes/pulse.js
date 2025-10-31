import { Router, json } from "express";
import { addClient, send, broadcast, toAlert } from "../pulse/hub.js";
import { generateText } from "../lib/openai.js";

const router = Router();

/* ---------- helpers ---------- */
function clean(x){ return (x ?? "").toString().trim(); }
function checkSecret(req){
  const expected = clean(process.env.PULSE_SECRET);
  const got = clean(req.params.secret) || clean(req.query.secret) || clean(req.body?.secret);
  return expected && got && got === expected;
}

/* ---------- SSE stream ---------- */
// GET /api/pulse/stream?f=<urlencoded JSON optional>
router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  res.flushHeaders?.();

  // (opsional) baca filter klien; saat ini tidak dipakai di server
  try { req._filters = JSON.parse(clean(req.query.f)); } catch {}

  addClient(res);
  send(res, { ok: true, hello: "PulseScout SSE connected" });

  const keep = setInterval(() => {
    try { res.write("event: ping\ndata: {}\n\n"); } catch {}
  }, 25000);

  res.on("close", () => clearInterval(keep));
});

/* ---------- Webhook (nyata) ---------- */
// POST /api/pulse/webhook/:secret
// Body bisa object tunggal atau array of objects (akan dibroadcast satu per satu)
router.post("/webhook/:secret", json({ limit: "1mb" }), (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: "invalid_secret" });
  const body = req.body;
  const items = Array.isArray(body) ? body : [body];
  for (const it of items) broadcast(toAlert(it));
  res.json({ ok: true, received: items.length });
});

/* ---------- Emit manual (testing) ---------- */
// POST /api/pulse/emit  (body: {secret, payload:{...}})
router.post("/emit", json(), (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: "invalid_secret" });
  broadcast(toAlert(req.body?.payload || {}));
  res.json({ ok: true });
});

// GET /api/pulse/emit?secret=...&symbol=SOL/USDT&signal=...&validity=0.9&side=long&notes=...
router.get("/emit", (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: "invalid_secret" });
  const { symbol="SOL/USDT", signal="manual", validity=0.9, side="neutral", notes="" } = req.query || {};
  broadcast(toAlert({ source:"manual", symbol, signal, validity:Number(validity), side, notes }));
  res.json({ ok: true });
});

/* ---------- Generator fallback (AI) ---------- */
// POST /api/pulse/generate  (body: {secret, minValidity, maxAlerts, symbols[]})
router.post("/generate", json(), async (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: "invalid_secret" });

  const minValidity = Math.max(0, Math.min(0.99, Number(req.body?.minValidity ?? 0.85)));
  const maxAlerts   = Math.min(5, Math.max(1, Number(req.body?.maxAlerts ?? 2)));
  const symbols     = Array.isArray(req.body?.symbols) && req.body.symbols.length
    ? req.body.symbols.slice(0, 12)
    : ["BTC/USDT","SOL/USDT","ETH/USDT"];

  const system = "You output only JSON. No text outside JSON.";
  const user = `
Return a JSON array (1..${maxAlerts}) of alert objects with fields:
ts (ISO now), source("ai-fallback"), symbol(one of ${JSON.stringify(symbols)}),
signal (e.g. "volume_z=3.2", "oi_spike +6%", "dex_liq_add $200k", "whale_tx $120k"),
validity (0.70..0.98 float), side("long"|"short"|"neutral"), notes(short).
All validity must be >= ${minValidity}.
`.trim();

  try {
    const raw = await generateText({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      system, user, temperature: 0.1, max_tokens: 280
    });

    // ambil blok JSON
    const m = raw.match(/```json([\s\S]*?)```/i) || raw.match(/\[[\s\S]*\]$/);
    const arr = JSON.parse(m ? (m[1] ? m[1].trim() : m[0]) : raw);

    let count = 0;
    const items = Array.isArray(arr) ? arr : [];
    for (const it of items) {
      if (Number(it.validity) >= minValidity) { broadcast(it); count++; }
    }
    res.json({ ok: true, emitted: count, items });
  } catch (e) {
    res.status(500).json({ error: "generate_failed", detail: e.message });
  }
});

export default router;
