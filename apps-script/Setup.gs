/**
 * =====================================================================
 *  ELITE GLOBAL WORLD TRAVEL & TOURS LTD. (RC: 7787410)
 *  Lead system — website forms → this web app → Google Sheets + Drive
 * =====================================================================
 *
 *  HOW TO USE (full steps in README.md and docs/ENVIRONMENTS.md):
 *   1. Sign in to script.google.com as the owner account (see docs/ENVIRONMENTS.md)
 *   2. Run  setupEliteGlobal  → approve permissions. Safe to run again at any time.
 *   3. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)
 *   4. Put the /exec URL in public/assets/js/config.js → webAppUrl
 *
 *  FUNCTIONS YOU CAN RUN:
 *   setupEliteGlobal()   – creates or upgrades the folder, tracker columns/tabs, closes retired forms
 *   showSystemInfo()     – prints the folder, tracker and web app URLs in the log
 *   cleanupTestData()    – removes every lead whose name starts with "TEST" (all tabs + Drive)
 *   setOwnerEmail()      – stores the expected owner account for this environment
 *   checkEmailSettings() – prints the email settings (STAFF_EMAIL, SITE_URL, provider, on/off, quota, queue);
 *                          change them in Project Settings → Script Properties (setStaffEmail / setSiteUrl explain how)
 *   sendEmailSamples()   – sends one sample of every email to STAFF_EMAIL for approval
 *   checkRecentEmailJobs() – the last 20 review-email decisions (sent / waiting / held / …), no personal data
 *   enableTestOtpBypass() / disableTestOtpBypass() – STAGING ONLY: fixed email code for TEST names @example.com
 *   testRequestCorrection() – STAGING ONLY: sets Correction Needed on the newest TEST visa lead (@example.com)
 *   recountVisaFiles()   – recounts Visa Files now (Visa Processing / Visa Approved not yet emailed); logs Lead ID + count
 *   archiveNow()         – moves finished leads (90 days after their last change) to the quarterly archive files
 *   benchmarkScale()     – STAGING ONLY: times the tracker reads with 1,000 and 20,000 synthetic TEST rows (temporary file)
 *   testApproveVisa()    – STAGING ONLY: SPECIMEN visa files + Visa Approved on the newest TEST visa lead (@example.com)
 *   resetSetupFlag()     – ⚠️ forgets every stored ID (only after deleting the Drive folder)
 * =====================================================================
 */

// ---------------------------------------------------------------------
// MAIN SETUP — idempotent: creates what is missing, upgrades what exists
// ---------------------------------------------------------------------
function setupEliteGlobal() {
  checkOwner_();
  const p = PropertiesService.getScriptProperties();

  // 1. Root Drive folder
  let root = folderOrNull_(p.getProperty('FOLDER_ID'));
  if (!root) {
    root = DriveApp.createFolder(CONFIG.FOLDER_NAME);
    Logger.log('Created Drive folder "' + CONFIG.FOLDER_NAME + '".');
  }
  p.setProperty('FOLDER_ID', root.getId());

  // 2. Visa Applications subfolder
  let visa = folderOrNull_(p.getProperty('VISA_FOLDER_ID'));
  if (!visa) {
    const found = root.getFoldersByName(CONFIG.VISA_FOLDER_NAME);
    visa = found.hasNext() ? found.next() : root.createFolder(CONFIG.VISA_FOLDER_NAME);
    Logger.log('Visa Applications folder ready.');
  }
  p.setProperty('VISA_FOLDER_ID', visa.getId());

  // 3. Central Lead Tracker (reuse, or build)
  let ss = spreadsheetOrNull_(p.getProperty('TRACKER_ID'));
  if (!ss) {
    ss = buildTracker_();
    DriveApp.getFileById(ss.getId()).moveTo(root);
    Logger.log('Created Central Lead Tracker.');
  }
  p.setProperty('TRACKER_ID', ss.getId());

  // 4. Email Log spreadsheet + email settings — before anything that reads them (setupScale_ fills Emails Sent from the log)
  ensureEmailLog_(root);
  ensureEmailSettings_();

  upgradeTracker_(ss);
  if (p.getProperty('LEAD_SEQ') === null) p.setProperty('LEAD_SEQ', '0');
  setupVisaDelivery_(); // "Approved Visa" in every visa lead folder + Visa Files recount (schema 7)
  setupScale_(ss);      // schema 9: Due + Archive Index tabs, unused grid columns trimmed, Emails Sent filled once

  // 5. Retire the Google Forms system
  removeLegacyTriggers_();
  closeLegacyForms_();

  // 6. Triggers (status emails, queue, archive, daily summary) — each created only if missing
  ensureTriggers_(ss);

  // 7. Housekeeping + info
  purgeStaleUploads_();
  purgeStaleCorrections_();
  writeSystemInfo_();
  protectForStaff_(ss); // last: every system tab exists now
  lockSharing_(ss, visa);
  p.setProperties({ SETUP_DONE: 'yes', SCHEMA_VERSION: CONFIG.SCHEMA_VERSION });

  Logger.log('✅ SETUP COMPLETE');
  showSystemInfo();
}

