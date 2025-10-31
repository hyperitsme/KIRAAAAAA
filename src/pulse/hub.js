// src/pulse/hub.js  (ESM)
// Registry SSE clients + helper to format & broadcast alerts

/** @typedef {{ts?:string|number, source?:string, symbol?:string, signal?:string, validity?:number, side?:string, notes?:string}} Alert */

const clients = new Set();

/** Tambahkan client SSE */
export function addClient(res) {
  // render SSE headers sudah di-set oleh routes/pulse.js
  try {
    res.write(`event: ready\ndata: {}\n\n`);
  } catch {}
  clients.add(res);
  res.on("close", () => {
    clients.delete(res);
  });
}

/** Kirim ke 1 client */
export function send(res, data) {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // koneksi tutup
    clients.delete(res);
  }
}

/** Broadcast ke semua client yang aktif */
export function broadcast(obj) {
  const payload = normalizeAlert(obj);
  const dead = [];
  for (const res of clients) {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      dead.push(res);
    }
  }
  dead.forEach((r) => clients.delete(r));
}

/** Bentuk alert yang konsisten */
function normalizeAlert(a = {}) {
  const nowISO = new Date().toISOString();
  const out = {
    ts: toISO(a.ts) || nowISO,
    source: pick(a.source, a.src, "unknown"),
    symbol: pick(a.symbol, a.pair, a.ticker, "UNKNOWN"),
    signal: pick(a.signal, a.event, "signal"),
    validity: num(a.validity, a.confidence, 0.9),
    side: (pick(a.side, "neutral") || "neutral").toString().toLowerCase(),
    notes: pick(a.notes, a.note, a.comment, ""),
  };

  // format tambahan (mis. z / usd) → tempel ke signal agar informatif
  if (a.z != null && !/z=/.test(out.signal)) out.signal += ` z=${a.z}`;
  if (a.usd != null && !/\$/.test(out.signal)) out.signal += ` $${a.usd}`;
  return out;
}

/** Util: safe ISO */
function toISO(x) {
  if (!x) return null;
  if (typeof x === "number") return new Date(x).toISOString();
  const d = new Date(x);
  return isNaN(+d) ? null : d.toISOString();
}
function num(...xs) {
  for (const v of xs) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}
function pick(...xs) {
  for (const v of xs) if (v !== undefined && v !== null && v !== "") return v;
  return undefined;
}

/** Export juga helper re-format agar bisa dipakai dari routes */
export const toAlert = normalizeAlert;
