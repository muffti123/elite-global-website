/**
 * Umrah visa applications (apply-visa.html):
 *   createVisaApplication → Lead ID + upload token
 *   uploadPassenger (one request per passenger, safe to retry)
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
    departureCity: vText_(d.departureCity, true, 'departureCity', 'your departure city'),
    flightTicket: vOneOf_(d.flightTicket, LISTS.YES_NO, true, 'flightTicket', 'whether you have a flight ticket'),
    priorKsa: vOneOf_(d.priorKsa, LISTS.YES_NO, true, 'priorKsa', 'whether you have travelled to Saudi Arabia before'),
    westernVisa: vOneOf_(d.westernVisa, LISTS.YES_NO, false, 'westernVisa', 'whether you hold a UK, US or Schengen visa'),
    extraInfo: vLong_(d.extraInfo),
    heard: vOneOf_(d.heard, LISTS.HEARD, false, 'heard', 'how you heard about us'),
  };
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

  rateLimit_('email:' + a.email);

  const leadId = withLock_(function () { return nextLeadId_(CONFIG.FORMS.VISA.idPrefix); });

  // Drive work happens outside the lock
  const folder = visaRootFolder_().createFolder(leadId + ' – ' + folderSafe_(a.name));
  const token = Utilities.getUuid();
  saveUploadState_(leadId, { t: token, n: list.length, f: folder.getId(), k: codes, u: [], c: Date.now() });

  withLock_(function () {
    appendTrackerRow_({
      leadId: leadId, date: new Date(), name: a.name, phone: a.phone,
      category: CONFIG.FORMS.VISA.category,
      adults: counts[0], children: counts[1], infants: counts[2],
      travelDate: a.travelDate, budget: 'N/A (visa only)',
      folderUrl: folder.getUrl(),
      notesPrefix: uploadTag_(0, list.length) + ' ',
      notes: [
        'Email: ' + a.email,
        'Country: ' + a.country,
        'Departure: ' + a.departureCity,
        'Flight ticket: ' + a.flightTicket,
        'Been to KSA: ' + a.priorKsa,
        'UK/US/Schengen visa: ' + v_(a.westernVisa),
        'Passengers: ' + list.length,
        a.extraInfo ? 'Requests: ' + a.extraInfo : '',
        a.heard ? 'Source: ' + a.heard : '',
      ],
    });
  });

  console.log('createVisaApplication ok ' + leadId + ' passengers=' + list.length);
  return { ok: true, leadId: leadId, token: token, total: list.length };
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
  const old = sub.getFiles();
  while (old.hasNext()) old.next().setTrashed(true);
  const pFile = sub.createFile(Utilities.newBlob(passport.bytes, passport.type.mime, 'passport.' + passport.type.ext));
  const phFile = sub.createFile(Utilities.newBlob(photo.bytes, photo.type.mime, 'photo.' + photo.type.ext));
  const kb = Math.round(photo.bytes.length / 102.4) / 10;

  const cur = withLock_(function () {
    const s = getUploadState_(leadId);
    if (!s) fail_(EXPIRED_MSG);
    if (s.u.indexOf(idx) === -1) s.u.push(idx);
    saveUploadState_(leadId, s);
    upsertPassengerRow_(leadId, idx, [
      leadId, idx, safeCell_(name), cat, kb,
      '=HYPERLINK("' + pFile.getUrl() + '","passport.' + passport.type.ext + '")',
      '=HYPERLINK("' + phFile.getUrl() + '","photo.' + photo.type.ext + '")',
      new Date(),
    ]);
    setTrackerUploadTag_(leadId, uploadTag_(s.u.length, s.n));
    return s;
  });

  console.log('uploadPassenger ok ' + leadId + ' #' + idx + ' passport=' + passport.type.ext + '/' +
    passport.bytes.length + 'B photo=' + photo.type.ext + '/' + photo.bytes.length + 'B');
  return { ok: true, leadId: leadId, index: idx, photoKb: kb, uploaded: cur.u.length, total: cur.n };
}

// ---------------------------------------------------------------------
// ACTION: finalizeVisaApplication
// ---------------------------------------------------------------------
function finalizeVisaApplication_(d) {
  const leadId = str_(d.leadId, 20);
  if (!/^EG-VO-\d{5}$/.test(leadId)) fail_(EXPIRED_MSG);

  // A repeated finalize (e.g. the first reply was lost) is fine once the lead is complete.
  if (!getUploadState_(leadId) && /^\[Complete:/.test(trackerNotes_(leadId))) {
    return { ok: true, leadId: leadId };
  }
  const st = requireUploadState_(leadId, d.token);
  const missing = [];
  for (let i = 1; i <= st.n; i++) if (st.u.indexOf(i) === -1) missing.push(i);
  if (missing.length) {
    fail_('Some passengers have not finished uploading (' + missing.join(', ') + '). Please retry them.',
      null, { missing: missing });
  }
  withLock_(function () {
    setTrackerUploadTag_(leadId, '[Complete: ' + st.n + (st.n === 1 ? ' passenger]' : ' passengers]'));
    deleteUploadState_(leadId);
  });
  console.log('finalizeVisaApplication ok ' + leadId);
  return { ok: true, leadId: leadId };
}

// ---------------------------------------------------------------------
// UPLOAD STATE (Script Properties: UPLOAD_<LeadID>)
// {t: token, n: passengers, f: folderId, k: category codes, u: uploaded indexes, c: created ms}
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

/** Writes or replaces the Visa Passengers row for (leadId, index). Call inside withLock_. */
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
  if (!row) row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, values.length).setValues([values]);
}

function uploadTag_(done, total) { return '[Uploading ' + done + '/' + total + ']'; }

function trackerNotes_(leadId) {
  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  return row ? String(sh.getRange(row, CONFIG.NOTES_COL).getValue()) : '';
}

/** Replaces the [Uploading k/N] / [Complete: N passengers] tag at the start of the tracker notes. */
function setTrackerUploadTag_(leadId, tag) {
  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  if (!row) return;
  const cell = sh.getRange(row, CONFIG.NOTES_COL);
  const rest = String(cell.getValue()).replace(/^\[(Uploading \d+\/\d+|Complete: \d+ passengers?)\]\s*/, '');
  cell.setValue(tag + ' ' + rest);
}
