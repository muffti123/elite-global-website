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
      '<p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#8a5a00;text-transform:uppercase;letter-spacing:.04em">' + e(o.box.title) + '</p>' +
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

  const wa = 'https://wa.me/' + C.whatsapp;
  const footer =
    '<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#ffffff">' + e(C.name) + '</p>' +
    '<p style="margin:0 0 10px;font-size:12px;color:' + EMAIL_GOLD + '">RC: ' + e(C.rc) + '</p>' +
    '<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#d8deeb">' + e(C.address) + '</p>' +
    '<p style="margin:0 0 6px;font-size:13px;line-height:1.7;color:#d8deeb">' +
    'Phone: <a href="tel:' + e(C.phone.replace(/\s/g, '')) + '" style="color:#ffffff">' + e(C.phone) + '</a> &nbsp;·&nbsp; ' +
    '<a href="' + e(wa) + '" style="color:#ffffff">WhatsApp</a> &nbsp;·&nbsp; ' +
    '<a href="' + e(C.instagram) + '" style="color:#ffffff">Instagram</a> &nbsp;·&nbsp; ' +
    '<a href="mailto:' + e(C.email) + '" style="color:#ffffff">' + e(C.email) + '</a></p>' +
    '<p style="margin:10px 0 0;font-size:13px"><a href="' + e(site + '/track.html') + '" style="color:' + EMAIL_GOLD + ';font-weight:bold">Track your application</a></p>';

  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">' +
    '<title>' + e(o.subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#eef1f6;font-family:' + EMAIL_FONT + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef1f6">' + e(o.preheader || '') + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6"><tr><td align="center" style="padding:20px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:' + EMAIL_NAVY + ';padding:20px 24px;border-bottom:4px solid ' + EMAIL_GOLD + '">' +
    '<img src="' + e(site + '/assets/brand/email-logo.png') + '" width="220" alt="Elite Global World Travel &amp; Tours Ltd." style="display:block;width:220px;max-width:100%;height:auto;border:0;color:#ffffff;font-size:18px;font-weight:bold"></td></tr>' +
    '<tr><td style="padding:28px 24px 12px;font-family:' + EMAIL_FONT + '">' +
    '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:' + EMAIL_NAVY + '">' + e(o.heading) + '</h1>' + body + '</td></tr>' +
    '<tr><td style="background:' + EMAIL_NAVY + ';padding:22px 24px;font-family:' + EMAIL_FONT + '">' + footer + '</td></tr>' +
    '</table></td></tr></table></body></html>';

  // Plain-text version
  const t = [o.heading, ''];
  (o.paragraphs || []).forEach(function (x) { t.push(x, ''); });
  if (o.box) t.push(o.box.title.toUpperCase() + ':', o.box.text, '');
  (o.rows || []).forEach(function (r) { t.push(r[0] + ': ' + r[1] + (r[2] && r[2] !== r[1] ? ' (' + r[2] + ')' : '')); });
  if (o.rows && o.rows.length) t.push('');
  (o.lists || []).forEach(function (l) { t.push(l.title + ':'); (l.items.length ? l.items : ['None.']).forEach(function (i) { t.push(' - ' + i); }); t.push(''); });
  if (o.button) t.push(o.button.label + ': ' + o.button.url, '');
  (o.small || []).forEach(function (x) { t.push(x); });
  t.push('', '—', C.name + ' (RC: ' + C.rc + ')', C.address, 'Phone: ' + C.phone + ' · WhatsApp: ' + wa,
    'Instagram: ' + C.instagram, 'Email: ' + C.email, 'Track your application: ' + site + '/track.html');
  return { subject: o.subject, html: html, text: t.join('\n') };
}

/** Contact lines shared by customer emails. */
function contactSmall_() {
  const C = CONFIG.COMPANY_INFO;
  return ['Questions? Call ' + C.phone + ', message us on WhatsApp (link below) or reply to this email.',
    'Can\'t find our emails? Please check your spam or junk folder and mark us as "not spam".'];
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
    sh.getRange(row, trackerCols_(sh)['Last Customer Email']).setValue(label + ' · ' + stamp);
    SpreadsheetApp.flush();
  } catch (e) { console.error('Last Customer Email not updated: ' + e.message); }
}

