/**
 * Web app entry points. Deploy as: Execute as **Me**, Who has access **Anyone**.
 *
 * The website sends   POST <web app URL>   with a text/plain JSON body (no CORS preflight):
 *   {"action": "<name>", "hp": "<honeypot, must be empty>", ...fields}
 * and always gets JSON back:
 *   {"ok": true, "leadId": "EG-..", ...}   or   {"ok": false, "error": "<friendly text>", "field"?: "..."}
 */

const API_VERSION = 1;

const ACTIONS = {
  submitContact: submitContact_,
  submitCustomRequest: submitCustomRequest_,
  createVisaApplication: createVisaApplication_,
  uploadPassenger: uploadPassenger_,
  uploadDocument: uploadDocument_,
  finalizeVisaApplication: finalizeVisaApplication_,
  trackApplication: trackApplication_,
  sendEmailCode: sendEmailCode_,
  verifyEmailCode: verifyEmailCode_,
  endTrackSession: endTrackSession_,
  sendCorrectionCode: sendCorrectionCode_,
  verifyCorrectionCode: verifyCorrectionCode_,
  loadCorrection: loadCorrection_,
  uploadCorrectionFile: uploadCorrectionFile_,
  submitCorrection: submitCorrection_,
  sendVisaCode: sendVisaCode_,
  verifyVisaCode: verifyVisaCode_,
  listVisaFiles: listVisaFiles_,
  downloadVisaFile: downloadVisaFile_,
  loadTestReport: loadTestReport_,
};

// Google is busy or briefly unavailable (quota per second, simultaneous executions, a service hiccup):
// the website retries these automatically, so they get {busy: true} and no error email.
const BUSY_RE = /too many (simultaneous|times)|service invoked too many times|rate limit|lock timeout|could not obtain lock|timed out|temporarily unavailable|service (spreadsheets|drive|documents) (failed|error)|server error occurred|internal error|backend error|try again later|address unavailable|exceeded maximum execution time/i;

/**
 * Health check: opening the web app URL in a browser shows {"ok":true,...}.
 * schema = SCHEMA_VERSION written by setupEliteGlobal (3 = v3 columns + Visa Applications tab;
 * 4 = Message to Customer column; 5 = Review Status, Review Updated, Last Customer Email; 6 = Correction For; 7 = Visa Files + Approved Visa folders; 8 = Send Now tick box; 9 = Last Change, Emails Sent, Due + Archive Index tabs).
 */
function doGet() {
  const schema = Number(PropertiesService.getScriptProperties().getProperty('SCHEMA_VERSION') || 0);
  return json_({ ok: true, service: 'Elite Global lead API', version: API_VERSION, schema: schema });
}

function doPost(e) {
  let action = '';
  const t0 = Date.now();
  let busy = false;
  let qa = false;
  lockStatsReset_('');
  try {
    const body = e && e.postData && e.postData.contents;
    if (!body) fail_('Empty request.');
    if (body.length > CONFIG.LIMITS.BODY_MAX) fail_('The upload is too large. Please choose smaller files.');

    let d;
    try { d = JSON.parse(body); } catch (x) { fail_('Invalid request.'); }
    if (!d || typeof d !== 'object') fail_('Invalid request.');

    action = String(d.action || '');
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) fail_('Unknown request.');
    LOCK_STATS_.action = action;
    qa = d.qaTiming === true;

    // Bots fill the hidden field: pretend it worked and store nothing.
    if (d.hp) return json_(honeypotReply_(action));

    return json_(qaTiming_(qa, ACTIONS[action](d), t0));
  } catch (err) {
    if (err && (err.busy || (!err.userFacing && BUSY_RE.test(String(err && err.message))))) {
      busy = true;
      console.log('doPost ' + action + ' busy');
      return json_(qaTiming_(qa, { ok: false, busy: true, error: err.userFacing ? err.message : BUSY_MSG }, t0));
    }
    if (err && err.userFacing) {
      const out = { ok: false, error: err.message };
      if (err.field) out.field = err.field;
      if (err.missing) out.missing = err.missing;
      if (err.reverify) out.reverify = true; // email token missing/expired: confirm the email again
      if (err.relogin) out.relogin = true;   // Track session ended: look up the application again
      if (err.restart) out.restart = true;   // correction / download token ended: start again from the Track page
      if (err.relist) out.relist = true;     // visa download: the file list changed, show it again
      if (err.archived) out.archived = true; // the lead is in the archive (read-only)
      return json_(out);
    }
    // Unexpected: log the error class only — never the request (it may hold passport data).
    console.error('doPost ' + action + ' failed: ' + (err && err.message));
    notifyError_(err, action);
    return json_({ ok: false, error: 'Sorry, something went wrong on our side. Please try again in a moment.' });
  } finally {
    if (action) recordAction_(action, Date.now() - t0, busy, LOCK_STATS_);
  }
}

