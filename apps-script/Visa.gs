/**
 * Umrah visa applications (apply-visa.html):
 *   createVisaApplication → Lead ID + upload token
 *   uploadPassenger (one request per passenger, safe to retry)
 *   uploadDocument  (optional flight ticket / hotel booking: per passenger, or once for all)
 *   finalizeVisaApplication
 * Upload state lives in Script Properties under UPLOAD_<LeadID> until finalize, or until
 * purgeStaleUploads_() removes it after 24 h. Never log names, answers or file contents.
 */

const EXPIRED_MSG = 'This application has expired or could not be found. Please start a new application.';

// ---------------------------------------------------------------------
// ACTION: createVisaApplication
// ---------------------------------------------------------------------
function createVisaApplication_(d) {
  const CATS = LISTS.PASSENGER_CATEGORIES;
  const a = {
    name: vName_(d.name, 'name'),
    phone: vPhone_(d.phone, 'phone'),
    email: vEmail_(d.email, 'email'),
    country: vOneOf_(d.country, COUNTRIES, true, 'country', 'your country of residence'),
    travelDate: vDate_(d.travelDate, true, 'travelDate', 'your preferred travel date'),
    flightTicket: vOneOf_(d.flightTicket, LISTS.YES_NO, true, 'flightTicket', 'whether you have a flight ticket'),
    priorKsa: vOneOf_(d.priorKsa, LISTS.YES_NO, true, 'priorKsa', 'whether you have travelled to Saudi Arabia before'),
    westernVisa: vOneOf_(d.westernVisa, LISTS.YES_NO, false, 'westernVisa', 'whether you hold a UK, US or Schengen visa'),
    extraInfo: vLong_(d.extraInfo),
    heard: vOneOf_(d.heard, LISTS.HEARD, false, 'heard', 'how you heard about us'),
  };
  a.departureAirport = vAirport_(d.departureAirport, d.departureAirportOther, a.country);
  if (d.consent !== true) fail_('Please tick the declaration to submit your application.', 'consent');

  const list = d.passengers;
  if (!Array.isArray(list) || list.length < 1) fail_('Please add at least one passenger.', 'passengers');
  if (list.length > CONFIG.LIMITS.MAX_PASSENGERS) {
    fail_('You can add up to ' + CONFIG.LIMITS.MAX_PASSENGERS + ' passengers per application.', 'passengers');
  }
  const counts = [0, 0, 0];
  const codes = list.map(function (p, i) {
    p = p || {};
    vName_(p.name, 'passengers', 'the full name of passenger ' + (i + 1));
    const c = CATS.indexOf(vOneOf_(p.category, CATS, true, 'passengers', 'a category for passenger ' + (i + 1)));
    counts[c] += 1;
    return String(c);
  }).join('');

  const docs = docsDeclared_(d.docs, list.length);
  requireEmailToken_(d.emailToken, a.email);
  // Submission key: a retried create returns the first reply (same Lead ID + upload token), never a second lead
  const sk = sidKey_(d.sid);
  const again = sk && CacheService.getScriptCache().get(sk);
  if (again && again !== 'pending') { console.log('createVisaApplication replay'); return JSON.parse(again); }
  rateLimit_('email:' + a.email);

  const state = { claimed: false };
  return sidGuard_(sk, function () { return state.claimed; }, function () {
  // Lock 1 (tiny): sid claim + Lead ID — the folder name needs the ID, and no tracker row exists without a folder
  let replay = null;
  const leadId = withLock_(function () {
    replay = claimSid_(sk);
    if (replay) return '';
    state.claimed = !!sk;
    return nextLeadId_(CONFIG.FORMS.VISA.idPrefix);
  });
  if (replay) { console.log('createVisaApplication replay'); return replay; }

  // Drive work happens outside the lock
  const folder = visaRootFolder_().createFolder(leadId + ' – ' + folderSafe_(a.name));
  const folderUrl = folder.getUrl();
  const token = Utilities.getUuid();
  saveUploadState_(leadId, { t: token, n: list.length, f: folder.getId(), k: codes, u: [], c: Date.now(), d: docs, dd: [], sl: {} });

  // Lock 2: the tracker row only
  const made = createLeadRow_({ leadId: leadId }, function () {
    return {
      name: a.name, phone: a.phone, category: CONFIG.FORMS.VISA.category,
      adults: counts[0], children: counts[1], infants: counts[2],
      travelDate: a.travelDate, budget: 'N/A (visa only)', folderUrl: folderUrl,
      email: a.email, country: a.country, departure: a.departureAirport,
      passengers: list.length, source: a.heard,
      status: CONFIG.STATUS.uploading(0, list.length),
    };
  });
  // Visa Applications row (appendRow: atomic, no lock), the folder link written in the same call
  const tab = CONFIG.TABS.VISA;
  const vrow = [
    leadId, made.now, a.name, a.phone, a.email, a.country, parseDate_(a.travelDate), a.departureAirport,
    a.flightTicket, a.priorKsa, a.westernVisa, list.length, counts[0], counts[1], counts[2],
    '', '', a.extraInfo, a.heard, '',
  ];
  vrow[tab.folderCol - 1] = '=HYPERLINK("' + folderUrl + '","📁 ' + leadId + '")';
  appendDetailRow_(tab, vrow, [tab.folderCol]);

  console.log('createVisaApplication ok ' + leadId + ' passengers=' + list.length);
  const out = { ok: true, leadId: leadId, token: token, total: list.length };
  storeSid_(sk, out); // server side only (CacheService); the upload token is never logged
  return out;
  });
}

