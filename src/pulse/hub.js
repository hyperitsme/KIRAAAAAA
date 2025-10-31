// src/routes/pulse.js
import { Router, json } from "express";
import { addClient, send, broadcast, toAlert } from "../pulse/hub.js";
import { generateText } from "../lib/openai.js";

const router = Router();

/* -------------------- utils -------------------- */
const J = json({ limit: "1mb" });
const clean = (x) => (x ?? "").toString().trim();
const ok = (res, body) => res.json({ ok: true, ...body });
const bad = (res, code, msg) => res.status(code).json({ error: msg });

function checkSecret(req) {
  const expected = clean(process.env.PULSE_SECRET);
  const got =
    clean(req.params.secret) ||
    clean(req.query.secret) ||
    clean(req.body?.secret);
  return expected && got && expected === got;
}

/* -------------------- SSE stream -------------------- */
// GET /api/pulse/stream?f=<urlencoded JSON optional>
router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  try {
    req._filters = JSON.parse(clean(req.query.f));
  } catch { /* ignore */ }

  addClient(res);
  send(res, { hello: "PulseScout SSE connected" });

  const keep = setInterval(() => {
    try { res.write("event: ping\ndata: {}\n\n"); } catch {}
  }, 25000);

  res.on("close", () => clearInterval(keep));
});

/* -------------------- Generic webhook -------------------- */
// POST /api/pulse/webhook/:secret
router.post("/webhook/:secret", J, (req, res) => {
  if (!checkSecret(req)) return bad(res, 401, "invalid_secret");
  const items = Array.isArray(req.body) ? req.body : [req.body];
  for (const it of items) broadcast(toAlert(it));
  ok(res, { received: items.length });
});

/* -------------------- Emit manual (test) -------------------- */
// GET /api/pulse/emit?...  or  POST /api/pulse/emit  {secret, payload}
router.get("/emit", (req, res) => {
  if (!checkSecret(req)) return bad(res, 401, "invalid_secret");
  const { symbol = "SOL/USDT", signal = "manual", validity = 0.9, side = "neutral", notes = "" } = req.query || {};
  broadcast(
    toAlert({ source: "manual", symbol, signal, validity: Number(validity), side, notes })
  );
  ok(res, {});
});

router.post("/emit", J, (req, res) => {
  if (!checkSecret(req)) return bad(res, 401, "invalid_secret");
  broadcast(toAlert(req.body?.payload || {}));
  ok(res, {});
});

/* ============================================================
   INTEGRATIONS (TradingView / Dexscreener / Pump.fun)
   Semuanya menggunakan :secret pada path untuk keamanan sederhana.
   Mapping payload → alert dilakukan di sini.
   ============================================================ */

/* --- TradingView webhook (Strategy Alert) ---
   Set di TradingView: Webhook URL = https://<host>/api/pulse/integrations/tradingview/<SECRET>
   Isi pesan (suggested JSON):
   {
     "symbol": "{{ticker}}",
     "side": "{{strategy.order.action}}",   // LONG/SHORT/NEUTRAL
     "confidence": {{plot("validity")}},    // 0..1 (opsional)
     "note": "{{strategy.order.comment}}"
   }
*/
router.post("/integrations/tradingview/:secret", J, (req, res) => {
  if (!checkSecret(req)) return bad(res, 401, "invalid_secret");
  const b = req.body || {};
  const sym = b.symbol || b.ticker || b.TICKER || "UNKNOWN";
  const side = (b.side || b.SIDE || "NEUTRAL").toString().toLowerCase();
  const validity = Number(b.confidence ?? b.validity ?? 0.9);
  const signal = b.signal || b.alert || "tv_webhook";
  const notes = b.note || b.notes || b.comment || "";

  broadcast(
    toAlert({
      source: "tradingview",
      symbol: sym,
      signal,
      validity,
      side,
      notes,
    })
  );
  ok(res, { mapped: true });
});

