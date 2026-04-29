/**
 * ════════════════════════════════════════════════════════
 *  QLARIFY HEALTH — Google Apps Script CRM + WhatsApp Notifier
 *
 *  HOW TO DEPLOY (takes 5 minutes):
 *  ──────────────────────────────────────────────────────
 *  1. Go to https://script.google.com → New Project
 *  2. Delete the default code and paste this entire file
 *  3. Click "+" next to "Services" → add "Sheets API"
 *  4. Click Deploy → New Deployment → Web App
 *     - Execute as: Me (qlarifyhealth@gmail.com)
 *     - Who has access: Anyone
 *  5. Click Deploy → copy the Web App URL
 *  6. Paste that URL into the oncology.html CONFIG as:
 *       webhook_url: "https://script.google.com/macros/s/YOUR_ID/exec"
 *  7. Done! Every form submission now:
 *       ✓ Logs to Google Sheets (your CRM)
 *       ✓ Emails info@qlarify.health
 *       ✓ Auto-replies to the lead
 *       ✓ Creates a WhatsApp click-to-send link in the email
 *
 *  FIRST RUN SETUP:
 *  ──────────────────────────────────────────────────────
 *  When you first run this, Google will ask for permissions.
 *  Click "Advanced" → "Go to Qlarify Lead Handler (unsafe)"
 *  → Allow. This is your own script, it's safe.
 *
 *  THE SHEET:
 *  ──────────────────────────────────────────────────────
 *  A Google Sheet named "Qlarify Leads" will be created
 *  automatically in your Google Drive on the first submission.
 *  Bookmark it — this is your CRM.
 * ════════════════════════════════════════════════════════
 */

const NOTIFY_EMAIL  = 'info@qlarify.health';
const NOTIFY_WA     = '918147410751';   // No + or spaces
const SHEET_NAME    = 'Qlarify Leads';
const CALENDLY_URL  = 'https://calendly.com/qlarify-marketing/30min';

