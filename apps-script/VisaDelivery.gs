/**
 * Approved visa delivery (round 2.4).
 *
 * Staff put the visa file(s) in the lead's Drive folder → "Approved Visa" (PDF, JPG or PNG, max 5 MB each;
 * one per passenger or one combined). "Visa Files" in the Lead Tracker counts the valid ones. With Review
 * Status Visa Approved the customer email waits until there is at least one (Notify.gs).
 *
 * Customer: Track page → "Download your visa" (only Visa Approved + Visa Files > 0, never for a Lost lead)
 *   sendVisaCode {session}           → code to the email ON THE APPLICATION (scope visa|<LeadID>|<email>)
 *   verifyVisaCode {session, code}   → download token (30 min, several downloads; ends on Log out) + file list
 *   listVisaFiles {dtoken}           → the list again (recounts Visa Files)
 *   downloadVisaFile {dtoken, ref}   → {name, mime, b64}: the bytes through the web app. Drive sharing is
 *                                      never changed and no Drive link or file ID is ever sent.
 * Logs: the Lead ID and the file count only — never a name, email, code or token.
 */
const VISA_ACTIONS = ['sendVisaCode', 'verifyVisaCode', 'listVisaFiles', 'downloadVisaFile'];
const VISA_NOT_READY = 'Your visa is not available to download at the moment. Please look up your application again to see its current status.';
const VISA_ENDED = 'Your download session has ended. Please confirm your email again to download your visa.';
const VISA_TOO_LARGE_NOTE = 'Your visa is too large to attach — please download it from the Track page.';

// ---------------------------------------------------------------------
// WHO MAY DOWNLOAD
// ---------------------------------------------------------------------
/** Visa lead, not Lost, Review Status Visa Approved. */
function visaApproved_(lead) {
  return String(lead.get('Lead Category') || '') === CONFIG.FORMS.VISA.category &&
    String(lead.get('Lead Status') || '').trim() !== 'Lost' &&
    String(lead.get('Review Status') || '').trim() === 'Visa Approved';
}
/** … and at least one valid file in Approved Visa (the Visa Files column). */
function visaDownloadReady_(lead) {
  return visaApproved_(lead) && Number(lead.get('Visa Files')) > 0;
}

// ---------------------------------------------------------------------
// DRIVE: "Approved Visa" and its valid files
// ---------------------------------------------------------------------
/** The "Approved Visa" folder in a lead folder (created when missing and create is true). */
function approvedVisaFolder_(leadFolder, create) {
  const it = leadFolder.getFoldersByName(CONFIG.VISA_DELIVERY.FOLDER);
  if (it.hasNext()) return it.next();
  return create ? leadFolder.createFolder(CONFIG.VISA_DELIVERY.FOLDER) : null;
}

/** First bytes match the type (PDF %PDF, JPEG FF D8 FF, PNG 89 50 4E 47). */
function visaMagicOk_(bytes, type) {
  const b = function (i) { return bytes[i] & 255; };
  if (!bytes || bytes.length < 4) return false;
  if (type === 'PDF') return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46;
  if (type === 'JPG') return b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF;
  if (type === 'PNG') return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47;
  return false;
}

/**
 * Files in Approved Visa, sorted by name then by date added: {files: [{file, type, size, blob?}],
 * badType, tooLarge}. Only PDF/JPG/PNG up to 5 MB count; with checkBytes the first bytes are checked too.
 */
function scanVisaFiles_(folder, checkBytes) {
  const V = CONFIG.VISA_DELIVERY;
  const out = { files: [], badType: 0, tooLarge: 0 };
  if (!folder) return out;
  const list = [];
  const it = folder.getFiles();
  while (it.hasNext()) list.push(it.next());
  list.sort(function (a, b) {
    const n = String(a.getName()).localeCompare(String(b.getName()));
    return n || (a.getDateCreated().getTime() - b.getDateCreated().getTime());
  });
  list.forEach(function (f) {
    const type = V.TYPES[String(f.getMimeType() || '').toLowerCase()];
    if (!type) { out.badType++; return; }
    const size = Number(f.getSize()) || 0;
    if (size > V.FILE_MAX) { out.tooLarge++; return; }
    let blob = null;
    if (checkBytes) {
      blob = f.getBlob();
      if (!visaMagicOk_(blob.getBytes(), type)) { out.badType++; return; }
    }
    out.files.push({ file: f, type: type, size: size, blob: blob });
  });
  return out;
}

