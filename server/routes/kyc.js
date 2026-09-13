const express = require("express");
const { db } = require("../db");
const { requireUser } = require("../middleware/auth");
const { logActivity } = require("../middleware/log");

const router = express.Router();

function ipOf(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
}

router.get("/", requireUser, (req, res) => {
  const submission = db.prepare(`
    SELECT * FROM kyc_submissions WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1
  `).get(req.user.id);
  res.json({ submission: submission || null, kyc_status: req.user.kyc_status });
});

router.post("/submit", requireUser, (req, res) => {
  const { full_name, date_of_birth, nin, address, id_type, id_number } = req.body || {};
  if (!full_name || !date_of_birth || !nin || !address || !id_type || !id_number) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (!/^\d{11}$/.test(String(nin))) {
    return res.status(400).json({ error: "NIN must be 11 digits." });
  }

  // If a pending submission exists, replace it
  db.prepare("DELETE FROM kyc_submissions WHERE user_id = ? AND status = 'pending'").run(req.user.id);

  const info = db.prepare(`
    INSERT INTO kyc_submissions (user_id, full_name, date_of_birth, nin, address, id_type, id_number, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(req.user.id, full_name, date_of_birth, nin, address, id_type, id_number);

  db.prepare("UPDATE users SET kyc_status = 'pending' WHERE id = ?").run(req.user.id);

  logActivity({
    actor_type: "user", actor_id: req.user.id,
    action: "kyc.submit", meta: { submission_id: info.lastInsertRowid }, ip: ipOf(req),
  });

  res.json({ ok: true, submission_id: info.lastInsertRowid });
});

module.exports = { router };