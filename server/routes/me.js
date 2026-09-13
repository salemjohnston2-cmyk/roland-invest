const express = require("express");
const { db } = require("../db");
const { requireUser } = require("../middleware/auth");
const { logActivity } = require("../middleware/log");

const router = express.Router();

function ipOf(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
}

router.get("/", requireUser, (req, res) => {
  const u = req.user;
  const holdingsCount = db.prepare("SELECT COUNT(*) AS c FROM holdings WHERE user_id = ? AND quantity > 0").get(u.id).c;
  res.json({
    user: {
      id: u.id, name: u.name, email: u.email, phone: u.phone,
      method: u.method, balance: u.balance, kyc_status: u.kyc_status,
      created_at: u.created_at, holdings_count: holdingsCount,
    },
  });
});

router.patch("/", requireUser, (req, res) => {
  const { name, phone } = req.body || {};
  const updates = [];
  const params = [];
  if (typeof name === "string" && name.trim()) { updates.push("name = ?"); params.push(name.trim()); }
  if (typeof phone === "string") { updates.push("phone = ?"); params.push(phone.trim()); }
  if (!updates.length) return res.status(400).json({ error: "Nothing to update." });

  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "user.profile_updated", meta: { fields: Object.keys(req.body || {}) }, ip: ipOf(req),
  });

  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone, balance: u.balance, kyc_status: u.kyc_status } });
});

router.get("/holdings", requireUser, (req, res) => {
  const rows = db.prepare(`
    SELECT h.symbol, h.quantity, h.avg_buy_price, s.name, s.exchange, s.current_price, s.change_pct
    FROM holdings h
    LEFT JOIN stocks s ON s.symbol = h.symbol
    WHERE h.user_id = ? AND h.quantity > 0
    ORDER BY h.updated_at DESC
  `).all(req.user.id);

  const holdings = rows.map(r => {
    const currentValue = r.quantity * (r.current_price || 0);
    const costBasis = r.quantity * r.avg_buy_price;
    const pl = currentValue - costBasis;
    return {
      symbol: r.symbol,
      name: r.name || r.symbol,
      exchange: r.exchange || "",
      quantity: r.quantity,
      avg_buy_price: r.avg_buy_price,
      current_price: r.current_price || 0,
      change_pct: r.change_pct || 0,
      current_value: Number(currentValue.toFixed(2)),
      cost_basis: Number(costBasis.toFixed(2)),
      profit_loss: Number(pl.toFixed(2)),
    };
  });

  const totalValue = holdings.reduce((s, h) => s + h.current_value, 0);
  res.json({ holdings, total_value: Number(totalValue.toFixed(2)) });
});

router.get("/transactions", requireUser, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  const type = req.query.type;
  const status = req.query.status;

  let where = "WHERE user_id = ?";
  const params = [req.user.id];
  if (type) { where += " AND type = ?"; params.push(type); }
  if (status) { where += " AND status = ?"; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM transactions ${where}`).get(...params).c;
  const rows = db.prepare(`
    SELECT id, type, method, amount, status, reference, meta, created_at, updated_at
    FROM transactions ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const transactions = rows.map(r => ({
    ...r,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));

  res.json({ transactions, total, limit, offset });
});

// Bank accounts
router.get("/bank-accounts", requireUser, (req, res) => {
  const accounts = db.prepare("SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY is_default DESC, created_at DESC").all(req.user.id);
  res.json({ accounts });
});

router.post("/bank-accounts", requireUser, (req, res) => {
  const { bank_name, account_number, account_name } = req.body || {};
  if (!bank_name || !account_number || !account_name) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (!/^\d{10}$/.test(String(account_number))) {
    return res.status(400).json({ error: "Account number must be 10 digits." });
  }

  const count = db.prepare("SELECT COUNT(*) AS c FROM bank_accounts WHERE user_id = ?").get(req.user.id).c;
  const isDefault = count === 0 ? 1 : 0;

  const info = db.prepare(`
    INSERT INTO bank_accounts (user_id, bank_name, account_number, account_name, is_default)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, bank_name, account_number, account_name, isDefault);

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "user.bank_account_added", meta: { bank_name, last4: String(account_number).slice(-4) }, ip: ipOf(req),
  });

  const account = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(info.lastInsertRowid);
  res.json({ account });
});

router.patch("/bank-accounts/:id/default", requireUser, (req, res) => {
  const id = parseInt(req.params.id);
  const acc = db.prepare("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if (!acc) return res.status(404).json({ error: "Account not found." });

  db.prepare("UPDATE bank_accounts SET is_default = 0 WHERE user_id = ?").run(req.user.id);
  db.prepare("UPDATE bank_accounts SET is_default = 1 WHERE id = ?").run(id);
  res.json({ ok: true });
});

router.delete("/bank-accounts/:id", requireUser, (req, res) => {
  const id = parseInt(req.params.id);
  const acc = db.prepare("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if (!acc) return res.status(404).json({ error: "Account not found." });

  const remaining = db.prepare("SELECT COUNT(*) AS c FROM bank_accounts WHERE user_id = ?").get(req.user.id).c;
  if (remaining === 1) {
    return res.status(400).json({ error: "You must keep at least one bank account." });
  }

  db.prepare("DELETE FROM bank_accounts WHERE id = ?").run(id);

  // If we deleted the default, promote another
  if (acc.is_default) {
    const next = db.prepare("SELECT id FROM bank_accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(req.user.id);
    if (next) db.prepare("UPDATE bank_accounts SET is_default = 1 WHERE id = ?").run(next.id);
  }

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "user.bank_account_removed", meta: { last4: String(acc.account_number).slice(-4) }, ip: ipOf(req),
  });

  res.json({ ok: true });
});

module.exports = { router };