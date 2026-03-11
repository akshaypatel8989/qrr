/**
 * creditDealerCommission
 * ──────────────────────
 * Called whenever a QR order is paid/activated.
 * If the order was created by someone with role=dealer, OR has a dealerCodeUsed,
 * we automatically credit 20% of the base order amount to the dealer's wallet.
 *
 * This is the GLOBAL commission rule — it runs from orders.js (pay endpoint)
 * and dealer.js (dealer creates QR directly).
 */

const User               = require("../models/User");
const { Wallet, DealerTransaction } = require("../models/Wallet");

const DEALER_COMMISSION_RATE = 0.20;   // 20%

/**
 * @param {Object} order   - Mongoose Order document
 * @param {Object} creator - User doc of whoever created/paid the order
 */
async function creditDealerCommission(order, creator) {
  try {
    let dealer = null;

    // 1. If the creator IS a dealer — they earn directly
    if (creator && (creator.role === "dealer" || creator.role === "admin")) {
      dealer = creator;
    }

    // 2. If a dealerCode was used — find that dealer
    if (!dealer && order.dealerCodeUsed) {
      dealer = await User.findOne({
        dealerCode: order.dealerCodeUsed,
        role: { $in: ["dealer", "admin"] },
      });
    }

    if (!dealer) return null;  // no dealer involved

    // Base amount for commission (pre-GST price)
    const base       = order.baseAmount || order.amount;
    const commission = Math.round(base * DEALER_COMMISSION_RATE);
    if (commission <= 0) return null;

    // Credit wallet
    const wallet = await Wallet.findOneAndUpdate(
      { userId: dealer._id },
      { $inc: { balance: commission, totalEarned: commission } },
      { upsert: true, new: true }
    );

    // Log transaction
    await DealerTransaction.create({
      dealerId:     dealer._id,
      type:         "COMMISSION",
      amount:       commission,
      orderId:      order._id,
      description:  `20% commission on QR order ${order.vehicleNumber} (₹${base} × 20%)`,
      status:       "COMPLETED",
      balanceAfter: wallet.balance,
    });

    return { dealer, commission, newBalance: wallet.balance };
  } catch (err) {
    console.error("Commission credit error:", err.message);
    return null;
  }
}

module.exports = { creditDealerCommission, DEALER_COMMISSION_RATE };
