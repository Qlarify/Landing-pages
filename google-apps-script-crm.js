/**
 * ════════════════════════════════════════════════════════
 *  QLARIFY HEALTH — Google Apps Script CRM v2
 *  Full automation: CRM + Email + WhatsApp + Follow-up triggers
 *
 *  DEPLOY (5 min):
 *  1. script.google.com → New Project → paste this file
 *  2. Deploy → New Deployment → Web App
 *     Execute as: Me | Who has access: Anyone
 *  3. Copy Web App URL → paste into oncology.html CONFIG
 *
 *  AFTER DEPLOY — Install auto-triggers (one time):
 *  Run the installTriggers() function once from the editor.
 *  This sets up:
 *    • Hourly follow-up reminders (2h after lead, if not contacted)
 *    • Daily 9am IST summary email with pipeline overview
 * ════════════════════════════════════════════════════════
 */

const NOTIFY_EMAIL    = 'info@qlarify.health';
const NOTIFY_WA       = '918147410751';
const SHEET_NAME      = 'Qlarify Leads';
const CALENDLY_URL    = 'https://calendly.com/qlarify-marketing/30min';
const FOLLOW_UP_HOURS = 2; // Alert if lead not marked contacted within 2 hours

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
    const utmSrc    = data.utm_source    || '';
    const utmMed    = data.utm_medium    || '';
    const utmCamp   = data.utm_campaign  || '';
    const referrer  = data.referrer      || '';
    const ts        = new Date();
    const tsIST     = Utilities.formatDate(ts, 'Asia/Kolkata', 'dd MMM yyyy, hh:mm a') + ' IST';

    // 1. Log to CRM sheet
    logToSheet({ timestamp: tsIST, rawTs: ts.toISOString(), name, email, phone, hospital, role, formId, specialty, pageUrl, referrer, utmSrc, utmMed, utmCamp, status: 'New Lead' });

    // 2. Build WhatsApp pre-filled link
    const waText = encodeURIComponent(
      '🔔 NEW LEAD — Qlarify ' + specialty + '\n\n' +
      '👤 ' + name + '\n' +
      '🏥 ' + hospital + '\n' +
      '💼 ' + role + '\n' +
      '📧 ' + email + '\n' +
      '📱 ' + phone + '\n' +
      '🕐 ' + tsIST
    );
    const waLink = 'https://wa.me/' + NOTIFY_WA + '?text=' + waText;

    // 3. Email alert to Qlarify team
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: '🔔 New Lead — ' + hospital + ' · ' + specialty,
      htmlBody: buildNotifyEmail(name, email, phone, hospital, role, specialty, formId, pageUrl, tsIST, waLink, utmSrc, utmMed, utmCamp, referrer),
      name: 'Qlarify Lead Alert'
    });

    // 4. Auto-reply to the lead
    if (email) {
      MailApp.sendEmail({
        to: email,
        replyTo: NOTIFY_EMAIL,
        subject: 'Your video audit request is confirmed — Qlarify Health',
        htmlBody: buildAutoReply(name, hospital, specialty),
        name: 'Qlarify Health'
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, logged: true, wa_link: waLink }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'Qlarify Lead Handler v2' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Log to Google Sheets CRM ──────────────────────────────
function logToSheet(row) {
  let ss;
  const files = DriveApp.getFilesByName(SHEET_NAME);
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SHEET_NAME);
    const sheet = ss.getActiveSheet();
    sheet.setName('Leads');
    sheet.appendRow(['Timestamp','Name','Email','Phone','Hospital','Designation','Form ID','Specialty','Page URL','Referrer','UTM Source','UTM Medium','UTM Campaign','Status','Contacted?','Follow-up Notes','Lead Score','_RawTS']);
    sheet.getRange(1,1,1,17).setBackground('#163460').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1,160); sheet.setColumnWidth(2,140); sheet.setColumnWidth(3,200); sheet.setColumnWidth(5,180); sheet.setColumnWidth(15,120); sheet.setColumnWidth(16,220);
    sheet.getRange(1,18).setFontColor('#f5f5f5'); // hide raw timestamp column

    // Dropdown for Status
    sheet.getRange('N2:N1000').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['New Lead','Contacted','Qualified','Proposal Sent','Won','Lost','Not a Fit'],true).build()
    );
    // Dropdown for Contacted
    sheet.getRange('O2:O1000').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['No','WhatsApp Sent','Called','Emailed','Meeting Booked'],true).build()
    );
  }

  const sheet = ss.getSheets()[0];
  const score = scoreLead(row);
  sheet.appendRow([row.timestamp, row.name, row.email, row.phone, row.hospital, row.role, row.formId, row.specialty, row.pageUrl, row.referrer, row.utmSrc, row.utmMed, row.utmCamp, 'New Lead', 'No', '', score, row.rawTs]);

  const lastRow = sheet.getLastRow();
  const rowColor = score >= 80 ? '#d4edda' : score >= 50 ? '#fff3cd' : '#fdeee5';
  sheet.getRange(lastRow, 1, 1, 17).setBackground(rowColor);
  sheet.getRange(lastRow, 2).setFontWeight('bold');
  sheet.getRange(lastRow, 5).setFontWeight('bold');
}