// ---------------------------------------------------------------------
// ACTION: uploadPassenger — one passenger per request; repeating it replaces the files
// ---------------------------------------------------------------------
function uploadPassenger_(d) {
  const CATS = LISTS.PASSENGER_CATEGORIES;
  const L = CONFIG.LIMITS;
  const leadId = str_(d.leadId, 20);
  const st = requireUploadState_(leadId, d.token);

  const idx = Number(d.index);
  if (!Number.isInteger(idx) || idx < 1 || idx > st.n) fail_('Invalid passenger number.', 'index');
  const name = vName_(d.name, 'name', 'the passenger\'s full name');
  const cat = vOneOf_(d.category, CATS, true, 'category', 'a passenger category');
  if (String(CATS.indexOf(cat)) !== st.k.charAt(idx - 1)) {
    fail_('The passenger category does not match your application. Please start a new application.', 'category');
  }

  const passport = checkFile_(d.passport, ['pdf', 'jpg', 'png'], 'passport', 'the passport file');
  if (passport.type.ext === 'pdf' && passport.bytes.length > L.PDF_MAX) {
    fail_('The passport PDF must be 5 MB or smaller.', 'passport');
  }
  if (passport.type.ext !== 'pdf' && passport.bytes.length > L.PASSPORT_IMG_MAX) {
    fail_('The passport image is too large. Please choose it again so it can be resized.', 'passport');
  }
  const photo = checkFile_(d.photo, ['jpg', 'png'], 'photo', 'the passport photograph');
  if (photo.bytes.length < L.PHOTO_MIN) fail_('The photo is smaller than 25 KB. Please choose a clearer photo.', 'photo');
  if (photo.bytes.length > L.PHOTO_MAX) fail_('The photo must be between 25 KB and 50 KB.', 'photo');

  // Drive work (outside the lock). Existing files for this passenger are replaced.
  const nn = ('0' + idx).slice(-2);
  const sub = passengerFolder_(DriveApp.getFolderById(st.f), nn, name);
  trashNamed_(sub, ['passport', 'photo']);
  const pFile = sub.createFile(Utilities.newBlob(passport.bytes, passport.type.mime, 'passport.' + passport.type.ext));
  const phFile = sub.createFile(Utilities.newBlob(photo.bytes, photo.type.mime, 'photo.' + photo.type.ext));
  const kb = Math.round(photo.bytes.length / 102.4) / 10;

  const cur = withLock_(function () {
    const s = getUploadState_(leadId);
    if (!s) fail_(EXPIRED_MSG);
    if (s.u.indexOf(idx) === -1) s.u.push(idx);
    saveUploadState_(leadId, s);
    const shared = function (c) { return s.sl && s.sl[c] ? sharedLink_(s.sl[c]) : undefined; };
    upsertPassengerRow_(leadId, idx, [
      leadId, idx, safeCell_(name), cat, kb,
      '=HYPERLINK("' + pFile.getUrl() + '","passport.' + passport.type.ext + '")',
      '=HYPERLINK("' + phFile.getUrl() + '","photo.' + photo.type.ext + '")',
      new Date(), shared('t'), shared('h'),
    ]);
    setApplicationStatus_(leadId, CONFIG.STATUS.uploading(s.u.length, s.n));
    return s;
  });

  console.log('uploadPassenger ok ' + leadId + ' #' + idx + ' passport=' + passport.type.ext + '/' +
    passport.bytes.length + 'B photo=' + photo.type.ext + '/' + photo.bytes.length + 'B');
  return { ok: true, leadId: leadId, index: idx, photoKb: kb, uploaded: cur.u.length, total: cur.n };
}

