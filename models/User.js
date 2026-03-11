const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const { nanoid } = require("nanoid");

const userSchema = new mongoose.Schema({
  fullName:    { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:       { type: String, required: true, trim: true },
  password:    { type: String, required: true, select: false },
  role:        { type: String, enum: ["user", "dealer", "admin"], default: "user" },
  referralCode:{ type: String, unique: true },
  dealerCode:  { type: String, default: null },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

userSchema.pre("save", async function (next) {
  if (!this.referralCode) {
    this.referralCode = nanoid(8).toUpperCase();
  }
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.matchPassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", userSchema);
