const express = require("express");
const { db } = require("../db");

const router = express.Router();

router.get("/", (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM site_content").all();
  const content = {};
  for (const r of rows) content[r.key] = r.value;

  const bank = db.prepare("SELECT bank_name, account_name, account_number FROM bank_details WHERE id = 1").get();

  res.json({
    content,
    bank: bank ? {
      bank_name: bank.bank_name,
      account_name: bank.account_name,
      account_number: bank.account_number,
    } : null,
  });
});

module.exports = { router };