// ---------------------------------------------------------------------
// ACTION: uploadDocument — optional flight ticket / hotel booking. scope "all" stores one file at the
// application folder root for every passenger; scope N stores it in "NN – name/". Repeating replaces it.
// ---------------------------------------------------------------------
function uploadDocument_(d) {
  const L = CONFIG.LIMITS;
  const leadId = str_(d.leadId, 20);
  const st = requireUploadState_(leadId, d.token);
  const code = d.kind === 'ticket' ? 't' : d.kind === 'hotel' ? 'h' : fail_('Invalid document type.', 'kind');
  const doc = CONFIG.DOCS[code];
  const scope = d.scope === 'all' ? 0 : Number(d.scope);
  if (!Number.isInteger(scope) || scope < 0 || scope > st.n) fail_('Invalid passenger number.', 'scope');
  if (!docDeclared_(st, scope, code)) {
    fail_('This document was not part of your application. Please start a new application.', 'kind');
  }
  const file = checkFile_(d.file, ['pdf', 'jpg', 'png'], 'file', doc.label);
  if (file.type.ext === 'pdf' && file.bytes.length > L.DOC_PDF_MAX) fail_('PDF files must be 5 MB or smaller.', 'file');
  if (file.type.ext !== 'pdf' && file.bytes.length > L.DOC_IMG_MAX) {
    fail_('The image is too large. Please choose it again so it can be resized.', 'file');
  }

  // Drive work (outside the lock)
  const app = DriveApp.getFolderById(st.f);
  const nn = ('0' + scope).slice(-2);
  const folder = scope === 0 ? app : passengerFolder_(app, nn, vName_(d.name, 'name', 'the passenger\'s full name'));
  trashNamed_(folder, [doc.file]);
  const name = doc.file + '.' + file.type.ext;
  const f = folder.createFile(Utilities.newBlob(file.bytes, file.type.mime, name));

  withLock_(function () {
    const s = getUploadState_(leadId);
    if (!s) fail_(EXPIRED_MSG);
    s.dd = s.dd || [];
    if (s.dd.indexOf(scope + code) === -1) s.dd.push(scope + code);
    if (scope === 0) { s.sl = s.sl || {}; s.sl[code] = [f.getUrl(), name]; }
    saveUploadState_(leadId, s);
    const ss = trackerSS_();
    if (scope === 0) {
      // Visa Applications: Shared … column; Visa Passengers: every passenger row of this lead
      const tab = CONFIG.TABS.VISA;
      const va = ss.getSheetByName(tab.name);
      const row = va ? findLeadRow_(va, leadId) : 0;
      if (row) va.getRange(row, tab.sharedCols[code]).setFormula('=HYPERLINK("' + f.getUrl() + '","' + name + '")');
      const ps = ss.getSheetByName(CONFIG.TABS.PASSENGERS.name);
      const col = CONFIG.TABS.PASSENGERS.headers.indexOf(doc.col) + 1;
      if (ps && ps.getLastRow() > 1) {
        ps.getRange(2, 1, ps.getLastRow() - 1, 1).createTextFinder(leadId).matchEntireCell(true).findAll()
          .forEach(function (h) { ps.getRange(h.getRow(), col).setFormula(sharedLink_(s.sl[code])); });
      }
    } else {
      const v = new Array(CONFIG.TABS.PASSENGERS.headers.length);
      v[0] = leadId; v[1] = scope;
      v[CONFIG.TABS.PASSENGERS.headers.indexOf(doc.col)] = '=HYPERLINK("' + f.getUrl() + '","' + name + '")';
      upsertPassengerRow_(leadId, scope, v);
    }
  });
  console.log('uploadDocument ok ' + leadId + ' ' + (scope || 'all') + '/' + code + ' ' + file.type.ext + '/' + file.bytes.length + 'B');
  return { ok: true, leadId: leadId, scope: scope || 'all', kind: doc.kind };
}

