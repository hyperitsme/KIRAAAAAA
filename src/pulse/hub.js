const clients = new Set();

export function addClient(res){
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function send(res, obj){
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

export function broadcast(obj){
  for (const res of clients) {
    try { send(res, obj); } catch {}
  }
}

export function toAlert(payload = {}){
  const now = new Date().toISOString();
  const source  = payload.source || payload.feed || payload._source || "unknown";
  const symbol  = payload.symbol || payload.ticker || payload.pair || payload.token || "-";
  const signal  = payload.signal || payload.event || payload.reason || "anomaly";
  const side    = (payload.side || payload.bias || "neutral").toLowerCase();

  let validity  = typeof payload.validity === "number" ? payload.validity : undefined;
  if (validity == null) {
    const z = Number(payload.volume_z || payload.z || payload.score);
    if (!isNaN(z)) validity = Math.max(0, Math.min(0.99, 0.5 + Math.tanh(z/4)*0.4));
  }
  if (validity == null) validity = 0.86;

  const notes = payload.notes || payload.message || payload.desc || payload.description || "";
  return { ts: now, source, symbol, signal, validity, side, notes };
}
