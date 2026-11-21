/**
 * Lead IDs, Central Lead Tracker rows, and the contact / customize handlers.
 */

// ---------------------------------------------------------------------
// LOCK + LEAD ID
// ---------------------------------------------------------------------
/** Runs fn while holding the script lock (max 30 s wait). */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) fail_('We are very busy right now. Please try again in a moment.');
  try {
    const out = fn();
    SpreadsheetApp.flush(); // write now: errors surface here (not after the reply) and before the lock is released
    return out;
  } finally {
    lock.releaseLock();
  }
}

/** Next Lead ID, e.g. EG-VO-00012. One sequence for all lead types. Call inside withLock_. */
function nextLeadId_(prefix) {
  const p = PropertiesService.getScriptProperties();
  const seq = Number(p.getProperty('LEAD_SEQ') || 0) + 1;
  p.setProperty('LEAD_SEQ', String(seq));
  return 'EG-' + prefix + '-' + ('00000' + seq).slice(-5);
}

// ---------------------------------------------------------------------
// TRACKER ACCESS
// ---------------------------------------------------------------------
function trackerSS_() {
  const id = PropertiesService.getScriptProperties().getProperty('TRACKER_ID');
  if (!id) throw new Error('Setup has not been run (no TRACKER_ID).');
  return SpreadsheetApp.openById(id);
}

function trackerSheet_() {
  return trackerSS_().getSheetByName(CONFIG.TRACKER_TAB);
}

/** Row number of a Lead ID in column A of the sheet, or 0. */
function findLeadRow_(sh, leadId) {
  const hit = sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 1)
    .createTextFinder(leadId).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

/**
 * Column number of every Lead Tracker header, found by name in row 1 (the v3 columns were appended
 * after Drive Folder, and staff may have added their own columns further right).
 */
function trackerCols_(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cols = {};
  head.forEach(function (h, i) { if (h !== '' && !cols[h]) cols[h] = i + 1; });
  const missing = CONFIG.HEADERS.filter(function (h) { return !cols[h]; });
  if (missing.length) throw new Error('Lead Tracker is missing ' + missing.join(', ') + '. Run setupEliteGlobal().');
  return cols;
}

/**
 * Appends one lead to the Lead Tracker tab. Call inside withLock_.
 * r = {leadId, date, name, phone, category, adults, children, infants, travelDate, budget, folderUrl?,
 *      email?, country?, departure?, passengers?, source?, status}
 * Follow-up Notes is left empty: it belongs to staff. The answers live in the detail tabs.
 */
function appendTrackerRow_(r) {
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const row = nextEmptyRow_(sh);
  const v = {
    'Lead ID': r.leadId,
    'Date Received': r.date,
    'Customer Name': safeCell_(r.name),
    'Phone Number': String(r.phone || ''), // column is plain-text formatted
    'Lead Category': r.category,
    'Adults': r.adults,
    'Children': r.children,
    'Infants': r.infants,
    'Total Travellers': '=IF(COUNT(F' + row + ':H' + row + ')=0,"",F' + row + '+G' + row + '+H' + row + ')',
    'Travel Date': parseDate_(r.travelDate),
    'Budget': safeCell_(r.budget || ''),
    'Lead Status': 'New Lead',
    'Assigned Agent': '',
    'Follow-up Notes': '',
    'Drive Folder': r.folderUrl ? '=HYPERLINK("' + r.folderUrl + '","📁 ' + r.leadId + '")' : '',
    'Email': String(r.email || ''),
    'Country': safeCell_(r.country || ''),
    'Departure': safeCell_(r.departure || ''),
    'Passengers': r.passengers === undefined ? '' : r.passengers,
    'Lead Source': safeCell_(r.source || ''),
    'Application Status': r.status || CONFIG.STATUS.RECEIVED,
    'Message to Customer': '', // staff only; shown on track.html
    'Review Status': '',       // visa: set to Under Review at finalize, then by staff
    'Review Updated': '',
    'Last Customer Email': '',
  };
  // Write the contiguous block of web-app columns; staff columns outside it are untouched.
  const last = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
  const current = sh.getRange(row, 1, 1, last).getValues()[0];
  CONFIG.HEADERS.forEach(function (h) { current[cols[h] - 1] = v[h]; });
  sh.getRange(row, 1, 1, last).setValues([current]);
  return row;
}

/** Sets the Application Status of a lead (e.g. "Uploading 2/5", "Complete: 5 passengers", "Expired"). */
function setApplicationStatus_(leadId, status) {
  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  if (!row) return;
  sh.getRange(row, trackerCols_(sh)['Application Status']).setValue(status);
}

/** Current Application Status of a lead ('' when not found). */
function applicationStatus_(leadId) {
  const sh = trackerSheet_();
  const row = findLeadRow_(sh, leadId);
  return row ? String(sh.getRange(row, trackerCols_(sh)['Application Status']).getValue()) : '';
}

