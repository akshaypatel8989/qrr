const express = require("express");
const router  = express.Router();
const QRRecord = require("../models/QRRecord");

// GET /api/scan/:qrId — PUBLIC, no auth
// NOTE: emergency contact numbers are NOT returned — use /api/call/connect to bridge calls
router.get("/:qrId", async (req, res) => {
  try {
    const qr = await QRRecord.findById(req.params.qrId);
    if (!qr || !qr.isActive)
      return res.status(404).json({ success: false, message: "QR code not found or deactivated" });

    qr.scanCount += 1;
    await qr.save();

    // ⚠️  Emergency numbers are intentionally NOT exposed here.
    //     Use POST /api/call/connect to bridge a masked call instead.
    res.json({
      success:        true,
      qrId:           qr._id,          // needed by frontend to initiate call
      vehicle_number: qr.vehicleNumber,
      vehicle_type:   qr.vehicleType,
      blood_group:    qr.bloodGroup  || null,
      city:           qr.city        || null,
      state:          qr.state       || null,
      has_contact2:   !!qr.emergencyContact2,
      qr_active:      qr.isActive,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
