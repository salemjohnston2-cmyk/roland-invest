const { db } = require("./db");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pickInterval() {
  return Math.random() < 0.5 ? 5000 : 10000;
}

function pickDelta() {
  // Returns ±0.6% or ±0.2%, picked randomly.
  const sign = Math.random() < 0.5 ? -1 : 1;
  const magnitude = Math.random() < 0.5 ? 0.006 : 0.002;
  return sign * magnitude;
}

function tick() {
  const stocks = db.prepare("SELECT id, base_price, min_price, max_price, current_price FROM stocks WHERE is_active = 1").all();
  const update = db.prepare("UPDATE stocks SET current_price = ?, change_pct = ? WHERE id = ?");

  const tx = db.transaction((list) => {
    for (const s of list) {
      const delta = pickDelta();
      const next = clamp(s.current_price * (1 + delta), s.min_price, s.max_price);
      const change = ((next - s.base_price) / s.base_price) * 100;
      update.run(Number(next.toFixed(2)), Number(change.toFixed(2)), s.id);
    }
  });

  try { tx(stocks); } catch (e) { console.error("fluctuate tick failed:", e.message); }

  setTimeout(tick, pickInterval());
}

function startFluctuation() {
  // First tick after 3s so boot logs are clean.
  setTimeout(tick, 3000);
}

module.exports = { startFluctuation };