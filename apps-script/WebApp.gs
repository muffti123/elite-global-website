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
  finalizeVisaApplication: finalizeVisaApplication_,
};

/** Health check: opening the web app URL in a browser shows {"ok":true,...}. */
function doGet() {
  return json_({ ok: true, service: 'Elite Global lead API', version: API_VERSION });
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
  const fake = 'EG-' + (action === 'submitContact' ? 'GE' : action === 'submitCustomRequest' ? 'CE' : 'VO') +
    '-' + ('0000' + Math.floor(Math.random() * 99999)).slice(-5);
  return action === 'createVisaApplication'
    ? { ok: true, leadId: fake, token: Utilities.getUuid(), total: 0 }
    : { ok: true, leadId: fake };
}