/** Note on the Visa Files cell when files were ignored ('' when none). */
function visaFilesNote_(scan) {
  const n = function (k) { return k + (k === 1 ? ' file' : ' files') + ' ignored: '; };
  const out = [];
  if (scan.tooLarge) out.push(n(scan.tooLarge) + 'too large (max 5 MB) — please upload a smaller PDF, JPG or PNG');
  if (scan.badType) out.push(n(scan.badType) + 'not a PDF, JPG or PNG — please upload a PDF, JPG or PNG');
  return out.join('\n');
}

/**
 * Recounts Approved Visa for a tracker row ({leadId, row}) and writes Visa Files (+ the note) when it
 * changed. Creates the folder when missing. Returns the scan, or null when the Drive folder is missing.
 */
function refreshVisaFiles_(lead, checkBytes, sh, cols) {
  if (!lead.archived) {
    sh = sh || trackerSheet_();
    cols = cols || trackerCols_(sh);
  }
  let scan;
  try { scan = scanVisaFiles_(approvedVisaFolder_(leadFolder_(lead), true), checkBytes); } catch (e) {
    console.error('Visa Files ' + lead.leadId + ': ' + noEmails_(e.message));
    return null;
  }
  if (lead.archived) return scan; // archive rows are never written
  const cell = sh.getRange(lead.row, cols['Visa Files']);
  if (cell.getValue() !== scan.files.length) cell.setValue(scan.files.length);
  const note = visaFilesNote_(scan);
  if (String(cell.getNote() || '') !== note) cell.setNote(note);
  return scan;
}

/** Neutral download / attachment name (never the staff's file name): "EG-VO-00052 – Visa 1 of 2.pdf". */
function visaFileName_(leadId, i, n, type) {
  return leadId + ' – Visa ' + i + ' of ' + n + '.' + String(type).toLowerCase();
}
/** Opaque file reference for the browser (never the Drive file ID). */
function visaRef_(fileId) { return tokenSig_('vf|' + fileId).slice(0, 16); }

// ---------------------------------------------------------------------
// EMAIL ATTACHMENTS (ATTACH_VISA=on) — built when the email is delivered (also from the queue)
// ---------------------------------------------------------------------
/** {blobs, detail}: the valid files of a lead, or none when over 15 MB together. Never throws. */
function visaAttachments_(leadId) {
  try {
    const lead = trackRow_(leadId);
    if (!lead) return { blobs: [], detail: 'not attached (lead not found)' };
    const scan = scanVisaFiles_(approvedVisaFolder_(leadFolder_(lead), false), true);
    const n = scan.files.length;
    if (!n) return { blobs: [], detail: 'not attached (no visa file)' };
    const total = scan.files.reduce(function (a, x) { return a + x.size; }, 0);
    if (total > CONFIG.VISA_DELIVERY.ATTACH_MAX) return { blobs: [], detail: 'not attached (too large)' };
    const blobs = scan.files.map(function (x, i) { return x.blob.setName(visaFileName_(leadId, i + 1, n, x.type)); });
    return { blobs: blobs, detail: 'attached ' + n + (n === 1 ? ' file' : ' files') };
  } catch (e) {
    console.error('visa attachments: ' + noEmails_(e.message));
    return { blobs: [], detail: 'not attached (Drive error)' };
  }
}

// ---------------------------------------------------------------------
// ACTIONS: sendVisaCode / verifyVisaCode (step-up check with the stored email)
// ---------------------------------------------------------------------
function visaLead_(session) {
  const s = requireSession_(session);
  const lead = trackRow_(s.leadId);
  if (!lead) fail_(SESSION_ENDED, null, { relogin: true });
  if (!visaDownloadReady_(lead)) fail_(VISA_NOT_READY, null, { restart: true });
  const email = String(lead.get('Email') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) fail_('We cannot send a code for this application. Please contact us on WhatsApp.');
  return { s: s, lead: lead, email: email, scope: 'visa|' + lead.leadId + '|' + email };
}

function sendVisaCode_(d) {
  const c = visaLead_(d.session);
  const bypass = testBypassOn_() && isTestLead_(c.lead.get('Customer Name'), c.email);
  issueCode_(c.scope, c.email, bypass, 'code');
  console.log('sendVisaCode ' + (bypass ? 'test' : 'sent'));
  return { ok: true, masked: maskEmail_(c.email), resendIn: CONFIG.OTP.RESEND_S };
}