// ── Main entry point ─────────────────────────────────────
function doPost(e) {
  try {
    const raw  = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    const name      = data.name      || 'Not provided';
    const email     = data.email     || '';
    const phone     = data.phone     || 'Not provided';
    const hospital  = data.hospital  || 'Not provided';
    const role      = data.role      || data.designation || 'Not provided';
    const formId    = data.form_id   || 'unknown';
    const specialty = data.specialty || 'Oncology';
    const pageUrl   = data.page_url  || '';
    const utmSrc    = data.utm_source   || '';
    const utmMed    = data.utm_medium   || '';
    const utmCamp   = data.utm_campaign || '';
    const ts        = new Date();
    const tsIST     = Utilities.formatDate(ts, 'Asia/Kolkata', 'dd MMM yyyy, hh:mm a') + ' IST';

    // ── 1. Log to Google Sheet ──────────────────────────
    logToSheet({
      timestamp: tsIST,
      name, email, phone, hospital, role,
      formId, specialty, pageUrl,
      utmSrc, utmMed, utmCamp,
      status: 'New Lead'
    });

    // ── 2. Send notification to Qlarify team ───────────
    const waText = encodeURIComponent(
      '🔔 NEW LEAD — Qlarify ' + specialty + ' Page\n\n' +
      '👤 Name: ' + name + '\n' +
      '🏥 Hospital: ' + hospital + '\n' +
      '💼 Designation: ' + role + '\n' +
      '📧 Email: ' + email + '\n' +
      '📱 Contact: ' + phone + '\n' +
      '📍 Source: ' + formId + '\n' +
      '🕐 Time: ' + tsIST
    );
    const waLink = 'https://wa.me/' + NOTIFY_WA + '?text=' + waText;

    const notifyBody = buildNotifyEmail(name, email, phone, hospital, role, specialty, formId, pageUrl, tsIST, waLink, utmSrc, utmMed, utmCamp);

    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: '🔔 New Lead — ' + hospital + ' · ' + specialty + ' Audit',
      htmlBody: notifyBody,
      name: 'Qlarify Lead Alert'
    });

    // ── 3. Auto-reply to the lead ────────────────────────
    if (email) {
      const autoReplyBody = buildAutoReply(name, hospital, specialty);
      MailApp.sendEmail({
        to: email,
        replyTo: NOTIFY_EMAIL,
        subject: 'Your video audit request is confirmed — Qlarify Health',
        htmlBody: autoReplyBody,
        name: 'Qlarify Health'
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, logged: true, wa_link: waLink }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('Error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Log to Google Sheets ──────────────────────────────────
function logToSheet(row) {
  let ss;
  const files = DriveApp.getFilesByName(SHEET_NAME);
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SHEET_NAME);
    const sheet = ss.getActiveSheet();
    sheet.setName('Leads');
    sheet.appendRow([
      'Timestamp', 'Name', 'Email', 'Phone', 'Hospital',
      'Designation', 'Form ID', 'Specialty', 'Page URL',
      'UTM Source', 'UTM Medium', 'UTM Campaign', 'Status',
      'Follow-up Notes'
    ]);
    sheet.getRange(1, 1, 1, 14).setBackground('#163460').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const sheet = ss.getSheets()[0];
  sheet.appendRow([
    row.timestamp, row.name, row.email, row.phone, row.hospital,
    row.role, row.formId, row.specialty, row.pageUrl,
    row.utmSrc, row.utmMed, row.utmCamp, row.status, ''
  ]);

  // Colour-code new rows
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1, 1, 14).setBackground('#fdeee5');
}

// ── Notification email template ───────────────────────────
function buildNotifyEmail(name, email, phone, hospital, role, specialty, formId, pageUrl, tsIST, waLink, utmSrc, utmMed, utmCamp) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}' +
    '.wrap{max-width:580px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #c8d8e4}' +
    '.top{background:linear-gradient(90deg,#163460,#1c3d6d);padding:20px 28px;color:#fff}' +
    '.top h1{margin:0;font-size:20px;font-weight:700} .top p{margin:6px 0 0;font-size:13px;opacity:.75}' +
    '.body{padding:28px} .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#5a7a94;font-weight:700;margin-bottom:4px}' +
    '.val{font-size:16px;color:#163460;font-weight:600;margin-bottom:16px}' +
    '.div{height:1px;background:#e3ebf3;margin:20px 0}' +
    '.wa{display:block;background:#25D366;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;text-align:center;margin:24px auto;max-width:260px}' +
    '.meta{background:#f7f9fc;border-radius:12px;padding:14px 18px;font-size:12px;color:#5a7a94;margin-top:20px;line-height:1.8}' +
    '.foot{text-align:center;padding:16px;font-size:11px;color:#9ab;border-top:1px solid #e3ebf3}' +
    '</style></head><body><div class="wrap">' +
    '<div class="top"><h1>🔔 New Lead — ' + specialty + ' Page</h1><p>' + tsIST + '</p></div>' +
    '<div class="body">' +
    '<div class="lbl">Name</div><div class="val">' + name + '</div>' +
    '<div class="lbl">Designation</div><div class="val">' + role + '</div>' +
    '<div class="lbl">Hospital / Cancer Centre</div><div class="val">' + hospital + '</div>' +
    '<div class="lbl">Email</div><div class="val"><a href="mailto:' + email + '" style="color:#163460">' + email + '</a></div>' +
    '<div class="lbl">WhatsApp / Contact</div><div class="val"><a href="tel:' + phone + '" style="color:#163460">' + phone + '</a></div>' +
    '<div class="div"></div>' +
    '<a href="' + waLink + '" class="wa">📲 Send WhatsApp Now</a>' +
    '<div class="div"></div>' +
    '<div class="meta">' +
    '<strong>Source:</strong> ' + formId + '<br>' +
    '<strong>Page:</strong> ' + pageUrl + '<br>' +
    (utmSrc ? '<strong>UTM:</strong> ' + utmSrc + ' / ' + utmMed + ' / ' + utmCamp : '') +
    '</div>' +
    '<div style="margin-top:16px;text-align:center">' +
    '<a href="' + CALENDLY_URL + '" style="color:#163460;font-size:13px">📅 Book a follow-up call</a>' +
    '</div>' +
    '</div>' +
    '<div class="foot">Qlarify Health · info@qlarify.health · +91 81474 10751</div>' +
    '</div></body></html>';
}

