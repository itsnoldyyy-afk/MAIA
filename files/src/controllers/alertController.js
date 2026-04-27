const { pool } = require('../config/db');

// ─────────────────────────────────────────────────────────────────
// 1. POST TO FACEBOOK PAGE FEED
// Requires: FB_PAGE_ACCESS_TOKEN and FB_PAGE_ID in .env
// ─────────────────────────────────────────────────────────────────
async function postToFacebook(mp) {
  const token  = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;

  if (!token || !pageId) {
    console.warn('[FB] FB_PAGE_ACCESS_TOKEN or FB_PAGE_ID not set — skipping Facebook post');
    return null;
  }

  const message =
    `⚠️ MISSING PERSON ALERT — Davao City\n\n` +
    `Name: ${mp.full_name.toUpperCase()}, ${mp.age} years old\n` +
    `Gender: ${mp.gender}\n` +
    `Last seen: ${mp.last_seen_place}\n` +
    `Date: ${new Date(mp.last_seen_date).toLocaleDateString('en-PH')}\n` +
    (mp.description ? `Description: ${mp.description}\n\n` : '\n') +
    `If you have seen this person, please call the Davao City Police Office ` +
    `or the reporter's contact number immediately.\n\n` +
    `Reference: #${mp.reference_no}\n` +
    `🔁 Please SHARE to help find this person.\n\n` +
    `— Verified by MAIA / DCPO`;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, access_token: token }),
      }
    );
    const data = await res.json();
    if (data.id) {
      console.log(`[FB] Posted successfully — post ID: ${data.id}`);
      return data.id;
    }
    console.error('[FB] API error:', JSON.stringify(data));
    return null;
  } catch (err) {
    console.error('[FB] Fetch error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. SEND VIA FACEBOOK MESSENGER (Free — replaces SMS for testing)
// Uses the Facebook Send API to message users who messaged your Page
// Requires: FB_PAGE_ACCESS_TOKEN in .env
// NOTE: You can only message users who have previously messaged your Page
// (This is a Facebook platform restriction — 24hr window)
// ─────────────────────────────────────────────────────────────────
async function sendMessengerAlert(mp, psids) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;

  if (!token) {
    console.warn('[Messenger] FB_PAGE_ACCESS_TOKEN not set — skipping Messenger');
    return 0;
  }

  if (!psids || psids.length === 0) {
    console.warn('[Messenger] No Messenger PSIDs found in database — skipping');
    return 0;
  }

  const message =
    `⚠️ MAIA MISSING PERSON ALERT\n\n` +
    `${mp.full_name.toUpperCase()}, ${mp.age} y/o — MISSING\n` +
    `Last seen: ${mp.last_seen_place}\n` +
    `Date: ${new Date(mp.last_seen_date).toLocaleDateString('en-PH')}\n\n` +
    (mp.description ? `${mp.description}\n\n` : '') +
    `If you have seen this person, contact DCPO immediately.\n` +
    `Reference: #${mp.reference_no}\n\n` +
    `— MAIA / Davao City Police Office`;

  let sent = 0;

  for (const psid of psids) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: psid },
            message:   { text: message },
            messaging_type: 'MESSAGE_TAG',
            tag: 'ACCOUNT_UPDATE',
          }),
        }
      );
      const data = await res.json();
      if (data.message_id) {
        sent++;
        console.log(`[Messenger] Sent to PSID ${psid}`);
      } else {
        console.warn(`[Messenger] Failed for PSID ${psid}:`, JSON.stringify(data));
      }
    } catch (err) {
      console.error(`[Messenger] Error for PSID ${psid}:`, err.message);
    }
  }

  console.log(`[Messenger] Sent to ${sent} / ${psids.length} recipients`);
  return sent;
}