// ── Lead scoring 0–100 ────────────────────────────────────
function scoreLead(row) {
  let score = 0;
  const role = (row.role || '').toLowerCase();
  if (/ceo|cxo|president|director|founder/.test(role))       score += 35;
  else if (/head|vp|chief|gm|general manager/.test(role))    score += 28;
  else if (/manager|marketing|business|admin/.test(role))    score += 20;
  else                                                        score += 10;
  if (row.hospital && row.hospital !== 'Not provided')        score += 20;
  if (row.email && !/@gmail|@yahoo|@hotmail/.test(row.email)) score += 20;
  else if (row.email)                                         score += 10;
  if (row.phone && row.phone !== 'Not provided')              score += 15;
  if (/google|meta|facebook|linkedin/.test((row.utmSrc||'').toLowerCase())) score += 10;
  else if (row.utmSrc)                                        score += 5;
  return Math.min(score, 100);
}

// ── ⏰ Hourly follow-up check ─────────────────────────────
function checkFollowUps() {
  const files = DriveApp.getFilesByName(SHEET_NAME);
  if (!files.hasNext()) return;
  const sheet = SpreadsheetApp.open(files.next()).getSheets()[0];
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const reminders = [];

  for (let i = 1; i < data.length; i++) {
    const status = data[i][13], contacted = data[i][14], rawTs = data[i][17];
    if (status === 'New Lead' && contacted === 'No' && rawTs) {
      const hoursOld = (now - new Date(rawTs)) / 3600000;
      if (hoursOld >= FOLLOW_UP_HOURS) {
        reminders.push({ name: data[i][1], hospital: data[i][4], role: data[i][5], phone: data[i][3], email: data[i][2], hoursOld: Math.round(hoursOld) });
      }
    }
  }
  if (!reminders.length) return;

  const rows = reminders.map(r =>
    '<tr style="border-bottom:1px solid #e3ebf3">' +
    '<td style="padding:10px 12px;font-weight:600;color:#163460">' + r.name + '</td>' +
    '<td style="padding:10px 12px;color:#5a7a94">' + r.hospital + '</td>' +
    '<td style="padding:10px 12px">' + r.role + '</td>' +
    '<td style="padding:10px 12px;color:#e8835f;font-weight:700">' + r.hoursOld + 'h ago</td>' +
    '<td style="padding:10px 12px"><a href="https://wa.me/' + NOTIFY_WA + '?text=' +
      encodeURIComponent('Hi ' + r.name.split(' ')[0] + ', this is the Qlarify Health team. You requested a free video audit for ' + r.hospital + '. When is a good time to connect?') +
      '" style="background:#25D366;color:#fff;padding:6px 14px;border-radius:999px;text-decoration:none;font-size:12px;font-weight:600">WhatsApp Now</a></td></tr>'
  ).join('');

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '⚠️ ' + reminders.length + ' Qlarify lead' + (reminders.length > 1 ? 's' : '') + ' need follow-up now',
    htmlBody: '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5"><div style="max-width:640px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #c8d8e4"><div style="background:linear-gradient(90deg,#163460,#1c3d6d);padding:20px 28px;color:#fff"><h2 style="margin:0;font-size:18px">⚠️ ' + reminders.length + ' Lead' + (reminders.length > 1 ? 's' : '') + ' Waiting</h2><p style="margin:6px 0 0;font-size:13px;opacity:.75">Not contacted in ' + FOLLOW_UP_HOURS + '+ hours</p></div><div style="padding:20px"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f7f9fc"><th style="padding:10px 12px;text-align:left;color:#5a7a94;font-size:11px;text-transform:uppercase">Name</th><th style="padding:10px 12px;text-align:left;color:#5a7a94;font-size:11px;text-transform:uppercase">Hospital</th><th style="padding:10px 12px;text-align:left;color:#5a7a94;font-size:11px;text-transform:uppercase">Role</th><th style="padding:10px 12px;text-align:left;color:#5a7a94;font-size:11px;text-transform:uppercase">Age</th><th style="padding:10px 12px;text-align:left;color:#5a7a94;font-size:11px;text-transform:uppercase">Action</th></tr></thead><tbody>' + rows + '</tbody></table><div style="margin-top:20px;text-align:center"><a href="' + CALENDLY_URL + '" style="display:inline-block;background:#163460;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">📅 Book follow-up</a></div></div></div></body></html>',
    name: 'Qlarify CRM Alert'
  });
}

