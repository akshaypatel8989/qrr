const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { Wallet, Referral, Withdrawal } = require("../models/Wallet");

// GET /api/wallet
router.get("/", protect, async (req, res) => {
  try {
    const wallet      = await Wallet.findOne({ userId: req.user._id }) || { balance: 0, totalEarned: 0, totalWithdrawn: 0 };
    const referrals   = await Referral.find({ referrerId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    const withdrawals = await Withdrawal.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({
      success: true,
      wallet,
      referrals,
      withdrawals,
      referralCode: req.user.referralCode,
      settings: { platformFeePercent: 20, minWithdrawal: 100, rewardPerReferral: 50 },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/wallet/withdraw
router.post("/withdraw", protect, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 100)
      return res.status(400).json({ success: false, message: "Minimum withdrawal is ₹100" });

    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet || wallet.balance < amount)
      return res.status(400).json({ success: false, message: "Insufficient balance" });

    const platformFee  = Math.round((amount * 20) / 100);
    const payoutAmount = amount - platformFee;

    // Deduct immediately
    wallet.balance        -= amount;
    wallet.totalWithdrawn += amount;
    await wallet.save();

    const withdrawal = await Withdrawal.create({ userId: req.user._id, amount, platformFee, payoutAmount, status: "PENDING" });
    res.json({ success: true, withdrawal, newBalance: wallet.balance });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
