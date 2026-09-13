const express = require("express");
const cors = require("cors");

const { db, migrate } = require("./db");
const { seed } = require("./seed");

const { router: authRoutes } = require("./routes/auth");
const { router: meRoutes } = require("./routes/me");

migrate();
seed();

const app = express();
app.use(express.json({ limit: "1mb" }));

const origins = (process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true); // curl / server-to-server
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

// Fallback
app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("Roland Invests API listening on port " + PORT);
});