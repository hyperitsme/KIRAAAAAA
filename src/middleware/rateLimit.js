// Super simple in-memory rate limit (IP-based). Untuk production, ganti Redis.
const hits = new Map();

export function tinyRateLimit({ windowMs = 10_000, max = 30 } = {}) {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.ip || "unknown";
    const now = Date.now();
    const bucket = hits.get(ip) || [];
    const fresh = bucket.filter(ts => now - ts < windowMs);
    fresh.push(now);
    hits.set(ip, fresh);
    if (fresh.length > max) {
      return res.status(429).json({ error: "Too many requests. Slow down." });
    }
    next();
  };
}
