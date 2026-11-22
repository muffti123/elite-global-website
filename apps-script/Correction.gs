/**
 * Self-service corrections (track.html → correct-visa.html), for visa leads whose Review Status is
 * "Correction Needed" (one correction round = one Review Updated time of that status):
 *   sendCorrectionCode {session}          → code to the email ON THE APPLICATION; reply: masked address only
 *   verifyCorrectionCode {session, code}  → correction token (60 min, this Lead ID + round, used once at submit)
 *   loadCorrection {ctoken}               → answers, passengers (names, categories) and which files exist
 *                                           (file type only — files are never sent back to the browser)
 *   uploadCorrectionFile {ctoken, slot, kind, file} → one replacement per request, kept in
 *                                           "Correction (pending)" until submit (retry-safe: a repeat replaces it)
 *   submitCorrection {ctoken, answers, passengers} → old files to "Replaced <date>" (never deleted), new files
 *                                           in place, tracker updated, Notes line, Review Status → Correction
 *                                           Received (the normal status email follows), staff alert at once
 *
 *  - State: Script Property CORR_<LeadID> = {j: token id, x: expiry ms, r: round ms, f: pending folder id,
 *    s: {"<slot>:<kind>": {id, ext, kb}}}. A new code replaces it; submit deletes it (single use).
 *    Expired state: its pending folder goes to the Drive bin (runEmailJobs / cleanupTestData / setup).
 *  - Email and phone cannot be changed here. Never log the email, name, code or token.
 */

const CORRECTION_ACTIONS = ['sendCorrectionCode', 'verifyCorrectionCode', 'loadCorrection', 'uploadCorrectionFile', 'submitCorrection'];
const CORR_NOT_NEEDED = 'This application does not need a correction at the moment. Please look it up again to see its current status.';
const CORR_ENDED = 'Your correction session has ended. Please go back to the Track page and confirm your email again.';
const CORR_KINDS = { passport: 'passport', photo: 'photo', ticket: 'flight-ticket', hotel: 'hotel-booking' };
const CORR_LABEL = { passport: 'passport', photo: 'photo', ticket: 'flight ticket', hotel: 'hotel booking' };

/** Round (Review Updated ms) when the lead can be corrected now: visa, not Lost, Review Status Correction Needed. Else 0. */
function correctionRound_(lead) {
  if (String(lead.get('Lead Category') || '') !== CONFIG.FORMS.VISA.category) return 0;
  if (String(lead.get('Lead Status') || '').trim() === 'Lost') return 0;
  if (String(lead.get('Review Status') || '').trim() !== 'Correction Needed') return 0;
  const u = lead.get('Review Updated');
  return u instanceof Date && !isNaN(u) ? u.getTime() : 0;
}

/** a•••@g•••.com */
function maskEmail_(email) {
  const at = email.lastIndexOf('@');
  const dom = email.slice(at + 1), dot = dom.lastIndexOf('.');
  return email.charAt(0) + '•••@' + dom.charAt(0) + '•••' + (dot > 0 ? dom.slice(dot) : '');
}

function corrKey_(leadId) { return 'CORR_' + leadId; }
function getCorrection_(leadId) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(corrKey_(leadId)) || 'null'); } catch (e) { return null; }
}
function saveCorrection_(leadId, st) { PropertiesService.getScriptProperties().setProperty(corrKey_(leadId), JSON.stringify(st)); }

/** Ends a correction state: its pending replacements go to the Drive bin (originals are never touched). */
function dropCorrection_(leadId, st) {
  if (st && st.f) { try { DriveApp.getFolderById(st.f).setTrashed(true); } catch (e) { /* already gone */ } }
  PropertiesService.getScriptProperties().deleteProperty(corrKey_(leadId));
}

