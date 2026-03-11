const express  = require("express");
const router   = express.Router();
const { protect, isDealer } = require("../middleware/auth");
const { creditDealerCommission } = require("../middleware/commission");
const Order    = require("../models/Order");
const QRRecord = require("../models/QRRecord");
const { Wallet, DealerTransaction, DealerWithdrawal } = require("../models/Wallet");

const PROCESSING_FEE_RATE = 0.10;  // 10% withdrawal fee
const MIN_WITHDRAWAL      = 100;

// ── GET /api/dealer/orders ─────────────────────────────────────────────────────
router.get("/orders", protect, isDealer, async (req, res) => {
  try {
    const orders    = await Order.find({ createdByDealer: req.user._id }).sort({ createdAt: -1 });
    const qrRecords = await QRRecord.find({ orderId: { $in: orders.map(o => o._id) } });
    const wallet    = await Wallet.findOne({ userId: req.user._id }) || { balance: 0, totalEarned: 0, totalWithdrawn: 0 };
    res.json({ success: true, orders, qrRecords, wallet });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── POST /api/dealer/orders — dealer creates QR directly for customer ─────────
// Commission is auto-applied via creditDealerCommission
router.post("/orders", protect, isDealer, async (req, res) => {
  try {
    const { vehicleNumber, vehicleType, emergencyContact1, emergencyContact2,
            bloodGroup, city, state, amount } = req.body;
    if (!vehicleNumber || !emergencyContact1)
      return res.status(400).json({ success: false, message: "Vehicle number and emergency contact are required" });

    const base        = amount || 199;
    const cgst        = Math.round(base * 0.09);
    const sgst        = Math.round(base * 0.09);
    const totalAmount = base + cgst + sgst;

    const order = await Order.create({
      userId:           req.user._id,
      createdByDealer:  req.user._id,
      orderType: "digital", planType: "general",
      vehicleNumber:    vehicleNumber.toUpperCase(),
      vehicleType:      vehicleType || "4W",
      emergencyContact1, emergencyContact2: emergencyContact2 || null,
      bloodGroup: bloodGroup || null,
      city: city || null, state: state || null,
      amount: totalAmount, baseAmount: base, cgst, sgst,
      status: "PAID",
      paymentId: "DEALER_" + Date.now(),
    });

    const qr = await QRRecord.create({
      orderId: order._id, userId: req.user._id,
      vehicleNumber: order.vehicleNumber, vehicleType: order.vehicleType,
      emergencyContact1: order.emergencyContact1, emergencyContact2: order.emergencyContact2,
      bloodGroup: order.bloodGroup, city: order.city, state: order.state,
      isActive: true,
    });

    // Global 20% commission — always applied for dealer role
    const commissionResult = await creditDealerCommission(order, req.user);

    res.status(201).json({
      success: true, order, qrRecord: qr,
      commission:  commissionResult?.commission  || 0,
      newBalance:  commissionResult?.newBalance  || 0,
      message: commissionResult
        ? `QR created! ₹${commissionResult.commission} (20%) credited to your wallet.`
        : "QR created successfully.",
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── GET /api/dealer/wallet — full wallet data ─────────────────────────────────
router.get("/wallet", protect, isDealer, async (req, res) => {
  try {
    const wallet      = await Wallet.findOne({ userId: req.user._id }) || { balance: 0, totalEarned: 0, totalWithdrawn: 0 };
    const transactions= await DealerTransaction.find({ dealerId: req.user._id })
      .sort({ createdAt: -1 }).limit(100)
      .populate("orderId", "vehicleNumber amount");
    const withdrawals = await DealerWithdrawal.find({ dealerId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, wallet, transactions, withdrawals });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── POST /api/dealer/wallet/withdraw — create withdrawal request ──────────────
router.post("/wallet/withdraw", protect, isDealer, async (req, res) => {
  try {
    const { amount, bankAccountNumber, ifscCode, accountHolderName } = req.body;

    if (!amount || amount < MIN_WITHDRAWAL)
      return res.status(400).json({ success: false, message: `Minimum withdrawal is ₹${MIN_WITHDRAWAL}` });
    if (!bankAccountNumber || !ifscCode || !accountHolderName)
      return res.status(400).json({ success: false, message: "Bank account number, IFSC code, and account holder name are required" });

    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet || wallet.balance < amount)
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });

    // Validate IFSC format (basic)
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase()))
      return res.status(400).json({ success: false, message: "Invalid IFSC code format (e.g. SBIN0001234)" });

    const processingFee  = Math.round(amount * PROCESSING_FEE_RATE);
    const payableAmount  = amount - processingFee;

    // Deduct from wallet immediately (hold amount while pending)
    wallet.balance -= amount;
    await wallet.save();

    const withdrawal = await DealerWithdrawal.create({
      dealerId: req.user._id,
      requestedAmount: amount,
      processingFee,
      payableAmount,
      bankAccountNumber,
      ifscCode: ifscCode.toUpperCase(),
      accountHolderName,
      status: "PENDING",
    });

    // Log transaction
    await DealerTransaction.create({
      dealerId:     req.user._id,
      type:         "WITHDRAWAL_REQUEST",
      amount,
      withdrawalId: withdrawal._id,
      description:  `Withdrawal request of ₹${amount} (10% fee: ₹${processingFee}, payout: ₹${payableAmount})`,
      status:       "PENDING",
      balanceAfter: wallet.balance,
    });

    res.json({
      success:    true,
      withdrawal,
      newBalance: wallet.balance,
      message:    `Withdrawal request of ₹${amount} submitted. You will receive ₹${payableAmount} after 10% processing fee.`,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