/** Sets Review Status + Review Updated (used at finalize; staff edits go through onTrackerEdit). */
function setReviewStatus_(leadId, status) {
  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  if (!row) return;
  const cols = trackerCols_(sh);
  sh.getRange(row, cols['Review Status']).setValue(status);
  sh.getRange(row, cols['Review Updated']).setValue(new Date());
}

function fmtDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'Africa/Lagos', 'd MMM yyyy');
  const d = parseDate_(String(v || ''));
  return d instanceof Date ? Utilities.formatDate(d, 'Africa/Lagos', 'd MMM yyyy') : String(v || '');
}

function isTestLead_(name, email) {
  return /^\s*'?TEST/i.test(String(name || '')) && /@example\.com$/i.test(String(email || '').trim());
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
  });
}

/** Staff alert for a new lead. Never throws. */
function notifyNewLead_(lead) {
  try {
    if (!settings_().notifyStaff) return logEmail_({ kind: 'staff-alert', leadId: lead.leadId }, 'skipped', 'staff alerts off');
    const sh = trackerSheet_();
    lead.row = lead.row || findLeadRow_(sh, lead.leadId);
    lead.trackerUrl = trackerSS_().getUrl() + '#gid=' + sh.getSheetId() + '&range=A' + lead.row;
    const m = renderStaffAlert_(lead);
    return sendEmail_({ to: staffEmail_(), kind: 'staff-alert', key: lead.leadId + '|staff-alert', leadId: lead.leadId,
      subject: m.subject, html: m.html, text: m.text });
  } catch (e) { console.error('staff alert failed: ' + e.message); return 'failed'; }
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
      .concat(contactSmall_()),
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
  } catch (e) { console.error('confirmation failed: ' + e.message); return false; }
}