function verifyVisaCode_(d) {
  const c = visaLead_(d.session);
  checkCode_(c.scope, d.code, 'verifyVisaCode');
  const leadId = c.lead.leadId;
  // Bound to the Lead ID and to the Track session (its 8-hour end): Log out ends it too.
  const x = Math.min(Date.now() + CONFIG.VISA_DELIVERY.TOKEN_MIN * 60000, c.s.max);
  const body = x + '.' + c.s.max + '.' + leadId;
  const files = visaFileList_(c.lead);
  console.log('verifyVisaCode ok ' + leadId + ' files=' + files.length);
  return { ok: true, dtoken: body + '.' + tokenSig_('visa|' + body), minutes: Math.max(1, Math.round((x - Date.now()) / 60000)), files: files };
}

/** The lead of a valid, unexpired, not logged-out download token that may still download. Otherwise restart. */
function requireVisaToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || !/^\d{13}$/.test(parts[0]) || !/^\d{13}$/.test(parts[1]) || !/^EG-VO-\d{5}$/.test(parts[2])) fail_(VISA_ENDED, null, { restart: true });
  const body = parts[0] + '.' + parts[1] + '.' + parts[2];
  const now = Date.now();
  if (tokenSig_('visa|' + body) !== parts[3] || Number(parts[0]) < now || Number(parts[1]) < now) fail_(VISA_ENDED, null, { restart: true });
  if (CacheService.getScriptCache().get(sessionRevokedKey_(parts[2], Number(parts[1])))) fail_(VISA_ENDED, null, { restart: true });
  const lead = trackRow_(parts[2]);
  if (!lead || !visaApproved_(lead)) fail_(VISA_NOT_READY, null, { restart: true });
  return lead;
}

/** [{ref, label, type, kb}] — recounts Visa Files (the customer opened the download). */
function visaFileList_(lead) {
  const scan = refreshVisaFiles_(lead, true);
  if (!scan) throw new Error('Approved Visa folder unavailable');
  const n = scan.files.length;
  return scan.files.map(function (x, i) {
    return { ref: visaRef_(x.file.getId()), label: 'Visa – ' + (i + 1) + ' of ' + n, type: x.type, kb: Math.max(1, Math.round(x.size / 1024)) };
  });
}

function listVisaFiles_(d) {
  const lead = requireVisaToken_(d.dtoken);
  const files = visaFileList_(lead);
  console.log('listVisaFiles ' + lead.leadId + ' files=' + files.length);
  return { ok: true, files: files };
}

function downloadVisaFile_(d) {
  const lead = requireVisaToken_(d.dtoken);
  const V = CONFIG.VISA_DELIVERY;
  rateLimit_('visa:dl:' + lead.leadId, V.DOWNLOADS_PER_HOUR, 3600,
    'You have downloaded your visa ' + V.DOWNLOADS_PER_HOUR + ' times in the last hour. Please wait a while and try again, or contact us on WhatsApp.');
  const scan = scanVisaFiles_(approvedVisaFolder_(leadFolder_(lead), true), true);
  const ref = String(d.ref || '');
  let at = -1;
  scan.files.forEach(function (x, i) { if (at === -1 && visaRef_(x.file.getId()) === ref) at = i; });
  if (at === -1) fail_('This file has changed. Please choose it again from the updated list.', null, { relist: true });
  const x = scan.files[at];
  console.log('downloadVisaFile ok ' + lead.leadId + ' files=' + scan.files.length);
  return { ok: true, name: visaFileName_(lead.leadId, at + 1, scan.files.length, x.type), mime: x.blob.getContentType() || 'application/octet-stream',
    size: x.size, b64: Utilities.base64Encode(x.blob.getBytes()) };
}

// ---------------------------------------------------------------------
// SETUP: Approved Visa in every visa lead folder + a recount (budgeted; run setup again to finish)
// ---------------------------------------------------------------------
function setupVisaDelivery_() {
  const deadline = Date.now() + 150000;
  let made = 0, counted = 0, unfinished = false;
  const it = visaRootFolder_().getFolders();
  while (it.hasNext()) {
    if (Date.now() > deadline) { unfinished = true; break; }
    const f = it.next();
    if (!/^EG-VO-\d{5} – /.test(f.getName())) continue;
    if (!approvedVisaFolder_(f, false)) { f.createFolder(CONFIG.VISA_DELIVERY.FOLDER); made++; }
  }
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const last = sh.getLastRow();
  if (last >= 2 && !unfinished) {
    const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
    const data = sh.getRange(2, 1, last - 1, width).getValues();
    for (let i = 0; i < data.length; i++) {
      if (Date.now() > deadline) { unfinished = true; break; }
      const v = data[i];
      const status = String(v[cols['Review Status'] - 1] || '').trim();
      if (String(v[cols['Lead Category'] - 1]) !== CONFIG.FORMS.VISA.category) continue;
      if (status !== 'Visa Processing' && status !== 'Visa Approved') continue;
      if (refreshVisaFiles_({ leadId: String(v[cols['Lead ID'] - 1]), row: i + 2 }, false, sh, cols)) counted++;
    }
  }
  Logger.log('Approved Visa folders added: ' + made + ' · Visa Files recounted: ' + counted +
    (unfinished ? ' · ⚠️ not finished in time — run setupEliteGlobal again to continue.' : ''));
}