// ── Auto-reply email template ─────────────────────────────
function buildAutoReply(name, hospital, specialty) {
  const firstName = name.split(' ')[0];
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}' +
    '.wrap{max-width:580px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #c8d8e4}' +
    '.top{background:linear-gradient(90deg,#163460,#1c3d6d);padding:24px 28px;color:#fff;text-align:center}' +
    '.top h1{margin:0;font-size:20px;font-weight:700} .top p{margin:8px 0 0;font-size:13px;opacity:.8}' +
    '.body{padding:32px 28px;color:#163460}' +
    '.greet{font-size:20px;font-weight:700;margin-bottom:12px}' +
    'p{font-size:15px;line-height:1.7;color:rgba(22,52,96,.8);margin:0 0 14px}' +
    '.steps{background:#f7f9fc;border-radius:12px;padding:20px;margin:20px 0}' +
    '.step{margin-bottom:14px;padding-left:36px;position:relative;min-height:28px}' +
    '.step-n{position:absolute;left:0;top:0;width:26px;height:26px;background:linear-gradient(180deg,#e8835f,#d05a18);color:#fff;border-radius:50%;text-align:center;line-height:26px;font-weight:700;font-size:12px}' +
    '.step-t{font-size:14px;color:#163460;line-height:1.55}' +
    '.wa{display:block;background:#25D366;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;text-align:center;margin:24px auto;max-width:260px}' +
    '.foot{text-align:center;padding:16px;font-size:11px;color:#9ab;border-top:1px solid #e3ebf3}' +
    '</style></head><body><div class="wrap">' +
    '<div class="top"><h1>Your audit request is confirmed ✓</h1><p>Qlarify Health · ' + specialty + ' Video Audit</p></div>' +
    '<div class="body">' +
    '<div class="greet">Hi ' + firstName + ',</div>' +
    '<p>Thank you for requesting a free video audit for <strong>' + hospital + '</strong>. We\'ve received your details and will be in touch within <strong>24 hours</strong>.</p>' +
    '<div class="steps">' +
    '<div class="step"><div class="step-n">1</div><div class="step-t"><strong>We confirm you\'re a fit</strong> — within 24 hours, we\'ll review your cancer centre\'s profile.</div></div>' +
    '<div class="step"><div class="step-n">2</div><div class="step-t"><strong>We start the audit</strong> — no input needed from your end. We map your full ' + specialty + ' video library.</div></div>' +
    '<div class="step"><div class="step-n">3</div><div class="step-t"><strong>7-day delivery</strong> — your gap matrix, top 10 missing videos, and a 30-minute walkthrough.</div></div>' +
    '</div>' +
    '<p>Have questions? WhatsApp us directly:</p>' +
    '<a href="https://wa.me/918147410751?text=Hi%2C%20I%20just%20submitted%20the%20video%20audit%20form%20for%20' + encodeURIComponent(hospital) + '." class="wa">📲 WhatsApp +91 81474 10751</a>' +
    '<p style="font-size:13px;color:rgba(22,52,96,.55);text-align:center">Or email: <a href="mailto:info@qlarify.health" style="color:#e8835f">info@qlarify.health</a></p>' +
    '</div>' +
    '<div class="foot">© 2026 Qlarify Health · <a href="https://qlarify.health" style="color:#5a7a94">qlarify.health</a></div>' +
    '</div></body></html>';
}

// ── Test function (run manually to verify setup) ──────────
function testSetup() {
  const mockData = {
    name: 'Test Lead',
    email: 'info@qlarify.health',
    phone: '+91 81474 10751',
    hospital: 'Test Hospital',
    role: 'Marketing Head',
    form_id: 'test-run',
    specialty: 'Oncology',
    page_url: 'https://qlarify.health/oncology'
  };

  const mockEvent = {
    postData: { contents: JSON.stringify(mockData) }
  };

  const result = doPost(mockEvent);
  Logger.log('Test result: ' + result.getContent());
}