function folderOrNull_(id) {
  if (!id) return null;
  try {
    const f = DriveApp.getFolderById(id);
    return f.isTrashed() ? null : f;
  } catch (e) { return null; }
}

function spreadsheetOrNull_(id) {
  if (!id) return null;
  try { return SpreadsheetApp.openById(id); } catch (e) { return null; }
}

// ---------------------------------------------------------------------
// CENTRAL LEAD TRACKER
// ---------------------------------------------------------------------
function buildTracker_() {
  const ss = SpreadsheetApp.create(CONFIG.TRACKER_NAME);
  const sh = ss.getSheets()[0].setName(CONFIG.TRACKER_TAB);
  const H = CONFIG.HEADERS.slice(0, CONFIG.FOLDER_COL); // v3 columns are added by upgradeTracker_
  const rows = CONFIG.TRACKER_ROWS;

  // Grid size
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() > H.length) sh.deleteColumns(H.length + 1, sh.getMaxColumns() - H.length);

  // Header
  sh.getRange(1, 1, 1, H.length).setValues([H])
    .setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold')
    .setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true);
  sh.getRange(1, 12).setBackground(CONFIG.GOLD).setFontColor(CONFIG.NAVY); // Lead Status stands out
  sh.setRowHeight(1, 40);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);

  applyRowRules_(sh, 2, rows - 1);

  // Column widths: A..O
  [120, 140, 190, 150, 170, 70, 75, 70, 95, 110, 190, 150, 140, 380, 140]
    .forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange(2, 14, rows - 1, 1).setWrap(true);

  // Colour-coded Lead Status
  const statusRange = sh.getRange(2, 12, rows - 1, 1);
  const colours = {
    'New Lead': ['#fff4d6', '#8a5a00'],
    'Contacted': ['#e3ecff', '#102d70'],
    'Awaiting Response': ['#eef0f4', '#3d4660'],
    'Quotation Sent': ['#e8e3ff', '#4b2fa0'],
    'Payment Pending': ['#ffe9d6', '#a04a00'],
    'Converted': ['#dff3e6', '#176b38'],
    'Lost': ['#fde2e2', '#a01818'],
  };
  sh.setConditionalFormatRules(Object.keys(colours).map(function (status) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(status)
      .setBackground(colours[status][0]).setFontColor(colours[status][1])
      .setRanges([statusRange]).build();
  }));

  // Filter for the sales team
  sh.getRange(1, 1, rows, H.length).createFilter();

  // Warn (not block) anyone editing auto-generated columns
  [[1, 'Lead ID'], [2, 'Date Received'], [9, 'Total Travellers'], [15, 'Drive Folder']].forEach(function (c) {
    sh.getRange(2, c[0], rows - 1, 1).protect()
      .setDescription(c[1] + ' is generated automatically').setWarningOnly(true);
  });
  return ss;
}

