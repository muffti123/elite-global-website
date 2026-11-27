/**
 * Email layer: every email goes through sendEmail_().
 *
 *  - Provider: Script Property EMAIL_PROVIDER = "mailapp" (default) or "brevo" (transactional API,
 *    BREVO_API_KEY + SENDER_EMAIL in Script Properties — never in code).
 *  - Once only: a message with a `key` (e.g. "EG-VO-00012|status:Verified") is sent at most once;
 *    the key is looked up in the "Email Log" spreadsheet (separate from the Central Lead Tracker).
 *  - Never blocks a lead: when the quota is used up or the provider has a temporary problem, the
 *    email is queued in "Email Queue" and sent later by runEmailJobs (every 5 minutes).
 *  - Verification codes (urgent) are never queued, and other emails leave CONFIG.EMAIL.QUOTA_RESERVE
 *    of the MailApp quota free for them.
 *  - Logs contain the kind, Lead ID and result only — never an email address, name or code.
 */

const EMAIL_LOG_HEADERS = ['Time', 'Key', 'Kind', 'Lead ID', 'Result', 'Provider', 'Detail'];
const EMAIL_QUEUE_HEADERS = ['Queued At', 'Key', 'Kind', 'Lead ID', 'To', 'Subject', 'HTML', 'Text',
  'Attempts', 'Last Error', 'After Send'];
const EMAIL_DONE = { ok: true, queued: true, skipped: true }; // a key with one of these is never sent again

// ---------------------------------------------------------------------
// SETTINGS (Script Properties, with defaults)
// ---------------------------------------------------------------------
function settings_() {
  const p = PropertiesService.getScriptProperties();
  const get = function (k, d) { const v = p.getProperty(k); return v === null || String(v).trim() === '' ? d : String(v).trim(); };
  return {
    staffEmail: validEmails_(get('STAFF_EMAIL', '')).join(','),
    staffEmailRaw: get('STAFF_EMAIL', ''),
    siteUrl: siteUrlOk_(get('SITE_URL', '')) ? get('SITE_URL', '').replace(/\/+$/, '') : CONFIG.EMAIL.DEFAULT_SITE_URL,
    siteUrlSet: get('SITE_URL', '') !== '',
    siteUrlValid: get('SITE_URL', '') === '' || siteUrlOk_(get('SITE_URL', '')),
    notifyStaff: get('NOTIFY_STAFF', 'on').toLowerCase() !== 'off',
    notifyCustomer: get('NOTIFY_CUSTOMER', 'on').toLowerCase() !== 'off',
    provider: get('EMAIL_PROVIDER', 'mailapp').toLowerCase() === 'brevo' ? 'brevo' : 'mailapp',
    brevoKey: get('BREVO_API_KEY', ''),
    senderEmail: get('SENDER_EMAIL', ''),
    attachVisa: get('ATTACH_VISA', 'off').toLowerCase() === 'on', // Visa Approved email attaches the visa
  };
}

function staffEmail_() {
  return settings_().staffEmail || Session.getEffectiveUser().getEmail();
}

/** Setup: STAFF_EMAIL = the script owner (only when empty); warn when SITE_URL is not set. */
function ensureEmailSettings_() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('STAFF_EMAIL')) {
    p.setProperty('STAFF_EMAIL', Session.getEffectiveUser().getEmail());
    Logger.log('STAFF_EMAIL set to the script owner (change it with setStaffEmail).');
  }
  otpSecret_();
  const s = settings_();
  if (!s.siteUrlSet) {
    Logger.log('⚠️ SITE_URL is not set — emails link to ' + s.siteUrl + '. On production set SITE_URL in ' + SETTINGS_HOWTO + '.');
  }
  if (s.provider === 'brevo' && (!s.brevoKey || !s.senderEmail)) {
    Logger.log('⚠️ EMAIL_PROVIDER is brevo but BREVO_API_KEY or SENDER_EMAIL is missing — emails will be queued.');
  }
}

/** Valid addresses from a comma-separated list (lower-case). */
function validEmails_(value) {
  return String(value || '').split(',').map(function (e) { return e.trim().toLowerCase(); })
    .filter(function (e) { return EMAIL_RE.test(e); });
}
function siteUrlOk_(u) { return /^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(String(u || '').trim()); }

