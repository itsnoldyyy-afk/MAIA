const router = require("express").Router();
const { authenticate, requireAdmin } = require("../middleware/auth");
const { idUpload, photoUpload } = require("../middleware/upload");
const auth     = require("../controllers/authController");
const cases    = require("../controllers/caseController");
const sightings = require("../controllers/sightingController");
const alerts   = require("../controllers/alertController");
const { pool } = require("../config/db");

// ── Auth ──────────────────────────────────────────────────────────
router.post("/auth/register",    idUpload.single("id_photo"), auth.register);
router.post("/auth/verify-otp",  auth.verifyOtp);
router.post("/auth/login",       auth.login);

// ── Cases ─────────────────────────────────────────────────────────
router.get ("/cases/stats",         authenticate, requireAdmin, cases.getStats);
router.post("/cases",               authenticate, photoUpload.single("photo"), cases.createCase);
router.get ("/cases",               authenticate, cases.listCases);
router.get ("/cases/:id",           authenticate, cases.getCase);
router.patch("/cases/:id/verify",   authenticate, requireAdmin, cases.verifyCase);
router.patch("/cases/:id/status",   authenticate, cases.updateStatus);

// ── Sightings ─────────────────────────────────────────────────────
router.post("/cases/:id/sightings", photoUpload.single("photo"), sightings.reportSighting);
router.get ("/cases/:id/sightings", sightings.listSightings);
router.patch("/sightings/:id/confirm", authenticate, requireAdmin, sightings.confirmSighting);

// ── Alerts & Dissemination ────────────────────────────────────────
router.post("/alerts/disseminate/:caseId", authenticate, requireAdmin, alerts.disseminateAlert);
router.get ("/alerts/notifications/:caseId", authenticate, alerts.getNotifications);

// ── Messenger Subscription ────────────────────────────────────────
// Admin registers a user's Messenger PSID so they receive alerts
// Usage: POST /api/messenger/subscribe  { userId, psid }
router.post("/messenger/subscribe", authenticate, requireAdmin, async (req, res) => {
  const { userId, psid } = req.body;
  if (!userId || !psid) return res.status(400).json({ success: false, message: "userId and psid required" });
  try {
    await pool.query("UPDATE users SET messenger_psid = ? WHERE id = ?", [psid, userId]);
    res.json({ success: true, message: `Messenger PSID saved for user ${userId}` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get all users with/without Messenger subscription (admin only)
router.get("/messenger/subscribers", authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, full_name, phone, role, messenger_psid FROM users WHERE is_verified = TRUE ORDER BY full_name"
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