/**
 * Brings an existing tracker up to date: 15th "Drive Folder" column, v3 columns (with a blanks-only
 * backfill from old notes) and the detail tabs. Safe to repeat; never moves rows or Lead IDs.
 */
function upgradeTracker_(ss) {
  const sh = ss.getSheetByName(CONFIG.TRACKER_TAB);
  if (!sh) throw new Error('The tracker has no "' + CONFIG.TRACKER_TAB + '" tab. Restore it or rebuild the tracker.');
  const H = CONFIG.HEADERS;
  const col = CONFIG.FOLDER_COL;

  if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
  if (sh.getRange(1, col).getValue() !== H[col - 1]) {
    sh.getRange(1, col).setValue(H[col - 1])
      .setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold')
      .setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true);
    sh.setColumnWidth(col, 140);
    sh.getRange(2, col, sh.getMaxRows() - 1, 1).protect()
      .setDescription('Drive Folder is generated automatically').setWarningOnly(true);
    Logger.log('Added "' + H[col - 1] + '" column to the Lead Tracker.');
  }
  addTrackerColumns_(sh);
  repairColumnValidation_(sh);
  backfillV3Columns_(sh);

  // Make the sales filter cover every web-app column
  const lastCol = Math.max.apply(null, H.map(function (h) { return trackerCols_(sh)[h]; }));
  const filter = sh.getFilter();
  if (!filter || filter.getRange().getNumColumns() < lastCol) {
    if (filter) filter.remove();
    sh.getRange(1, 1, sh.getMaxRows(), lastCol).createFilter();
  }

  // Detail tabs, in order after the Lead Tracker
  [CONFIG.TABS.VISA, CONFIG.TABS.PASSENGERS, CONFIG.TABS.CUSTOM, CONFIG.TABS.CONTACT].forEach(function (tab, i) {
    ensureTab_(ss, tab, i + 1);
  });
}

/**
 * Columns added after Drive Folder (CONFIG.EXTRA_COLS): v3 Email, Country, Departure, Passengers,
 * Lead Source, Application Status; v4 Message to Customer. Each missing header is added in the first
 * free column after the existing headers, so no existing column, row, formula, protection or Lead ID
 * moves. Safe to repeat: headers that exist (anywhere) are left alone; header notes are (re)applied.
 */
function addTrackerColumns_(sh) {
  const head = sh.getRange(1, 1, 1, sh.getMaxColumns()).getValues()[0];
  let last = 0;
  head.forEach(function (h, i) { if (h !== '') last = i + 1; });
  const rows = sh.getMaxRows() - 1;
  Object.keys(CONFIG.EXTRA_COLS).forEach(function (name) {
    const spec = CONFIG.EXTRA_COLS[name];
    const at = head.indexOf(name);
    if (at !== -1) {
      if (spec.note) sh.getRange(1, at + 1).setNote(spec.note);
      return;
    }
    last += 1;
    if (sh.getMaxColumns() < last) sh.insertColumnsAfter(sh.getMaxColumns(), last - sh.getMaxColumns());
    const cell = sh.getRange(1, last);
    cell.setValue(name)
      .setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold')
      .setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true);
    sh.setColumnWidth(last, spec.width);
    const body = sh.getRange(2, last, rows, 1);
    if (spec.format) body.setNumberFormat(spec.format);
    if (spec.align) body.setHorizontalAlignment(spec.align);
    if (spec.auto) body.protect().setDescription(name + ' is updated automatically').setWarningOnly(true);
    if (spec.wrap) body.setWrap(true).setVerticalAlignment('top');
    // Sheets copies the left neighbour's dropdown into an inserted column: only "list" columns keep one
    body.setDataValidation(null);
    if (spec.checkbox) body.setDataValidation(checkboxRule_());
    if (spec.list) {
      body.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CONFIG[spec.list], true)
        .setAllowInvalid(false).setHelpText(spec.help || 'Choose a status from the list.').build());
      if (name === 'Review Status') addReviewColours_(sh, body);
    }
    if (spec.note) cell.setNote(spec.note);
    if (spec.hidden) { try { sh.hideColumns(last); } catch (e) { /* staff can hide it */ } }
    head[last - 1] = name;
    Logger.log('Added "' + name + '" column to the Lead Tracker.');
  });
}

