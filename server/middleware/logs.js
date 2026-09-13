const { db } = require("../db");

function logActivity({ actor_type, actor_id = null, action, meta = null, ip = null }) {
  try {
    db.prepare(`
      INSERT INTO activity_log (actor_type, actor_id, action, meta, ip)
      VALUES (?, ?, ?, ?, ?)
    `).run(actor_type, actor_id, action, meta ? JSON.stringify(meta) : null, ip);
  } catch (e) {
    // Never let logging break the request.
    console.error("activity_log write failed:", e.message);
  }
}

module.exports = { logActivity };