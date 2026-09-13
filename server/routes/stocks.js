const express = require("express");
const { db } = require("../db");

const router = express.Router();

router.get("/", (_req, res) => {
  const stocks = db.prepare(`
    SELECT id, symbol, name, exchange, image_url, base_price, min_price, max_price,
           current_price, change_pct, is_active, is_featured
    FROM stocks
    WHERE is_active = 1
    ORDER BY is_featured DESC, symbol ASC
  `).all();
  res.json({ stocks });
});

router.get("/:symbol", (req, res) => {
  const s = db.prepare("SELECT * FROM stocks WHERE symbol = ? AND is_active = 1").get(req.params.symbol);
  if (!s) return res.status(404).json({ error: "Stock not found." });
  res.json({ stock: s });
});

module.exports = { router };