// ---------------------------------------------------------------------
// ACTION: finalizeVisaApplication
// ---------------------------------------------------------------------
function finalizeVisaApplication_(d) {
  const leadId = str_(d.leadId, 20);
  if (!/^EG-VO-\d{5}$/.test(leadId)) fail_(EXPIRED_MSG);

  // A repeated finalize (e.g. the first reply was lost) is fine once the lead is complete.
  if (!getUploadState_(leadId) && isComplete_(leadId)) {
    return { ok: true, leadId: leadId };
  }
  const st = requireUploadState_(leadId, d.token);
  const missing = [];
  for (let i = 1; i <= st.n; i++) if (st.u.indexOf(i) === -1) missing.push(i);
  // declared documents (0 = the shared documents)
  docsMissing_(st).forEach(function (i) { if (missing.indexOf(i) === -1) missing.push(i); });
  missing.sort(function (x, y) { return x - y; });
  if (missing.length) {
    fail_('Some uploads have not finished (' + missing.map(function (i) { return i || 'shared documents'; }).join(', ') + '). Please retry them.',
      null, { missing: missing });
  }
  withLock_(function () {
    setApplicationStatus_(leadId, CONFIG.STATUS.complete(st.n));
    setReviewStatus_(leadId, 'Under Review'); // review workflow starts; Lead Status is untouched
    deleteUploadState_(leadId);
  });
  // Where staff will put the approved visa (VisaDelivery.gs)
  try { approvedVisaFolder_(DriveApp.getFolderById(st.f), true); } catch (e) { console.error('Approved Visa folder: ' + e.message); }
  console.log('finalizeVisaApplication ok ' + leadId);

  // Emails never fail the application: staff alert + one combined "received + under review" email
  const res = { ok: true, leadId: leadId };
  const lead = leadFromTracker_(leadId);
  if (lead) {
    try { lead.folderUrl = DriveApp.getFolderById(st.f).getUrl(); } catch (e) { lead.folderUrl = ''; }
    lead.kind = 'visa';
    notifyNewLead_(lead);
    res.emailed = sendConfirmation_(lead);
  }
  return res;
}

// ---------------------------------------------------------------------
// OPTIONAL DOCUMENTS
// Upload state d: one digit per slot (slot 0 = shared, 1…n = passengers): 0 none, 1 ticket, 2 hotel,
// 3 both. dd: uploaded keys such as "0t", "3h". sl: shared file {t|h: [url, name]}.
// ---------------------------------------------------------------------
/** Validates the optional {shared:{ticket,hotel}, passengers:[{ticket,hotel}]} declaration → digits. */
function docsDeclared_(docs, n) {
  if (docs === undefined || docs === null) return '0'.repeat(n + 1);
  if (typeof docs !== 'object') fail_('Invalid request.');
  const sh = docs.shared || {};
  const pax = Array.isArray(docs.passengers) ? docs.passengers : [];
  if (pax.length && pax.length !== n) fail_('Invalid request.');
  const digit = function (o, skip) {
    o = o || {};
    return String((o.ticket === true && !skip.t ? 1 : 0) + (o.hotel === true && !skip.h ? 2 : 0));
  };
  const shared = { t: sh.ticket === true, h: sh.hotel === true };
  let out = digit(sh, {});
  for (let i = 0; i < n; i++) out += digit(pax[i], shared); // a shared document is stored once only
  return out;
}

function docDeclared_(st, slot, code) {
  const v = Number(String(st.d || '').charAt(slot) || 0);
  return code === 't' ? (v & 1) === 1 : (v & 2) === 2;
}

/** Slots (0 = shared) with a declared document that has not arrived yet. */
function docsMissing_(st) {
  const out = [];
  const d = String(st.d || '');
  for (let slot = 0; slot < d.length; slot++) {
    ['t', 'h'].forEach(function (c) {
      if (docDeclared_(st, slot, c) && (st.dd || []).indexOf(slot + c) === -1 && out.indexOf(slot) === -1) out.push(slot);
    });
  }
  return out;
}

function sharedLink_(entry) { return '=HYPERLINK("' + entry[0] + '","' + entry[1] + ' (all passengers)")'; }

/** Moves files called <base>.<ext> (any extension) in the folder to the bin, for each base. */
function trashNamed_(folder, bases) {
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const base = String(f.getName()).replace(/\.[^.]*$/, '');
    if (bases.indexOf(base) !== -1) f.setTrashed(true);
  }
}

// ---------------------------------------------------------------------
// UPLOAD STATE (Script Properties: UPLOAD_<LeadID>)
// {t: token, n: passengers, f: folderId, k: category codes, u: uploaded indexes, c: created ms,
//  d / dd / sl: optional documents (see above)}
// ---------------------------------------------------------------------
function uploadKey_(leadId) { return 'UPLOAD_' + leadId; }

