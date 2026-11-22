/**
 * "Track my application" (public/track.html): trackApplication {leadId, contact}.
 *
 * Privacy rules:
 *  - The customer proves ownership with the Lead ID plus the email or phone number used on the lead.
 *  - Unknown ID, wrong contact, bad format, rate limit and honeypot all get the SAME reply
 *    (CONFIG.TRACK.NOT_FOUND), so Lead IDs cannot be enumerated.
 *  - Lookups are rate-limited per Lead ID and per contact value (hashed keys in CacheService).
 *  - Visa leads: a Review Status (CONFIG.TRACK.REVIEW) decides the stage when it is set; Lost always shows Closed.
 *  - Only the service type, date received, customer stage, next step, the staff "Message to Customer"
 *    and (visa) the upload line are returned — never name, phone, email, answers, files, links or notes.
 *  - The contact value is never logged; a miss does not log the Lead ID either.
 *  - A successful lookup returns a session token (see makeSession_): a refresh in the same tab looks the
 *    application up with it, without the contact. A bad, expired or logged-out token = the same miss reply.
 */

const LEAD_ID_RE = /^EG-(VO|CE|GE)-\d{5}$/;
const SESSION_ENDED = 'Please look up your application again.';

/**
 * trackApplication {leadId, contact} → the lookup, or {session} → the same reply without the contact
 * check (refresh / reopen in the same tab). Both return a fresh session token.
 */
function trackApplication_(d) {
  const T = CONFIG.TRACK;
  const notFound = function (why) {
    console.log('trackApplication ' + why);
    return { ok: false, error: T.NOT_FOUND };
  };

  // Session lookup: valid token → no contact check, own per-Lead-ID counter. Every failure = not found.
  if (d.session) {
    const s = parseSession_(d.session);
    if (!s) return notFound('session-invalid');
    try { rateLimit_('track:s:' + s.leadId, T.SESSION_MAX, T.WINDOW_S); } catch (e) {
      if (e && e.userFacing) return notFound('limited');
      throw e;
    }
    const lead = trackRow_(s.leadId);
    if (!lead) return notFound('not-found');
    const out = trackResult_(lead);
    // Poll (the page's 2-minute live update): no new token, so polling is not activity — the session
    // still ends after 60 minutes without activity.
    if (d.poll) { console.log('trackApplication poll'); return out; }
    out.session = makeSession_(s.leadId, s.max);
    console.log('trackApplication session');
    return out;
  }

  const leadId = str_(d.leadId, 30).replace(/\s+/g, '').toUpperCase();
  const contact = str_(d.contact, 254);
  const key = contactKey_(contact);
  if (!key) return notFound('not-found');

  // Count every attempt: the contact first (so guessing IDs is limited too), then the Lead ID.
  try {
    rateLimit_('track:c:' + key, T.CONTACT_MAX, T.WINDOW_S);
    if (!LEAD_ID_RE.test(leadId)) return notFound('not-found');
    rateLimit_('track:id:' + leadId, T.ID_MAX, T.WINDOW_S);
  } catch (e) {
    if (e && e.userFacing) return notFound('limited');
    throw e;
  }

  const lead = trackRow_(leadId);
  if (!lead) return notFound('not-found');
  if (!contactMatches_(contact, lead.get('Email'), lead.get('Phone Number'))) return notFound('not-found');
  const out = trackResult_(lead);
  out.session = makeSession_(leadId, Date.now() + T.SESSION_MAX_H * 3600000);
  console.log('trackApplication found');
  return out;
}

/** The Lead Tracker row of a Lead ID as {leadId, row, get(header)}, or null. */
function trackRow_(leadId) {
  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  if (!row) return archivedLead_(leadId); // archived leads stay findable (read-only)
  const cols = trackerCols_(sh);
  const last = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
  const vals = sh.getRange(row, 1, 1, last).getValues()[0];
  return { leadId: leadId, row: row, get: function (h) { return vals[cols[h] - 1]; } };
}

/** What the customer may see (PRD §3.5) + canCorrect. Never name, phone, email, answers, files, links or notes. */
function trackResult_(lead) {
  const T = CONFIG.TRACK;
  const get = lead.get;
  const category = String(get('Lead Category') || '');
  const status = String(get('Lead Status') || '').trim();
  const app = String(get('Application Status') || '').trim();
  const visa = category === CONFIG.FORMS.VISA.category;
  let stage = T.STAGES[status] || T.STAGES['New Lead'];
  if (status !== 'Lost' && visa && app === CONFIG.STATUS.EXPIRED) stage = T.EXPIRED;
  // Visa review workflow: a Review Status, when set, decides what the customer sees — except for a
  // Lost lead, which always shows Closed.
  const review = String(get('Review Status') || '').trim();
  if (status !== 'Lost' && visa && Object.prototype.hasOwnProperty.call(T.REVIEW, review)) stage = T.REVIEW[review];

  const out = {
    ok: true,
    leadId: lead.leadId,
    service: T.SERVICE[category] || 'Enquiry',
    received: receivedDate_(get('Date Received')),
    stage: stage[0],
    description: stage[1],
    nextStep: stage[2],
  };
  // Plain text: control characters and runs of spaces/new lines become one space, then cut to 300.
  const message = String(get('Message to Customer') || '').replace(/[\u0000-\u001F\u007F\s]+/g, ' ')
    .trim().slice(0, T.MESSAGE_MAX).trim();
  if (message) out.message = message;
  if (visa) {
    const upload = uploadLine_(app);
    if (upload) out.upload = upload;
  }
  if (correctionRound_(lead)) out.canCorrect = true;
  // "Download your visa": Visa Approved with at least one valid file in Approved Visa (never for Lost)
  // Visa Approved but Visa Files still 0: recount this lead's Approved Visa folder now (one folder only), so the
  // button appears as soon as staff have uploaded the file.
  let ready = visaDownloadReady_(lead);
  if (!ready && visaApproved_(lead)) {
    const scan = refreshVisaFiles_(lead, false);
    ready = !!(scan && scan.files.length);
  }
  if (ready) { out.canDownload = true; out.nextStep = CONFIG.VISA_DELIVERY.NEXT_STEP; }
  return out;
}

