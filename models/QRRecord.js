const mongoose = require("mongoose");

const qrSchema = new mongoose.Schema({
  orderId:    { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // Cached vehicle info for fast scan lookup (no auth needed)
  vehicleNumber:    String,
  vehicleType:      String,
  emergencyContact1:String,
  emergencyContact2:String,
  bloodGroup:       String,
  city:             String,
  state:            String,
  isActive:         { type: Boolean, default: true },
  scanCount:        { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("QRRecord", qrSchema);