function getUploadState_(leadId) {
  const raw = PropertiesService.getScriptProperties().getProperty(uploadKey_(leadId));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function saveUploadState_(leadId, st) {
  PropertiesService.getScriptProperties().setProperty(uploadKey_(leadId), JSON.stringify(st));
}

function deleteUploadState_(leadId) {
  PropertiesService.getScriptProperties().deleteProperty(uploadKey_(leadId));
}

/** Valid, unexpired state whose token matches, or a friendly error. */
function requireUploadState_(leadId, token) {
  if (!/^EG-VO-\d{5}$/.test(leadId)) fail_(EXPIRED_MSG);
  const st = getUploadState_(leadId);
  if (!st || typeof token !== 'string' || token !== st.t) fail_(EXPIRED_MSG);
  if (Date.now() - st.c > CONFIG.LIMITS.UPLOAD_TTL_MS) {
    deleteUploadState_(leadId);
    fail_(EXPIRED_MSG);
  }
  return st;
}

/** Deletes upload state older than 24 h (abandoned applications). Tracker rows and folders stay. */
function purgeStaleUploads_() {
  const p = PropertiesService.getScriptProperties();
  const all = p.getProperties();
  let removed = 0;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('UPLOAD_') !== 0) return;
    let created = 0;
    try { created = JSON.parse(all[key]).c; } catch (e) { created = 0; }
    if (!created || Date.now() - created > CONFIG.LIMITS.UPLOAD_TTL_MS) {
      p.deleteProperty(key);
      removed++;
      try { markExpired_(key.slice('UPLOAD_'.length)); } catch (e) { /* tracker row gone */ }
    }
  });
  Logger.log('Upload state: removed ' + removed + ' entr' + (removed === 1 ? 'y' : 'ies') + ' older than 24 h.');
  return removed;
}

/**
 * TEST ONLY — run from the editor. Makes an unfinished application look 25 h old so the
 * 24 h purge can be tested. Not reachable from the web app.
 */
function testBackdateUpload(leadId) {
  const st = getUploadState_(leadId);
  if (!st) throw new Error('No upload state for ' + leadId + '. Start a TEST visa application and stop after it is created.');
  st.c = Date.now() - 25 * 60 * 60 * 1000;
  saveUploadState_(leadId, st);
  Logger.log('Upload state for ' + leadId + ' backdated by 25 h.');
}

// ---------------------------------------------------------------------
// DRIVE + SHEET HELPERS
// ---------------------------------------------------------------------
function visaRootFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('VISA_FOLDER_ID');
  if (!id) throw new Error('Setup has not been run (no VISA_FOLDER_ID).');
  return DriveApp.getFolderById(id);
}

function folderSafe_(name) {
  return String(name).replace(/[\\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** The "NN – name" folder for a passenger, reused on retry (renamed if the name changed). */
function passengerFolder_(appFolder, nn, name) {
  const wanted = nn + ' – ' + folderSafe_(name);
  const it = appFolder.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(nn + ' – ') === 0) {
      if (f.getName() !== wanted) f.setName(wanted);
      return f;
    }
  }
  return appFolder.createFolder(wanted);
}

/**
 * Writes the Visa Passengers row for (leadId, index). Call inside withLock_.
 * undefined entries keep what is already in the row (e.g. a document uploaded separately).
 */
function upsertPassengerRow_(leadId, idx, values) {
  const sh = trackerSS_().getSheetByName(CONFIG.TABS.PASSENGERS.name);
  if (!sh) throw new Error('Tab "' + CONFIG.TABS.PASSENGERS.name + '" is missing. Run setupEliteGlobal().');
  let row = 0;
  if (sh.getLastRow() > 1) {
    const hits = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
      .createTextFinder(leadId).matchEntireCell(true).findAll();
    for (let i = 0; i < hits.length && !row; i++) {
      if (Number(sh.getRange(hits[i].getRow(), 2).getValue()) === idx) row = hits[i].getRow();
    }
  }
  const range = row ? sh.getRange(row, 1, 1, values.length) : sh.getRange(sh.getLastRow() + 1, 1, 1, values.length);
  const cur = row ? range.getValues()[0] : [];
  range.setValues([values.map(function (v, i) { return v === undefined ? (row ? cur[i] : '') : v; })]);
}

/**
 * True when the application finished: Application Status "Complete: …", or (applications that
 * were finished before v3) the old "[Complete: …]" tag at the start of Follow-up Notes.
 */
function isComplete_(leadId) {
  if (/^Complete:/.test(applicationStatus_(leadId))) return true;
  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  return row ? /^\[Complete:/.test(String(sh.getRange(row, CONFIG.NOTES_COL).getValue())) : false;
}

/** Abandoned application (upload state purged after 24 h): status → Expired, unless it completed. */
function markExpired_(leadId) {
  if (!/^EG-VO-\d{5}$/.test(leadId) || isComplete_(leadId)) return;
  setApplicationStatus_(leadId, CONFIG.STATUS.EXPIRED);
}