// ---------------------------------------------------------------------
// ACTIONS: sendCorrectionCode / verifyCorrectionCode (step-up check with the stored email)
// ---------------------------------------------------------------------
function correctionLead_(session) {
  const s = requireSession_(session);
  const lead = trackRow_(s.leadId);
  if (!lead) fail_(SESSION_ENDED, null, { relogin: true });
  const round = correctionRound_(lead);
  if (!round) fail_(CORR_NOT_NEEDED, null, { relogin: true });
  const email = String(lead.get('Email') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) fail_('We cannot send a code for this application. Please contact us on WhatsApp.');
  return { lead: lead, round: round, email: email, scope: 'corr|' + lead.leadId + '|' + email };
}

function sendCorrectionCode_(d) {
  const c = correctionLead_(d.session);
  const bypass = testBypassOn_() && isTestLead_(c.lead.get('Customer Name'), c.email);
  issueCode_(c.scope, c.email, bypass, 'code');
  console.log('sendCorrectionCode ' + (bypass ? 'test' : 'sent'));
  return { ok: true, masked: maskEmail_(c.email), resendIn: CONFIG.OTP.RESEND_S };
}

function verifyCorrectionCode_(d) {
  const c = correctionLead_(d.session);
  checkCode_(c.scope, d.code, 'verifyCorrectionCode');
  const leadId = c.lead.leadId;
  const st = { j: Utilities.getUuid().replace(/-/g, ''), x: Date.now() + CONFIG.CORRECTION.TOKEN_MIN * 60000, r: c.round, f: '', s: {}, c: Date.now() };
  withLock_(function () {
    dropCorrection_(leadId, getCorrection_(leadId)); // an earlier, unfinished correction ends here
    saveCorrection_(leadId, st);
  });
  const body = st.x + '.' + leadId + '.' + st.j;
  console.log('verifyCorrectionCode ok');
  return { ok: true, ctoken: body + '.' + tokenSig_('corr|' + body), minutes: CONFIG.CORRECTION.TOKEN_MIN };
}

/** The correction state for a valid token whose round is still open, plus the lead. Otherwise a restart error. */
function requireCorrection_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || !/^\d{13}$/.test(parts[0]) || !/^EG-VO-\d{5}$/.test(parts[1])) fail_(CORR_ENDED, null, { restart: true });
  const body = parts[0] + '.' + parts[1] + '.' + parts[2];
  if (tokenSig_('corr|' + body) !== parts[3] || Number(parts[0]) < Date.now()) fail_(CORR_ENDED, null, { restart: true });
  const leadId = parts[1];
  const st = getCorrection_(leadId);
  if (!st || st.j !== parts[2] || st.x < Date.now()) fail_(CORR_ENDED, null, { restart: true });
  const lead = trackRow_(leadId);
  if (!lead || correctionRound_(lead) !== st.r) fail_(CORR_NOT_NEEDED, null, { restart: true });
  return { leadId: leadId, st: st, lead: lead };
}

// ---------------------------------------------------------------------
// APPLICATION DATA (Visa Applications, Visa Passengers, Drive)
// ---------------------------------------------------------------------
function visaAppRow_(leadId) {
  const tab = CONFIG.TABS.VISA;
  const sh = trackerSS_().getSheetByName(tab.name);
  const row = sh ? findLeadRow_(sh, leadId) : 0;
  if (!row) throw new Error('Visa Applications row missing');
  return { sh: sh, row: row, v: sh.getRange(row, 1, 1, tab.headers.length).getValues()[0] };
}

