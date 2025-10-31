import cors from "cors";

function norm(u){
  try { const x = new URL(u); return `${x.protocol}//${x.host}`; }
  catch { return (u || "").replace(/\/+$/,""); }
}

export function buildCors(){
  const list = (process.env.CORS_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const allow = new Set(list.map(norm));

  if (allow.size === 0) {
    console.warn("[CORS] No CORS_ORIGINS set → allow all (dev)");
    return cors({ origin: true, credentials: true });
  }
  return cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const o = norm(origin);
      if (allow.has(o)) return cb(null, true);
      cb(new Error(`[CORS] Blocked origin: ${origin}`));
    }
  });
}
