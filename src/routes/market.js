import { Router } from "express";
const router = Router();

// Super simple placeholder: random up/down
router.get("/btc-1h", (req, res) => {
  const outcome = Math.random() < 0.5 ? "up" : "down";
  res.json({ outcome, horizon: "1h" });
});

export default router;