/** Visa Passengers rows of a lead, by No.: [{index, row, name, category}]. */
function passengerRows_(leadId) {
  const sh = trackerSS_().getSheetByName(CONFIG.TABS.PASSENGERS.name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(leadId).matchEntireCell(true).findAll()
    .map(function (h) {
      const v = sh.getRange(h.getRow(), 1, 1, 4).getValues()[0];
      return { index: Number(v[1]), row: h.getRow(), name: String(v[2] || '').replace(/^'/, ''), category: String(v[3] || '') };
    })
    .filter(function (p) { return p.index >= 1; })
    .sort(function (a, b) { return a.index - b.index; });
}

/** The lead's Drive folder (from the Drive Folder link, or by name under Visa Applications). */
function leadFolder_(lead) {
  const sh = trackerSheet_();
  const f = String(sh.getRange(lead.row, CONFIG.FOLDER_COL).getFormula() || '');
  const m = /\/folders\/([\w-]+)/.exec(f);
  if (m) { try { return DriveApp.getFolderById(m[1]); } catch (e) { /* fall through */ } }
  const it = visaRootFolder_().getFolders();
  while (it.hasNext()) {
    const x = it.next();
    if (x.getName().indexOf(lead.leadId + ' – ') === 0) return x;
  }
  throw new Error('Drive folder missing');
}

/** {base: extension} of the files directly in a folder. */
function filesIn_(folder) {
  const out = {};
  const it = folder.getFiles();
  while (it.hasNext()) {
    const m = /^(.*)\.([a-z0-9]+)$/i.exec(it.next().getName());
    if (m) out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

/** "NN – …" passenger folders of an application folder, by number. */
function paxFolders_(app) {
  const out = {};
  const it = app.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    const m = /^(\d\d) – /.exec(f.getName());
    if (m) out[Number(m[1])] = f;
  }
  return out;
}

function airportParts_(label) {
  const s = String(label || '');
  if (s.indexOf('Other: ') === 0) return { code: 'OTHER', other: s.slice(7) };
  const m = /\(([A-Z0-9]{3,4})\)$/.exec(s);
  return { code: m ? m[1] : '', other: '' };
}

function isoDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'Africa/Lagos', 'yyyy-MM-dd');
  const s = String(v || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

// ---------------------------------------------------------------------
// ACTION: loadCorrection {ctoken}
// ---------------------------------------------------------------------
function loadCorrection_(d) {
  const c = requireCorrection_(d.ctoken);
  const lead = c.lead;
  const va = visaAppRow_(c.leadId).v;
  const air = airportParts_(va[7]);
  const app = leadFolder_(lead);
  const pf = paxFolders_(app);
  const docs = function (files) { return { ticket: files['flight-ticket'] || '', hotel: files['hotel-booking'] || '' }; };
  const passengers = passengerRows_(c.leadId).map(function (p) {
    const files = pf[p.index] ? filesIn_(pf[p.index]) : {};
    const dd = docs(files);
    return { index: p.index, name: p.name, category: p.category,
      files: { passport: files.passport || '', photo: files.photo || '', ticket: dd.ticket, hotel: dd.hotel } };
  });
  const forWhat = String(lead.get('Correction For') || '').trim();
  console.log('loadCorrection ok ' + c.leadId);
  return {
    ok: true,
    leadId: c.leadId,
    message: cleanMessage_(lead.get('Message to Customer')),
    correctionFor: CONFIG.CORRECTION_FOR.indexOf(forWhat) !== -1 ? forWhat : '',
    email: maskEmail_(String(lead.get('Email') || '').trim().toLowerCase()),
    minutesLeft: Math.max(1, Math.floor((c.st.x - Date.now()) / 60000)),
    answers: {
      name: String(va[2] || '').replace(/^'/, ''), country: String(va[5] || ''), travelDate: isoDate_(va[6]),
      departureAirport: air.code, departureAirportOther: air.other,
      flightTicket: String(va[8] || ''), priorKsa: String(va[9] || ''), westernVisa: String(va[10] || ''),
      extraInfo: String(va[17] || '').replace(/^'/, ''),
    },
    passengers: passengers,
    shared: docs(filesIn_(app)),
  };
}

// ---------------------------------------------------------------------
// ACTION: uploadCorrectionFile {ctoken, slot, kind, file} — slot 0 = the shared documents, 1…n = passengers
// ---------------------------------------------------------------------
function uploadCorrectionFile_(d) {
  const L = CONFIG.LIMITS;
  const c = requireCorrection_(d.ctoken);
  const kind = Object.prototype.hasOwnProperty.call(CORR_KINDS, d.kind) ? d.kind : fail_('Invalid document type.', 'kind');
  const n = passengerRows_(c.leadId).length;
  const slot = Number(d.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot > n || (slot === 0 && (kind === 'passport' || kind === 'photo'))) {
    fail_('Invalid passenger number.', 'slot');
  }
  let file, kb = '';
  if (kind === 'passport') {
    file = checkFile_(d.file, ['pdf', 'jpg', 'png'], 'file', 'the passport file');
    if (file.type.ext === 'pdf' && file.bytes.length > L.PDF_MAX) fail_('The passport PDF must be 5 MB or smaller.', 'file');
    if (file.type.ext !== 'pdf' && file.bytes.length > L.PASSPORT_IMG_MAX) fail_('The passport image is too large. Please choose it again so it can be resized.', 'file');
  } else if (kind === 'photo') {
    file = checkFile_(d.file, ['jpg', 'png'], 'file', 'the passport photograph');
    if (file.bytes.length < L.PHOTO_MIN) fail_('The photo is smaller than 25 KB. Please choose a clearer photo.', 'file');
    if (file.bytes.length > L.PHOTO_MAX) fail_('The photo must be between 25 KB and 50 KB.', 'file');
    kb = Math.round(file.bytes.length / 102.4) / 10;
  } else {
    file = checkFile_(d.file, ['pdf', 'jpg', 'png'], 'file', kind === 'ticket' ? 'the flight ticket' : 'the hotel booking');
    if (file.type.ext === 'pdf' && file.bytes.length > L.DOC_PDF_MAX) fail_('PDF files must be 5 MB or smaller.', 'file');
    if (file.type.ext !== 'pdf' && file.bytes.length > L.DOC_IMG_MAX) fail_('The image is too large. Please choose it again so it can be resized.', 'file');
  }
  const key = slot + ':' + kind;
  withLock_(function () {
    const st = getCorrection_(c.leadId);
    if (!st || st.j !== c.st.j) fail_(CORR_ENDED, null, { restart: true });
    let pending = null;
    if (st.f) { try { pending = DriveApp.getFolderById(st.f); } catch (e) { pending = null; } }
    if (!pending) { pending = leadFolder_(c.lead).createFolder(CONFIG.CORRECTION.PENDING_FOLDER); st.f = pending.getId(); }
    if (st.s[key]) { try { DriveApp.getFileById(st.s[key].id).setTrashed(true); } catch (e) { /* gone */ } } // a retry replaces it
    const f = pending.createFile(Utilities.newBlob(file.bytes, file.type.mime, ('0' + slot).slice(-2) + '-' + CORR_KINDS[kind] + '.' + file.type.ext));
    st.s[key] = { id: f.getId(), ext: file.type.ext, kb: kb };
    saveCorrection_(c.leadId, st);
  });
  console.log('uploadCorrectionFile ok ' + c.leadId + ' ' + key + ' ' + file.type.ext + '/' + file.bytes.length + 'B');
  return { ok: true, slot: slot, kind: kind, photoKb: kb || undefined };
}

// ---------------------------------------------------------------------
// ACTION: submitCorrection {ctoken, answers, passengers: [{index, name, category}]}
// ---------------------------------------------------------------------
function submitCorrection_(d) {
  const CATS = LISTS.PASSENGER_CATEGORIES;
  const result = withLock_(function () {
    const c = requireCorrection_(d.ctoken); // inside the lock: the token is used once
    const st = c.st, leadId = c.leadId, lead = c.lead;
    const va = visaAppRow_(leadId);
    const old = va.v;
    const a = d.answers || {};
    const changes = [];

    // Answers: unchanged values are kept as stored (even a travel date now in the past)
    const name = vName_(a.name, 'name');
    const country = vOneOf_(a.country, COUNTRIES, true, 'country', 'your country of residence');
    const oldDate = isoDate_(old[6]);
    const travelDate = str_(a.travelDate, 10) === oldDate && oldDate ? oldDate : vDate_(a.travelDate, true, 'travelDate', 'your preferred travel date');
    const air = airportParts_(old[7]);
    const sameAir = country === String(old[5]) && str_(a.departureAirport, 10) === air.code &&
      (air.code !== 'OTHER' || str_(a.departureAirportOther, CONFIG.LIMITS.NAME_MAX) === air.other);
    const departure = sameAir ? String(old[7]) : vAirport_(a.departureAirport, a.departureAirportOther, country);
    const flightTicket = vOneOf_(a.flightTicket, LISTS.YES_NO, true, 'flightTicket', 'whether you have a flight ticket');
    const priorKsa = vOneOf_(a.priorKsa, LISTS.YES_NO, true, 'priorKsa', 'whether you have travelled to Saudi Arabia before');
    const westernVisa = vOneOf_(a.westernVisa, LISTS.YES_NO, false, 'westernVisa', 'whether you hold a UK, US or Schengen visa');
    const extraInfo = vLong_(a.extraInfo);
    const was = function (i) { return String(old[i] === undefined ? '' : old[i]).replace(/^'/, ''); };
    if (name !== was(2)) changes.push('Name changed');
    if (country !== was(5)) changes.push('Country changed');
    if (travelDate !== oldDate) changes.push('Travel date changed');
    if (departure !== was(7)) changes.push('Departure airport changed');
    if (flightTicket !== was(8)) changes.push('Flight ticket answer changed');
    if (priorKsa !== was(9)) changes.push('Travelled to Saudi Arabia before changed');
    if (westernVisa !== was(10)) changes.push('UK/US/Schengen visa answer changed');
    if (extraInfo !== was(17)) changes.push('Additional information changed');

    // Passengers: same number as the application; names and categories may change
    const rows = passengerRows_(leadId);
    const list = Array.isArray(d.passengers) ? d.passengers : [];
    if (list.length !== rows.length) fail_('The number of passengers cannot change here. Please contact us on WhatsApp.', 'passengers');
    const counts = [0, 0, 0];
    const pax = rows.map(function (r, i) {
      const p = list[i] || {};
      if (Number(p.index) !== r.index) fail_('Invalid request.', 'passengers');
      const pn = vName_(p.name, 'passengers', 'the full name of passenger ' + r.index);
      const pc = vOneOf_(p.category, CATS, true, 'passengers', 'a category for passenger ' + r.index);
      counts[CATS.indexOf(pc)] += 1;
      if (pn !== r.name) changes.push('Passenger ' + r.index + ' name changed');
      if (pc !== r.category) changes.push('Passenger ' + r.index + ' category changed');
      return { index: r.index, name: pn, category: pc };
    });

    if (!changes.length && !Object.keys(st.s).length) fail_('Nothing has been changed yet. Replace a file or change an answer, then submit.');

    // Files: old ones to "Replaced <date>" (renamed "NN – file"), the new ones in place
    const app = leadFolder_(lead);
    const stamp = Utilities.formatDate(new Date(), 'Africa/Lagos', 'd MMM yyyy HH:mm');
    let replaced = null;
    const links = {}; // "<slot>:<kind>" → [url, file name]
    Object.keys(st.s).sort().forEach(function (key) {
      const slot = Number(key.split(':')[0]), kind = key.split(':')[1], item = st.s[key];
      const base = CORR_KINDS[kind];
      const target = slot === 0 ? app : passengerFolder_(app, ('0' + slot).slice(-2), pax[slot - 1].name);
      let had = false;
      const it = target.getFiles();
      while (it.hasNext()) {
        const f = it.next();
        if (String(f.getName()).replace(/\.[^.]*$/, '') !== base) continue;
        if (!replaced) replaced = app.createFolder('Replaced ' + stamp);
        f.setName((slot === 0 ? 'All' : ('0' + slot).slice(-2)) + ' – ' + f.getName());
        f.moveTo(replaced);
        had = true;
      }
      const nf = DriveApp.getFileById(item.id);
      nf.setName(base + '.' + item.ext);
      nf.moveTo(target);
      links[key] = [nf.getUrl(), base + '.' + item.ext];
      changes.push((slot === 0 ? 'Shared ' + CORR_LABEL[kind] + ' (all passengers)' : 'Passenger ' + slot + ' ' + CORR_LABEL[kind]) +
        (had ? ' replaced' : ' added'));
    });
    if (st.f) { try { DriveApp.getFolderById(st.f).setTrashed(true); } catch (e) { /* gone */ } } // empty now

    // Folder names follow the names
    pax.forEach(function (p) { passengerFolder_(app, ('0' + p.index).slice(-2), p.name); });
    app.setName(leadId + ' – ' + folderSafe_(name));

    // Visa Passengers
    const now = new Date();
    const linkF = function (k) { return '=HYPERLINK("' + links[k][0] + '","' + links[k][1] + '")'; };
    const H = CONFIG.TABS.PASSENGERS.headers;
    pax.forEach(function (p) {
      const v = new Array(H.length);
      v[0] = leadId; v[1] = p.index; v[2] = safeCell_(p.name); v[3] = p.category;
      const k = p.index + ':';
      if (links[k + 'passport']) v[5] = linkF(k + 'passport');
      if (links[k + 'photo']) { v[6] = linkF(k + 'photo'); v[4] = st.s[k + 'photo'].kb; }
      if (links[k + 'ticket']) v[8] = linkF(k + 'ticket');
      if (links[k + 'hotel']) v[9] = linkF(k + 'hotel');
      if (links['0:ticket']) v[8] = sharedLink_(links['0:ticket']);
      if (links['0:hotel']) v[9] = sharedLink_(links['0:hotel']);
      if (Object.keys(links).some(function (x) { return x.indexOf(k) === 0; })) v[7] = now;
      upsertPassengerRow_(leadId, p.index, v);
    });

    // Visa Applications
    const tab = CONFIG.TABS.VISA;
    const set = function (col, val) { va.sh.getRange(va.row, col).setValue(val); };
    set(3, safeCell_(name)); set(6, safeCell_(country)); set(7, parseDate_(travelDate)); set(8, safeCell_(departure));
    set(9, flightTicket); set(10, priorKsa); set(11, westernVisa); set(13, counts[0]); set(14, counts[1]); set(15, counts[2]);
    set(18, safeCell_(extraInfo));
    if (links['0:ticket']) va.sh.getRange(va.row, tab.sharedCols.t).setFormula(linkF('0:ticket'));
    if (links['0:hotel']) va.sh.getRange(va.row, tab.sharedCols.h).setFormula(linkF('0:hotel'));

    // Lead Tracker: details, a Notes line (staff text kept), Review Status → Correction Received
    const sh = trackerSheet_();
    const cols = trackerCols_(sh);
    const put = function (h, val) { sh.getRange(lead.row, cols[h]).setValue(val); };
    put('Customer Name', safeCell_(name)); put('Country', safeCell_(country)); put('Travel Date', parseDate_(travelDate));
    put('Departure', safeCell_(departure)); put('Adults', counts[0]); put('Children', counts[1]); put('Infants', counts[2]);
    const notes = String(sh.getRange(lead.row, CONFIG.NOTES_COL).getValue() || '');
    const line = 'Correction submitted ' + stamp + ': ' + changes.join('; ') + '.';
    sh.getRange(lead.row, CONFIG.NOTES_COL).setValue(safeCell_(notes ? notes + '\n' + line : line));
    setReviewStatus_(leadId, 'Correction Received');
    PropertiesService.getScriptProperties().deleteProperty(corrKey_(leadId));
    return { leadId: leadId, row: lead.row, changes: changes, folderUrl: app.getUrl(), round: st.r, name: name,
      correctionFor: String(lead.get('Correction For') || '') };
  });
  console.log('submitCorrection ok ' + result.leadId + ' changes=' + result.changes.length);
  notifyCorrection_(result); // never throws
  return { ok: true, leadId: result.leadId };
}

// ---------------------------------------------------------------------
// STAFF ALERT
// ---------------------------------------------------------------------
function renderCorrectionAlert_(r) {
  const rows = [['Lead ID', r.leadId], ['Name', r.name]];
  if (r.correctionFor) rows.push(['Correction For', r.correctionFor]);
  rows.push(['Review Status', 'Correction Received']);
  if (r.trackerUrl) rows.push(['Lead Tracker', 'Open row ' + r.row, r.trackerUrl]);
  if (r.folderUrl) rows.push(['Drive folder', 'Open the files (old ones are in "Replaced …")', r.folderUrl]);
  return renderEmail_({
    subject: 'Elite Global — Correction submitted: ' + r.leadId,
    preheader: r.leadId + ' · ' + r.changes.length + (r.changes.length === 1 ? ' change' : ' changes'),
    heading: 'Correction submitted',
    paragraphs: ['The customer has submitted a correction on the website. Review Status is now "Correction Received" ' +
      '(the customer gets the usual Correction Received email in about 5 minutes).'],
    rows: rows,
    lists: [{ title: 'What changed', items: r.changes }],
    small: ['Staff alert — please check the correction and update the Review Status.'],
    staff: true,
  });
}

function notifyCorrection_(r) {
  try {
    if (!settings_().notifyStaff) return logEmail_({ kind: 'staff-alert', leadId: r.leadId }, 'skipped', 'staff alerts off');
    const sh = trackerSheet_();
    r.trackerUrl = trackerSS_().getUrl() + '#gid=' + sh.getSheetId() + '&range=A' + r.row;
    const m = renderCorrectionAlert_(r);
    return sendEmail_({ to: staffEmail_(), kind: 'staff-alert', key: r.leadId + '|correction|' + r.round, leadId: r.leadId,
      subject: m.subject, html: m.html, text: m.text });
  } catch (e) { console.error('correction alert failed: ' + e.message); return 'failed'; }
}

// ---------------------------------------------------------------------
// HOUSEKEEPING
// ---------------------------------------------------------------------
/** Expired correction states (and, with testIds, those of TEST leads): pending files → Drive bin. Returns the count. */
function purgeStaleCorrections_(testIds) {
  const all = PropertiesService.getScriptProperties().getProperties();
  let n = 0;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('CORR_') !== 0) return;
    const id = key.slice(5);
    let st = null;
    try { st = JSON.parse(all[key]); } catch (e) { st = null; }
    if (st && st.x > Date.now() && !(testIds && testIds[id])) return;
    dropCorrection_(id, st);
    n++;
  });
  if (n) console.log('purgeStaleCorrections removed=' + n);
  return n;
}

/**
 * STAGING ONLY — Run button. Sets Correction Needed (Correction For "Passport photo", a TEST message) on the
 * newest TEST visa lead with an @example.com email, for the live correction test. Logs the Lead ID only.
 */
function testRequestCorrection() {
  const site = settings_().siteUrl;
  if (!/staging/i.test(site)) throw new Error('testRequestCorrection is for staging only (SITE_URL is ' + site + ').');
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
    const row = i + 2;
    sh.getRange(row, cols['Message to Customer']).setValue('TEST: please replace the passport photo of passenger 1 (plain white background).');
    sh.getRange(row, cols['Correction For']).setValue('Passport photo');
    sh.getRange(row, cols['Review Status']).setValue('Correction Needed');
    sh.getRange(row, cols['Review Updated']).setValue(new Date());
    Logger.log('Correction Needed set on ' + get('Lead ID') + '. Open the Track page with this reference.');
    return String(get('Lead ID'));
  }
  throw new Error('No finished TEST visa lead with an @example.com email found. Submit one on staging first.');
}
