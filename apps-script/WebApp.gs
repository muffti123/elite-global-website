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
};

/**
 * Health check: opening the web app URL in a browser shows {"ok":true,...}.
 * schema = SCHEMA_VERSION written by setupEliteGlobal (3 = v3 columns + Visa Applications tab;
 * 4 = Message to Customer column; 5 = Review Status, Review Updated, Last Customer Email).
 */
function doGet() {
  const schema = Number(PropertiesService.getScriptProperties().getProperty('SCHEMA_VERSION') || 0);
  return json_({ ok: true, service: 'Elite Global lead API', version: API_VERSION, schema: schema });
}

function doPost(e) {
  let action = '';
  try {
    const body = e && e.postData && e.postData.contents;
    if (!body) fail_('Empty request.');
    if (body.length > CONFIG.LIMITS.BODY_MAX) fail_('The upload is too large. Please choose smaller files.');

    let d;
    try { d = JSON.parse(body); } catch (x) { fail_('Invalid request.'); }
    if (!d || typeof d !== 'object') fail_('Invalid request.');

    action = String(d.action || '');
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) fail_('Unknown request.');

    // Bots fill the hidden field: pretend it worked and store nothing.
    if (d.hp) return json_(honeypotReply_(action));

    return json_(ACTIONS[action](d));
  } catch (err) {
    if (err && err.userFacing) {
      const out = { ok: false, error: err.message };
      if (err.field) out.field = err.field;
      if (err.missing) out.missing = err.missing;
      if (err.reverify) out.reverify = true; // email token missing/expired: confirm the email again
      return json_(out);
    }
    // Unexpected: log the error class only — never the request (it may hold passport data).
    console.error('doPost ' + action + ' failed: ' + (err && err.message));
    notifyError_(err, action);
    return json_({ ok: false, error: 'Sorry, something went wrong on our side. Please try again in a moment.' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function honeypotReply_(action) {
  if (action === 'trackApplication') return { ok: false, error: CONFIG.TRACK.NOT_FOUND }; // same as a miss
  if (action === 'sendEmailCode') return { ok: true, resendIn: CONFIG.OTP.RESEND_S };        // nothing is sent
  if (action === 'verifyEmailCode') return { ok: false, error: OTP_WRONG, field: 'code' };
  const fake = 'EG-' + (action === 'submitContact' ? 'GE' : action === 'submitCustomRequest' ? 'CE' : 'VO') +
    '-' + ('0000' + Math.floor(Math.random() * 99999)).slice(-5);
  return action === 'createVisaApplication'
    ? { ok: true, leadId: fake, token: Utilities.getUuid(), total: 0 }
    : { ok: true, leadId: fake };
}
