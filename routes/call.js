/**
 * /api/call  — Masked Call Bridge using Twilio
 *
 * Flow:
 *  1. Scanner enters their number on the QR scan page
 *  2. POST /api/call/connect  → Twilio calls scanner's number
 *  3. Scanner picks up        → Twilio bridges to emergency contact
 *  4. Both parties connected  — emergency number is NEVER revealed
 *
 * Twilio Webhook:
 *  GET  /api/call/twiml/:callId  → returns TwiML to bridge the call
 */

const express  = require("express");
const router   = express.Router();
const twilio   = require("twilio");
const QRRecord = require("../models/QRRecord");

// ── Twilio client ─────────────────────────────────────────────────────────────
const getTwilio = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials not configured in .env");
  return twilio(sid, token);
};

// In-memory store for active bridge calls (use Redis in production)
const pendingCalls = new Map(); // callId → { emergencyNumber, vehicleNumber }

// ── POST /api/call/connect ────────────────────────────────────────────────────
// Body: { qrId, callerPhone }
// 1. Look up emergency number from QR record
// 2. Initiate Twilio call to caller → on answer, bridge to emergency
router.post("/connect", async (req, res) => {
  try {
    const { qrId, callerPhone } = req.body;

    if (!qrId || !callerPhone) {
      return res.status(400).json({ success: false, message: "qrId and callerPhone are required" });
    }

    // Clean caller phone — ensure +91 prefix
    const cleanCaller = formatIndianPhone(callerPhone);
    if (!cleanCaller) {
      return res.status(400).json({ success: false, message: "Invalid phone number. Use 10-digit Indian mobile number." });
    }

    // Look up QR record
    const qr = await QRRecord.findById(qrId);
    if (!qr || !qr.isActive) {
      return res.status(404).json({ success: false, message: "QR code not found or deactivated" });
    }

    const emergencyNumber = formatIndianPhone(qr.emergencyContact1);
    if (!emergencyNumber) {
      return res.status(400).json({ success: false, message: "Emergency contact number is invalid" });
    }

    // Store bridge info — keyed by a short call ID
    const callId = `${qrId}-${Date.now()}`;
    pendingCalls.set(callId, {
      emergencyNumber,
      vehicleNumber: qr.vehicleNumber,
      callerPhone:   cleanCaller,
      createdAt:     Date.now(),
    });

    // Clean up after 5 minutes
    setTimeout(() => pendingCalls.delete(callId), 5 * 60 * 1000);

    // TwiML webhook URL — Twilio will call this when the caller picks up
    const webhookUrl = `${process.env.BACKEND_URL || "https://yourdomain.com"}/api/call/twiml/${callId}`;

    // ── Initiate Twilio call to the SCANNER first ──────────────────────────
    const client = getTwilio();
    const call   = await client.calls.create({
      to:   cleanCaller,
      from: process.env.TWILIO_PHONE_NUMBER,  // your Twilio number
      url:  webhookUrl,                        // TwiML to run when answered
      statusCallback: `${process.env.BACKEND_URL || "https://yourdomain.com"}/api/call/status`,
      statusCallbackMethod: "POST",
    });

    res.json({
      success:  true,
      message:  `Calling you now at ${maskPhone(cleanCaller)}. Please pick up — we'll connect you to the vehicle owner.`,
      callSid:  call.sid,
      callId,
    });

  } catch (e) {
    if (e.message?.includes("credentials not configured")) {
      return res.status(503).json({ success: false, message: "Calling service not configured. Contact admin." });
    }
    console.error("Call connect error:", e.message);
    res.status(500).json({ success: false, message: "Failed to initiate call: " + e.message });
  }
});

// ── GET /api/call/twiml/:callId ───────────────────────────────────────────────
// Twilio calls this webhook when scanner picks up
// Returns TwiML to bridge call to emergency number
router.post("/twiml/:callId", (req, res) => {
  const { callId } = req.params;
  const bridge     = pendingCalls.get(callId);

  res.set("Content-Type", "text/xml");

  if (!bridge) {
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-IN">Sorry, this call request has expired. Please scan the QR code again.</Say>
  <Hangup/>
</Response>`);
  }

  // TwiML: say intro → dial emergency contact → hangup
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-IN">
    Hello. This is an emergency call from Emergency Safety Q R R.
    You scanned vehicle ${bridge.vehicleNumber.split("").join(" ")}.
    Connecting you to the vehicle owner now. Please hold.
  </Say>
  <Dial callerId="${process.env.TWILIO_PHONE_NUMBER}" timeout="30" record="do-not-record">
    <Number>${bridge.emergencyNumber}</Number>
  </Dial>
  <Say voice="alice" language="en-IN">
    The vehicle owner did not answer. Please try again or contact local emergency services.
  </Say>
  <Hangup/>
</Response>`);
});

// ── POST /api/call/status ─────────────────────────────────────────────────────
// Twilio status callback — logs call events
router.post("/status", (req, res) => {
  const { CallStatus, CallSid, To } = req.body;
  console.log(`📞 Call ${CallSid} to ${maskPhone(To || "")} — Status: ${CallStatus}`);
  res.sendStatus(200);
});

// ── GET /api/call/check ───────────────────────────────────────────────────────
// Frontend can check if calling service is configured
router.get("/check", (req, res) => {
  const configured = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN  &&
    process.env.TWILIO_PHONE_NUMBER
  );
  res.json({ success: true, callServiceAvailable: configured });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatIndianPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  // Handle: 10-digit, 91+10-digit, 0+10-digit
  let ten;
  if      (digits.length === 10)                      ten = digits;
  else if (digits.length === 12 && digits.startsWith("91")) ten = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0"))  ten = digits.slice(1);
  else return null;
  if (!/^[6-9]\d{9}$/.test(ten)) return null; // valid Indian mobile
  return `+91${ten}`;
}

function maskPhone(phone) {
  const d = phone.replace(/\D/g, "");
  if (d.length >= 10) {
    const ten = d.slice(-10);
    return `+91 ${ten.slice(0,2)}XXXXXX${ten.slice(8)}`;
  }
  return "XXXXXXXXXX";
}

module.exports = router;