// ---------------------------------------------------------------------
// REVIEW STATUS EMAILS
// ---------------------------------------------------------------------
// Email wording per Review Status (the Track page uses CONFIG.TRACK.REVIEW; the "Next step" differs only
// where the email itself is the place to act).
const REVIEW_EMAIL_NEXT = {
  'Correction Needed': 'Please reply to this email with what we need, or send it to us on WhatsApp.',
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

function renderStatusEmail_(lead, status, message) {
  const st = CONFIG.TRACK.REVIEW[status];
  const action = status === 'Correction Needed';
  return renderEmail_({
    subject: 'Elite Global — ' + (action ? 'Action needed on your visa application' : 'Visa application update: ' + st[0]) + ' (' + lead.leadId + ')',
    preheader: st[1],
    heading: action ? 'Action needed' : st[0],
    paragraphs: ['Dear ' + lead.name + ',', REVIEW_INTRO[status]],
    box: message ? { title: action ? 'What we need from you' : 'Message from our team', text: message } : null,
    rows: [['Reference number', lead.leadId], ['Status', st[0]], ['Next step', REVIEW_EMAIL_NEXT[status] || st[2]]],
    button: { label: 'Track your application', url: trackUrl_(lead.leadId) },
    small: contactSmall_(),
  });
}

/** Message to Customer as plain text (same rules as the Track page). */
function cleanMessage_(v) {
  return String(v || '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]+/g, ' ').replace(/[ \t]+/g, ' ')
    .trim().slice(0, CONFIG.TRACK.MESSAGE_MAX).trim();
}

/**
 * Status emails: visa rows whose Review Status has not changed for UNDO_MIN minutes and has not been
 * emailed for this lead. Correction Needed waits for a Message to Customer. Returns counts.
 */
function processReviewEmails_(deadline) {
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const last = sh.getLastRow();
  const out = { sent: 0, queued: 0, skipped: 0, held: 0, waiting: 0 };
  if (last < 2) return out;
  const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
  const data = sh.getRange(2, 1, last - 1, width).getValues();
  const undo = CONFIG.EMAIL.UNDO_MIN * 60000;
  const now = Date.now();
  data.forEach(function (v, i) {
    const get = function (h) { return v[cols[h] - 1]; };
    const leadId = String(get('Lead ID') || '');
    const status = String(get('Review Status') || '').trim();
    if (!leadId || String(get('Lead Category')) !== CONFIG.FORMS.VISA.category || !CONFIG.TRACK.REVIEW[status]) return;
    const lastEmail = String(get('Last Customer Email') || '');
    // Already emailed (or queued / skipped) for this status: every label ends "Status: <status> · <time>"
    if (lastEmail.indexOf('Status: ' + status + ' ·') !== -1) return;
    const row = i + 2;
    const updated = get('Review Updated');
    if (!(updated instanceof Date) || isNaN(updated)) { // the edit trigger missed it: start the window now
      sh.getRange(row, cols['Review Updated']).setValue(new Date());
      out.waiting++;
      return;
    }
    if (now - updated.getTime() < undo) { out.waiting++; return; }
    if (Date.now() > deadline) { out.waiting++; return; }
    const message = cleanMessage_(get('Message to Customer'));
    if (status === 'Correction Needed' && !message) { out.held++; return; }
    const key = leadId + '|status:' + status;
    if (emailDone_(key)) return; // emailed before (e.g. changed back to an earlier status)
    const lead = { leadId: leadId, name: String(get('Customer Name') || ''), email: String(get('Email') || '').trim() };
    const skip = customerSkip_(lead);
    if (skip) {
      logEmail_({ kind: 'status', key: key, leadId: leadId }, 'skipped', skip);
      sh.getRange(row, cols['Last Customer Email']).setValue('Not sent (' + skip + ') · Status: ' + status + ' · ' +
        Utilities.formatDate(new Date(), 'Africa/Lagos', 'd MMM yyyy HH:mm'));
      out.skipped++;
      return;
    }
    const m = renderStatusEmail_(lead, status, message);
    const r = sendEmail_({ to: lead.email, kind: 'status', key: key, leadId: leadId, subject: m.subject, html: m.html,
      text: m.text, after: { lastEmail: 'Status: ' + status } });
    if (r === 'ok') out.sent++;
    else if (r === 'queued') {
      out.queued++;
      sh.getRange(row, cols['Last Customer Email']).setValue('Queued: Status: ' + status + ' · ' +
        Utilities.formatDate(new Date(), 'Africa/Lagos', 'd MMM yyyy HH:mm'));
    }
  });
  return out;
}

// ---------------------------------------------------------------------
// TRIGGERS
// ---------------------------------------------------------------------
/** Installable onEdit (Lead Tracker): a Review Status or Message to Customer edit restarts the undo window. */
function onTrackerEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== CONFIG.TRACKER_TAB) return;
    const cols = trackerCols_(sh);
    const c1 = e.range.getColumn(), c2 = c1 + e.range.getNumColumns() - 1;
    const hit = [cols['Review Status'], cols['Message to Customer']].some(function (c) { return c >= c1 && c <= c2; });
    const r1 = Math.max(e.range.getRow(), 2), r2 = Math.min(e.range.getRow() + e.range.getNumRows() - 1, sh.getLastRow());
    if (!hit || r2 < r1 || r2 - r1 > 1000) return;
    const cats = sh.getRange(r1, cols['Lead Category'], r2 - r1 + 1, 1).getValues();
    const stamps = sh.getRange(r1, cols['Review Updated'], r2 - r1 + 1, 1).getValues();
    const now = new Date();
    let changed = false;
    cats.forEach(function (c, i) {
      if (String(c[0]) === CONFIG.FORMS.VISA.category) { stamps[i][0] = now; changed = true; }
    });
    if (changed) sh.getRange(r1, cols['Review Updated'], r2 - r1 + 1, 1).setValues(stamps);
  } catch (err) { console.error('onTrackerEdit: ' + err.message); }
}

