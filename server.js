const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// app.use(cors({
//   origin: [
//     process.env.FRONTEND_URL || "http://localhost:5173",
//     "http://localhost:5173",
//     "http://localhost:3000",
//     "http://127.0.0.1:5173",
//   ],
//   credentials: true,
// }));

app.use(cors({
  origin: [
    "https://emergency-safety-qrr.netlify.app",
    "http://localhost:5173"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.options("*", cors())

///////
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",   require("./routes/auth"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/scan",   require("./routes/scan"));
app.use("/api/call",   require("./routes/call"));   // masked calling bridge
app.use("/api/wallet", require("./routes/wallet"));
app.use("/api/dealer", require("./routes/dealer"));
app.use("/api/admin",  require("./routes/admin"));


app.get("/", (req, res) => {
  res.send("Backend API is running 🚀");
});




// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));
app.get("/", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Internal server error" });
});

// ── Connect & Start ───────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/emergency_qrr")
  .then(() => {
    console.log("✅ MongoDB connected");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("❌ DB Error:", err.message);
    process.exit(1);
  });
