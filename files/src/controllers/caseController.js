const { pool }  = require('../config/db');
const { genRef } = require('./authController');

// ── Lightweight AI screening (rule-based placeholder) ──────────
// Replace with real ML model in production (see ai-screening.js)
function runAiScreening(data) {
  let fakeScore = 0;

  // Flag if description is too short
  if (!data.description || data.description.length < 20) fakeScore += 25;

  // Flag if last-seen date is suspiciously far in the past
  const daysSince = (Date.now() - new Date(data.last_seen_date)) / 86400000;
  if (daysSince > 90) fakeScore += 20;

  // Flag if no photo uploaded
  if (!data.photo_path) fakeScore += 30;

  // Clamp to 0-100
  return Math.min(fakeScore, 100);
}

// POST /api/cases  — file a new missing person report
async function createCase(req, res) {
  const {
    full_name, age, gender,
    last_seen_place, last_seen_lat, last_seen_lng,
    last_seen_date, last_seen_time, description,
  } = req.body;

  if (!full_name || !age || !gender || !last_seen_place || !last_seen_date) {
    return res.status(400).json({ success: false, message: 'Required fields missing' });
  }

  const photo_path = req.file ? req.file.filename : null;
  const fakeScore  = runAiScreening({ description, last_seen_date, photo_path });
  const ref        = genRef();

  try {
    const [result] = await pool.query(
      `INSERT INTO missing_persons
        (reference_no, reporter_id, full_name, age, gender, photo_path,
         last_seen_place, last_seen_lat, last_seen_lng,
         last_seen_date, last_seen_time, description, ai_fake_score)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ref, req.user.id, full_name, age, gender, photo_path,
       last_seen_place, last_seen_lat || null, last_seen_lng || null,
       last_seen_date, last_seen_time || null, description || null, fakeScore]
    );

    // Log the creation
    await pool.query(
      'INSERT INTO case_logs (missing_person_id, action, performed_by, notes) VALUES (?,?,?,?)',
      [result.insertId, 'case_created', req.user.id, `AI fake score: ${fakeScore}%`]
    );

    res.status(201).json({
      success: true,
      message: 'Report submitted for admin review',
      reference_no: ref,
      case_id: result.insertId,
      ai_screening: {
        fake_probability: fakeScore,
        status: fakeScore < 40 ? 'likely_legitimate' : fakeScore < 70 ? 'review_needed' : 'likely_fake',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// GET /api/cases  — list cases (admin sees all; reporter sees own)
async function listCases(req, res) {
  const { status, district, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

 // Reporters see ALL active/found cases publicly,
// but only their OWN pending/rejected reports
if (req.user.role === 'reporter') {
  if (!status || status === 'pending' || status === 'rejected') {
    where.push('(mp.status IN ("active","found","closed") OR mp.reporter_id = ?)');
    params.push(req.user.id);
  }
  // If explicitly filtering by active/found, show all — no user filter
}
  if (status)   { where.push('mp.status = ?');            params.push(status); }
  if (district) { where.push('mp.last_seen_place LIKE ?'); params.push(`%${district}%`); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT mp.id, mp.reference_no, mp.full_name, mp.age, mp.gender,
              mp.last_seen_place, mp.last_seen_date, mp.status,
              mp.photo_path, mp.ai_fake_score, mp.created_at,
              u.full_name AS reporter_name,
              (SELECT COUNT(*) FROM sightings s WHERE s.missing_person_id = mp.id) AS sighting_count
       FROM missing_persons mp
       JOIN users u ON u.id = mp.reporter_id
       ${whereClause}
       ORDER BY mp.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM missing_persons mp ${whereClause}`, params
    );

    res.json({ success: true, data: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// GET /api/cases/:id
async function getCase(req, res) {
  try {
    const [[mp]] = await pool.query(
      `SELECT mp.*, u.full_name AS reporter_name, u.phone AS reporter_phone
       FROM missing_persons mp JOIN users u ON u.id = mp.reporter_id
       WHERE mp.id = ?`, [req.params.id]
    );
    if (!mp) return res.status(404).json({ success: false, message: 'Case not found' });

    const [sightings] = await pool.query(
      'SELECT * FROM sightings WHERE missing_person_id = ? ORDER BY created_at DESC', [mp.id]
    );
    const [logs] = await pool.query(
      `SELECT cl.*, u.full_name AS actor FROM case_logs cl
       LEFT JOIN users u ON u.id = cl.performed_by
       WHERE cl.missing_person_id = ? ORDER BY cl.created_at DESC`, [mp.id]
    );

    res.json({ success: true, data: { ...mp, sightings, logs } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// PATCH /api/cases/:id/verify  — admin approves or rejects
async function verifyCase(req, res) {
  const { action, notes } = req.body; // action: 'approve' | 'reject'
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, message: 'action must be approve or reject' });
  }

  const newStatus = action === 'approve' ? 'active' : 'rejected';

  try {
    await pool.query(
      `UPDATE missing_persons
       SET status = ?, verified_by = ?, verified_at = NOW()
       WHERE id = ?`,
      [newStatus, req.user.id, req.params.id]
    );
    await pool.query(
      'INSERT INTO case_logs (missing_person_id, action, performed_by, notes) VALUES (?,?,?,?)',
      [req.params.id, `case_${action}d`, req.user.id, notes || null]
    );

    // TODO: trigger Facebook post & SMS notifications when approved (see alertController.js)

    res.json({ success: true, message: `Case ${action}d successfully`, status: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// PATCH /api/cases/:id/status  — update status (found, closed)
async function updateStatus(req, res) {
  const { status, notes } = req.body;
  const allowed = ['active', 'found', 'closed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(', ')}` });
  }
  try {
    await pool.query('UPDATE missing_persons SET status = ? WHERE id = ?', [status, req.params.id]);
    await pool.query(
      'INSERT INTO case_logs (missing_person_id, action, performed_by, notes) VALUES (?,?,?,?)',
      [req.params.id, `status_changed_to_${status}`, req.user.id, notes || null]
    );
    res.json({ success: true, message: `Case status updated to ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// GET /api/cases/stats  — dashboard summary numbers
async function getStats(req, res) {
  try {
    const [[row]] = await pool.query(`
      SELECT
        SUM(status IN ('active'))               AS active_cases,
        SUM(status = 'pending')                 AS pending_cases,
        SUM(status = 'found' AND YEAR(created_at) = YEAR(NOW())) AS found_this_year,
        COUNT(*)                                AS total_cases,
        ROUND(AVG(100 - ai_fake_score), 1)     AS avg_ai_accuracy
      FROM missing_persons
    `);
    res.json({ success: true, data: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { createCase, listCases, getCase, verifyCase, updateStatus, getStats };
