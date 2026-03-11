const mongoose = require("mongoose");

// ── Wallet (shared for users & dealers) ───────────────────────────────────────
const walletSchema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
  balance:        { type: Number, default: 0 },
  totalEarned:    { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
}, { timestamps: true });

// ── Referral reward ───────────────────────────────────────────────────────────
const referralSchema = new mongoose.Schema({
  referrerId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  referreeId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  orderId:      { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  rewardAmount: { type: Number, required: true },
  isPaid:       { type: Boolean, default: true },
}, { timestamps: true });

// ── Dealer Transaction (full audit log) ───────────────────────────────────────
const dealerTransactionSchema = new mongoose.Schema({
  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: {
    type: String,
    enum: ["COMMISSION", "WITHDRAWAL_REQUEST", "WITHDRAWAL_APPROVED", "WITHDRAWAL_REJECTED", "PROCESSING_FEE"],
    required: true,
  },
  amount:       { type: Number, required: true },
  orderId:      { type: mongoose.Schema.Types.ObjectId, ref: "Order",            default: null },
  withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: "DealerWithdrawal", default: null },
  description:  { type: String, required: true },
  status:       { type: String, enum: ["COMPLETED", "PENDING", "FAILED"], default: "COMPLETED" },
  balanceAfter: { type: Number, default: null },
}, { timestamps: true });

// ── Dealer Withdrawal Request ─────────────────────────────────────────────────
const dealerWithdrawalSchema = new mongoose.Schema({
  dealerId:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  requestedAmount:   { type: Number, required: true },
  processingFee:     { type: Number, required: true },
  payableAmount:     { type: Number, required: true },
  bankAccountNumber: { type: String, required: true },
  ifscCode:          { type: String, required: true, uppercase: true },
  accountHolderName: { type: String, required: true },
  status:            { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
  adminNotes:        { type: String, default: null },
  processedAt:       { type: Date,   default: null },
  processedBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

// ── App Settings ──────────────────────────────────────────────────────────────
const settingsSchema = new mongoose.Schema({
  key:   { type: String, unique: true, required: true },
  value: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

module.exports = {
  Wallet:            mongoose.model("Wallet",            walletSchema),
  Referral:          mongoose.model("Referral",          referralSchema),
  DealerTransaction: mongoose.model("DealerTransaction", dealerTransactionSchema),
  DealerWithdrawal:  mongoose.model("DealerWithdrawal",  dealerWithdrawalSchema),
  Settings:          mongoose.model("Settings",          settingsSchema),
};