// ─────────────────────────────────────────────────────────────────
// SMS via Semaphore (kept for when credits are available)
// ─────────────────────────────────────────────────────────────────
async function sendSmsAlert(mp, phoneNumbers) {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey) {
    console.warn('[SMS] SEMAPHORE_API_KEY not set — skipping SMS');
    return 0;
  }

  const message =
    `MAIA ALERT: ${mp.full_name}, ${mp.age}y/o MISSING. ` +
    `Last seen: ${mp.last_seen_place}. ` +
    `Call DCPO if seen. Ref: ${mp.reference_no}`;

  let sent = 0;
  const chunks = [];
  for (let i = 0; i < phoneNumbers.length; i += 1000) chunks.push(phoneNumbers.slice(i, i + 1000));

  for (const batch of chunks) {
    try {
      const res = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey:     apiKey,
          number:     batch.join(','),
          message,
          sendername: 'DCPO-MAIA',
        }),
      });
      const data = await res.json();
      sent += Array.isArray(data) ? data.length : 0;
    } catch (err) {
      console.error('[SMS] Batch error:', err.message);
    }
  }
  console.log(`[SMS] Sent to ${sent} recipients`);
  return sent;
}

// ─────────────────────────────────────────────────────────────────
// POST /api/alerts/disseminate/:caseId
// ─────────────────────────────────────────────────────────────────
async function disseminateAlert(req, res) {
  const caseId = req.params.caseId;

  try {
    const [[mp]] = await pool.query('SELECT * FROM missing_persons WHERE id = ?', [caseId]);
    if (!mp) return res.status(404).json({ success: false, message: 'Case not found' });
    if (mp.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Only active (verified) cases can be disseminated' });
    }

    // 1. Post to Facebook Page feed
    const fbPostId = await postToFacebook(mp);
    if (fbPostId) {
      await pool.query(
        'UPDATE missing_persons SET fb_post_id = ?, fb_posted_at = NOW() WHERE id = ?',
        [fbPostId, caseId]
      );
    }

    // 2. Send Messenger alerts to stored PSIDs (free)
    const [messengerUsers] = await pool.query(
      'SELECT messenger_psid FROM users WHERE messenger_psid IS NOT NULL AND is_verified = TRUE'
    );
    const psids = messengerUsers.map(u => u.messenger_psid).filter(Boolean);
    const messengerSent = await sendMessengerAlert(mp, psids);

    // 3. Send SMS alerts (only if Semaphore is configured)
    let smsSent = 0;
    if (process.env.SEMAPHORE_API_KEY) {
      const [users] = await pool.query('SELECT phone FROM users WHERE is_verified = TRUE AND role = "reporter"');
      smsSent = await sendSmsAlert(mp, users.map(u => u.phone));
    }

    // 4. Log notifications
    await pool.query(
      `INSERT INTO notifications (missing_person_id, channel, recipients_count, message)
       VALUES (?, 'facebook', 1, ?), (?, 'sms', ?, ?)`,
      [
        caseId, `FB Post: ${fbPostId || 'failed'}`,
        caseId, messengerSent + smsSent, `Messenger: ${messengerSent} | SMS: ${smsSent}`
      ]
    );

    await pool.query(
      'INSERT INTO case_logs (missing_person_id, action, performed_by, notes) VALUES (?,?,?,?)',
      [caseId, 'alert_disseminated', req.user.id,
       `FB: ${fbPostId || 'n/a'} | Messenger: ${messengerSent} | SMS: ${smsSent}`]
    );

    res.json({
      success: true,
      message: 'Alert disseminated',
      facebook:  { posted: !!fbPostId, post_id: fbPostId },
      messenger: { sent: messengerSent, total_psids: psids.length },
      sms:       { sent: smsSent },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// GET /api/alerts/notifications/:caseId
async function getNotifications(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE missing_person_id = ? ORDER BY sent_at DESC',
      [req.params.caseId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { disseminateAlert, getNotifications, postToFacebook, sendSmsAlert, sendMessengerAlert };