/**
 * Run button: recounts Visa Files now for every visa row at Visa Processing, or Visa Approved whose email has
 * not gone out yet. Logs Lead ID + count only.
 */
function recountVisaFiles() {
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const last = sh.getLastRow();
  const lines = [];
  if (last >= 2) {
    const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
    const data = sh.getRange(2, 1, last - 1, width).getValues();
    const deadline = Date.now() + 300000;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      const get = function (h) { return v[cols[h] - 1]; };
      if (String(get('Lead Category')) !== CONFIG.FORMS.VISA.category) continue;
      const status = String(get('Review Status') || '').trim();
      const emailed = String(get('Last Customer Email') || '').indexOf('Status: Visa Approved ·') !== -1;
      if (status !== 'Visa Processing' && !(status === 'Visa Approved' && !emailed)) continue;
      if (Date.now() > deadline) { lines.push('⚠️ stopped (time limit) — run recountVisaFiles again for the rest'); break; }
      const id = String(get('Lead ID'));
      const scan = refreshVisaFiles_({ leadId: id, row: i + 2 }, false, sh, cols);
      lines.push(id + ': ' + (scan ? scan.files.length + (scan.files.length === 1 ? ' file' : ' files') : 'Drive folder missing'));
    }
  }
  Logger.log('recountVisaFiles — ' + lines.length + ' row(s)' + (lines.length ? ':\n' + lines.join('\n') : ' (none at Visa Processing / Visa Approved waiting for its email)'));
  return lines;
}

// ---------------------------------------------------------------------
// STAGING HELPER (Run button)
// ---------------------------------------------------------------------
/**
 * STAGING ONLY. Puts two generated SPECIMEN visa PDFs (small + ~4.5 MB, "SPECIMEN - NOT A VISA", no personal
 * data) in "Approved Visa" of the newest finished TEST visa lead with an @example.com email and sets Review
 * Status = Visa Approved. Logs the Lead ID only.
 */
function testApproveVisa() {
  const site = settings_().siteUrl;
  if (!/staging/i.test(site)) throw new Error('testApproveVisa is for staging only (SITE_URL is ' + site + ').');
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const last = sh.getLastRow();
  const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
  const data = last > 1 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i];
    const get = function (h) { return v[cols[h] - 1]; };
    if (String(get('Lead Category')) !== CONFIG.FORMS.VISA.category || !isTestLead_(get('Customer Name'), get('Email'))) continue;
    if (!/^Complete:/.test(String(get('Application Status')))) continue;
    const lead = { leadId: String(get('Lead ID')), row: i + 2 };
    const folder = approvedVisaFolder_(leadFolder_(lead), true);
    const it = folder.getFiles();
    while (it.hasNext()) { const f = it.next(); if (/^SPECIMEN-visa-/.test(f.getName())) f.setTrashed(true); } // earlier run → bin
    folder.createFile(Utilities.newBlob(specimenVisaPdf_(1), 'application/pdf', 'SPECIMEN-visa-1.pdf'));
    folder.createFile(Utilities.newBlob(specimenVisaPdf_(2), 'application/pdf', 'SPECIMEN-visa-2.pdf'));
    refreshVisaFiles_(lead, false, sh, cols);
    sh.getRange(lead.row, cols['Review Status']).setValue('Visa Approved');
    sh.getRange(lead.row, cols['Review Updated']).setValue(new Date());
    addDue_(lead.leadId, 'status change (test)');
    Logger.log('Visa Approved set on ' + lead.leadId + ' (2 SPECIMEN files). Open the Track page with this reference.');
    return lead.leadId;
  }
  throw new Error('No finished TEST visa lead with an @example.com email found. Submit one on staging first.');
}