/** Appends a row to a detail tab (CONFIG.TABS.*). Strings are made formula-safe. Call inside withLock_. */
function appendDetailRow_(tab, values) {
  const sh = trackerSS_().getSheetByName(tab.name);
  if (!sh) throw new Error('Tab "' + tab.name + '" is missing. Run setupEliteGlobal().');
  sh.appendRow(values.map(function (v, i) {
    return tab.textCols.indexOf(i + 1) !== -1 ? String(v) : safeCell_(v);
  }));
  return sh.getLastRow();
}

/** First empty row, judged by the Lead ID column. Adds more rows when full. */
function nextEmptyRow_(sh) {
  const max = sh.getMaxRows();
  const ids = sh.getRange(2, 1, max - 1, 1).getValues();
  let last = 0;
  for (let i = ids.length - 1; i >= 0; i--) { if (ids[i][0] !== '') { last = i + 1; break; } }
  const row = last + 2;
  if (row > max) {
    sh.insertRowsAfter(max, 500);
    applyRowRules_(sh, max + 1, 500);
  }
  return row;
}

/** Formats, dropdowns and the Total Travellers formula for a block of Lead Tracker rows. */
function applyRowRules_(sh, startRow, numRows) {
  sh.getRange(startRow, 2, numRows, 1).setNumberFormat('dd mmm yyyy, hh:mm');
  sh.getRange(startRow, 4, numRows, 1).setNumberFormat('@');
  sh.getRange(startRow, 6, numRows, 4).setNumberFormat('0').setHorizontalAlignment('center');
  sh.getRange(startRow, 10, numRows, 1).setNumberFormat('dd mmm yyyy');

  sh.getRange(startRow, 5, numRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.LEAD_CATEGORIES, true)
      .setAllowInvalid(false).setHelpText('Choose a lead category from the list.').build());
  sh.getRange(startRow, 12, numRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.LEAD_STATUSES, true)
      .setAllowInvalid(false).setHelpText('Choose a lead status from the list.').build());
  sh.getRange(startRow, 6, numRows, 3).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0)
      .setAllowInvalid(false).setHelpText('Enter a whole number, 0 or more.').build());

  // Total Travellers = Adults + Children + Infants (blank until a count is entered)
  sh.getRange(startRow, 9, numRows, 1)
    .setFormulaR1C1('=IF(COUNT(RC[-3]:RC[-1])=0,"",RC[-3]+RC[-2]+RC[-1])');

  // Review Status dropdown (v5 column, found by name; absent on a brand-new tracker until upgraded)
  const head = sh.getRange(1, 1, 1, sh.getMaxColumns()).getValues()[0];
  const rc = head.indexOf('Review Status') + 1;
  if (rc) {
    sh.getRange(startRow, rc, numRows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.REVIEW_STATUSES, true)
        .setAllowInvalid(false).setHelpText('Choose a status from the list.').build());
  }
}

function toInt_(v) {
  if (v === undefined || v === null || String(v).trim() === '') return '';
  const n = parseInt(String(v).trim(), 10);
  return isNaN(n) ? '' : n;
}

function parseDate_(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : s;
}

// ---------------------------------------------------------------------
// ACTION: submitContact (website contact box)
// ---------------------------------------------------------------------
function submitContact_(d) {
  const a = {
    name: vName_(d.name, 'name'),
    phone: vPhone_(d.phone, 'phone'),
    enquiryType: vOneOf_(d.enquiryType, LISTS.ENQUIRY_TYPES, true, 'enquiryType', 'what you need help with'),
    travelDate: vDate_(d.travelDate, false, 'travelDate', 'your preferred travel date'),
    travellers: vInt_(d.travellers, false, 'travellers', 'the number of travellers', 1, 999),
    details: vLong_(d.details),
  };
  rateLimit_('phone:' + a.phone.replace(/\D/g, ''));

  const res = withLock_(function () {
    const leadId = nextLeadId_(CONFIG.FORMS.CONTACT.idPrefix);
    const now = new Date();
    appendTrackerRow_({
      leadId: leadId, date: now, name: a.name, phone: a.phone,
      category: CONFIG.FORMS.CONTACT.category,
      adults: a.travellers, children: '', infants: '', // website only collects a total
      travelDate: a.travelDate, budget: '', // website only collects a total (counted under Adults)
      status: CONFIG.STATUS.RECEIVED,
    });
    appendDetailRow_(CONFIG.TABS.CONTACT, [
      leadId, now, a.name, a.phone, a.enquiryType, parseDate_(a.travelDate), a.travellers, a.details,
    ]);
    console.log('submitContact ok ' + leadId);
    return { ok: true, leadId: leadId };
  });
  notifyNewLead_({
    leadId: res.leadId, kind: 'contact', name: a.name, phone: a.phone, email: '', country: '',
    travelDate: a.travelDate, passengers: a.travellers, extra: [['Enquiry', a.enquiryType]],
  });
  return res;
}