const SETTINGS_HOWTO = 'Apps Script editor → Project Settings (gear icon) → Script Properties → Edit script properties';

/**
 * Staff alerts and the daily summary go to Script Property STAFF_EMAIL. From the Run button: edit
 * STAFF_EMAIL in Project Settings → Script Properties (one address, or several separated by commas),
 * then run checkEmailSettings. Developers can also call setStaffEmail("name@example.com").
 */
function setStaffEmail(email) {
  if (email === undefined || email === null || typeof email === 'object') { // Run button: no argument (or an event object)
    Logger.log('To change who gets staff alerts and the daily summary:\n  ' + SETTINGS_HOWTO +
      '\n  → STAFF_EMAIL = the address (several: separate with commas) → Save.\nThen run checkEmailSettings to confirm.' +
      '\nCurrent STAFF_EMAIL: ' + (validEmails_(settings_().staffEmailRaw).length ? validEmails_(settings_().staffEmailRaw).length + ' address(es) set (see Script Properties)' : '(empty → the owner account)'));
    return;
  }
  const list = validEmails_(email);
  if (!list.length || list.length !== String(email).split(',').filter(function (e) { return e.trim(); }).length) {
    throw new Error('setStaffEmail: please give valid email addresses, e.g. setStaffEmail("name@example.com").');
  }
  PropertiesService.getScriptProperties().setProperty('STAFF_EMAIL', list.join(','));
  Logger.log('STAFF_EMAIL set (' + list.length + ' address' + (list.length > 1 ? 'es' : '') + ').');
}

/**
 * Website address used in email links and the logo (Script Property SITE_URL). From the Run button: edit
 * SITE_URL in Project Settings → Script Properties (e.g. https://www.your-domain, no slash at the end),
 * then run checkEmailSettings. Developers can also call setSiteUrl("https://…").
 */
function setSiteUrl(url) {
  if (url === undefined || url === null || typeof url === 'object') {
    Logger.log('To change the website address used in emails:\n  ' + SETTINGS_HOWTO +
      '\n  → SITE_URL = https://… (no slash at the end) → Save.\nThen run checkEmailSettings to confirm.' +
      '\nCurrent SITE_URL: ' + settings_().siteUrl + (settings_().siteUrlSet ? '' : ' (default)'));
    return;
  }
  const u = String(url).trim().replace(/\/+$/, '');
  if (!siteUrlOk_(u)) throw new Error('setSiteUrl: please give the https:// address of the website.');
  PropertiesService.getScriptProperties().setProperty('SITE_URL', u);
  Logger.log('SITE_URL set to ' + u);
}

/** Run button: checks the email settings in Script Properties and prints them (same as showNotifySettings). */
function checkEmailSettings() { return showNotifySettings(); }

/** Editor: prints the email settings. The Brevo key is never printed. */
function showNotifySettings() {
  const s = settings_();
  let quota = '';
  try { quota = String(MailApp.getRemainingDailyQuota()); } catch (e) { quota = 'unknown'; }
  const raw = String(s.staffEmailRaw || '').split(',').filter(function (e) { return e.trim(); });
  const badStaff = raw.length && validEmails_(s.staffEmailRaw).length !== raw.length;
  Logger.log('\nEmail settings (Script Properties — change them in ' + SETTINGS_HOWTO + '):' +
    '\n  STAFF_EMAIL      ' + (raw.length ? raw.length + (raw.length === 1 ? ' address' : ' addresses') + ' set (see Script Properties)' : '(empty → the owner account)') +
    (badStaff ? '   ⚠️ some addresses are not valid and are ignored: check STAFF_EMAIL' : '') +
    '\n  SITE_URL         ' + s.siteUrl + (!s.siteUrlValid ? '   ⚠️ SITE_URL is not a valid https:// address — the default is used'
      : s.siteUrlSet ? '' : '  (default — set it on production)') +
    '\n  NOTIFY_STAFF     ' + (s.notifyStaff ? 'on' : 'off') +
    '\n  NOTIFY_CUSTOMER  ' + (s.notifyCustomer ? 'on' : 'off') +
    '\n  EMAIL_PROVIDER   ' + s.provider +
    '\n  BREVO_API_KEY    ' + (s.brevoKey ? 'set' : 'not set') +
    '\n  SENDER_EMAIL     ' + (s.senderEmail ? 'set (see Script Properties)' : '(not set)') +
    '\n  ATTACH_VISA      ' + (s.attachVisa ? 'on (the Visa Approved email attaches the visa files, up to 15 MB together)'
      : 'off (the Visa Approved email has the Download button only; set ATTACH_VISA = on to attach)') +
    '\n  TEST_OTP_BYPASS  ' + (testBypassOn_() ? 'on (staging tests only)' : 'off') +
    '\n  FORMS_PAUSED     ' + (formsPaused_() ? 'on ⏸ (new online requests are refused — run resumeForms)' : 'off') +
    '\n  MailApp quota left today: ' + quota +
    '\n  Email queue: ' + emailQueueCount_() + ' waiting');
}