/**
 * STAGING ONLY (TEST_OTP_BYPASS on): with {qaTiming: true} the reply carries this request's lock timings
 * {qa: {n, held, max, wait, ms}} for tools/qa/load-live.js. Numbers only; never on production (bypass is off there).
 */
function qaTiming_(qa, out, t0) {
  if (!qa || !out || typeof out !== 'object') return out;
  try { if (!testBypassOn_()) return out; } catch (e) { return out; }
  const s = LOCK_STATS_;
  return Object.assign({}, out, { qa: { n: s.n, held: s.held, max: s.max, wait: s.wait, ms: Date.now() - t0 } });
}

/**
 * STAGING ONLY (TEST_OTP_BYPASS on, SITE_URL staging) — tools/qa/load-live.js: how many Lead Tracker rows a load
 * test run created ({tag}: rows whose name starts "TEST Load <tag> "), and how many distinct names (a duplicate lead
 * would repeat a name). Counts only: no names, emails or IDs.
 */
function loadTestReport_(d) {
  if (!testBypassOn_() || !/staging/i.test(settings_().siteUrl)) fail_('Not available.');
  const tag = String(d.tag || '');
  if (!/^[A-Z0-9]{4,12}$/.test(tag)) fail_('Invalid request.');
  const sh = trackerSheet_();
  const last = sh.getLastRow();
  const names = last >= 2 ? sh.getRange(2, 3, last - 1, 1).getValues() : [];
  const prefix = 'TEST Load ' + tag + ' ';
  const seen = {};
  let rows = 0;
  names.forEach(function (r) { const n = String(r[0] || '').replace(/^'/, ''); if (n.indexOf(prefix) === 0) { rows++; seen[n] = true; } });
  console.log('loadTestReport rows=' + rows);
  return { ok: true, rows: rows, names: Object.keys(seen).length };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function honeypotReply_(action) {
  if (action === 'trackApplication') return { ok: false, error: CONFIG.TRACK.NOT_FOUND }; // same as a miss
  if (action === 'sendEmailCode') return { ok: true, resendIn: CONFIG.OTP.RESEND_S };        // nothing is sent
  if (action === 'verifyEmailCode') return { ok: false, error: OTP_WRONG, field: 'code' };
  if (action === 'endTrackSession') return { ok: true };
  if (CORRECTION_ACTIONS.indexOf(action) !== -1 || VISA_ACTIONS.indexOf(action) !== -1) return { ok: false, error: SESSION_ENDED, relogin: true };
  if (action === 'loadTestReport') return { ok: false, error: 'Not available.' };
  const fake = 'EG-' + (action === 'submitContact' ? 'GE' : action === 'submitCustomRequest' ? 'CE' : 'VO') +
    '-' + ('0000' + Math.floor(Math.random() * 99999)).slice(-5);
  return action === 'createVisaApplication'
    ? { ok: true, leadId: fake, token: Utilities.getUuid(), total: 0 }
    : { ok: true, leadId: fake };
}