/**
 * Columns appended by the web app: only the list columns (Review Status, Correction For) have a dropdown. Removes a dropdown that Sheets copied
 * into Review Updated / Last Customer Email (or any other appended web-app column) when they were inserted
 * next to it. Safe to repeat.
 */
function repairColumnValidation_(sh) {
  const cols = trackerCols_(sh);
  const rows = sh.getMaxRows() - 1;
  Object.keys(CONFIG.EXTRA_COLS).forEach(function (name) {
    if (CONFIG.EXTRA_COLS[name].list) return;
    if (CONFIG.EXTRA_COLS[name].checkbox) { sh.getRange(2, cols[name], rows, 1).setDataValidation(checkboxRule_()); return; }
    sh.getRange(2, cols[name], rows, 1).setDataValidation(null);
  });
}

/** Colour-coded Review Status (added next to the existing Lead Status colours). */
function addReviewColours_(sh, range) {
  const colours = {
    'Under Review': ['#e3ecff', '#102d70'],
    'Correction Needed': ['#ffe9d6', '#a04a00'],
    'Correction Received': ['#fff4d6', '#8a5a00'],
    'Verified': ['#e8e3ff', '#4b2fa0'],
    'Visa Processing': ['#eef0f4', '#3d4660'],
    'Visa Approved': ['#dff3e6', '#176b38'],
    'Not Approved / Closed': ['#fde2e2', '#a01818'],
  };
  const rules = sh.getConditionalFormatRules().concat(Object.keys(colours).map(function (status) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(status)
      .setBackground(colours[status][0]).setFontColor(colours[status][1]).setRanges([range]).build();
  }));
  sh.setConditionalFormatRules(rules);
}

/**
 * Fills the v3 columns of leads created before v3 from their old "[Auto] Email: … | Country: …"
 * Follow-up Notes. Only empty cells are filled and the notes are kept as they are, so running it
 * again changes nothing.
 */
function backfillV3Columns_(sh) {
  const cols = trackerCols_(sh);
  const last = sh.getLastRow();
  if (last < 2) return;
  const n = last - 1;
  const read = function (h) { return sh.getRange(2, cols[h], n, 1).getValues(); };
  const ids = read('Lead ID'), cats = read('Lead Category'), notes = read('Follow-up Notes');
  const targets = ['Email', 'Country', 'Departure', 'Passengers', 'Lead Source', 'Application Status'];
  const data = {};
  targets.forEach(function (h) { data[h] = read(h); });
  const raw = function (text, label) {
    const m = new RegExp('(?:^|\\| |\\] )' + label + ': ([^|]+?)(?: \\||$)').exec(text);
    return m ? m[1].split('  ')[0].trim() : ''; // stop at a double space (staff text typed after it)
  };
  // List answers must start with a known option, so staff text added after them is never copied.
  const fromList = function (value, list) {
    return list.filter(function (o) { return value.indexOf(o) === 0; })
      .sort(function (a, b) { return b.length - a.length; })[0] || '';
  };
  const pick = function (text, label) {
    const v = raw(text, label);
    if (label === 'Email') { const m = /[^\s@|]+@[^\s@|]+\.[^\s@|]+/.exec(v); return m ? m[0].toLowerCase() : ''; }
    if (label === 'Country') return fromList(v, COUNTRIES);
    if (label === 'Source') return fromList(v, LISTS.HEARD);
    if (label === 'Passengers') return /^\d+/.test(v) ? v.match(/^\d+/)[0] : '';
    return v;
  };
  let filled = 0;
  for (let i = 0; i < n; i++) {
    if (ids[i][0] === '') continue;
    const t = String(notes[i][0] || '');
    const tag = /^\[(Uploading \d+\/\d+|Complete: \d+ passengers?)\]/.exec(t);
    const found = {
      'Email': pick(t, 'Email'),
      'Country': pick(t, 'Country'),
      'Departure': pick(t, 'Departure'),
      'Passengers': pick(t, 'Passengers'),
      'Lead Source': pick(t, 'Source'),
      'Application Status': tag ? tag[1] : (cats[i][0] && cats[i][0] !== CONFIG.FORMS.VISA.category ? CONFIG.STATUS.RECEIVED : ''),
    };
    if (found['Passengers'] !== '') found['Passengers'] = Number(found['Passengers']) || '';
    targets.forEach(function (h) {
      if (data[h][i][0] === '' && found[h] !== '') { data[h][i][0] = found[h]; filled++; }
    });
  }
  if (!filled) return;
  targets.forEach(function (h) { sh.getRange(2, cols[h], n, 1).setValues(data[h]); });
  Logger.log('Filled ' + filled + ' empty v3 cell(s) from the notes of earlier leads (notes kept).');
}