/** One line for System Info. */
function emailSettingsLine_() {
  const s = settings_();
  return 'provider ' + s.provider + ' · staff alerts ' + (s.notifyStaff ? 'on' : 'off') +
    ' · customer emails ' + (s.notifyCustomer ? 'on' : 'off') + ' · links to ' + s.siteUrl;
}

// ---------------------------------------------------------------------
// EMAIL LOG SPREADSHEET ("Elite Global – Email Log": Email Log + Email Queue tabs)
// ---------------------------------------------------------------------
function ensureEmailLog_(root) {
  const p = PropertiesService.getScriptProperties();
  let ss = spreadsheetOrNull_(p.getProperty('EMAIL_LOG_ID'));
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.EMAIL.LOG_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    Logger.log('Created "' + CONFIG.EMAIL.LOG_NAME + '" spreadsheet.');
  }
  p.setProperty('EMAIL_LOG_ID', ss.getId());
  const tabs = [[CONFIG.EMAIL.LOG_TAB, EMAIL_LOG_HEADERS, [150, 260, 110, 120, 80, 80, 300]],
    [CONFIG.EMAIL.QUEUE_TAB, EMAIL_QUEUE_HEADERS, [150, 260, 110, 120, 200, 260, 200, 200, 70, 200, 200]]];
  tabs.forEach(function (t, i) {
    let sh = ss.getSheetByName(t[0]);
    if (!sh) {
      const blank = ss.getSheets().filter(function (x) { return /^(Sheet1|Blad1|Feuille 1)$/.test(x.getName()) && x.getLastRow() === 0; })[0];
      sh = blank ? blank.setName(t[0]) : ss.insertSheet(t[0], i);
    }
    if (sh.getMaxColumns() < t[1].length) sh.insertColumnsAfter(sh.getMaxColumns(), t[1].length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, t[1].length).setValues([t[1]])
      .setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold');
    sh.setFrozenRows(1);
    t[2].forEach(function (w, c) { sh.setColumnWidth(c + 1, w); });
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('dd mmm yyyy, hh:mm:ss');
  });
}

function emailLogSS_() {
  const id = PropertiesService.getScriptProperties().getProperty('EMAIL_LOG_ID');
  if (!id) throw new Error('Setup has not been run (no EMAIL_LOG_ID).');
  return SpreadsheetApp.openById(id);
}
function emailLogSheet_() { return emailLogSS_().getSheetByName(CONFIG.EMAIL.LOG_TAB); }
function emailQueueSheet_() { return emailLogSS_().getSheetByName(CONFIG.EMAIL.QUEUE_TAB); }

function emailLogUrl_() {
  const ss = spreadsheetOrNull_(PropertiesService.getScriptProperties().getProperty('EMAIL_LOG_ID'));
  return ss ? ss.getUrl() : '(missing — run setupEliteGlobal)';
}

/**
 * Masks anything shaped like an email address. Every log line that can carry text we don't control (a Google error
 * message such as "Invalid email: …", a Script Property) goes through it: logs never show an address.
 */
