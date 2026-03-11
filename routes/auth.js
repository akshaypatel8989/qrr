const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { Wallet } = require("../models/Wallet");
const { generateToken, protect } = require("../middleware/auth");

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
  return null;
};

// POST /api/auth/signup
router.post("/signup", [
  body("fullName").trim().notEmpty().withMessage("Full name is required"),
  body("email").isEmail().withMessage("Valid email required"),
  body("phone").trim().notEmpty().withMessage("Phone is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
], async (req, res) => {
  const err = validate(req, res); if (err) return;
  try {
    const { fullName, email, phone, password, referralCode } = req.body;
    if (await User.findOne({ email }))
      return res.status(400).json({ success: false, message: "Email already registered" });

    const user = await User.create({ fullName, email, phone, password });
    await Wallet.create({ userId: user._id });

    res.status(201).json({
      success: true,
      token: generateToken(user._id),
      user: { _id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, referralCode: user.referralCode },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/auth/login
router.post("/login", [
  body("email").isEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password required"),
], async (req, res) => {
  const err = validate(req, res); if (err) return;
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    if (!user.isActive)
      return res.status(403).json({ success: false, message: "Account deactivated. Contact support." });

    res.json({
      success: true,
      token: generateToken(user._id),
      user: { _id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, referralCode: user.referralCode, dealerCode: user.dealerCode || null },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/auth/me
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/auth/profile
router.put("/profile", protect, async (req, res) => {
  try {
    const { fullName, phone } = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, { fullName, phone }, { new: true }).select("-password");
    res.json({ success: true, message: "Profile updated", user });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/auth/change-password
router.put("/change-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.matchPassword(currentPassword)))
      return res.status(400).json({ success: false, message: "Current password incorrect" });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: "Password changed" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
