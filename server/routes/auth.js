const express = require("express");
const crypto = require("crypto");
const { db } = require("../db");
const { logActivity } = require("../middleware/log");

const router = express.Router();

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    method: u.method,
    balance: u.balance,
    kyc_status: u.kyc_status,
    created_at: u.created_at,
  };
}

function ipOf(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
}

// SIGNUP — email method
router.post("/signup", (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (existing) {
    if (existing.method === "email") {
      return res.status(409).json({ error: "An account with this email already exists. Log in instead." });
    }
    return res.status(409).json({ error: "This email is linked to a Google account. Use 'Sign in with Google' instead." });
  }

  const info = db.prepare(`
    INSERT INTO users (method, name, email, phone, password)
    VALUES ('email', ?, ?, ?, ?)
  `).run(name, email, phone || null, password);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  const token = newToken();
  db.prepare("INSERT INTO sessions (token, user_id, role) VALUES (?, ?, 'user')").run(token, user.id);

  logActivity({
    actor_type: "user",
    actor_id: user.id,
    action: "user.signup",
    meta: { email: user.email, method: "email" },
    ip: ipOf(req),
  });

  res.json({ token, user: publicUser(user) });
});

// LOGIN — email method
router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  if (user.method !== "email") {
    return res.status(409).json({ error: "This account uses Google sign-in. Use 'Sign in with Google' instead." });
  }
  if (user.password !== password) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  const token = newToken();
  db.prepare("INSERT INTO sessions (token, user_id, role) VALUES (?, ?, 'user')").run(token, user.id);

  logActivity({
    actor_type: "user",
    actor_id: user.id,
    action: "user.login",
    meta: { email: user.email, method: "email" },
    ip: ipOf(req),
  });

  res.json({ token, user: publicUser(user) });
});

// LOGOUT
router.post("/logout", (req, res) => {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
    if (session && session.role === "user") {
      logActivity({
        actor_type: "user",
        actor_id: session.user_id,
        action: "user.logout",
        ip: ipOf(req),
      });
    }
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  res.json({ ok: true });
});

module.exports = { router, publicUser, newToken, ipOf };

// GOOGLE (fake SSO) — create if new, login if existing, siloed by method
router.post("/google", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (existing) {
    if (existing.method !== "google") {
      return res.status(409).json({ error: "This email is registered with a different sign-in method." });
    }
    if (existing.password !== password) {
      return res.status(401).json({ error: "Incorrect password." });
    }
    const token = newToken();
    db.prepare("INSERT INTO sessions (token, user_id, role) VALUES (?, ?, 'user')").run(token, existing.id);
    logActivity({
      actor_type: "user",
      actor_id: existing.id,
      action: "user.google_login",
      meta: { email: existing.email },
      ip: ipOf(req),
    });
    return res.json({ token, user: publicUser(existing) });
  }

  // New account
  const info = db.prepare(`
    INSERT INTO users (method, name, email, password)
    VALUES ('google', ?, ?, ?)
  `).run(email.split("@")[0] || "Investor", email, password);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  const token = newToken();
  db.prepare("INSERT INTO sessions (token, user_id, role) VALUES (?, ?, 'user')").run(token, user.id);

  logActivity({
    actor_type: "user",
    actor_id: user.id,
    action: "user.google_signup",
    meta: { email: user.email },
    ip: ipOf(req),
  });

  res.json({ token, user: publicUser(user) });
});