/** Every 5 minutes: status emails, then the queue. Runs never overlap. */
function runEmailJobs() {
  const cache = CacheService.getScriptCache();
  if (cache.get('EMAIL_JOBS')) return;
  cache.put('EMAIL_JOBS', '1', 290);
  try {
    const deadline = Date.now() + CONFIG.EMAIL.JOB_BUDGET_MS;
    const q = runEmailQueue_(deadline);
    const s = processReviewEmails_(deadline);
    console.log('runEmailJobs status sent=' + s.sent + ' queued=' + s.queued + ' held=' + s.held + ' waiting=' + s.waiting +
      ' · queue sent=' + q.sent + ' waiting=' + q.waiting + ' failed=' + q.failed);
    return { status: s, queue: q };
  } finally {
    cache.remove('EMAIL_JOBS');
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
  const waitingReview = [], waitingNew = [], held = [];
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
      }
      const ls = String(get('Lead Status') || '').trim();
      const rec = get('Date Received');
      if ((ls === '' || ls === 'New Lead') && !status && rec instanceof Date && rec.getTime() < cutoff) {
        waitingNew.push(id + ' — New Lead since ' + fmtDate_(rec));
      }
    });
  }
  let quota = '';
  if (settings_().provider === 'mailapp') { try { quota = String(MailApp.getRemainingDailyQuota()); } catch (e) { quota = 'unknown'; } }
  return { counts: counts, waitingReview: waitingReview, waitingNew: waitingNew, held: held,
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
      { title: 'Held emails (Correction Needed without a Message to Customer)', items: cap(s.held) },
      { title: 'Visa reviews waiting more than ' + CONFIG.EMAIL.WAIT_DAYS + ' days', items: cap(s.waitingReview) },
      { title: 'New leads not contacted for more than ' + CONFIG.EMAIL.WAIT_DAYS + ' days', items: cap(s.waitingNew) },
    ],
    button: { label: 'Open the Lead Tracker', url: trackerSS_().getUrl() },
    small: ['Sent automatically every morning by the Elite Global lead system.'],
  });
}

/** Daily trigger (~08:00 Lagos): staff summary, then prune the Email Log (90 days). */
function sendDailySummary() {
  const s = collectSummary_();
  const m = renderSummary_(s);
  const today = Utilities.formatDate(new Date(), 'Africa/Lagos', 'yyyy-MM-dd');
  const r = settings_().notifyStaff
    ? sendEmail_({ to: staffEmail_(), kind: 'summary', key: 'summary|' + today, subject: m.subject, html: m.html, text: m.text })
    : 'skipped';
  const pruned = pruneEmailLog_();
  console.log('sendDailySummary ' + r + ' pruned=' + pruned);
  return r;
}

// ---------------------------------------------------------------------
// ERROR NOTICE + SAMPLES
// ---------------------------------------------------------------------
function renderErrorEmail_(action, err) {
  return renderEmail_({
    subject: 'Elite Global — ⚠️ Web app error' + (action ? ' (' + action + ')' : ''),
    heading: 'A website submission failed',
    paragraphs: ['The customer was asked to try again. Check Apps Script → Executions for details.'],
    rows: [['Action', action || '—'], ['Error', String(err && err.message || '')]],
    small: [String(err && err.stack || '').slice(0, 1500)],
  });
}

/**
 * Editor: sends one sample of every email to STAFF_EMAIL (SAMPLE data; not written to the tracker
 * or the Email Log, and not de-duplicated). Run it after public/ is deployed so the logo shows.
 */
function sendEmailSamples() {
  const to = staffEmail_();
  const lead = { leadId: 'EG-VO-01234', kind: 'visa', name: 'SAMPLE Customer <Name>', phone: '+234 800 000 0000',
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
  CONFIG.REVIEW_STATUSES.forEach(function (st) {
    const msg = st === 'Correction Needed' ? 'Please upload a clearer passport photo with a plain white background.\nThe current photo is too dark.' :
      st === 'Visa Approved' ? 'Your e-visa will be sent to you on WhatsApp today.' : '';
    samples.push(['status: ' + st, renderStatusEmail_(lead, st, msg)]);
  });
  samples.push(['daily summary', renderSummary_(collectSummary_())]);
  samples.push(['error notice', renderErrorEmail_('sampleAction', new Error('Sample error — nothing is wrong'))]);
  samples.forEach(function (s, i) {
    const m = s[1];
    const r = deliver_({ to: to, kind: 'sample', subject: '[SAMPLE ' + (i + 1) + '/' + samples.length + '] ' + m.subject, html: m.html, text: m.text });
    Logger.log((r.result === 'ok' ? '✅ ' : '⚠️ ') + 'Sample ' + (i + 1) + ' — ' + s[0] + ': ' + r.result + (r.detail ? ' (' + r.detail + ')' : ''));
  });
}
