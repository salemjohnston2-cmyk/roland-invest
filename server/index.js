const express = require("express");
const cors = require("cors");

const { db, migrate } = require("./db");
const { seed } = require("./seed");
const { startFluctuation } = require("./fluctuate");

const { router: authRoutes } = require("./routes/auth");
const { router: meRoutes } = require("./routes/me");
const { router: stocksRoutes } = require("./routes/stocks");
const { router: contentRoutes } = require("./routes/content");
const { router: depositRoutes } = require("./routes/deposit");
const { router: buyRoutes } = require("./routes/buy");
const { router: kycRoutes } = require("./routes/kyc");
const { router: withdrawRoutes } = require("./routes/withdraw");
const { router: adminRoutes } = require("./routes/admin");

migrate();
seed();

const app = express();
app.use(express.json({ limit: "1mb" }));

const origins = (process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500")
  .split(",").map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (origins.includes(origin) || origins.includes("*")) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.get("/health", (_req, res) => {
  let dbOk = false;
  try { db.prepare("SELECT 1").get(); dbOk = true; } catch (_) {}
  res.json({ ok: true, db: dbOk, uptime: process.uptime() });
});

app.use("/api/auth", authRoutes);
app.use("/api/me", meRoutes);
app.use("/api/stocks", stocksRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/deposit", depositRoutes);
app.use("/api/buy", buyRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/api/dollyb14", adminRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found." }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("Roland Invests API listening on port " + PORT);
  startFluctuation();
});