/* --- Dexscreener feed ---
   Dexscreener tidak punya webhook resmi untuk semua event,
   biasanya via 3rd party/zap. Terima payload generik seperti:
   {
     "symbol":"SOL/USDT",
     "event":"volume_z",
     "z":3.8,
     "side":"long",
     "validity":0.92,
     "notes":"anomaly on Orca"
   }
*/
router.post("/integrations/dexscreener/:secret", J, (req, res) => {
  if (!checkSecret(req)) return bad(res, 401, "invalid_secret");
  const b = req.body || {};
  const sym = b.symbol || b.pair || "UNKNOWN";
  let sig = b.signal || b.event || "dexscreener";
  if (b.z != null && !/z=/.test(sig)) sig += ` z=${b.z}`;
  broadcast(
    toAlert({
      source: "dexscreener",
      symbol: sym,
      signal: sig,
      validity: Number(b.validity ?? 0.9),
      side: (b.side || "neutral").toLowerCase(),
      notes: b.notes || "",
    })
  );
  ok(res, { mapped: true });
});

/* --- Pump.fun feed ---
   Contoh payload:
   {
     "symbol":"XYZ/SOL",
     "event":"liquidity_add",
     "usd": 25000,
     "validity": 0.88,
     "side":"long",
     "notes":"new add, LP locked"
   }
*/
router.post("/integrations/pumpfun/:secret", J, (req, res) => {
  if (!checkSecret(req)) return bad(res, 401, "invalid_secret");
  const b = req.body || {};
  const sym = b.symbol || b.pair || b.mint || "UNKNOWN";
  let sig = b.signal || b.event || "pump.fun";
  if (b.usd != null && !/\$/.test(sig)) sig += ` $${b.usd}`;
  broadcast(
    toAlert({
      source: "pump.fun",
      symbol: sym,
      signal: sig,
      validity: Number(b.validity ?? 0.9),
      side: (b.side || "neutral").toLowerCase(),
      notes: b.notes || "",
    })
  );
  ok(res, { mapped: true });
});

/* ============================================================
   AI FALLBACK (hanya jika semua feed OFF atau sepi lama)
   ============================================================ */
router.post("/generate", J, async (req, res) => {
  if (!checkSecret(req)) return bad(res, 401, "invalid_secret");

  const minValidity = Math.max(0, Math.min(0.99, Number(req.body?.minValidity ?? 0.85)));
  const maxAlerts   = Math.min(5, Math.max(1, Number(req.body?.maxAlerts ?? 2)));
  const symbols     = Array.isArray(req.body?.symbols) && req.body.symbols.length
    ? req.body.symbols.slice(0, 12)
    : ["BTC/USDT","SOL/USDT","ETH/USDT"];

  const system = "You output only JSON. No commentary outside JSON.";
  const user = `
Return a JSON array (1..${maxAlerts}) of alert objects:
{ "ts": ISO-now, "source": "ai-fallback", "symbol": one-of ${JSON.stringify(symbols)},
  "signal": "volume_z=3.1" | "oi_spike +6%" | "whale_tx $120k" | "dex_liq_add $30k",
  "validity": ${minValidity}..0.98, "side": "long"|"short"|"neutral", "notes": "short text"}
`.trim();

  try {
    const raw = await generateText({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      system, user, temperature: 0.1, max_tokens: 280
    });

    const m = raw.match(/```json([\s\S]*?)```/i) || raw.match(/\[[\s\S]*\]$/);
    const arr = JSON.parse(m ? (m[1] ? m[1].trim() : m[0]) : raw);

    let count = 0;
    (Array.isArray(arr) ? arr : []).forEach((it) => {
      if (Number(it.validity) >= minValidity) { broadcast(it); count++; }
    });
    ok(res, { emitted: count });
  } catch (e) {
    bad(res, 500, "generate_failed");
  }
});

export default router;
