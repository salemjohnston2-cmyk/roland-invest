const express = require("express");
const { db } = require("../db");
const { requireUser } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireUser, (req, res) => {
  const u = req.user;
  const holdingsCount = db.prepare("SELECT COUNT(*) AS c FROM holdings WHERE user_id = ? AND quantity > 0").get(u.id).c;
  res.json({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      method: u.method,
      balance: u.balance,
      kyc_status: u.kyc_status,
      created_at: u.created_at,
      holdings_count: holdingsCount,
    },
  });
});

module.exports = { router };