// ---------------------------------------------------------------------
// TRACK SESSION: "<idle expiry>.<max expiry>.<Lead ID>.<HMAC>" (OTP_SECRET). No email or phone inside.
// Idle expiry slides (60 min after the last lookup) but never past the max (8 h after the first lookup).
// Log out revokes every token of the session (same max expiry) for the hour its tokens can still live.
// ---------------------------------------------------------------------
function makeSession_(leadId, max) {
  const idle = Math.min(Date.now() + CONFIG.TRACK.SESSION_IDLE_MIN * 60000, max);
  const body = idle + '.' + max + '.' + leadId;
  return body + '.' + tokenSig_('track|' + body);
}

/** {leadId, idle, max} for a valid, unexpired, not logged-out session token; otherwise null. */
function parseSession_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || !/^\d{13}$/.test(parts[0]) || !/^\d{13}$/.test(parts[1]) || !LEAD_ID_RE.test(parts[2])) return null;
  const body = parts[0] + '.' + parts[1] + '.' + parts[2];
  if (tokenSig_('track|' + body) !== parts[3]) return null;
  const idle = Number(parts[0]), max = Number(parts[1]), now = Date.now();
  if (idle < now || max < now || idle > max) return null;
  if (CacheService.getScriptCache().get(sessionRevokedKey_(parts[2], max))) return null;
  return { leadId: parts[2], idle: idle, max: max };
}

function sessionRevokedKey_(leadId, max) { return 'TRK_OUT_' + sha256Hex_(leadId + '|' + max).slice(0, 32); }

/** For the correction actions: the session's Lead ID, or a "look up again" error. */
function requireSession_(token) {
  const s = parseSession_(token);
  if (!s) fail_(SESSION_ENDED, null, { relogin: true });
  return s;
}

// ---------------------------------------------------------------------
// ACTION: endTrackSession {session} — the Log out button. Always ok (nothing to reveal).
// ---------------------------------------------------------------------
function endTrackSession_(d) {
  const s = parseSession_(d.session);
  if (s) {
    // Tokens issued before log out expire within SESSION_IDLE_MIN, so the mark only needs to live that long.
    CacheService.getScriptCache().put(sessionRevokedKey_(s.leadId, s.max), '1', CONFIG.TRACK.SESSION_IDLE_MIN * 60 + 60);
    console.log('endTrackSession ok');
  }
  return { ok: true };
}

/** Normalised contact: lower-case email, or phone digits (Nigerian numbers as 0XXXXXXXXXX). '' if unusable. */
function contactKey_(value) {
  const v = String(value || '').trim();
  if (v.indexOf('@') !== -1) {
    const e = v.toLowerCase();
    return EMAIL_RE.test(e) ? e : '';
  }
  return phoneKey_(v);
}

/**
 * Phone digits for comparison: non-digits removed, a leading 00 dropped, and Nigerian numbers in
 * international form (234 + 10 digits) written as 0 + 10 digits, so 0803…, +234 803… and 234803…
 * are equal. Fewer than 7 digits never matches.
 */
function phoneKey_(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.indexOf('00') === 0) digits = digits.slice(2);
  if (/^234\d{10}$/.test(digits)) digits = '0' + digits.slice(3);
  return digits.length >= 7 ? digits : '';
}

/** Email: case-insensitive equality with the lead's Email. Phone: phoneKey_ equality with Phone Number. */
function contactMatches_(contact, email, phone) {
  const key = contactKey_(contact);
  if (!key) return false;
  if (key.indexOf('@') !== -1) return key === String(email || '').trim().toLowerCase();
  const stored = phoneKey_(phone);
  return !!stored && key === stored;
}

/** "20 Nov 2026" (Lagos), date only. */
function receivedDate_(value) {
  if (value instanceof Date && !isNaN(value)) return Utilities.formatDate(value, 'Africa/Lagos', 'd MMM yyyy');
  const s = String(value || '').trim();
  return s ? s.split(',')[0] : '';
}

/** Customer wording of the visa Application Status. */
function uploadLine_(app) {
  let m = /^Complete: (\d+)/.exec(app);
  if (m) {
    const n = Number(m[1]);
    return n === 1 ? 'All documents for your 1 passenger received' : 'All ' + n + ' passengers\' documents received';
  }
  m = /^Uploading (\d+)\/(\d+)/.exec(app);
  if (m) return 'Upload not finished (' + m[1] + ' of ' + m[2] + ' passengers received)';
  if (app === CONFIG.STATUS.EXPIRED) return 'Upload not finished';
  return '';
}
