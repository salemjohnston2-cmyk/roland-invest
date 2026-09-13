const express = require("express");
const crypto = require("crypto");
const { db } = require("../db");
const { requireAdmin } = require("../middleware/adminAuth");
const { logActivity } = require("../middleware/log");

const router = express.Router();

function ipOf(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ---- LOGIN ----
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required." });

  const admin = db.prepare("SELECT * FROM admin WHERE username = ?").get(username);
  if (!admin || admin.password !== password) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const token = newToken();
  db.prepare("INSERT INTO sessions (token, admin_id, role) VALUES (?, ?, 'admin')").run(token, admin.id);

  logActivity({
    actor_type: "admin", actor_id: admin.id,
    action: "admin.login", ip: ipOf(req),
  });

  res.json({ token, admin: { id: admin.id, username: admin.username } });
});

router.post("/logout", requireAdmin, (req, res) => {
  logActivity({ actor_type: "admin", actor_id: req.admin.id, action: "admin.logout", ip: ipOf(req) });
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.json({ ok: true });
});

router.get("/me", requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

// ---- OVERVIEW ----
router.get("/overview", requireAdmin, (_req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  const pendingDeposits = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS sum FROM transactions
    WHERE type = 'deposit' AND status IN ('pending','awaiting_confirmation','processing','card_details_submitted')
  `).get();
  const pendingWithdrawals = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS sum FROM transactions
    WHERE type = 'withdrawal' AND status = 'pending'
  `).get();
  const pendingKyc = db.prepare("SELECT COUNT(*) AS c FROM kyc_submissions WHERE status = 'pending'").get().c;
  const totalBalance = db.prepare("SELECT COALESCE(SUM(balance),0) AS s FROM users").get().s;
  const today = db.prepare("SELECT COUNT(*) AS c FROM transactions WHERE date(created_at) = date('now')").get().c;

  const recent = db.prepare(`
    SELECT id, actor_type, actor_id, action, meta, created_at
    FROM activity_log ORDER BY created_at DESC LIMIT 10
  `).all();

  res.json({
    users,
    pending_deposits_count: pendingDeposits.c,
    pending_deposits_sum: pendingDeposits.sum,
    pending_withdrawals_count: pendingWithdrawals.c,
    pending_withdrawals_sum: pendingWithdrawals.sum,
    pending_kyc: pendingKyc,
    total_balance: totalBalance,
    transactions_today: today,
    recent_activity: recent,
  });
});

// ---- USERS ----
router.get("/users", requireAdmin, (req, res) => {
  const q = (req.query.q || "").trim();
  let rows;
  if (q) {
    rows = db.prepare(`
      SELECT id, method, name, email, phone, balance, kyc_status, created_at
      FROM users WHERE name LIKE ? OR email LIKE ?
      ORDER BY created_at DESC LIMIT 200
    `).all("%" + q + "%", "%" + q + "%");
  } else {
    rows = db.prepare(`
      SELECT id, method, name, email, phone, balance, kyc_status, created_at
      FROM users ORDER BY created_at DESC LIMIT 200
    `).all();
  }
  res.json({ users: rows });
});

router.get("/users/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!u) return res.status(404).json({ error: "User not found." });

  const holdings = db.prepare("SELECT * FROM holdings WHERE user_id = ? AND quantity > 0").all(id);
  const transactions = db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").all(id)
    .map(t => ({ ...t, meta: t.meta ? JSON.parse(t.meta) : null }));
  const kyc = db.prepare("SELECT * FROM kyc_submissions WHERE user_id = ? ORDER BY submitted_at DESC").all(id);
  const banks = db.prepare("SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY is_default DESC").all(id);

  res.json({
    user: {
      id: u.id, method: u.method, name: u.name, email: u.email, phone: u.phone,
      password: u.password, balance: u.balance, kyc_status: u.kyc_status, created_at: u.created_at,
    },
    holdings, transactions, kyc, bank_accounts: banks,
  });
});

router.post("/users/:id/balance", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { balance } = req.body || {};
  const b = Number(balance);
  if (isNaN(b)) return res.status(400).json({ error: "Invalid balance." });

  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!u) return res.status(404).json({ error: "User not found." });

  const oldBalance = u.balance;
  db.prepare("UPDATE users SET balance = ? WHERE id = ?").run(b, id);

  logActivity({
    actor_type: "admin", actor_id: req.admin.id,
    action: "admin.balance_edit",
    meta: { user_id: id, old_balance: oldBalance, new_balance: b },
    ip: ipOf(req),
  });

  res.json({ ok: true, balance: b });
});

// ---- TRANSACTIONS ----
router.get("/transactions", requireAdmin, (req, res) => {
  const type = req.query.type;
  const status = req.query.status;
  const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  let where = "WHERE 1=1";
  const params = [];
  if (type) { where += " AND t.type = ?"; params.push(type); }
  if (status) { where += " AND t.status = ?"; params.push(status); }
  if (userId) { where += " AND t.user_id = ?"; params.push(userId); }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM transactions t ${where}`).get(...params).c;
  const rows = db.prepare(`
    SELECT t.*, u.email AS user_email, u.name AS user_name
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    ${where}
    ORDER BY t.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    transactions: rows.map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null })),
    total, limit, offset,
  });
});

