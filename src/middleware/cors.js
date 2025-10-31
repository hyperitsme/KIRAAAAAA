import cors from "cors";

export function buildCors() {
  const list = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (list.length === 0) {
    // default: allow local & anything (dev)
    return cors({ origin: true, credentials: true });
  }
  return cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (list.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true
  });
}

