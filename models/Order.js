const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  orderType:        { type: String, enum: ["digital", "physical"], required: true },
  planType:         { type: String, enum: ["general", "silver", "gold"], required: true },
  vehicleNumber:    { type: String, required: true, uppercase: true, trim: true },
  vehicleType:      { type: String, enum: ["2W", "3W", "4W", "HV"], default: "4W" },
  emergencyContact1:{ type: String, required: true },
  emergencyContact2:{ type: String, default: null },
  bloodGroup:       { type: String, default: null },
  // Address (physical only)
  fullAddress:      { type: String, default: null },
  pincode:          { type: String, default: null },
  city:             { type: String, default: null },
  state:            { type: String, default: null },
  landmark:         { type: String, default: null },
  // Payment
  amount:           { type: Number, required: true },   // total incl. GST
  baseAmount:       { type: Number, default: null },     // pre-GST price
  cgst:             { type: Number, default: 0 },        // 9% CGST
  sgst:             { type: Number, default: 0 },        // 9% SGST
  paymentId:        { type: String, default: null },
  // Status
  status: {
    type: String,
    enum: ["CREATED", "PAID", "PENDING_APPROVAL", "APPROVED_SENT", "SHIPPED", "DELIVERED", "CANCELLED", "REJECTED"],
    default: "CREATED",
  },
  adminNotes:       { type: String, default: null },
  courierTracking:  { type: String, default: null },
  // Codes
  referralCodeUsed: { type: String, default: null },
  dealerCodeUsed:   { type: String, default: null },
  // Created by dealer
  createdByDealer:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);