function ensureTab_(ss, tab, position) {
  let sh = ss.getSheetByName(tab.name);
  if (!sh) {
    sh = ss.insertSheet(tab.name, position);
    Logger.log('Added "' + tab.name + '" tab.');
  }
  const n = tab.headers.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  sh.getRange(1, 1, 1, n).setValues([tab.headers])
    .setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  tab.widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  const body = Math.max(sh.getMaxRows() - 1, 1);
  tab.textCols.forEach(function (c) { sh.getRange(2, c, body, 1).setNumberFormat('@'); });
  tab.dateCols.forEach(function (c) {
    sh.getRange(2, c, body, 1).setNumberFormat(c === 2 || c === 8 ? 'dd mmm yyyy, hh:mm' : 'dd mmm yyyy');
  });
}

// ---------------------------------------------------------------------
// RETIRED GOOGLE FORMS
// ---------------------------------------------------------------------
const LEGACY_FORMS = [
  ['FORM_VISA_ID', 'Form 1 — Visa Only'],
  ['FORM_CUSTOM_ID', 'Form 2 — Custom Experience'],
  ['FORM_CONTACT_ID', 'Form 3 — General Contact'],
];

function removeLegacyTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onLeadFormSubmit') { ScriptApp.deleteTrigger(t); n++; }
  });
  if (n) Logger.log('Removed ' + n + ' old Google Forms trigger(s).');
}

/**
 * Closes the old Forms (kept in Drive). Each step is tried on its own, because on some forms
 * Google rejects setCustomClosedFormMessage ("Invalid data updating form") even though closing
 * works. Order: try the "moved" message, stop accepting responses, and if the form still
 * accepts responses, unpublish it. The real state is read back and logged.
 */
function closeLegacyForms_() {
  const p = PropertiesService.getScriptProperties();
  LEGACY_FORMS.forEach(function (f) {
    const id = p.getProperty(f[0]);
    if (!id) return;
    let form;
    try { form = FormApp.openById(id); } catch (e) {
      Logger.log('Skipped ' + f[1] + ': could not open it (' + noEmails_(e.message) + ').');
      return;
    }
    const notes = [];
    try { form.setCustomClosedFormMessage(TEXT.FORM_MOVED); } catch (e) {
      notes.push('custom message not accepted by Google (' + e.message + ')');
    }
    try { if (form.isAcceptingResponses()) form.setAcceptingResponses(false); } catch (e) {
      notes.push('stop accepting failed (' + e.message + ')');
    }
    try {
      if (form.isAcceptingResponses() && typeof form.setPublished === 'function') form.setPublished(false);
    } catch (e) {
      notes.push('unpublish failed (' + e.message + ')');
    }
    Logger.log(f[1] + ': ' + legacyFormState_(form) + (notes.length ? ' — ' + notes.join('; ') : '') + '.');
  });
}

