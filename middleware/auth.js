const jwt = require("jsonwebtoken");
const User = require("../models/User");

const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET || "secret_fallback", { expiresIn: "30d" });

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return res.status(401).json({ success: false, message: "Not authorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret_fallback");
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return res.status(401).json({ success: false, message: "User not found" });
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Token invalid or expired" });
  }
};

const isDealer = (req, res, next) => {
  if (req.user.role === "dealer" || req.user.role === "admin") return next();
  return res.status(403).json({ success: false, message: "Dealer access required" });
};

const isAdmin = (req, res, next) => {
  if (req.user.role === "admin") return next();
  return res.status(403).json({ success: false, message: "Admin access required" });
};

module.exports = { generateToken, protect, isDealer, isAdmin };