function noEmails_(s) {
  return String(s == null ? '' : s).replace(/[^\s@<>"'(),;:\[\]]+@[^\s@<>"'(),;:\[\]]+\.[A-Za-z]{2,}/g, '(an email address)');
}

/** One log row (and one console line). Never an address, name or code. */
function logEmail_(m, result, detail) {
  console.log('email ' + m.kind + ' ' + result + (m.leadId ? ' ' + m.leadId : ''));
  if (m.key && EMAIL_DONE[result]) markEmailSent_(m.key);
  if (result === 'ok') countHealth_('mail', String(m.to || '').split(',').length || 1);
  if (result === 'failed' || result === 'unavailable') countHealth_('mailFail');
  try {
    emailLogSheet_().appendRow([new Date(), m.key || '', m.kind, m.leadId || '', result,
      settings_().provider, noEmails_(detail).slice(0, 300)]);
  } catch (e) { console.error('email log unavailable: ' + noEmails_(e.message)); }
  return result;
}

/**
 * True when a key was already sent, queued or deliberately skipped. Lead keys ("EG-VO-00012|status:Verified")
 * are checked in the lead's "Emails Sent" cell (sentCell, when the caller already read the row) — never by
 * searching the Email Log. Other keys (daily summary) and leads no longer in the tracker use the Email Log.
 */
function emailDone_(key, sentCell) {
  if (!key) return false;
  const m = /^(EG-(?:VO|CE|GE)-\d{5})\|(.+)$/.exec(key);
  if (m) {
    let cell = sentCell;
    if (cell === undefined) {
      try {
        const sh = trackerSheet_();
        const row = findLeadRow_(sh, m[1]);
        if (row) cell = sh.getRange(row, trackerCols_(sh)['Emails Sent']).getValue();
      } catch (e) { cell = undefined; }
    }
    if (cell !== undefined) return emailSentHas_(cell, m[2]);
  }
  return emailLogDone_(key);
}

/** " ; "-separated keys of one lead (without the Lead ID). */
function emailSentHas_(cell, part) { return String(cell || '').split(' ; ').indexOf(part) !== -1; }

/** Adds a lead key to its "Emails Sent" cell (once). Never throws. */
function markEmailSent_(key) {
  const m = /^(EG-(?:VO|CE|GE)-\d{5})\|(.+)$/.exec(String(key || ''));
  if (!m) return;
  try {
    const sh = trackerSheet_();
    const row = findLeadRow_(sh, m[1]);
    if (!row) return;
    const cell = sh.getRange(row, trackerCols_(sh)['Emails Sent']);
    const cur = String(cell.getValue() || '');
    if (!emailSentHas_(cur, m[2])) cell.setValue(cur ? cur + ' ; ' + m[2] : m[2]);
  } catch (e) { /* the Email Log still has it */ }
}

/** Key found in the Email Log with a done result (TextFinder on the key column). */
function emailLogDone_(key) {
  const sh = emailLogSheet_();
  const last = sh.getLastRow();
  if (last < 2) return false;
  const hits = sh.getRange(2, 2, last - 1, 1).createTextFinder(key).matchEntireCell(true).findAll();
  return hits.some(function (h) { return EMAIL_DONE[String(sh.getRange(h.getRow(), 5).getValue())]; });
}

// ---------------------------------------------------------------------
// SEND
// ---------------------------------------------------------------------
/**
 * m = {to, kind, subject, html, text, key?, leadId?, urgent?, after?}
 *   urgent: verification code — never queued, may use the reserved quota.
 *   after:  {lastEmail: 'label'} written to the lead's "Last Customer Email" once delivered.
 * Returns 'ok' | 'queued' | 'skipped' | 'duplicate' | 'failed' | 'unavailable' (urgent only). Never throws.
 */
function sendEmail_(m) {
  try {
    if (!m.to) return logEmail_(m, 'skipped', 'no recipient');
    if (m.key && emailDone_(m.key)) { console.log('email ' + m.kind + ' duplicate'); return 'duplicate'; }
    const r = deliver_(m);
    if (r.result === 'ok') { afterSend_(m); return logEmail_(m, 'ok', r.detail || ''); }
    if (r.result === 'queue') {
      if (m.urgent) return logEmail_(m, 'unavailable', r.detail);
      enqueueEmail_(m, r.detail);
      return logEmail_(m, 'queued', r.detail);
    }
    return logEmail_(m, 'failed', r.detail);
  } catch (e) {
    return logEmail_(m, 'failed', e && e.message);
  }
}

/**
 * Sends through the configured provider. Returns {result: 'ok'|'queue'|'failed', detail}.
 * Attachments: m.attachments (blobs, samples only), or m.after.visa = {id, attach, why} (Visa Approved
 * email): the visa files are read from Drive at delivery, so the queue never holds file contents.
 * Only "attached N files" / "not attached (…)" is ever logged about them.
 */
function deliver_(m) {
  const s = settings_();
  const C = CONFIG.COMPANY_INFO;
  let atts = m.attachments || null;
  let note = '';
  const v = m.after && m.after.visa;
  if (!atts && v) {
    if (v.attach) { const a = visaAttachments_(v.id); atts = a.blobs; note = a.detail; }
    else note = 'not attached (' + (v.why || 'ATTACH_VISA off') + ')';
  }
  if (atts && !atts.length) atts = null;
  const ok = { result: 'ok', detail: note };
  if (s.provider === 'brevo') {
    if (!s.brevoKey || !s.senderEmail) return { result: 'queue', detail: 'Brevo not configured' };
    const payload = {
      sender: { name: CONFIG.EMAIL.SENDER_NAME, email: s.senderEmail },
      to: String(m.to).split(',').map(function (e) { return { email: e.trim() }; }),
      replyTo: { email: C.email, name: CONFIG.EMAIL.SENDER_NAME },
      subject: m.subject, htmlContent: m.html, textContent: m.text,
    };
    if (atts) payload.attachment = atts.map(function (b) { return { name: b.getName(), content: Utilities.base64Encode(b.getBytes()) }; });
    for (let attempt = 0; attempt < 2; attempt++) {
      let code = 0;
      try {
        const res = UrlFetchApp.fetch(CONFIG.EMAIL.BREVO_URL, {
          method: 'post', contentType: 'application/json', payload: JSON.stringify(payload),
          headers: { 'api-key': s.brevoKey, accept: 'application/json' }, muteHttpExceptions: true,
        });
        code = res.getResponseCode();
      } catch (e) { code = -1; }
      if (code >= 200 && code < 300) return ok;
      const transient = code === -1 || code === 429 || code >= 500;
      if (!transient) return { result: 'failed', detail: 'Brevo HTTP ' + code };
      if (attempt === 0) Utilities.sleep(2000);
      else return { result: 'queue', detail: 'Brevo ' + (code === -1 ? 'network error' : 'HTTP ' + code) };
    }
  }
  // MailApp (default)
  const need = String(m.to).split(',').length;
  const reserve = m.urgent ? 0 : CONFIG.EMAIL.QUOTA_RESERVE;
  if (MailApp.getRemainingDailyQuota() - need < reserve) return { result: 'queue', detail: 'MailApp quota' };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const o = { to: m.to, subject: m.subject, htmlBody: m.html, body: m.text, name: CONFIG.EMAIL.SENDER_NAME, replyTo: C.email };
      if (atts) o.attachments = atts;
      MailApp.sendEmail(o);
      return ok;
    } catch (e) {
      if (/too many times|quota/i.test(e && e.message)) return { result: 'queue', detail: 'MailApp quota' };
      if (attempt === 0) Utilities.sleep(2000);
      else return { result: 'queue', detail: 'MailApp: ' + noEmails_(e && e.message).slice(0, 120) };
    }
  }
  return { result: 'queue', detail: 'unknown' };
}