/** Human-readable real state of a retired form, read back from Google. */
function legacyFormState_(form) {
  let accepting = null, published = null, message = '';
  try { accepting = form.isAcceptingResponses(); } catch (e) { /* unknown */ }
  try { if (typeof form.isPublished === 'function') published = form.isPublished(); } catch (e) { /* unknown */ }
  try { message = form.getCustomClosedFormMessage() || ''; } catch (e) { /* unknown */ }
  if (published === false) return 'UNPUBLISHED (not reachable by respondents)';
  if (accepting === false) {
    return message === TEXT.FORM_MOVED
      ? 'CLOSED with "' + TEXT.FORM_MOVED + '"'
      : 'CLOSED with Google\'s default "no longer accepting responses" message';
  }
  if (accepting === true) return '⚠️ STILL OPEN — close it by hand (Responses → Accepting responses off)';
  return 'state unknown';
}

// ---------------------------------------------------------------------
// INFO
// ---------------------------------------------------------------------
function collectInfo_() {
  const p = PropertiesService.getScriptProperties();
  const folderUrl = function (key) {
    const f = folderOrNull_(p.getProperty(key));
    return f ? f.getUrl() : '(missing — run setupEliteGlobal)';
  };
  const tracker = spreadsheetOrNull_(p.getProperty('TRACKER_ID'));
  let webApp = '';
  try { webApp = ScriptApp.getService().getUrl() || ''; } catch (e) { webApp = ''; }

  const rows = [
    ['Google account owner', Session.getEffectiveUser().getEmail()],
    ['Drive folder', folderUrl('FOLDER_ID')],
    ['Visa Applications folder (passports + photos)', folderUrl('VISA_FOLDER_ID')],
    ['Central Lead Tracker', tracker ? tracker.getUrl() : '(missing — run setupEliteGlobal)'],
    ['Email Log (sent emails + queue)', emailLogUrl_()],
    ['Emails', emailSettingsLine_()],
    ['', ''],
    ['Web app URL → public/assets/js/config.js webAppUrl',
      webApp ? webApp : 'Not deployed yet: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)'],
  ];
  if (/\/dev$/.test(webApp)) {
    rows.push(['⚠️ Note', 'This is the /dev (test) URL. Use the /exec URL shown in Deploy → Manage deployments.']);
  }
  const legacy = LEGACY_FORMS.filter(function (f) { return p.getProperty(f[0]); });
  if (legacy.length) {
    rows.push(['', '']);
    legacy.forEach(function (f) {
      let url = '(could not open — deleted or no access)';
      let state = 'state unknown';
      try {
        const form = FormApp.openById(p.getProperty(f[0]));
        url = form.getEditUrl();
        state = legacyFormState_(form);
      } catch (e) { /* deleted */ }
      rows.push(['Retired ' + f[1] + ' (not on the website): ' + state, url]);
    });
  }
  return rows;
}

// ---------------------------------------------------------------------
// STAFF ACCESS — system columns and tabs: owner only (CONFIG.STAFF_COLUMNS)
// ---------------------------------------------------------------------
const STAFF_PROTECT_DESC = 'Elite Global system data — only the owner can edit (staff columns are open)';
const SYSTEM_TAB_DESC = 'Elite Global system tab — only the owner can edit';
// warning-only protections made by earlier setups: replaced by the owner-only sheet protections below
const OLD_WARNING_RE = /is generated automatically|is updated automatically|headers are used by the web app|is written by the archive job|generated by setup script/;

/** Only the owner (the account running this) may edit; never "anyone in the domain". */
function ownerOnly_(prot) {
  const me = Session.getEffectiveUser();
  prot.setWarningOnly(false);
  try { prot.addEditor(me); } catch (e) { /* the owner is always an editor */ }
  const mine = String(me.getEmail() || '').toLowerCase();
  const others = prot.getEditors().filter(function (u) { return String(u.getEmail() || '').toLowerCase() !== mine; });
  if (others.length) prot.removeEditors(others);
  if (prot.canDomainEdit()) prot.setDomainEdit(false);
  return prot;
}

