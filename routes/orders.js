const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/auth");
const { creditDealerCommission } = require("../middleware/commission");
const Order    = require("../models/Order");
const QRRecord = require("../models/QRRecord");
const User     = require("../models/User");
const { Wallet, Referral } = require("../models/Wallet");

// POST /api/orders — create order
router.post("/", protect, async (req, res) => {
  try {
    const {
      orderType, planType, vehicleNumber, vehicleType,
      emergencyContact1, emergencyContact2, bloodGroup,
      fullAddress, pincode, city, state, landmark,
      referralCodeUsed, dealerCodeUsed, amount, baseAmount,
    } = req.body;

    // Server-side GST (18%)
    const base        = baseAmount || amount;
    const cgst        = Math.round(base * 0.09);
    const sgst        = Math.round(base * 0.09);
    const totalAmount = base + cgst + sgst;

    const order = await Order.create({
      userId:   req.user._id,
      orderType, planType,
      vehicleNumber:     vehicleNumber?.toUpperCase(),
      vehicleType:       vehicleType || "4W",
      emergencyContact1, emergencyContact2: emergencyContact2 || null,
      bloodGroup:        bloodGroup  || null,
      fullAddress:       fullAddress || null,
      pincode:           pincode     || null,
      city:              city        || null,
      state:             state       || null,
      landmark:          landmark    || null,
      amount:     totalAmount,
      baseAmount: base,
      cgst, sgst,
      referralCodeUsed: referralCodeUsed || null,
      dealerCodeUsed:   dealerCodeUsed   || null,
      status: "CREATED",
    });

    res.status(201).json({ success: true, order });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/orders/:id/pay — mark paid, generate QR, trigger commissions
router.put("/:id/pay", protect, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.status !== "CREATED") return res.status(400).json({ success: false, message: "Order already processed" });

    order.paymentId = req.body.paymentId || "SIMULATED_" + Date.now();
    order.status    = order.orderType === "digital" ? "PAID" : "PENDING_APPROVAL";
    await order.save();

    // Generate QR record
    const qr = await QRRecord.create({
      orderId:          order._id,
      userId:           req.user._id,
      vehicleNumber:    order.vehicleNumber,
      vehicleType:      order.vehicleType,
      emergencyContact1:order.emergencyContact1,
      emergencyContact2:order.emergencyContact2,
      bloodGroup:       order.bloodGroup,
      city:             order.city,
      state:            order.state,
      isActive: true,
    });

    // ── GLOBAL: Dealer commission (20%) ──────────────────────────────────
    // Applies if: logged-in user is a dealer OR a dealerCode was used
    const commissionResult = await creditDealerCommission(order, req.user);

    // ── Referral reward (₹50 per referral) ───────────────────────────────
    if (order.referralCodeUsed) {
      try {
        const referrer = await User.findOne({ referralCode: order.referralCodeUsed });
        if (referrer && referrer._id.toString() !== req.user._id.toString()) {
          const reward = 50;
          await Referral.create({
            referrerId: referrer._id, referreeId: req.user._id,
            orderId: order._id, rewardAmount: reward, isPaid: true,
          });
          await Wallet.findOneAndUpdate(
            { userId: referrer._id },
            { $inc: { balance: reward, totalEarned: reward } },
            { upsert: true }
          );
        }
      } catch { /* referral error non-fatal */ }
    }

    res.json({
      success: true,
      order,
      qrRecord: qr,
      dealerCommission: commissionResult ? {
        credited:   commissionResult.commission,
        newBalance: commissionResult.newBalance,
      } : null,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/orders/with-qr
router.get("/with-qr", protect, async (req, res) => {
  try {
    const orders   = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
    const qrRecords= await QRRecord.find({ orderId: { $in: orders.map(o => o._id) } });
    res.json({ success: true, orders, qrRecords });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/orders/:id
router.get("/:id", protect, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const qrRecord = await QRRecord.findOne({ orderId: order._id });
    res.json({ success: true, order, qrRecord });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
