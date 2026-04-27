const { pool } = require("../config/db");
async function reportSighting(req, res) {
  const { sighting_place, sighting_lat, sighting_lng, sighting_datetime, description, reporter_name, reporter_phone } = req.body;
  const mid = req.params.id; const photo_path = req.file?req.file.filename:null;
  if (!sighting_place||!sighting_datetime) return res.status(400).json({ success:false, message:"sighting_place and sighting_datetime required" });
  try {
    const [[mp]] = await pool.query("SELECT id,status FROM missing_persons WHERE id=?",[mid]);
    if (!mp) return res.status(404).json({ success:false, message:"Case not found" });
    const [r] = await pool.query("INSERT INTO sightings (missing_person_id,reporter_name,reporter_phone,sighting_place,sighting_lat,sighting_lng,sighting_datetime,description,photo_path) VALUES (?,?,?,?,?,?,?,?,?)",[mid,reporter_name||null,reporter_phone||null,sighting_place,sighting_lat||null,sighting_lng||null,sighting_datetime,description||null,photo_path]);
    res.status(201).json({ success:true, message:"Sighting submitted. Thank you!", sighting_id:r.insertId });
  } catch(err) { res.status(500).json({ success:false, message:"Server error" }); }
}
async function listSightings(req, res) {
  try { const [rows] = await pool.query("SELECT * FROM sightings WHERE missing_person_id=? ORDER BY sighting_datetime DESC",[req.params.id]); res.json({ success:true, data:rows }); }
  catch(err) { res.status(500).json({ success:false, message:"Server error" }); }
}
async function confirmSighting(req, res) {
  try { await pool.query("UPDATE sightings SET is_confirmed=TRUE WHERE id=?",[req.params.id]); res.json({ success:true, message:"Sighting confirmed" }); }
  catch(err) { res.status(500).json({ success:false, message:"Server error" }); }
}
module.exports = { reportSighting, listSightings, confirmSighting };
