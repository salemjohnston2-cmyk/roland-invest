const { db } = require("../db");

function requireAdmin(req, res, next) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Admin authentication required." });
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND role = 'admin'").get(token);
  if (!session) return res.status(401).json({ error: "Admin authentication required." });
  const admin = db.prepare("SELECT id, username FROM admin WHERE id = ?").get(session.admin_id);
  if (!admin) return res.status(401).json({ error: "Admin authentication required." });
  req.admin = admin;
  req.token = token;
  next();
}

module.exports = { requireAdmin };