/** After a delivered customer email: "Last Customer Email" on the lead. */
function afterSend_(m) {
  if (m.after && m.after.lastEmail && m.leadId) {
    try { setLastCustomerEmail_(m.leadId, m.after.lastEmail); } catch (e) { /* lead removed */ }
  }
}

// ---------------------------------------------------------------------
// QUEUE
// ---------------------------------------------------------------------
function enqueueEmail_(m, why) {
  PropertiesService.getScriptProperties().setProperty('QUEUE_PENDING', '1');
  emailQueueSheet_().appendRow([new Date(), m.key || '', m.kind, m.leadId || '', m.to, m.subject,
    m.html, m.text, 0, String(why || ''), m.after ? JSON.stringify(m.after) : '']);
}

function emailQueueCount_() {
  try { return Math.max(emailQueueSheet_().getLastRow() - 1, 0); } catch (e) { return 0; }
}

/** Sends queued emails while the quota allows. Returns {sent, waiting, failed}. */
function runEmailQueue_(deadline) {
  const sh = emailQueueSheet_();
  const last = sh.getLastRow();
  const out = { sent: 0, waiting: 0, failed: 0 };
  if (last < 2) { PropertiesService.getScriptProperties().setProperty('QUEUE_PENDING', '0'); return out; }
  const rows = sh.getRange(2, 1, last - 1, EMAIL_QUEUE_HEADERS.length).getValues();
  const done = [];
  let stop = false;
  rows.forEach(function (r, i) {
    const attempts = Number(r[8]) || 0;
    if (attempts >= CONFIG.EMAIL.QUEUE_MAX_ATTEMPTS) { out.failed++; return; }
    if (stop || Date.now() > deadline) { out.waiting++; return; }
    const m = { key: r[1], kind: r[2], leadId: r[3], to: r[4], subject: r[5], html: r[6], text: r[7] };
    try { m.after = r[10] ? JSON.parse(r[10]) : null; } catch (e) { m.after = null; }
    const res = deliver_(m);
    if (res.result === 'ok') {
      afterSend_(m);
      logEmail_(m, 'ok', 'from queue' + (res.detail ? ' · ' + res.detail : ''));
      done.push(i + 2);
      out.sent++;
      return;
    }
    sh.getRange(i + 2, 9, 1, 2).setValues([[attempts + 1, String(res.detail || '')]]);
    if (attempts + 1 >= CONFIG.EMAIL.QUEUE_MAX_ATTEMPTS) { logEmail_(m, 'failed', 'gave up after ' + (attempts + 1) + ' attempts'); out.failed++; }
    else out.waiting++;
    if (res.result === 'queue') stop = true; // quota / provider still unavailable: try again next run
  });
  done.reverse().forEach(function (row) { sh.deleteRow(row); });
  PropertiesService.getScriptProperties().setProperty('QUEUE_PENDING', out.waiting ? '1' : '0');
  return out;
}

