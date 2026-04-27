const jwt = require("jsonwebtoken");
function authenticate(req, res, next) {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "No token provided" });
  const token = header.split(" ")[1];
  try { req.user = jwt.verify(token, process.env.JWT_SECRET || "maia_secret_key"); next(); }
  catch { return res.status(401).json({ success: false, message: "Invalid or expired token" }); }
}
function requireAdmin(req, res, next) {
  if (!["admin","superadmin"].includes(req.user?.role)) return res.status(403).json({ success: false, message: "Admin access required" });
  next();
}
module.exports = { authenticate, requireAdmin };
