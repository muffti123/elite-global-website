/**
 * What is emailed, when, and how it looks:
 *   - staff alert for every new lead (contact, customise, visa at finalize)
 *   - customer confirmation (customise; visa = one combined "received + under review" email)
 *   - customer email for every Review Status change, once it has stayed unchanged for 5 minutes
 *     (undo window), once per status per lead; Correction Needed waits for a Message to Customer
 *   - daily staff summary (~08:00 Africa/Lagos)
 *   - one branded template (renderEmail_) with a plain-text version; every value is escaped.
 * Customer emails are skipped for TEST leads with an @example.com address.
 */

// ---------------------------------------------------------------------
// TEMPLATE
// ---------------------------------------------------------------------
const EMAIL_FONT = 'Arial, Helvetica, sans-serif'; // the website's body font stack
const EMAIL_NAVY = '#06163F';
const EMAIL_GOLD = '#F5AE00';

function escHtml_(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function trackUrl_(leadId) {
  return settings_().siteUrl + '/track.html' + (leadId ? '?id=' + encodeURIComponent(leadId) : '');
}

/**
 * o = {subject, preheader, heading, paragraphs: [text], box?: {title, text}, rows?: [[label, value]],
 *      button?: {label, url}, small?: [text], lists?: [{title, items: [text]}]}
 * Everything is plain text and escaped here. Returns {subject, html, text}.
 * Customer emails (no o.staff): no remote image (a text wordmark instead) and no footer link — the button is
 * their only link (deliverability on a new domain). Staff emails keep the logo and the Track link.
 */
function renderEmail_(o) {
  const C = CONFIG.COMPANY_INFO;
  const site = settings_().siteUrl;
  const e = escHtml_;
  const p = function (t) { return '<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#18233d">' + e(t) + '</p>'; };
  let body = '';
  (o.paragraphs || []).forEach(function (t) { body += p(t); });
  if (o.box) {
    body += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px"><tr>' +
      '<td style="background:#fff8e6;border-left:4px solid ' + EMAIL_GOLD + ';padding:14px 16px;border-radius:6px">' +
      '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#8a5a00">' + e(o.box.title) + '</p>' +
      '<p style="margin:0;font-size:16px;line-height:1.55;color:#18233d;white-space:pre-line">' + e(o.box.text) + '</p></td></tr></table>';
  }
  if (o.rows && o.rows.length) {
    body += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse">';
    o.rows.forEach(function (r) {
      body += '<tr><td style="padding:8px 10px 8px 0;border-bottom:1px solid #e6eaf1;font-size:14px;color:#5b6680;width:38%;vertical-align:top">' + e(r[0]) +
        '</td><td style="padding:8px 0;border-bottom:1px solid #e6eaf1;font-size:15px;color:#18233d;vertical-align:top;word-break:break-word">' +
        (r[2] ? '<a href="' + e(r[2]) + '" style="color:#102d70">' + e(r[1]) + '</a>' : e(r[1])) + '</td></tr>';
    });
    body += '</table>';
  }
  (o.lists || []).forEach(function (l) {
    body += '<p style="margin:14px 0 6px;font-size:15px;font-weight:bold;color:' + EMAIL_NAVY + '">' + e(l.title) + '</p>';
    body += l.items.length
      ? '<ul style="margin:0 0 12px;padding-left:20px;font-size:14px;line-height:1.6;color:#18233d">' +
        l.items.map(function (i) { return '<li>' + e(i) + '</li>'; }).join('') + '</ul>'
      : '<p style="margin:0 0 12px;font-size:14px;color:#5b6680">None.</p>';
  });
  if (o.button) {
    body += '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="border-radius:9px;background:' + EMAIL_GOLD + '">' +
      '<a href="' + e(o.button.url) + '" style="display:inline-block;padding:14px 24px;font-family:' + EMAIL_FONT + ';font-size:16px;font-weight:bold;color:' + EMAIL_NAVY + ';text-decoration:none;border-radius:9px">' +
      e(o.button.label) + '</a></td></tr></table>';
  }
  (o.small || []).forEach(function (t) { body += '<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#5b6680">' + e(t) + '</p>'; });

  // Footer: contact details as text — the only links in customer emails go to SITE_URL (deliverability)
  const wa = whatsappText_();
  const ig = instagramHandle_();
  const rich = !!(o.staff || o.logo);
  const why = o.staff ? 'Staff notification from the Elite Global lead system.'
    : 'You\'re receiving this because you applied on our website.';
  const footer =
    '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#ffffff">' + e(C.name) + '</p>' +
    '<p style="margin:0 0 10px;font-size:12px;color:' + EMAIL_GOLD + '">RC: ' + e(C.rc) + '</p>' +
    '<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#d8deeb">' + e(C.address) + '</p>' +
    '<p style="margin:0 0 6px;font-size:13px;line-height:1.7;color:#d8deeb">Phone: ' + e(C.phone) +
    ' &nbsp;·&nbsp; WhatsApp: ' + e(wa) + (ig ? ' &nbsp;·&nbsp; Instagram: ' + e(ig) : '') + ' &nbsp;·&nbsp; Email: ' + e(C.email) + '</p>' +
    (rich ? '<p style="margin:10px 0 8px;font-size:13px"><a href="' + e(site + '/track.html') + '" style="color:' + EMAIL_GOLD + ';font-weight:bold">Track your application</a></p>' : '') +
    '<p style="margin:0;font-size:12px;color:#aab4cc">' + e(why) + '</p>';

  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">' +
    '<title>' + e(o.subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#eef1f6;font-family:' + EMAIL_FONT + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef1f6">' + e(o.preheader || '') + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6"><tr><td align="center" style="padding:20px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:' + EMAIL_NAVY + ';padding:20px 24px;border-bottom:4px solid ' + EMAIL_GOLD + '">' +
    (rich ? '<img src="' + e(site + '/assets/brand/email-logo.png') + '" width="220" height="141" alt="Elite Global World Travel &amp; Tours Ltd." style="display:block;width:220px;max-width:100%;height:auto;border:0;color:#ffffff;font-size:18px;font-weight:bold">'
      : '<p style="margin:0;font-size:20px;font-weight:bold;color:#ffffff">Elite Global</p><p style="margin:2px 0 0;font-size:13px;color:' + EMAIL_GOLD + '">World Travel &amp; Tours Ltd.</p>') + '</td></tr>' +
    '<tr><td style="padding:28px 24px 12px;font-family:' + EMAIL_FONT + '">' +
    '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:' + EMAIL_NAVY + '">' + e(o.heading) + '</h1>' + body + '</td></tr>' +
    '<tr><td style="background:' + EMAIL_NAVY + ';padding:22px 24px;font-family:' + EMAIL_FONT + '">' + footer + '</td></tr>' +
    '</table></td></tr></table></body></html>';

  // Plain-text version
  const t = [o.heading, ''];
  (o.paragraphs || []).forEach(function (x) { t.push(x, ''); });
  if (o.box) t.push(o.box.title + ':', o.box.text, '');
  (o.rows || []).forEach(function (r) { t.push(r[0] + ': ' + r[1] + (r[2] && r[2] !== r[1] ? ' (' + r[2] + ')' : '')); });
  if (o.rows && o.rows.length) t.push('');
  (o.lists || []).forEach(function (l) { t.push(l.title + ':'); (l.items.length ? l.items : ['None.']).forEach(function (i) { t.push(' - ' + i); }); t.push(''); });
  if (o.button) t.push(o.button.label + ': ' + o.button.url, '');
  (o.small || []).forEach(function (x) { t.push(x); });
  t.push('', '—', C.name + ' (RC: ' + C.rc + ')', C.address, 'Phone: ' + C.phone + ' · WhatsApp: ' + wa +
    (ig ? ' · Instagram: ' + ig : ''), 'Email: ' + C.email);
  if (rich) t.push('Track your application: ' + site + '/track.html');
  t.push('', why);
  return { subject: o.subject, html: html, text: t.join('\n') };
}

/** "+234 706 215 2046" for the WhatsApp number (same as the phone when the digits match). */
function whatsappText_() {
  const C = CONFIG.COMPANY_INFO;
  return C.phone.replace(/\D/g, '') === String(C.whatsapp) ? C.phone : '+' + C.whatsapp;
}
/** "@elite_global_travels" from the Instagram URL ('' when not set). */
function instagramHandle_() {
  const m = /instagram\.com\/([^/?#]+)/.exec(CONFIG.COMPANY_INFO.instagram || '');
  return m ? '@' + m[1] : '';
}

/** Contact lines shared by customer emails. */
function contactSmall_() {
  const C = CONFIG.COMPANY_INFO;
  return ['Questions? Call ' + C.phone + ', send us a WhatsApp message on ' + whatsappText_() + ' or reply to this email.'];
}
/** Added to the code email and the first confirmation: helps the next emails reach the inbox. */
function inboxSmall_() {
  return ['To make sure our updates reach your inbox, add ' + CONFIG.COMPANY_INFO.email + ' to your contacts. ' +
    'If you found this in Spam, mark it \'Not spam\'.'];
}

// ---------------------------------------------------------------------
// LEAD DATA
// ---------------------------------------------------------------------
/** Lead Tracker row as an object (by header), or null. */
function leadFromTracker_(leadId) {
  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  if (!row) return null;
  const cols = trackerCols_(sh);
  const last = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
  const v = sh.getRange(row, 1, 1, last).getValues()[0];
  const get = function (h) { return v[cols[h] - 1]; };
  return {
    row: row, leadId: leadId, name: String(get('Customer Name') || ''), phone: String(get('Phone Number') || ''),
    email: String(get('Email') || '').trim(), country: String(get('Country') || ''),
    travelDate: get('Travel Date'), passengers: get('Passengers') || get('Total Travellers') || '',
    category: String(get('Lead Category') || ''), extra: [['Departure', String(get('Departure') || '')]],
  };
}

function setLastCustomerEmail_(leadId, label) {
  try {
    const sh = trackerSheet_();
    const row = findLeadRow_(sh, leadId);
    if (!row) return;
    const stamp = Utilities.formatDate(new Date(), 'Africa/Lagos', 'd MMM yyyy HH:mm');
    const cols = trackerCols_(sh);
    sh.getRange(row, cols['Last Customer Email']).setValue(label + ' · ' + stamp);
    touchLead_(sh, row, cols);
    SpreadsheetApp.flush();
  } catch (e) { console.error('Last Customer Email not updated: ' + noEmails_(e.message)); }
}

/** Sets Review Status + Review Updated (used at finalize; staff edits go through onTrackerEdit). */
function setReviewStatus_(leadId, status) {
  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  if (!row) return;
  const cols = trackerCols_(sh);
  sh.getRange(row, cols['Review Status']).setValue(status);
  sh.getRange(row, cols['Review Updated']).setValue(new Date());
  touchLead_(sh, row, cols);
  addDue_(leadId, 'status change');
}

function fmtDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'Africa/Lagos', 'd MMM yyyy');
  const d = parseDate_(String(v || ''));
  return d instanceof Date ? Utilities.formatDate(d, 'Africa/Lagos', 'd MMM yyyy') : String(v || '');
}

function isTestLead_(name, email) {
  return isTestName_(name) && /@example\.com$/i.test(String(email || '').trim());
}

/** Customer emails are skipped (and logged) for TEST @example.com leads or when NOTIFY_CUSTOMER is off. */
function customerSkip_(lead) {
  if (!lead.email) return 'no email';
  if (isTestLead_(lead.name, lead.email)) return 'test lead';
  if (!settings_().notifyCustomer) return 'customer emails off';
  return '';
}

// ---------------------------------------------------------------------
// STAFF ALERT + CUSTOMER CONFIRMATION
// ---------------------------------------------------------------------
const SERVICE_LABEL = { contact: 'General enquiry', custom: 'Customised Umrah', visa: 'Umrah visa application' };

function renderStaffAlert_(lead) {
  const rows = [
    ['Lead ID', lead.leadId], ['Service', SERVICE_LABEL[lead.kind] || lead.kind], ['Name', lead.name],
    ['Phone', lead.phone],
  ];
  if (lead.email) rows.push(['Email', lead.email]);
  if (lead.country) rows.push(['Country', lead.country]);
  if (lead.travelDate) rows.push(['Travel date', fmtDate_(lead.travelDate)]);
  if (lead.passengers !== '' && lead.passengers !== undefined) rows.push([lead.kind === 'visa' ? 'Passengers' : 'Travellers', String(lead.passengers)]);
  (lead.extra || []).forEach(function (x) { if (x[1]) rows.push(x); });
  if (lead.trackerUrl) rows.push(['Lead Tracker', 'Open row ' + lead.row, lead.trackerUrl]);
  if (lead.folderUrl) rows.push(['Drive folder', 'Open passports and photos', lead.folderUrl]);
  return renderEmail_({
    subject: 'Elite Global — New ' + (SERVICE_LABEL[lead.kind] || 'lead').toLowerCase() + ': ' + lead.leadId,
    preheader: lead.leadId + ' · ' + lead.name,
    heading: 'New ' + (SERVICE_LABEL[lead.kind] || 'lead').toLowerCase(),
    paragraphs: [lead.kind === 'visa'
      ? 'All documents are uploaded. Review Status is now "Under Review".'
      : 'A new request has arrived from the website.'],
    rows: rows,
    small: ['Staff alert — please contact the customer by phone or WhatsApp.'],
    staff: true,
  });
}

/** Staff alert for a new lead. Never throws. */
function notifyNewLead_(lead) {
  try {
    if (!settings_().notifyStaff) return logEmail_({ kind: 'staff-alert', leadId: lead.leadId }, 'skipped', 'staff alerts off');
    // Load tests (tools/qa/load-live.js) would use up gmail.com's 100 emails a day
    if (/^\s*'?TEST Load /i.test(String(lead.name || ''))) return logEmail_({ kind: 'staff-alert', leadId: lead.leadId }, 'skipped', 'load test');
    const sh = trackerSheet_();
    lead.row = lead.row || findLeadRow_(sh, lead.leadId);
    lead.trackerUrl = trackerSS_().getUrl() + '#gid=' + sh.getSheetId() + '&range=A' + lead.row;
    const m = renderStaffAlert_(lead);
    return sendEmail_({ to: staffEmail_(), kind: 'staff-alert', key: lead.leadId + '|staff-alert', leadId: lead.leadId,
      subject: m.subject, html: m.html, text: m.text });
  } catch (e) { console.error('staff alert failed: ' + noEmails_(e.message)); return 'failed'; }
}

function renderConfirmation_(lead) {
  const visa = lead.kind === 'visa';
  const R = CONFIG.TRACK.REVIEW['Under Review'];
  return renderEmail_({
    subject: visa ? 'Elite Global — We received your visa application (' + lead.leadId + ')'
      : 'Elite Global — We received your Umrah request (' + lead.leadId + ')',
    preheader: 'Your reference number is ' + lead.leadId,
    heading: visa ? 'Your application is under review' : 'Thank you for your request',
    paragraphs: visa
      ? ['Dear ' + lead.name + ',', 'Thank you for choosing Elite Global. We have received your Umrah visa application and all your documents, ' +
        'and our team is now checking them.', R[2]]
      : ['Dear ' + lead.name + ',', 'Thank you for choosing Elite Global. We have received your request for a customised Umrah experience.',
        'A member of our team will contact you shortly by phone or WhatsApp to discuss your plans.'],
    rows: [['Reference number', lead.leadId], ['Service', visa ? 'Umrah visa only' : 'Customised Umrah'],
      ['Status', visa ? 'Under review' : 'Received']],
    button: { label: 'Track your application', url: trackUrl_(lead.leadId) },
    small: ['Keep your reference number. To track your application you will need it and the email address or phone number you used.']
      .concat(inboxSmall_(), contactSmall_()),
  });
}

/**
 * Customer confirmation (customise / visa). The visa one is also the "Under Review" status email.
 * Returns true when the email was sent or queued. Never throws.
 */
function sendConfirmation_(lead) {
  try {
    const visa = lead.kind === 'visa';
    const statusKey = lead.leadId + '|status:Under Review';
    const skip = customerSkip_(lead);
    if (skip) {
      logEmail_({ kind: 'confirmation', key: lead.leadId + '|confirmation', leadId: lead.leadId }, 'skipped', skip);
      if (visa) {
        logEmail_({ kind: 'status', key: statusKey, leadId: lead.leadId }, 'skipped', skip);
        setLastCustomerEmail_(lead.leadId, 'Not sent (' + skip + ') · Status: Under Review');
      }
      return false;
    }
    const m = renderConfirmation_(lead);
    const label = visa ? 'Confirmation + Status: Under Review' : 'Confirmation';
    const r = sendEmail_({ to: lead.email, kind: 'confirmation', key: lead.leadId + '|confirmation', leadId: lead.leadId,
      subject: m.subject, html: m.html, text: m.text, after: { lastEmail: label } });
    if (r === 'queued') setLastCustomerEmail_(lead.leadId, 'Queued: ' + label);
    if (visa && (r === 'ok' || r === 'queued')) logEmail_({ kind: 'status', key: statusKey, leadId: lead.leadId }, r, 'combined with confirmation');
    return r === 'ok' || r === 'queued' || r === 'duplicate';
  } catch (e) { console.error('confirmation failed: ' + noEmails_(e.message)); return false; }
}

// ---------------------------------------------------------------------
// REVIEW STATUS EMAILS
// ---------------------------------------------------------------------
// Email wording per Review Status (the Track page uses CONFIG.TRACK.REVIEW; the "Next step" differs only
// where the email itself is the place to act).
const REVIEW_EMAIL_NEXT = {
  'Correction Needed': 'Use the button below: look up your application with your email or phone number, then choose ' +
    '“Make the correction”. You can also reply to this email or message us on WhatsApp.',
  'Visa Approved': 'Use the button below: look up your application with your email or phone number, then choose ' +
    '“Download your visa”. Our team will also contact you about the next steps.',
};
const REVIEW_INTRO = {
  'Under Review': 'Your Umrah visa application is now being reviewed by our team.',
  'Correction Needed': 'We have checked your application and need a correction or more information before we can continue.',
  'Correction Received': 'Thank you — we have received your correction and are checking it.',
  'Verified': 'Good news: your documents have been checked and verified.',
  'Visa Processing': 'Your visa application has been submitted and is now being processed.',
  'Visa Approved': 'Congratulations — your Umrah visa has been approved.',
  'Not Approved / Closed': 'There is an update on your visa application: it has been closed.',
};

/**
 * visa (Visa Approved only): {attach: true, count} → "attached" line; {tooLarge: true} → the too-large line.
 * Visa Approved always has the gold "Download your visa" button (Track page link, no token).
 */
function renderStatusEmail_(lead, status, message, visa) {
  const st = CONFIG.TRACK.REVIEW[status];
  const action = status === 'Correction Needed';
  const approved = status === 'Visa Approved';
  const paragraphs = ['Dear ' + lead.name + ',', REVIEW_INTRO[status]];
  if (approved && visa && visa.attach) {
    paragraphs.push('Your visa is attached to this email' + (visa.count > 1 ? ' (' + visa.count + ' files)' : '') +
      '. You can also download it at any time from the Track page.');
  } else if (approved && visa && visa.tooLarge) paragraphs.push(VISA_TOO_LARGE_NOTE);
  return renderEmail_({
    subject: 'Elite Global — ' + (action ? 'Your visa application needs a correction' : 'Visa application update: ' + st[0]) + ' (' + lead.leadId + ')',
    preheader: st[1],
    heading: action ? 'We need a correction' : st[0],
    paragraphs: paragraphs,
    box: message ? { title: action ? 'What we need from you' : 'Message from our team', text: message } : null,
    rows: [['Reference number', lead.leadId], ['Status', st[0]], ['Next step', REVIEW_EMAIL_NEXT[status] || st[2]]],
    // Correction Needed: the customer fixes it on the website (Track page → Make the correction). No token in the link.
    button: { label: action ? 'Fix my application' : approved ? 'Download your visa' : 'Track your application', url: trackUrl_(lead.leadId) },
    small: contactSmall_(),
  });
}

/** Message to Customer as plain text (same rules as the Track page). */
function cleanMessage_(v) {
  return String(v || '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]+/g, ' ').replace(/[ \t]+/g, ' ')
    .trim().slice(0, CONFIG.TRACK.MESSAGE_MAX).trim();
}

// Statuses that can be emailed again in a later correction round (each round = a new status change).
// Every other status is emailed once per lead.
const REVIEW_PER_ROUND = ['Correction Needed', 'Correction Received'];

/** Once-only key: per lead + status, or per round (the time of the status change) for corrections. */
function reviewKey_(leadId, status, updated) {
  return leadId + '|status:' + status + (REVIEW_PER_ROUND.indexOf(status) !== -1 ? '|' + updated.getTime() : '');
}

/**
 * Status emails: visa rows whose Review Status has not changed for UNDO_MIN minutes and has not been
 * emailed (this status, or this correction round). Correction Needed waits for a Message to Customer;
 * the hold is released on the first run after the message is filled in. Editing the message after the
 * email was sent does not send it again. Every decision is kept for checkRecentEmailJobs. Returns counts.
 */
function processReviewEmails_(deadline) {
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const last = sh.getLastRow();
  const out = { sent: 0, queued: 0, skipped: 0, held: 0, waiting: 0 };
  if (last < 2) return out;
  const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
  const data = sh.getRange(2, 1, last - 1, width).getValues();
  const now = Date.now();
  const decisions = [], due = [];
  const dueIds = {};
  readDue_().forEach(function (x) { dueIds[x.id] = true; });
  data.forEach(function (v, i) {
    const r = reviewEmailRow_(sh, cols, v, i + 2, { deadline: deadline, now: now });
    if (r.decision) decisions.push(r.decision);
    if (out[r.outcome] !== undefined) out[r.outcome]++;
    if ((r.outcome === 'waiting' || r.outcome === 'held') && !dueIds[String(v[0])]) {
      due.push({ id: String(v[0]), at: Date.now() + (r.outcome === 'waiting' ? CONFIG.EMAIL.UNDO_MIN * 60000 : 0), reason: r.outcome + ' (hourly scan)' });
    }
  });
  saveReviewDecisions_(decisions);
  addDueMany_(due);
  return out;
}

/**
 * One tracker row of processReviewEmails_ (o.sendNow: the "Send Status Email Now" checkbox — no 5-minute wait,
 * every other rule kept). Returns {outcome: sent|queued|skipped|held|waiting|not sent|failed|none, reason,
 * decision: [Lead ID, status, decision, reason] | null, files}.
 */
function reviewEmailRow_(sh, cols, v, row, o) {
  const get = function (h) { return v[cols[h] - 1]; };
  const leadId = String(get('Lead ID') || '');
  const status = String(get('Review Status') || '').trim();
  const res = function (outcome, reason, files) {
    return { outcome: outcome, reason: reason, files: files, decision: reason ? [leadId, status, outcome, reason] : null };
  };
  if (!leadId || String(get('Lead Category')) !== CONFIG.FORMS.VISA.category) return res('none', o.sendNow ? 'only for visa applications' : '');
  if (!CONFIG.TRACK.REVIEW[status]) return res('none', o.sendNow ? 'no Review Status set' : '');
  const lastEmail = String(get('Last Customer Email') || '');
  const emailed = lastEmail.indexOf('Status: ' + status + ' ·') !== -1;
  // Visa Files is refreshed only while it matters: Visa Processing, or Visa Approved before its email
  // (held or waiting) — and always for Send now. Afterwards it is recounted when the customer opens the download.
  let scan = null;
  if ((status === 'Visa Processing' || (status === 'Visa Approved' && (!emailed || o.sendNow))) && Date.now() < o.deadline) {
    scan = refreshVisaFiles_({ leadId: leadId, row: row }, false, sh, cols);
  }
  const visaFiles = scan ? scan.files.length : Number(get('Visa Files')) || 0;
  // The customer's latest email is already about this status (sent, queued or skipped): nothing new to say.
  // A status is never emailed twice in a row; a new correction round needs another status in between.
  if (emailed) return res(o.sendNow ? 'not sent' : 'none', o.sendNow ? 'this status was already emailed to this customer' : '', visaFiles);
  let updated = get('Review Updated');
  if (!(updated instanceof Date) || isNaN(updated)) { // the edit trigger missed it: start the window now
    updated = new Date();
    sh.getRange(row, cols['Review Updated']).setValue(updated);
    if (!o.sendNow) return res('waiting', 'status change not seen by the edit trigger — the 5-minute wait starts now', visaFiles);
  }
  const key = reviewKey_(leadId, status, updated);
  if (!o.sendNow && o.now - updated.getTime() < CONFIG.EMAIL.UNDO_MIN * 60000) {
    return res('waiting', 'changed less than ' + CONFIG.EMAIL.UNDO_MIN + ' minutes ago (undo window)', visaFiles);
  }
  if (Date.now() > o.deadline) return res('waiting', '', visaFiles);
  const message = cleanMessage_(get('Message to Customer'));
  if (status === 'Correction Needed' && !message) return res('held', 'Message to Customer is empty', visaFiles);
  if (status === 'Visa Approved' && !visaFiles) return res('held', 'no visa file yet', visaFiles);
  if (emailDone_(key, get('Emails Sent'))) return res('not sent', 'this status was already emailed to this customer', visaFiles); // e.g. changed back
  const lead = { leadId: leadId, name: String(get('Customer Name') || ''), email: String(get('Email') || '').trim() };
  const stamp = function () { return Utilities.formatDate(new Date(), 'Africa/Lagos', 'd MMM yyyy HH:mm'); };
  const skip = customerSkip_(lead);
  if (skip) {
    logEmail_({ kind: 'status', key: key, leadId: leadId }, 'skipped', skip);
    sh.getRange(row, cols['Last Customer Email']).setValue('Not sent (' + skip + ') · Status: ' + status + ' · ' + stamp());
    return res('skipped', skip, visaFiles);
  }
  const after = { lastEmail: 'Status: ' + status };
  let visa = null;
  if (status === 'Visa Approved') { // ATTACH_VISA: the files are attached at delivery (up to 15 MB together)
    const on = settings_().attachVisa;
    const total = scan ? scan.files.reduce(function (a, x) { return a + x.size; }, 0) : 0;
    const tooLarge = on && total > CONFIG.VISA_DELIVERY.ATTACH_MAX;
    visa = { attach: on && !tooLarge, tooLarge: tooLarge, count: visaFiles };
    after.visa = { id: leadId, attach: visa.attach, why: !on ? 'ATTACH_VISA off' : tooLarge ? 'too large' : '' };
  }
  const m = renderStatusEmail_(lead, status, message, visa);
  const r = sendEmail_({ to: lead.email, kind: 'status', key: key, leadId: leadId, subject: m.subject, html: m.html,
    text: m.text, after: after });
  if (r === 'queued') sh.getRange(row, cols['Last Customer Email']).setValue('Queued: Status: ' + status + ' · ' + stamp());
  if (r === 'ok') { const x = res('sent', 'emailed to the customer' + (o.sendNow ? ' (Send Now)' : ''), visaFiles); x.visa = visa; return x; }
  if (r === 'queued') return res('queued', 'waiting for email quota', visaFiles);
  return res(r === 'duplicate' ? 'not sent' : 'failed', 'see the Email Log', visaFiles);
}

// ---------------------------------------------------------------------
// RECENT DECISIONS (checkRecentEmailJobs) — Lead ID, status, decision, reason, time. No personal data.
// ---------------------------------------------------------------------
const REVIEW_DECISIONS_MAX = 20;

/** Keeps the last 20 decisions; a repeat of a lead's latest decision (same status + decision) is not added. */
function saveReviewDecisions_(decisions) {
  if (!decisions.length) return;
  const p = PropertiesService.getScriptProperties();
  let list = [];
  try { list = JSON.parse(p.getProperty('REVIEW_DECISIONS') || '[]'); } catch (e) { list = []; }
  const now = Date.now();
  let changed = false;
  decisions.forEach(function (d) {
    let latest = null;
    for (let i = list.length - 1; i >= 0; i--) if (list[i][1] === d[0]) { latest = list[i]; break; }
    if (latest && latest[2] === d[1] && latest[3] === d[2]) return;
    list.push([now, d[0], d[1], d[2], d[3]]);
    changed = true;
  });
  if (!changed) return;
  p.setProperty('REVIEW_DECISIONS', JSON.stringify(list.slice(-REVIEW_DECISIONS_MAX)));
}

/** Run button: the last 20 review-email decisions (newest first). No addresses, names or messages. */
function checkRecentEmailJobs() {
  let list = [];
  try { list = JSON.parse(PropertiesService.getScriptProperties().getProperty('REVIEW_DECISIONS') || '[]'); } catch (e) { list = []; }
  const lines = list.slice().reverse().map(function (d) {
    return Utilities.formatDate(new Date(d[0]), 'Africa/Lagos', 'd MMM yyyy HH:mm') + '  ' + d[1] + '  ' + d[2] + '  → ' + d[3] + ' (' + d[4] + ')';
  });
  Logger.log('Last ' + lines.length + ' review-email decisions (newest first; checked every 5 minutes):\n' +
    (lines.length ? lines.join('\n') : '  none yet') +
    '\nEmails go out about ' + CONFIG.EMAIL.UNDO_MIN + ' minutes after the last Review Status change.');
  return lines;
}

// ---------------------------------------------------------------------
// TRIGGERS
// ---------------------------------------------------------------------
/**
 * Installable onEdit (Lead Tracker): a Review Status edit starts the 5-minute undo window (Review Updated).
 * Message to Customer edits do not: a held Correction Needed is sent on the next run once it is filled in.
 */
function onTrackerEdit(e) {
  const t0 = Date.now();
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== CONFIG.TRACKER_TAB) return; // other tabs: nothing to do (cheap exit)
    const cols = trackerCols_(sh);
    const c1 = e.range.getColumn(), c2 = c1 + e.range.getNumColumns() - 1;
    const inside = function (h) { return cols[h] >= c1 && cols[h] <= c2; };
    const hit = inside('Review Status');
    const r1 = Math.max(e.range.getRow(), 2), r2 = Math.min(e.range.getRow() + e.range.getNumRows() - 1, sh.getLastRow());
    if (r2 < r1) return;
    // Last Change (archive age): any staff edit of the row, except the auto columns
    const autoOnly = c1 === c2 && (c1 === cols['Last Change'] || c1 === cols['Emails Sent']);
    const n = r2 - r1 + 1;
    // one block read of the edited rows for every column used below (one call is faster than one per column)
    const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
    const block = (!autoOnly || hit) && n <= 1000 ? sh.getRange(r1, 1, n, width).getValues() : null;
    if (!autoOnly && block) {
      const now = new Date();
      const lcCol = cols['Last Change'];
      const cur = block.map(function (r) { return [r[lcCol - 1]]; });
      let any = false;
      block.forEach(function (r, i) { if (r[0] !== '') { cur[i][0] = now; any = true; } });
      if (any) sh.getRange(r1, lcCol, n, 1).setValues(cur);
    }
    // Review Status edits start the undo window (and go on the Due list); then ticked Send Now boxes are handled
    if (hit && block) stampReviewUpdated_(sh, cols, r1, r2, block);
    if (inside('Send Now')) sendNowRows_(e, sh, cols, r1, Math.min(r2, r1 + SEND_NOW_MAX - 1));
  } catch (err) { console.error('onTrackerEdit: ' + noEmails_(err.message)); }
  finally { recordRun_('edit', Date.now() - t0); }
}

/** Review Updated = now for the visa rows r1..r2 (a Review Status edit starts the 5-minute undo window). block = their values. */
function stampReviewUpdated_(sh, cols, r1, r2, block) {
  {
    const ru = cols['Review Updated'] - 1, cat = cols['Lead Category'] - 1;
    const stamps = block.map(function (r) { return [r[ru]]; });
    const now = new Date();
    const due = [];
    block.forEach(function (r, i) {
      if (String(r[cat]) === CONFIG.FORMS.VISA.category && r[0]) {
        stamps[i][0] = now;
        due.push({ id: String(r[0]), at: now.getTime() + CONFIG.EMAIL.UNDO_MIN * 60000, reason: 'status change' });
      }
    });
    if (due.length) {
      sh.getRange(r1, cols['Review Updated'], r2 - r1 + 1, 1).setValues(stamps);
      addDueMany_(due);
    }
  }
}

// ---------------------------------------------------------------------
// SEND NOW (tick box): recount Visa Files, then the current status email at once (no undo wait)
// ---------------------------------------------------------------------
const SEND_NOW_MAX = 50; // rows per tick action

/**
 * Ticked Send Now cells in rows r1..r2: each visa row is recounted, then its current Review Status email is sent
 * by reviewEmailRow_ (sendNow: every rule except the 5-minute wait). The box is unticked and its note shows the
 * result; a toast is shown where Google allows it. Non-visa rows: unticked + note. Logs Lead IDs only.
 */
function sendNowRows_(e, sh, cols, r1, r2) {
  const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
  const data = sh.getRange(r1, 1, r2 - r1 + 1, width).getValues();
  const ticked = [];
  data.forEach(function (v, i) { if (v[cols['Send Now'] - 1] === true) ticked.push(i); });
  if (!ticked.length) return;
  // Never at the same time as runEmailJobs (same lead could be emailed twice): wait for it, up to ~40 s
  const cache = CacheService.getScriptCache();
  for (let w = 0; w < 20 && cache.get('EMAIL_JOBS'); w++) Utilities.sleep(2000);
  const busy = !!cache.get('EMAIL_JOBS');
  if (!busy) cache.put('EMAIL_JOBS', '1', 120);
  const stamp = Utilities.formatDate(new Date(), 'Africa/Lagos', 'd MMM HH:mm');
  const toasts = [], decisions = [];
  try {
    ticked.forEach(function (i) {
      const row = r1 + i, v = data[i];
      const leadId = String(v[cols['Lead ID'] - 1] || '');
      const status = String(v[cols['Review Status'] - 1] || '').trim();
      let text;
      if (busy) text = 'Not sent — the automatic email check is running. Please tick again in a minute.';
      else if (!leadId || String(v[cols['Lead Category'] - 1]) !== CONFIG.FORMS.VISA.category) text = 'Ignored — Send Now is only for visa applications.';
      else {
        // Recount first (reviewEmailRow_ recounts Visa Processing / Visa Approved itself, on the same fresh scan)
        if (status !== 'Visa Processing' && status !== 'Visa Approved') refreshVisaFiles_({ leadId: leadId, row: row }, false, sh, cols);
        const r = reviewEmailRow_(sh, cols, v, row, { deadline: Date.now() + 60000, now: Date.now(), sendNow: true });
        if (r.decision) decisions.push(r.decision);
        text = sendNowText_(r, status, stamp);
      }
      const cell = sh.getRange(row, cols['Send Now']);
      cell.setValue(false);
      cell.setNote(text);
      toasts.push((leadId || 'Row ' + row) + ': ' + text);
      console.log('sendNow ' + (leadId || 'row') + ' ' + (text.split(' — ')[0]));
    });
  } finally {
    if (!busy) cache.remove('EMAIL_JOBS');
  }
  saveReviewDecisions_(decisions);
  try { (e && e.source ? e.source : sh.getParent()).toast(toasts.slice(0, 5).join('\n') + (toasts.length > 5 ? '\n… ' + (toasts.length - 5) + ' more (see the notes)' : ''), 'Elite Global — Send Now', 10); } catch (x) { /* toast is best-effort */ }
}

/** Cell-note wording for a Send Now result. */
function sendNowText_(r, status, stamp) {
  const files = r.files === 1 ? '1 file' : r.files + ' files';
  const visa = status === 'Visa Approved';
  if (r.outcome === 'sent') {
    let extra = '';
    if (visa) extra = r.visa && r.visa.attach ? ', ' + files + ' attached' : r.visa && r.visa.tooLarge ? ', not attached (over 15 MB — Download button)' : ', Download button only (ATTACH_VISA off)';
    return 'Sent ' + stamp + ' — ' + status + extra;
  }
  if (r.outcome === 'queued') return 'Queued ' + stamp + ' — ' + status + ' (daily email quota used up; it goes out automatically)';
  if (r.outcome === 'skipped') return 'Not sent — ' + status + ': ' + (r.reason === 'test lead' ? 'TEST lead (@example.com), customer emails are skipped' : r.reason);
  if (r.reason === 'no visa file yet') return 'Not sent — no visa file in Approved Visa (PDF, JPG or PNG, max 5 MB)';
  if (r.reason === 'Message to Customer is empty') return 'Not sent — Correction Needed needs a Message to Customer';
  if (r.reason === 'no Review Status set') return 'Not sent — no Review Status set';
  if (r.reason === 'this status was already emailed to this customer') return 'Not sent — ' + status + ' was already emailed to this customer';
  return 'Not sent — ' + (r.reason || r.outcome) + (visa ? ' (' + files + ')' : '');
}

/** Every 5 minutes: status emails, then the queue. Runs never overlap. */
function runEmailJobs() {
  const cache = CacheService.getScriptCache();
  if (cache.get('EMAIL_JOBS')) return;
  cache.put('EMAIL_JOBS', '1', 290);
  const t0 = Date.now();
  try {
    const deadline = Date.now() + CONFIG.EMAIL.JOB_BUDGET_MS;
    const p = PropertiesService.getScriptProperties();
    // The queue is only opened when something was queued (QUEUE_PENDING), so an idle run stays cheap
    const q = p.getProperty('QUEUE_PENDING') === '0' ? { sent: 0, waiting: 0, failed: 0, skipped: true } : runEmailQueue_(deadline);
    // Due tab every run; the full Lead Tracker scan (and the stale-correction clean-up) once an hour
    const s = processDue_(deadline);
    const lastFull = Number(p.getProperty('LAST_FULL_SCAN') || 0);
    if (Date.now() - lastFull >= 3600000 && Date.now() < deadline) {
      const f = processReviewEmails_(deadline);
      ['sent', 'queued', 'skipped', 'held', 'waiting'].forEach(function (k) { s[k] += f[k]; });
      s.full = true;
      p.setProperty('LAST_FULL_SCAN', String(Date.now()));
      try { purgeStaleCorrections_(); } catch (e) { console.error('purgeStaleCorrections: ' + noEmails_(e.message)); }
    }
    console.log('runEmailJobs ' + (s.full ? 'full' : 'due') + ' sent=' + s.sent + ' queued=' + s.queued + ' held=' + s.held + ' waiting=' + s.waiting +
      ' due=' + s.due + ' · queue sent=' + q.sent + ' waiting=' + q.waiting + ' failed=' + q.failed + ' · ' + (Date.now() - t0) + ' ms');
    return { status: s, queue: q };
  } finally {
    cache.remove('EMAIL_JOBS');
    recordRun_('jobs', Date.now() - t0);
  }
}

/** Creates the three triggers once (by handler name). */
function ensureTriggers_(ss) {
  const have = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { have[t.getHandlerFunction()] = true; });
  if (!have.onTrackerEdit) {
    ScriptApp.newTrigger('onTrackerEdit').forSpreadsheet(ss).onEdit().create();
    Logger.log('Added trigger: onTrackerEdit (Review Status changes).');
  }
  if (!have.runEmailJobs) {
    ScriptApp.newTrigger('runEmailJobs').timeBased().everyMinutes(5).create();
    Logger.log('Added trigger: runEmailJobs (every 5 minutes).');
  }
  if (!have.runArchive) {
    ScriptApp.newTrigger('runArchive').timeBased().atHour(2).everyDays(1).inTimezone('Africa/Lagos').create();
    Logger.log('Added trigger: runArchive (archive on the 1st of each month, ~02:00 Lagos; continues nightly until done).');
  }
  if (!have.sendDailySummary) {
    ScriptApp.newTrigger('sendDailySummary').timeBased().atHour(CONFIG.EMAIL.SUMMARY_HOUR).everyDays(1)
      .inTimezone('Africa/Lagos').create();
    Logger.log('Added trigger: sendDailySummary (daily around 08:00 Lagos).');
  }
}

// ---------------------------------------------------------------------
// DAILY SUMMARY
// ---------------------------------------------------------------------
function collectSummary_() {
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const last = sh.getLastRow();
  const counts = {};
  CONFIG.REVIEW_STATUSES.forEach(function (s) { counts[s] = 0; });
  const waitingReview = [], waitingNew = [], held = [], stale = [];
  const staleCut = Date.now() - CONFIG.ARCHIVE.STALE_DAYS * 864e5;
  const cutoff = Date.now() - CONFIG.EMAIL.WAIT_DAYS * 864e5;
  if (last >= 2) {
    const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
    sh.getRange(2, 1, last - 1, width).getValues().forEach(function (v) {
      const get = function (h) { return v[cols[h] - 1]; };
      const id = String(get('Lead ID') || '');
      if (!id) return;
      const status = String(get('Review Status') || '').trim();
      const visa = String(get('Lead Category')) === CONFIG.FORMS.VISA.category;
      if (visa && counts[status] !== undefined) {
        counts[status]++;
        const up = get('Review Updated');
        if (CONFIG.REVIEW_FINAL.indexOf(status) === -1 && up instanceof Date && up.getTime() < cutoff) {
          waitingReview.push(id + ' — ' + status + ' since ' + fmtDate_(up));
        }
        if (status === 'Correction Needed' && !cleanMessage_(get('Message to Customer'))) held.push(id + ' — Correction Needed, Message to Customer is empty');
        if (status === 'Visa Approved' && !(Number(get('Visa Files')) > 0) &&
          String(get('Last Customer Email') || '').indexOf('Status: Visa Approved ·') === -1) {
          held.push(id + ' — Visa Approved, no visa file yet in "Approved Visa"');
        }
      }
      const ls = String(get('Lead Status') || '').trim();
      const rec = get('Date Received');
      if (CONFIG.ARCHIVE.LEAD_FINAL.indexOf(ls) === -1 && CONFIG.ARCHIVE.REVIEW_FINAL.indexOf(status) === -1) {
        const lc = lastChangeMs_(get);
        if (lc && lc < staleCut) stale.push(id + ' — ' + (ls || 'New Lead') + (status ? ' / ' + status : '') + ', unchanged since ' + fmtDate_(new Date(lc)));
      }
      if ((ls === '' || ls === 'New Lead') && !status && rec instanceof Date && rec.getTime() < cutoff) {
        waitingNew.push(id + ' — New Lead since ' + fmtDate_(rec));
      }
    });
  }
  let quota = '';
  if (settings_().provider === 'mailapp') { try { quota = String(MailApp.getRemainingDailyQuota()); } catch (e) { quota = 'unknown'; } }
  let health = [];
  try { health = healthRows_(); } catch (e) { health = [['System health', 'unavailable: ' + noEmails_(e.message)]]; }
  return { counts: counts, waitingReview: waitingReview, waitingNew: waitingNew, held: held, stale: stale, health: health,
    queue: emailQueueCount_(), queueFailed: emailQueueFailed_(), quota: quota, provider: settings_().provider };
}

function renderSummary_(s) {
  const cap = function (list) { return list.length > 25 ? list.slice(0, 25).concat(['… and ' + (list.length - 25) + ' more']) : list; };
  const today = Utilities.formatDate(new Date(), 'Africa/Lagos', 'd MMM yyyy');
  const rows = CONFIG.REVIEW_STATUSES.map(function (st) { return [st, String(s.counts[st])]; });
  rows.push(['Emails waiting in the queue', String(s.queue) + (s.queueFailed ? ' (' + s.queueFailed + ' gave up — see the Email Log spreadsheet)' : '')]);
  rows.push(['Email quota left today', s.provider === 'brevo' ? 'Brevo — see the Brevo dashboard' : s.quota + ' (MailApp)']);
  return renderEmail_({
    subject: 'Elite Global — Daily summary ' + today,
    preheader: s.held.length + ' held · ' + (s.waitingReview.length + s.waitingNew.length) + ' waiting · queue ' + s.queue,
    heading: 'Daily summary — ' + today,
    paragraphs: ['Visa applications by Review Status:'],
    rows: rows,
    lists: [
      { title: 'Held emails (Correction Needed without a Message to Customer, Visa Approved without a visa file)', items: cap(s.held) },
      { title: 'Visa reviews waiting more than ' + CONFIG.EMAIL.WAIT_DAYS + ' days', items: cap(s.waitingReview) },
      { title: 'New leads not contacted for more than ' + CONFIG.EMAIL.WAIT_DAYS + ' days', items: cap(s.waitingNew) },
      { title: 'Please close (unchanged for ' + CONFIG.ARCHIVE.STALE_DAYS + ' days: set Lead Status to Converted or Lost so they can be archived)', items: cap(s.stale || []) },
      { title: 'System health' + ((s.health || []).some(function (r) { return /⚠️/.test(r[1]); }) ? ' — ⚠️ action needed (see the staff guide)' : ''),
        items: (s.health || []).map(function (r) { return r[0] + ': ' + r[1]; }) },
    ],
    button: { label: 'Open the Lead Tracker', url: trackerSS_().getUrl() },
    small: ['Sent automatically every morning by the Elite Global lead system.'],
    staff: true,
  });
}

/** Daily trigger (~08:00 Lagos): staff summary, then prune the Email Log (90 days). */
function sendDailySummary() {
  const t0 = Date.now();
  const s = collectSummary_();
  const m = renderSummary_(s);
  const today = Utilities.formatDate(new Date(), 'Africa/Lagos', 'yyyy-MM-dd');
  const r = settings_().notifyStaff
    ? sendEmail_({ to: staffEmail_(), kind: 'summary', key: 'summary|' + today, subject: m.subject, html: m.html, text: m.text })
    : 'skipped';
  const pruned = pruneEmailLog_();
  pruneHealth_();
  recordRun_('summary', Date.now() - t0);
  console.log('sendDailySummary ' + r + ' pruned=' + pruned);
  return r;
}

// ---------------------------------------------------------------------
// ERROR NOTICE + SAMPLES
// ---------------------------------------------------------------------
function renderErrorEmail_(action, err) {
  return renderEmail_({
    subject: 'Elite Global — Web app error' + (action ? ' (' + action + ')' : ''),
    heading: 'A website submission failed',
    paragraphs: ['The customer was asked to try again. Check Apps Script → Executions for details.'],
    rows: [['Action', action || '—'], ['Error', noEmails_(err && err.message)]],
    small: [String(err && err.stack || '').slice(0, 1500)],
    staff: true,
  });
}

/**
 * Editor: sends one sample of every email to STAFF_EMAIL (SAMPLE data; not written to the tracker
 * or the Email Log, and not de-duplicated). Run it after public/ is deployed so the logo shows.
 */
function sendEmailSamples() {
  const to = staffEmail_();
  const lead = { leadId: 'EG-VO-01234', kind: 'visa', name: 'Aisha Sample', phone: '+234 800 000 0000',
    email: 'sample@example.com', country: 'Nigeria', travelDate: new Date(Date.now() + 40 * 864e5), passengers: 2,
    extra: [['Departure', 'Kano – Mallam Aminu Kano International Airport (KAN)']], row: 2,
    trackerUrl: trackerSS_().getUrl(), folderUrl: 'https://drive.google.com/' };
  const custom = Object.assign({}, lead, { leadId: 'EG-CE-01235', kind: 'custom', folderUrl: '', extra: [['Budget', 'I need guidance on the budget']] });
  const contact = Object.assign({}, lead, { leadId: 'EG-GE-01236', kind: 'contact', email: '', country: '', folderUrl: '', extra: [['Enquiry', 'Hotel Accommodation']] });
  const samples = [
    ['code', renderCodeEmail_('123456')],
    ['staff alert (visa)', renderStaffAlert_(lead)],
    ['staff alert (customise)', renderStaffAlert_(custom)],
    ['staff alert (contact)', renderStaffAlert_(contact)],
    ['confirmation (visa = received + under review)', renderConfirmation_(lead)],
    ['confirmation (customise)', renderConfirmation_(custom)],
  ];
  const attach = {}; // sample index → SPECIMEN attachment
  CONFIG.REVIEW_STATUSES.forEach(function (st) {
    const msg = st === 'Correction Needed' ? 'Please upload a clearer passport photo with a plain white background.\nThe current photo is too dark.' :
      st === 'Visa Approved' ? 'Please check the names and passport numbers on your visa and tell us at once if anything is wrong.' : '';
    if (st !== 'Visa Approved') { samples.push(['status: ' + st, renderStatusEmail_(lead, st, msg)]); return; }
    samples.push(['status: Visa Approved (ATTACH_VISA off: Download button only)', renderStatusEmail_(lead, st, msg, { attach: false })]);
    attach[samples.length] = [Utilities.newBlob(specimenVisaPdf_(1), 'application/pdf', visaFileName_(lead.leadId, 1, 1, 'PDF'))];
    samples.push(['status: Visa Approved (ATTACH_VISA on: SPECIMEN visa attached)', renderStatusEmail_(lead, st, msg, { attach: true, count: 1 })]);
    samples.push(['status: Visa Approved (ATTACH_VISA on, over 15 MB: not attached)', renderStatusEmail_(lead, st, msg, { tooLarge: true })]);
  });
  samples.push(['daily summary', renderSummary_(collectSummary_())]);
  samples.push(['staff alert (correction submitted)', renderCorrectionAlert_({ leadId: lead.leadId, name: lead.name, row: 2, correctionFor: 'Passport photo',
    trackerUrl: lead.trackerUrl, folderUrl: lead.folderUrl, changes: ['Passenger 1 photo replaced', 'Travel date changed'] })]);
  samples.push(['error notice', renderErrorEmail_('sampleAction', new Error('Sample error — nothing is wrong'))]);
  samples.forEach(function (s, i) {
    const m = s[1];
    const r = deliver_({ to: to, kind: 'sample', subject: '[SAMPLE ' + (i + 1) + '/' + samples.length + '] ' + m.subject, html: m.html, text: m.text,
      attachments: attach[i] || null });
    Logger.log((r.result === 'ok' ? '✅ ' : '⚠️ ') + 'Sample ' + (i + 1) + ' — ' + s[0] + ': ' + r.result + (r.detail ? ' (' + r.detail + ')' : ''));
  });
}
