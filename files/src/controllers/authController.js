const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const JWT_SECRET = process.env.JWT_SECRET || "maia_secret_key";
function genRef() { return "MAIA-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random()*9000)+1000); }
function genOtp() { return String(Math.floor(100000+Math.random()*900000)); }
async function register(req, res) {
  const { full_name, phone, email, password, id_type } = req.body;
  if (!full_name||!phone||!password) return res.status(400).json({ success:false, message:"full_name, phone and password required" });
  try {
    const [ex] = await pool.query("SELECT id FROM users WHERE phone=?",[phone]);
    if (ex.length) return res.status(409).json({ success:false, message:"Phone already registered" });
    const hash = await bcrypt.hash(password,10);
    const otp = genOtp(); const otpExp = new Date(Date.now()+10*60*1000);
    const [r] = await pool.query("INSERT INTO users (full_name,phone,email,password_hash,id_type,otp_code,otp_expires) VALUES (?,?,?,?,?,?,?)",[full_name,phone,email||null,hash,id_type||null,otp,otpExp]);
    console.log("[OTP] "+phone+" → "+otp);
    res.status(201).json({ success:true, message:"Registered. OTP sent.", user_id:r.insertId, debug_otp: process.env.NODE_ENV!=="production"?otp:undefined });
  } catch(err) { console.error(err); res.status(500).json({ success:false, message:"Server error" }); }
}
async function verifyOtp(req, res) {
  const { phone, otp } = req.body;
  try {
    const [[u]] = await pool.query("SELECT id,otp_code,otp_expires FROM users WHERE phone=?",[phone]);
    if (!u) return res.status(404).json({ success:false, message:"User not found" });
    if (u.otp_code!==otp||new Date()>new Date(u.otp_expires)) return res.status(400).json({ success:false, message:"Invalid or expired OTP" });
    await pool.query("UPDATE users SET is_verified=TRUE,otp_code=NULL,otp_expires=NULL WHERE id=?",[u.id]);
    res.json({ success:true, message:"Phone verified" });
  } catch(err) { res.status(500).json({ success:false, message:"Server error" }); }
}
async function login(req, res) {
  const { phone, password } = req.body;
  try {
    const [[u]] = await pool.query("SELECT id,full_name,phone,role,password_hash,is_verified FROM users WHERE phone=?",[phone]);
    if (!u) return res.status(401).json({ success:false, message:"Invalid credentials" });
    if (!await bcrypt.compare(password,u.password_hash)) return res.status(401).json({ success:false, message:"Invalid credentials" });
    if (!u.is_verified) return res.status(403).json({ success:false, message:"Phone not verified" });
    const token = jwt.sign({ id:u.id, role:u.role, name:u.full_name }, JWT_SECRET, { expiresIn:"7d" });
    res.json({ success:true, token, user:{ id:u.id, full_name:u.full_name, role:u.role } });
  } catch(err) { res.status(500).json({ success:false, message:"Server error" }); }
}
module.exports = { register, verifyOtp, login, genRef };
