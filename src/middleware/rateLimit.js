// src/middleware/rateLimit.js
const store = new Map();
// very tiny sliding window
export function tinyRateLimit({ windowMs = 10_000, max = 40 } = {}) {
  return (req, res, next) => {
    const key = req.ip || req.headers["x-forwarded-for"] || "ip";
    const now = Date.now();
    const arr = store.get(key)?.filter((t) => now - t < windowMs) || [];
    arr.push(now);
    store.set(key, arr);
    if (arr.length > max) {
      return res.status(429).json({ error: "rate_limited" });
    }
    next();
  };
}
