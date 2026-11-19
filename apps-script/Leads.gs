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
    return fn();
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
 * Appends one lead to the Lead Tracker tab. Call inside withLock_.
 * r = {leadId, date, name, phone, category, adults, children, infants, travelDate, budget, notes[], folderUrl?}
 */
function appendTrackerRow_(r) {
  const sh = trackerSheet_();
  const row = nextEmptyRow_(sh);
  const folderCell = r.folderUrl
    ? '=HYPERLINK("' + r.folderUrl + '","📁 ' + r.leadId + '")'
    : '';
  sh.getRange(row, 1, 1, CONFIG.HEADERS.length).setValues([[
    r.leadId,
    r.date,
    safeCell_(r.name),
    String(r.phone || ''), // column is plain-text formatted
    r.category,
    r.adults,
    r.children,
    r.infants,
    '=IF(COUNT(F' + row + ':H' + row + ')=0,"",F' + row + '+G' + row + '+H' + row + ')',
    parseDate_(r.travelDate),
    safeCell_(r.budget || ''),
    'New Lead',
    '',
    safeCell_((r.notesPrefix || '') + '[Auto] ' + r.notes.filter(String).join(' | ')),
    folderCell,
  ]]);
  return row;
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
}

function toInt_(v) {
  if (v === undefined || v === null || String(v).trim() === '') return '';
  const n = parseInt(String(v).trim(), 10);
  return isNaN(n) ? '' : n;
}

function v_(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback === undefined ? '—' : fallback;
  return val;
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

  return withLock_(function () {
    const leadId = nextLeadId_(CONFIG.FORMS.CONTACT.idPrefix);
    const now = new Date();
    appendTrackerRow_({
      leadId: leadId, date: now, name: a.name, phone: a.phone,
      category: CONFIG.FORMS.CONTACT.category,
      adults: a.travellers, children: '', infants: '', // website only collects a total
      travelDate: a.travelDate, budget: '',
      notes: [
        'Enquiry: ' + a.enquiryType,
        a.travellers !== '' ? 'Travellers: ' + a.travellers + ' (age split not given — counted under Adults)' : '',
        a.details ? 'Details: ' + a.details : '',
      ],
    });
    appendDetailRow_(CONFIG.TABS.CONTACT, [
      leadId, now, a.name, a.phone, a.enquiryType, parseDate_(a.travelDate), a.travellers, a.details,
    ]);
    console.log('submitContact ok ' + leadId);
    return { ok: true, leadId: leadId };
  });
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
    departureCity: vText_(d.departureCity, true, 'departureCity', 'your preferred departure city'),
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
  if (a.adults + a.children + a.infants < 1) fail_('Please enter at least one traveller.', 'adults');
  rateLimit_('email:' + a.email);

  const services = a.services.concat(a.servicesOther ? ['Other: ' + a.servicesOther] : []);

  return withLock_(function () {
    const leadId = nextLeadId_(CONFIG.FORMS.CUSTOM.idPrefix);
    const now = new Date();
    appendTrackerRow_({
      leadId: leadId, date: now, name: a.name, phone: a.phone,
      category: CONFIG.FORMS.CUSTOM.category,
      adults: a.adults, children: a.children, infants: a.infants,
      travelDate: a.travelDate, budget: a.budget,
      notes: [
        'Email: ' + a.email,
        'Country: ' + a.country,
        'Departure: ' + a.departureCity,
        'Arrive: ' + a.arrivalCity,
        'Nights Madinah/Makkah: ' + a.nightsMadinah + '/' + a.nightsMakkah,
        'Hotel: ' + a.hotelCategory + ', ' + a.haramDistance + (a.preferredHotel ? ' (' + a.preferredHotel + ')' : ''),
        'Visa help: ' + a.visaAssist,
        'Flight ticket: ' + a.flightTicket,
        services.length ? 'Services: ' + services.join(', ') : '',
        a.experience ? 'Experience: ' + a.experience : '',
        a.hotelOrAirline ? 'Pref. hotel/airline: ' + a.hotelOrAirline : '',
        a.special ? 'Requests: ' + a.special : '',
        a.heard ? 'Source: ' + a.heard : '',
      ],
    });
    appendDetailRow_(CONFIG.TABS.CUSTOM, [
      leadId, now, a.name, a.phone, a.email, a.country, a.adults, a.children, a.infants,
      a.departureCity, parseDate_(a.travelDate), a.flightTicket, a.arrivalCity, a.nightsMadinah,
      a.nightsMakkah, a.hotelCategory, a.haramDistance, a.preferredHotel, services.join(', '),
      a.visaAssist, a.budget, a.experience, a.hotelOrAirline, a.special, a.heard,
    ]);
    console.log('submitCustomRequest ok ' + leadId);
    return { ok: true, leadId: leadId };
  });
}