/** Queue rows that gave up (for the daily summary). */
function emailQueueFailed_() {
  const sh = emailQueueSheet_();
  const last = sh.getLastRow();
  if (last < 2) return 0;
  return sh.getRange(2, 9, last - 1, 1).getValues()
    .filter(function (r) { return Number(r[0]) >= CONFIG.EMAIL.QUEUE_MAX_ATTEMPTS; }).length;
}

/** Removes Email Log rows older than CONFIG.EMAIL.LOG_DAYS (rows are in time order). */
function pruneEmailLog_() {
  const sh = emailLogSheet_();
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const cutoff = Date.now() - CONFIG.EMAIL.LOG_DAYS * 864e5;
  const times = sh.getRange(2, 1, last - 1, 1).getValues();
  let n = 0;
  while (n < times.length && times[n][0] instanceof Date && times[n][0].getTime() < cutoff) n++;
  if (n) sh.deleteRows(2, n);
  return n;
}

/** cleanupTestData: Email Log + Email Queue rows of the given TEST Lead IDs. */
function cleanupEmailLog_(testIds) {
  let n = 0;
  try {
    [emailLogSheet_(), emailQueueSheet_()].forEach(function (sh) {
      const last = sh.getLastRow();
      if (last < 2) return;
      const ids = sh.getRange(2, 4, last - 1, 1).getValues();
      for (let i = ids.length - 1; i >= 0; i--) {
        if (testIds[ids[i][0]]) { sh.deleteRow(i + 2); n++; }
      }
    });
  } catch (e) { Logger.log('Skipped Email Log clean-up: ' + noEmails_(e.message)); }
  return n;
}
