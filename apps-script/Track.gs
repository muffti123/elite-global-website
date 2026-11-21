/**
 * "Track my application" (public/track.html): trackApplication {leadId, contact}.
 *
 * Privacy rules:
 *  - The customer proves ownership with the Lead ID plus the email or phone number used on the lead.
 *  - Unknown ID, wrong contact, bad format, rate limit and honeypot all get the SAME reply
 *    (CONFIG.TRACK.NOT_FOUND), so Lead IDs cannot be enumerated.
 *  - Lookups are rate-limited per Lead ID and per contact value (hashed keys in CacheService).
 *  - Visa leads: a Review Status (CONFIG.TRACK.REVIEW) decides the stage when it is set.
 *  - Only the service type, date received, customer stage, next step, the staff "Message to Customer"
 *    and (visa) the upload line are returned — never name, phone, email, answers, files, links or notes.
 *  - The contact value is never logged; a miss does not log the Lead ID either.
 */

const LEAD_ID_RE = /^EG-(VO|CE|GE)-\d{5}$/;

function trackApplication_(d) {
  const T = CONFIG.TRACK;
  const notFound = function (why) {
    console.log('trackApplication ' + why);
    return { ok: false, error: T.NOT_FOUND };
  };
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

  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  if (!row) return notFound('not-found');
  const cols = trackerCols_(sh);
  const last = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
  const vals = sh.getRange(row, 1, 1, last).getValues()[0];
  const get = function (h) { return vals[cols[h] - 1]; };
  if (!contactMatches_(contact, get('Email'), get('Phone Number'))) return notFound('not-found');

  const category = String(get('Lead Category') || '');
  const status = String(get('Lead Status') || '').trim();
  const app = String(get('Application Status') || '').trim();
  const visa = category === CONFIG.FORMS.VISA.category;
  let stage = T.STAGES[status] || T.STAGES['New Lead'];
  if (status !== 'Lost' && visa && app === CONFIG.STATUS.EXPIRED) stage = T.EXPIRED;
  // Visa review workflow: a Review Status, when set, decides what the customer sees
  const review = String(get('Review Status') || '').trim();
  if (visa && Object.prototype.hasOwnProperty.call(T.REVIEW, review)) stage = T.REVIEW[review];

  const out = {
    ok: true,
    leadId: leadId,
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
  console.log('trackApplication found');
  return out;
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
