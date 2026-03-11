const express  = require("express");
const router   = express.Router();
const { protect, isAdmin } = require("../middleware/auth");
const Order    = require("../models/Order");
const QRRecord = require("../models/QRRecord");
const User     = require("../models/User");
const { Wallet, DealerWithdrawal, DealerTransaction } = require("../models/Wallet");

// ── GET /api/admin/stats ───────────────────────────────────────────────────────
router.get("/stats", protect, isAdmin, async (req, res) => {
  try {
    const [totalOrders, totalUsers, pendingOrders, pendingDealerWithdrawals] = await Promise.all([
      Order.countDocuments(),
      User.countDocuments(),
      Order.countDocuments({ status: "PENDING_APPROVAL" }),
      DealerWithdrawal.countDocuments({ status: "PENDING" }),
    ]);
    const revenueResult = await Order.aggregate([
      { $match: { status: { $in: ["PAID","PENDING_APPROVAL","APPROVED_SENT","SHIPPED","DELIVERED"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;
    res.json({ success: true, stats: { totalOrders, totalUsers, totalRevenue, pendingOrders, pendingWithdrawals: pendingDealerWithdrawals } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── GET /api/admin/orders ──────────────────────────────────────────────────────
router.get("/orders", protect, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(200)
      .populate("userId",          "fullName email phone")
      .populate("createdByDealer", "fullName email");
    res.json({ success: true, orders });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── PUT /api/admin/orders/:id/status ──────────────────────────────────────────
router.put("/orders/:id/status", protect, isAdmin, async (req, res) => {
  try {
    const { status, adminNotes, courierTracking } = req.body;
    const update = { status };
    if (adminNotes)      update.adminNotes      = adminNotes;
    if (courierTracking) update.courierTracking = courierTracking;
    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── GET /api/admin/users ───────────────────────────────────────────────────────
router.get("/users", protect, isAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).select("-password");
    res.json({ success: true, users });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── PUT /api/admin/users/:id/role ─────────────────────────────────────────────
router.put("/users/:id/role", protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── GET /api/admin/qr-records ─────────────────────────────────────────────────
router.get("/qr-records", protect, isAdmin, async (req, res) => {
  try {
    const qrRecords = await QRRecord.find().sort({ createdAt: -1 }).limit(200).populate("userId", "fullName");
    res.json({ success: true, qrRecords });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DEALER WITHDRAWALS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/dealer-withdrawals ─────────────────────────────────────────
router.get("/dealer-withdrawals", protect, isAdmin, async (req, res) => {
  try {
    const withdrawals = await DealerWithdrawal.find()
      .sort({ createdAt: -1 })
      .populate("dealerId",    "fullName email phone")
      .populate("processedBy", "fullName");
    res.json({ success: true, withdrawals });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── PUT /api/admin/dealer-withdrawals/:id/status — APPROVE or REJECT ─────────
router.put("/dealer-withdrawals/:id/status", protect, isAdmin, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    if (!["APPROVED","REJECTED"].includes(status))
      return res.status(400).json({ success: false, message: "Status must be APPROVED or REJECTED" });

    const withdrawal = await DealerWithdrawal.findById(req.params.id);
    if (!withdrawal)
      return res.status(404).json({ success: false, message: "Withdrawal not found" });
    if (withdrawal.status !== "PENDING")
      return res.status(400).json({ success: false, message: "Already processed" });

    withdrawal.status      = status;
    withdrawal.adminNotes  = adminNotes || null;
    withdrawal.processedAt = new Date();
    withdrawal.processedBy = req.user._id;
    await withdrawal.save();

    if (status === "APPROVED") {
      // Balance was deducted at request time — just update totalWithdrawn counter
      const wallet = await Wallet.findOneAndUpdate(
        { userId: withdrawal.dealerId },
        { $inc: { totalWithdrawn: withdrawal.requestedAmount } },
        { new: true }
      );
      await DealerTransaction.create({
        dealerId:     withdrawal.dealerId,
        type:         "WITHDRAWAL_APPROVED",
        amount:       withdrawal.payableAmount,
        withdrawalId: withdrawal._id,
        description:  `Withdrawal approved. ₹${withdrawal.payableAmount} transferred (fee ₹${withdrawal.processingFee})`,
        status:       "COMPLETED",
        balanceAfter: wallet?.balance ?? 0,
      });
    } else {
      // REJECTED — refund full requested amount back to wallet
      const wallet = await Wallet.findOneAndUpdate(
        { userId: withdrawal.dealerId },
        { $inc: { balance: withdrawal.requestedAmount } },
        { new: true }
      );
      await DealerTransaction.create({
        dealerId:     withdrawal.dealerId,
        type:         "WITHDRAWAL_REJECTED",
        amount:       withdrawal.requestedAmount,
        withdrawalId: withdrawal._id,
        description:  `Withdrawal rejected by admin. ₹${withdrawal.requestedAmount} refunded to wallet`,
        status:       "COMPLETED",
        balanceAfter: wallet?.balance ?? 0,
      });
    }

    res.json({ success: true, withdrawal, message: `Withdrawal ${status.toLowerCase()} successfully` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
