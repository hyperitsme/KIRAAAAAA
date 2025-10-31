const express = require('express');
const { addClient, send, broadcast, toAlert } = require('../pulse/hub');

const router = express.Router();

function checkSecret(req){
  const secret = process.env.PULSE_SECRET || '';
  return secret && (req.params.secret === secret || req.query.secret === secret || req.body?.secret === secret);
}

// GET /api/pulse/stream?f=<urlencoded JSON filters>
router.get('/stream', (req, res) => {
  // SSE headers
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders?.();

  addClient(res);

  // greeting + ping
  send(res, { ok: true, hello: 'PulseScout SSE connected' });
  const keep = setInterval(() => { try{ res.write('event: ping\ndata: {}\n\n'); }catch{} }, 25000);
  res.on('close', () => clearInterval(keep));
});

// POST /api/pulse/webhook/:secret
router.post('/webhook/:secret', express.json({limit:'1mb'}), (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: 'invalid secret' });

  // Bisa menerima array atau single object
  const body = req.body;
  const items = Array.isArray(body) ? body : [body];

  for (const it of items) {
    const alert = toAlert(it);
    broadcast(alert);
  }
  res.json({ ok: true, received: items.length });
});

// Dev/test: POST /api/pulse/emit { secret, payload }
router.post('/emit', express.json(), (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: 'invalid secret' });
  const alert = toAlert(req.body?.payload || {});
  broadcast(alert);
  res.json({ ok: true });
});

module.exports = router;
