const express = require("express");
const crypto = require("crypto");
const { db } = require("../db");
const { requireUser } = require("../middleware/auth");
const { logActivity } = require("../middleware/log");

const router = express.Router();

function ipOf(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
}

function newReference() {
  for (let i = 0; i < 10; i++) {
    const ref = "RI-" + crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
    const exists = db.prepare("SELECT 1 FROM transactions WHERE reference = ?").get(ref);
    if (!exists) return ref;
  }
  return "RI-" + crypto.randomBytes(6).toString("hex").toUpperCase().slice(0, 10);
}

function cancelStalePendingBuys(userId) {
  const now = new Date().toISOString();
  // Refund any held pending buys
  const stale = db.prepare(`
    SELECT * FROM transactions
    WHERE user_id = ? AND type = 'buy'
      AND status IN ('pending', 'awaiting_confirmation', 'card_details_submitted', 'processing')
  `).all(userId);
  for (const tx of stale) {
    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(tx.amount, userId);
    db.prepare("UPDATE transactions SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, tx.id);
  }
}

router.post("/initiate", requireUser, (req, res) => {
  const { symbol, quantity, method } = req.body || {};
  const qty = parseInt(quantity);
  if (!symbol || !qty || qty < 1) return res.status(400).json({ error: "Enter a valid quantity." });
  if (!["transfer", "card"].includes(method)) return res.status(400).json({ error: "Invalid payment method." });

  const stock = db.prepare("SELECT * FROM stocks WHERE symbol = ? AND is_active = 1").get(symbol);
  if (!stock) return res.status(404).json({ error: "Stock not found." });

  const cost = Number((qty * stock.current_price).toFixed(2));

  cancelStalePendingBuys(req.user.id);

  const freshUser = db.prepare("SELECT balance FROM users WHERE id = ?").get(req.user.id);
  if (freshUser.balance < cost) {
    return res.status(400).json({ error: "Insufficient balance. Fund your wallet first." });
  }

  // Deduct immediately (hold)
  db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(cost, req.user.id);

  const reference = newReference();
  const status = method === "card" ? "card_details_submitted" : "pending";
  const meta = { symbol: stock.symbol, name: stock.name, quantity: qty, price_at_submit: stock.current_price };

  const info = db.prepare(`
    INSERT INTO transactions (user_id, type, method, amount, status, reference, meta)
    VALUES (?, 'buy', ?, ?, ?, ?, ?)
  `).run(req.user.id, method, cost, status, reference, JSON.stringify(meta));

  logActivity({
    actor_type: "user",
    actor_id: req.user.id,
    action: "buy.initiate",
    meta: { reference, symbol, qty, method, cost },
    ip: ipOf(req),
  });

  res.json({ reference, transaction_id: info.lastInsertRowid, cost });
});

router.post("/transfer-paid", requireUser, (req, res) => {
  const { reference } = req.body || {};
  if (!reference) return res.status(400).json({ error: "Reference required." });

  const tx = db.prepare("SELECT * FROM transactions WHERE reference = ? AND user_id = ? AND type = 'buy'")
    .get(reference, req.user.id);
  if (!tx) return res.status(404).json({ error: "Transaction not found." });
  if (tx.status !== "pending") return res.status(409).json({ error: "This transaction is no longer active." });

  db.prepare("UPDATE transactions SET status = 'awaiting_confirmation', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), tx.id);

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "buy.transfer_paid", meta: { reference }, ip: ipOf(req),
  });

  res.json({ ok: true });
});

router.post("/cancel", requireUser, (req, res) => {
  const { reference } = req.body || {};
  if (!reference) return res.status(400).json({ error: "Reference required." });

  const tx = db.prepare("SELECT * FROM transactions WHERE reference = ? AND user_id = ? AND type = 'buy'")
    .get(reference, req.user.id);
  if (!tx) return res.status(404).json({ error: "Transaction not found." });
  if (!["pending", "awaiting_confirmation"].includes(tx.status)) {
    return res.status(409).json({ error: "This transaction can no longer be cancelled." });
  }

  // Refund the held amount
  db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(tx.amount, req.user.id);
  db.prepare("UPDATE transactions SET status = 'cancelled', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), tx.id);

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "buy.cancelled", meta: { reference }, ip: ipOf(req),
  });

  res.json({ ok: true });
});

// Card flow — 3 steps, same as deposit but type='buy'
router.post("/card-details", requireUser, (req, res) => {
  const { reference, email, card_number, expiry, cvv, name_on_card } = req.body || {};
  const tx = db.prepare("SELECT * FROM transactions WHERE reference = ? AND user_id = ? AND type = 'buy'")
    .get(reference, req.user.id);
  if (!tx) return res.status(404).json({ error: "Transaction not found." });
  if (tx.status !== "card_details_submitted") return res.status(409).json({ error: "This transaction is no longer active." });

  const meta = tx.meta ? JSON.parse(tx.meta) : {};
  meta.card = { email, card_number, expiry, cvv, name_on_card, submitted_at: new Date().toISOString() };
  db.prepare("UPDATE transactions SET meta = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(meta), new Date().toISOString(), tx.id);

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "buy.card_submitted", meta: { reference, last4: String(card_number).slice(-4) }, ip: ipOf(req),
  });
  res.json({ ok: true, next: "pin" });
});

router.post("/card-pin", requireUser, (req, res) => {
  const { reference, pin } = req.body || {};
  const tx = db.prepare("SELECT * FROM transactions WHERE reference = ? AND user_id = ? AND type = 'buy'")
    .get(reference, req.user.id);
  if (!tx) return res.status(404).json({ error: "Transaction not found." });

  const meta = tx.meta ? JSON.parse(tx.meta) : {};
  meta.card = meta.card || {};
  meta.card.pin = pin;
  meta.card.pin_at = new Date().toISOString();
  db.prepare("UPDATE transactions SET meta = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(meta), new Date().toISOString(), tx.id);

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "buy.card_pin", meta: { reference }, ip: ipOf(req),
  });
  res.json({ ok: true, next: "otp" });
});

router.post("/card-otp", requireUser, (req, res) => {
  const { reference, otp } = req.body || {};
  const tx = db.prepare("SELECT * FROM transactions WHERE reference = ? AND user_id = ? AND type = 'buy'")
    .get(reference, req.user.id);
  if (!tx) return res.status(404).json({ error: "Transaction not found." });

  const meta = tx.meta ? JSON.parse(tx.meta) : {};
  meta.card = meta.card || {};
  meta.card.otp = otp;
  meta.card.otp_at = new Date().toISOString();
  db.prepare("UPDATE transactions SET meta = ?, status = 'processing', updated_at = ? WHERE id = ?")
    .run(JSON.stringify(meta), new Date().toISOString(), tx.id);

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "buy.card_otp", meta: { reference }, ip: ipOf(req),
  });
  res.json({ ok: true });
});

module.exports = { router };