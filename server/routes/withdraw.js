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

router.post("/initiate", requireUser, (req, res) => {
  const { amount, bank_account_id } = req.body || {};
  const amt = Number(amount);

  if (!amt || amt <= 0) return res.status(400).json({ error: "Enter a valid amount." });
  if (req.user.kyc_status !== "approved") {
    return res.status(403).json({ error: "Complete your identity verification before withdrawing." });
  }
  if (amt > req.user.balance) {
    return res.status(400).json({ error: "Insufficient balance." });
  }

  const account = db.prepare("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?").get(bank_account_id, req.user.id);
  if (!account) return res.status(400).json({ error: "Select a valid bank account." });

  // Deduct immediately (hold)
  db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(amt, req.user.id);

  const reference = newReference();
  const meta = {
    bank_name: account.bank_name,
    account_number: account.account_number,
    account_name: account.account_name,
  };

  const info = db.prepare(`
    INSERT INTO transactions (user_id, type, method, amount, status, reference, meta)
    VALUES (?, 'withdrawal', 'bank', ?, 'pending', ?, ?)
  `).run(req.user.id, amt, reference, JSON.stringify(meta));

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "withdraw.initiate", meta: { reference, amount: amt, bank: account.bank_name }, ip: ipOf(req),
  });

  res.json({ reference, transaction_id: info.lastInsertRowid });
});

module.exports = { router };