// ── 📊 Daily summary at 9am IST ──────────────────────────
function sendDailySummary() {
  const files = DriveApp.getFilesByName(SHEET_NAME);
  if (!files.hasNext()) return;
  const sheet = SpreadsheetApp.open(files.next()).getSheets()[0];
  const data = sheet.getDataRange().getValues();
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd MMM yyyy');

  let todayLeads = [], totalNew = 0, totalContacted = 0, totalWon = 0;
  for (let i = 1; i < data.length; i++) {
    const ts = data[i][0] || '', status = data[i][13] || '';
    if (ts.includes(todayStr)) todayLeads.push({ name: data[i][1], hospital: data[i][4], role: data[i][5], status });
    if (status === 'New Lead') totalNew++;
    if (['Contacted','Qualified','Proposal Sent'].includes(status)) totalContacted++;
    if (status === 'Won') totalWon++;
  }

  const todayRows = todayLeads.map(l =>
    '<tr><td style="padding:8px 12px;font-weight:600">' + l.name + '</td><td style="padding:8px 12px;color:#5a7a94">' + l.hospital + '</td><td style="padding:8px 12px">' + l.role + '</td><td style="padding:8px 12px;color:#e8835f;font-weight:600">' + l.status + '</td></tr>'
  ).join('');

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '📊 Qlarify Daily — ' + todayStr + ' (' + todayLeads.length + ' new, ' + totalNew + ' pending)',
    htmlBody: '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5"><div style="max-width:580px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #c8d8e4"><div style="background:linear-gradient(90deg,#163460,#1c3d6d);padding:20px 28px;color:#fff"><h2 style="margin:0;font-size:18px">📊 Daily Lead Summary — ' + todayStr + '</h2></div><div style="padding:24px"><div style="display:flex;gap:16px;margin-bottom:24px"><div style="flex:1;background:#f7f9fc;border-radius:8px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:700;color:#163460">' + todayLeads.length + '</div><div style="font-size:12px;color:#5a7a94;text-transform:uppercase;letter-spacing:.1em">Today</div></div><div style="flex:1;background:#f7f9fc;border-radius:8px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:700;color:#e8835f">' + totalNew + '</div><div style="font-size:12px;color:#5a7a94;text-transform:uppercase;letter-spacing:.1em">Pending</div></div><div style="flex:1;background:#f7f9fc;border-radius:8px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:700;color:#25D366">' + totalWon + '</div><div style="font-size:12px;color:#5a7a94;text-transform:uppercase;letter-spacing:.1em">Won</div></div></div>' +
      (todayLeads.length > 0 ? '<h3 style="color:#163460;font-size:14px;margin:0 0 12px">Today\'s Leads</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f7f9fc"><th style="padding:8px 12px;text-align:left;color:#5a7a94;font-size:11px">Name</th><th style="padding:8px 12px;text-align:left;color:#5a7a94;font-size:11px">Hospital</th><th style="padding:8px 12px;text-align:left;color:#5a7a94;font-size:11px">Role</th><th style="padding:8px 12px;text-align:left;color:#5a7a94;font-size:11px">Status</th></tr></thead><tbody>' + todayRows + '</tbody></table>' : '<p style="color:#5a7a94;font-size:14px">No new leads today yet.</p>') +
      '<div style="margin-top:20px;text-align:center"><a href="https://docs.google.com/spreadsheets" style="display:inline-block;background:#163460;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open CRM →</a></div></div></div></body></html>',
    name: 'Qlarify CRM'
  });
}