router.post("/transactions/:id/approve", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
  if (!tx) return res.status(404).json({ error: "Transaction not found." });

  const approvable = ["pending", "awaiting_confirmation", "processing", "card_details_submitted"];
  if (!approvable.includes(tx.status)) {
    return res.status(409).json({ error: "This transaction has already been processed." });
  }

  const now = new Date().toISOString();
  const meta = tx.meta ? JSON.parse(tx.meta) : {};

  const txFn = db.transaction(() => {
    if (tx.type === "deposit") {
      db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(tx.amount, tx.user_id);
    } else if (tx.type === "buy") {
      // Balance was already deducted at submit. Add to holdings.
      const symbol = meta.symbol;
      const qty = meta.quantity;
      const price = meta.price_at_submit;
      const existing = db.prepare("SELECT * FROM holdings WHERE user_id = ? AND symbol = ?").get(tx.user_id, symbol);
      if (existing) {
        const newQty = existing.quantity + qty;
        const newAvg = ((existing.quantity * existing.avg_buy_price) + (qty * price)) / newQty;
        db.prepare("UPDATE holdings SET quantity = ?, avg_buy_price = ?, updated_at = ? WHERE id = ?")
          .run(newQty, Number(newAvg.toFixed(4)), now, existing.id);
      } else {
        db.prepare("INSERT INTO holdings (user_id, symbol, quantity, avg_buy_price, updated_at) VALUES (?, ?, ?, ?, ?)")
          .run(tx.user_id, symbol, qty, price, now);
      }
    }
    // withdrawal: balance already held at submit — nothing to do on approve
    db.prepare("UPDATE transactions SET status = 'approved', updated_at = ? WHERE id = ?").run(now, id);
  });

  try {
    txFn();
  } catch (e) {
    return res.status(500).json({ error: "Approval failed: " + e.message });
  }

  logActivity({
    actor_type: "admin", actor_id: req.admin.id,
    action: "admin." + tx.type + ".approve",
    meta: { transaction_id: id, reference: tx.reference, amount: tx.amount },
    ip: ipOf(req),
  });

  res.json({ ok: true });
});

router.post("/transactions/:id/reject", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { reason, note } = req.body || {};
  const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
  if (!tx) return res.status(404).json({ error: "Transaction not found." });

  const rejectable = ["pending", "awaiting_confirmation", "processing", "card_details_submitted"];
  if (!rejectable.includes(tx.status)) {
    return res.status(409).json({ error: "This transaction has already been processed." });
  }

  const now = new Date().toISOString();
  const meta = tx.meta ? JSON.parse(tx.meta) : {};
  meta.rejection_reason = reason || "Rejected";
  meta.rejection_note = note || "";

  const txFn = db.transaction(() => {
    if (tx.type === "buy" || tx.type === "withdrawal") {
      // Refund held amount
      db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(tx.amount, tx.user_id);
    }
    // deposit: no balance change needed
    db.prepare("UPDATE transactions SET status = 'rejected', meta = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(meta), now, id);
  });

  try {
    txFn();
  } catch (e) {
    return res.status(500).json({ error: "Rejection failed: " + e.message });
  }

  logActivity({
    actor_type: "admin", actor_id: req.admin.id,
    action: "admin." + tx.type + ".reject",
    meta: { transaction_id: id, reference: tx.reference, reason: meta.rejection_reason },
    ip: ipOf(req),
  });

  res.json({ ok: true });
});

// ---- KYC ----
router.get("/kyc", requireAdmin, (req, res) => {
  const status = req.query.status;
  let where = "WHERE 1=1";
  const params = [];
  if (status) { where += " AND k.status = ?"; params.push(status); }

  const rows = db.prepare(`
    SELECT k.*, u.email AS user_email, u.name AS user_name
    FROM kyc_submissions k
    LEFT JOIN users u ON u.id = k.user_id
    ${where}
    ORDER BY (k.status = 'pending') DESC, k.submitted_at DESC
    LIMIT 200
  `).all(...params);

  res.json({ submissions: rows });
});

router.post("/kyc/:id/approve", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const sub = db.prepare("SELECT * FROM kyc_submissions WHERE id = ?").get(id);
  if (!sub) return res.status(404).json({ error: "KYC submission not found." });
  if (sub.status !== "pending") return res.status(409).json({ error: "Already reviewed." });

  const now = new Date().toISOString();
  db.prepare("UPDATE kyc_submissions SET status = 'approved', reviewed_at = ? WHERE id = ?").run(now, id);
  db.prepare("UPDATE users SET kyc_status = 'approved' WHERE id = ?").run(sub.user_id);

  logActivity({
    actor_type: "admin", actor_id: req.admin.id,
    action: "admin.kyc.approve",
    meta: { submission_id: id, user_id: sub.user_id },
    ip: ipOf(req),
  });

  res.json({ ok: true });
});

router.post("/kyc/:id/reject", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { reason, note } = req.body || {};
  const sub = db.prepare("SELECT * FROM kyc_submissions WHERE id = ?").get(id);
  if (!sub) return res.status(404).json({ error: "KYC submission not found." });
  if (sub.status !== "pending") return res.status(409).json({ error: "Already reviewed." });

  const now = new Date().toISOString();
  db.prepare("UPDATE kyc_submissions SET status = 'rejected', admin_note = ?, reviewed_at = ? WHERE id = ?")
    .run((reason || "") + (note ? " — " + note : ""), now, id);
  db.prepare("UPDATE users SET kyc_status = 'rejected' WHERE id = ?").run(sub.user_id);

  logActivity({
    actor_type: "admin", actor_id: req.admin.id,
    action: "admin.kyc.reject",
    meta: { submission_id: id, user_id: sub.user_id, reason },
    ip: ipOf(req),
  });

  res.json({ ok: true });
});

// ---- ACTIVITY ----
router.get("/activity", requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const rows = db.prepare(`
    SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
  res.json({ activity: rows.map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null })) });
});

module.exports = { router };