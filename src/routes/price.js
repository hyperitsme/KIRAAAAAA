// src/routes/price.js
import { Router } from "express";

const router = Router();

// Peta simbol → id CoinGecko (bisa tambah sesuai kebutuhan)
const COINGECKO_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  DOGE: "dogecoin",
};

const VS = "usd";

async function fetchSimple(ids) {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?" +
    new URLSearchParams({ ids: ids.join(","), vs_currencies: VS }).toString();

  // Node 18+ punya fetch bawaan
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  return r.json();
}

/**
 * GET /api/price/:symbol
 * contoh: /api/price/SOL  → { symbol:"SOL", price: 178.23, source:"coingecko" }
 */
router.get("/price/:symbol", async (req, res) => {
  try {
    const sym = String(req.params.symbol || "").toUpperCase();
    const id = COINGECKO_IDS[sym];
    if (!id) return res.status(400).json({ error: "unsupported_symbol", sym });

    const data = await fetchSimple([id]);
    const price = data?.[id]?.[VS];
    if (price == null) return res.status(502).json({ error: "no_price" });

    res.json({ symbol: sym, price, vs: VS, source: "coingecko" });
  } catch (e) {
    res.status(500).json({ error: "price_failed", detail: String(e.message || e) });
  }
});

/**
 * GET /api/price/simple?symbols=SOL,ETH,BTC
 * contoh: /api/price/simple?symbols=SOL,ETH
 * output: { SOL: 178.23, ETH: 3540.12 }
 */
router.get("/price/simple", async (req, res) => {
  try {
    const list =
      String(req.query.symbols || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean) || [];

    if (!list.length) return res.status(400).json({ error: "symbols_required" });

    const ids = [];
    const mapBack = {};
    for (const sym of list) {
      const id = COINGECKO_IDS[sym];
      if (id) {
        ids.push(id);
        mapBack[id] = sym;
      }
    }
    if (!ids.length) return res.status(400).json({ error: "no_supported_symbols" });

    const data = await fetchSimple(ids);

    const out = {};
    for (const id of ids) {
      const sym = mapBack[id];
      const p = data?.[id]?.[VS];
      if (p != null) out[sym] = p;
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "price_failed", detail: String(e.message || e) });
  }
});

export default router;