// ── Notification email template ───────────────────────────
function buildNotifyEmail(name, email, phone, hospital, role, specialty, formId, pageUrl, tsIST, waLink, utmSrc, utmMed, utmCamp, referrer) {
  return '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0"><div style="max-width:580px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #c8d8e4"><div style="background:linear-gradient(90deg,#163460,#1c3d6d);padding:20px 28px;color:#fff"><h1 style="margin:0;font-size:20px">🔔 New Lead — ' + specialty + '</h1><p style="margin:6px 0 0;font-size:13px;opacity:.75">' + tsIST + '</p></div><div style="padding:28px"><p style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#5a7a94;margin-bottom:4px">Name</p><p style="font-size:16px;color:#163460;font-weight:600;margin:0 0 16px">' + name + '</p><p style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#5a7a94;margin-bottom:4px">Designation</p><p style="font-size:16px;color:#163460;font-weight:600;margin:0 0 16px">' + role + '</p><p style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#5a7a94;margin-bottom:4px">Hospital</p><p style="font-size:16px;color:#163460;font-weight:600;margin:0 0 16px">' + hospital + '</p><p style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#5a7a94;margin-bottom:4px">Email</p><p style="font-size:16px;color:#163460;font-weight:600;margin:0 0 16px"><a href="mailto:' + email + '" style="color:#163460">' + email + '</a></p><p style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#5a7a94;margin-bottom:4px">Phone</p><p style="font-size:16px;color:#163460;font-weight:600;margin:0 0 16px"><a href="tel:' + phone + '" style="color:#163460">' + phone + '</a></p><div style="height:1px;background:#e3ebf3;margin:20px 0"></div><a href="' + waLink + '" style="display:block;background:#25D366;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;text-align:center;margin:0 auto 20px;max-width:260px">📲 WhatsApp ' + name.split(' ')[0] + ' Now</a><div style="height:1px;background:#e3ebf3;margin:20px 0"></div><div style="background:#f7f9fc;border-radius:12px;padding:14px 18px;font-size:12px;color:#5a7a94;line-height:1.8"><strong>Form:</strong> ' + formId + '<br><strong>Page:</strong> ' + (pageUrl||'—') + '<br>' + (referrer?'<strong>Referrer:</strong> '+referrer+'<br>':'') + (utmSrc?'<strong>UTM:</strong> '+utmSrc+' / '+utmMed+' / '+utmCamp:'') + '</div><div style="margin-top:16px;text-align:center"><a href="' + CALENDLY_URL + '" style="color:#163460;font-size:13px">📅 Book a follow-up call</a></div></div><div style="text-align:center;padding:16px;font-size:11px;color:#9ab;border-top:1px solid #e3ebf3">Qlarify Health · info@qlarify.health · +91 81474 10751</div></div></body></html>';
}

