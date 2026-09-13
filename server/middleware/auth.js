const { db } = require("../db");

function getUserFromToken(token) {
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND role = 'user'").get(token);
  if (!session) return null;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id);
  return user || null;
}

function requireUser(req, res, next) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const user = getUserFromToken(token);
  if (!user) return res.status(401).json({ error: "Not logged in." });
  req.user = user;
  req.token = token;
  next();
}

function optionalUser(req, _res, next) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  req.user = getUserFromToken(token);
  req.token = token;
  next();
}

module.exports = { requireUser, optionalUser, getUserFromToken };