// ---------------------------------------------------------------------
// ACTION: submitCustomRequest (customize-umrah.html)
// ---------------------------------------------------------------------
function submitCustomRequest_(d) {
  const a = {
    name: vName_(d.name, 'name'),
    phone: vPhone_(d.phone, 'phone'),
    email: vEmail_(d.email, 'email'),
    country: vOneOf_(d.country, COUNTRIES, true, 'country', 'your country of residence'),
    adults: vInt_(d.adults, true, 'adults', 'the number of adults', 0, 999),
    children: vInt_(d.children, true, 'children', 'the number of children', 0, 999),
    infants: vInt_(d.infants, true, 'infants', 'the number of infants', 0, 999),
    travelDate: vDate_(d.travelDate, true, 'travelDate', 'your preferred travel date'),
    flightTicket: vOneOf_(d.flightTicket, LISTS.YES_NO, true, 'flightTicket', 'whether you have a flight ticket'),
    arrivalCity: vOneOf_(d.arrivalCity, LISTS.ARRIVAL, true, 'arrivalCity', 'your arrival city'),
    nightsMadinah: vInt_(d.nightsMadinah, true, 'nightsMadinah', 'nights in Madinah', 0, 999),
    nightsMakkah: vInt_(d.nightsMakkah, true, 'nightsMakkah', 'nights in Makkah', 0, 999),
    hotelCategory: vOneOf_(d.hotelCategory, LISTS.HOTEL_CAT, true, 'hotelCategory', 'a hotel category'),
    haramDistance: vOneOf_(d.haramDistance, LISTS.HARAM_DIST, true, 'haramDistance', 'a distance from the Haram'),
    preferredHotel: vText_(d.preferredHotel, false),
    services: vManyOf_(d.services, LISTS.SERVICES, 'services', 'services'),
    servicesOther: vText_(d.servicesOther, false, 'servicesOther', '', 200),
    visaAssist: vOneOf_(d.visaAssist, LISTS.VISA_ASSIST, true, 'visaAssist', 'whether you need visa assistance'),
    budget: vOneOf_(d.budget, LISTS.BUDGET, true, 'budget', 'a budget'),
    experience: vOneOf_(d.experience, LISTS.EXPERIENCE, false, 'experience', 'a travel experience'),
    hotelOrAirline: vText_(d.hotelOrAirline, false),
    special: vLong_(d.special),
    heard: vOneOf_(d.heard, LISTS.HEARD, false, 'heard', 'how you heard about us'),
  };
  a.departureAirport = vAirport_(d.departureAirport, d.departureAirportOther, a.country);
  if (a.adults + a.children + a.infants < 1) fail_('Please enter at least one traveller.', 'adults');
  requireEmailToken_(d.emailToken, a.email);
  rateLimit_('email:' + a.email);

  const services = a.services.concat(a.servicesOther ? ['Other: ' + a.servicesOther] : []);

  const res = withLock_(function () {
    const leadId = nextLeadId_(CONFIG.FORMS.CUSTOM.idPrefix);
    const now = new Date();
    appendTrackerRow_({
      leadId: leadId, date: now, name: a.name, phone: a.phone,
      category: CONFIG.FORMS.CUSTOM.category,
      adults: a.adults, children: a.children, infants: a.infants,
      travelDate: a.travelDate, budget: a.budget,
      email: a.email, country: a.country, departure: a.departureAirport, source: a.heard,
      status: CONFIG.STATUS.RECEIVED,
    });
    appendDetailRow_(CONFIG.TABS.CUSTOM, [
      leadId, now, a.name, a.phone, a.email, a.country, a.adults, a.children, a.infants,
      a.departureAirport, parseDate_(a.travelDate), a.flightTicket, a.arrivalCity, a.nightsMadinah,
      a.nightsMakkah, a.hotelCategory, a.haramDistance, a.preferredHotel, services.join(', '),
      a.visaAssist, a.budget, a.experience, a.hotelOrAirline, a.special, a.heard,
    ]);
    console.log('submitCustomRequest ok ' + leadId);
    return { ok: true, leadId: leadId };
  });
  const lead = {
    leadId: res.leadId, kind: 'custom', name: a.name, phone: a.phone, email: a.email, country: a.country,
    travelDate: a.travelDate, passengers: a.adults + a.children + a.infants,
    extra: [['Departure', a.departureAirport], ['Budget', a.budget]],
  };
  notifyNewLead_(lead);
  res.emailed = sendConfirmation_(lead);
  return res;
}