// ── Auto-reply template ───────────────────────────────────
function buildAutoReply(name, hospital, specialty) {
  const fn = name.split(' ')[0];
  return '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0"><div style="max-width:580px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #c8d8e4"><div style="background:linear-gradient(90deg,#163460,#1c3d6d);padding:24px 28px;color:#fff;text-align:center"><h1 style="margin:0;font-size:20px">Your audit request is confirmed ✓</h1><p style="margin:8px 0 0;font-size:13px;opacity:.8">Qlarify Health · ' + specialty + ' Video Audit</p></div><div style="padding:32px 28px;color:#163460"><h2 style="font-size:20px;font-weight:700;margin:0 0 12px">Hi ' + fn + ',</h2><p style="font-size:15px;line-height:1.7;color:rgba(22,52,96,.8);margin:0 0 14px">Thank you for requesting a free video audit for <strong>' + hospital + '</strong>. Our team will be in touch within <strong>24 hours</strong>.</p><div style="background:#f7f9fc;border-radius:12px;padding:20px;margin:20px 0"><div style="display:flex;gap:12px;margin-bottom:14px"><div style="background:linear-gradient(180deg,#e8835f,#d05a18);color:#fff;min-width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;line-height:28px;text-align:center">1</div><div style="font-size:14px;padding-top:4px"><strong>We confirm you\'re a fit</strong> — within 24 hours we\'ll review your cancer centre\'s profile.</div></div><div style="display:flex;gap:12px;margin-bottom:14px"><div style="background:linear-gradient(180deg,#e8835f,#d05a18);color:#fff;min-width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;line-height:28px;text-align:center">2</div><div style="font-size:14px;padding-top:4px"><strong>We start the audit</strong> — no input needed. We map your full ' + specialty + ' video library.</div></div><div style="display:flex;gap:12px"><div style="background:linear-gradient(180deg,#e8835f,#d05a18);color:#fff;min-width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;line-height:28px;text-align:center">3</div><div style="font-size:14px;padding-top:4px"><strong>7-day delivery</strong> — gap matrix, top 10 missing videos, 30-min walkthrough.</div></div></div><a href="https://wa.me/918147410751?text=' + encodeURIComponent('Hi, I submitted the video audit form for ' + hospital + '.') + '" style="display:block;background:#25D366;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;text-align:center;margin:16px auto;max-width:260px">📲 WhatsApp +91 81474 10751</a><p style="font-size:13px;color:rgba(22,52,96,.55);text-align:center">Or email: <a href="mailto:info@qlarify.health" style="color:#e8835f">info@qlarify.health</a></p></div><div style="text-align:center;padding:16px;font-size:11px;color:#9ab;border-top:1px solid #e3ebf3">© 2026 Qlarify Health · <a href="https://qlarify.health" style="color:#5a7a94">qlarify.health</a></div></div></body></html>';
}

// ── Install triggers (run once from editor) ───────────────
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkFollowUps').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('sendDailySummary').timeBased().atHour(3).everyDays(1).create(); // 3am UTC = 8:30am IST
  Logger.log('✓ Triggers installed: hourly follow-ups + daily 8:30am IST summary');
}

// ── Test (run manually) ───────────────────────────────────
function testSetup() {
  const mock = { postData: { contents: JSON.stringify({ name:'Test Lead', email:'info@qlarify.health', phone:'+91 81474 10751', hospital:'Apollo Cancer Centre', role:'Marketing Head', form_id:'test', specialty:'Oncology', page_url:'https://videoaudit.qlarify.health/oncology', utm_source:'test' }) } };
  Logger.log(doPost(mock).getContent());
}