/** The sheet's own protection (one per sheet; created if missing), owner only, with these ranges left open. */
function protectSheet_(sh, desc, open) {
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (pr) {
    if (OLD_WARNING_RE.test(pr.getDescription())) pr.remove();
  });
  const prot = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0] || sh.protect();
  prot.setDescription(desc);
  ownerOnly_(prot);
  prot.setUnprotectedRanges(open || []);
  return prot;
}

/** The staff columns of the Lead Tracker, rows 2 → the last row of the grid. */
function staffRanges_(sh) {
  const cols = trackerCols_(sh);
  const rows = sh.getMaxRows() - 1;
  return CONFIG.STAFF_COLUMNS.filter(function (h) { return cols[h]; })
    .map(function (h) { return sh.getRange(2, cols[h], rows, 1); });
}

/**
 * Setup (idempotent): the Lead Tracker is owner-only except the staff columns; the other system tabs are owner-only.
 * Staff tabs added by hand are left alone.
 */
function protectForStaff_(ss) {
  const tr = ss.getSheetByName(CONFIG.TRACKER_TAB);
  if (tr) { COLS_MEMO_ = {}; protectSheet_(tr, STAFF_PROTECT_DESC, staffRanges_(tr)); }
  [CONFIG.TABS.VISA.name, CONFIG.TABS.PASSENGERS.name, CONFIG.TABS.CUSTOM.name, CONFIG.TABS.CONTACT.name,
    CONFIG.INFO_TAB, CONFIG.DUE_TAB, CONFIG.ARCHIVE.INDEX_TAB].forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (sh) protectSheet_(sh, SYSTEM_TAB_DESC);
  });
  Logger.log('Staff access: Lead Tracker open for staff in ' + CONFIG.STAFF_COLUMNS.length + ' columns only; ' +
    'system columns and tabs can only be edited by the owner account.');
}

/** Staff who are editors of the tracker or the Visa Applications folder cannot share them on or change access. */
function lockSharing_(ss, visaFolder) {
  [function () { return DriveApp.getFileById(ss.getId()); }, function () { return visaFolder; }].forEach(function (get) {
    try { const item = get(); if (item) item.setShareableByEditors(false); } catch (e) { Logger.log('⚠️ Could not turn off "Editors can share": ' + noEmails_(e.message)); }
  });
}

/** The grid grew (applyRowRules_): stretch the open staff ranges to the new rows. Never throws. */
function refreshStaffRanges_(sh) {
  try {
    if (sh.getName() !== CONFIG.TRACKER_TAB) return;
    const prot = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
    if (!prot || prot.getDescription() !== STAFF_PROTECT_DESC) return;
    prot.setUnprotectedRanges(staffRanges_(sh));
  } catch (e) { console.error('staff ranges not refreshed (setup fixes it): ' + noEmails_(e.message)); }
}

function writeSystemInfo_() {
  const ss = trackerSS_();
  const sh = ss.getSheetByName(CONFIG.INFO_TAB) || ss.insertSheet(CONFIG.INFO_TAB);
  const rows = [['Item', 'URL / Value']].concat(collectInfo_());
  sh.clear();
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange(1, 1, 1, 2).setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold');
  sh.setColumnWidth(1, 430); sh.setColumnWidth(2, 700);
  sh.getRange(2, 2, rows.length - 1, 1).setWrap(true);
  if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) protectSheet_(sh, SYSTEM_TAB_DESC);
}

function showSystemInfo() {
  const lines = collectInfo_().map(function (r) { return r[0] ? r[0] + ':\n   ' + noEmails_(r[1]) : ''; });
  Logger.log('\n' + lines.join('\n'));
}

