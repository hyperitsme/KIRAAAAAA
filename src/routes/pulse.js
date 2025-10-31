import { Router, json } from "express";
import { addClient, send, broadcast, toAlert } from "../pulse/hub.js";

const router = Router();

function checkSecret(req){
  const secret = process.env.PULSE_SECRET || "";
  return secret && (req.params.secret === secret || req.query.secret === secret || req.body?.secret === secret);
}

// GET /api/pulse/stream
router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  res.flushHeaders?.();

  addClient(res);
  send(res, { ok: true, hello: "PulseScout SSE connected" });

  const keep = setInterval(() => {
    try { res.write("event: ping\ndata: {}\n\n"); } catch {}
  }, 25000);
  res.on("close", () => clearInterval(keep));
});

// POST /api/pulse/webhook/:secret
router.post("/webhook/:secret", json({ limit: "1mb" }), (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: "invalid_secret" });
  const body = req.body;
  const items = Array.isArray(body) ? body : [body];
  for (const it of items) broadcast(toAlert(it));
  res.json({ ok: true, received: items.length });
});

// POST /api/pulse/emit  (manual test)
router.post("/emit", json(), (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: "invalid_secret" });
  broadcast(toAlert(req.body?.payload || {}));
  res.json({ ok: true });
});

// GET /api/pulse/emit?secret=...  (browser friendly)
router.get("/emit", (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: "invalid_secret" });
  const { symbol="SOL/USDT", signal="manual", validity=0.9, side="neutral", notes="" } = req.query || {};
  broadcast(toAlert({ source:"manual", symbol, signal, validity: Number(validity), side, notes }));
  res.json({ ok: true });
});

export default router;