// ---------------------------------------------------------------------
// OWNER ACCOUNT (per environment)
// ---------------------------------------------------------------------
function checkOwner_() {
  const me = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const expected = (PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || '')
    .trim().toLowerCase();
  if (!expected) {
    Logger.log('ℹ️ No OWNER_EMAIL set in Script Properties — continuing as the account you are signed in as' +
      '. Every file will be owned by this account. Run setOwnerEmail() to enforce an owner.');
    return;
  }
  if (me && me !== expected) {
    throw new Error('You are signed in as a different account from OWNER_EMAIL (Script Properties). Please run this script ' +
      'while signed in as the owner account so every file is owned by the right account.');
  }
}

/**
 * Stores the expected owner account for this environment in Script Properties (OWNER_EMAIL).
 * Called with no argument (e.g. Run from the editor) it stores the account you are signed in as.
 */
function setOwnerEmail(email) {
  const value = String(email || Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    throw new Error('setOwnerEmail: that is not a valid email address.');
  }
  PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', value);
  Logger.log('OWNER_EMAIL set' + (email ? '.' : ' to the account you are signed in as.'));
}

/** Only use if you deleted the generated folder and want to rebuild everything. */
function resetSetupFlag() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Setup flag, stored IDs and triggers cleared. You can run setupEliteGlobal() again.');
}

// ---------------------------------------------------------------------
// SCALE (schema 9)
// ---------------------------------------------------------------------
/**
 * Hidden Due tab, Archive Index tab, unused grid columns trimmed (Google counts every cell of a tab's grid
 * towards the 10 million limit — empty ones too), and Emails Sent filled once from the Email Log.
 */
function setupScale_(ss) {
  dueSheet_();
  archiveIndexSheet_();
  [CONFIG.TABS.VISA, CONFIG.TABS.PASSENGERS, CONFIG.TABS.CUSTOM, CONFIG.TABS.CONTACT].forEach(function (tab) {
    const sh = ss.getSheetByName(tab.name);
    if (!sh) return;
    const keep = Math.max(tab.headers.length, sh.getLastColumn());
    if (sh.getMaxColumns() > keep) {
      sh.deleteColumns(keep + 1, sh.getMaxColumns() - keep);
      Logger.log('Trimmed "' + tab.name + '" to ' + keep + ' columns.');
    }
  });
  backfillEmailsSent_();
}

/** Once: the done keys of each lead from the Email Log → its Emails Sent cell (so the log is never searched). */
function backfillEmailsSent_() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('EMAILS_SENT_FILLED') === 'yes') return;
  const logSS = spreadsheetOrNull_(p.getProperty('EMAIL_LOG_ID'));
  const log = logSS && logSS.getSheetByName(CONFIG.EMAIL.LOG_TAB);
  if (!log) { Logger.log('Emails Sent: no Email Log yet — skipped (the next setup run fills it).'); return; }
  const per = {};
  if (log.getLastRow() >= 2) {
    log.getRange(2, 1, log.getLastRow() - 1, 5).getValues().forEach(function (r) {
      const m = /^(EG-(?:VO|CE|GE)-\d{5})\|(.+)$/.exec(String(r[1] || ''));
      if (!m || !EMAIL_DONE[String(r[4])]) return;
      const list = per[m[1]] = per[m[1]] || [];
      if (list.indexOf(m[2]) === -1) list.push(m[2]);
    });
  }
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const last = sh.getLastRow();
  let n = 0;
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    const cells = sh.getRange(2, cols['Emails Sent'], last - 1, 1).getValues();
    ids.forEach(function (r, i) {
      const keys = per[String(r[0])];
      if (!keys) return;
      const cur = String(cells[i][0] || '').split(' ; ').filter(String);
      keys.forEach(function (k) { if (cur.indexOf(k) === -1) cur.push(k); });
      cells[i][0] = cur.join(' ; ');
      n++;
    });
    sh.getRange(2, cols['Emails Sent'], last - 1, 1).setValues(cells);
  }
  p.setProperty('EMAILS_SENT_FILLED', 'yes');
  Logger.log('Emails Sent filled from the Email Log for ' + n + ' lead(s).');
}
