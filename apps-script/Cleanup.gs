/**
 * Test-data clean-up and error notices.
 */

// ---------------------------------------------------------------------
// TEST DATA CLEAN-UP
// Submit test enquiries with a name starting with "TEST " (capitals + a space), then run previewTestData to see
// which Lead IDs match and cleanupTestData to remove them from every tracker tab (incl. Visa Applications), move
// their visa folders to the Drive bin and drop their upload state.
// ---------------------------------------------------------------------

/** A TEST lead's name: "TEST" in capitals + a space at the start (Sheets may keep a leading '). Never "Testimony …",
 *  "test …" or "TESTIMONY …" — on production those are real customers. */
function isTestName_(name) {
  return /^\s*'?TEST\s/.test(String(name || ''));
}

/**
 * Editor (no arguments): shows what cleanupTestData would remove — Lead IDs and counts only (never names).
 * Changes nothing. Run it on production before cleanupTestData.
 */
function previewTestData() {
  const ss = trackerSS_();
  const ids = {};
  const counts = [];
  [CONFIG.TRACKER_TAB, CONFIG.TABS.VISA.name, CONFIG.TABS.CUSTOM.name, CONFIG.TABS.CONTACT.name].forEach(function (tab) {
    const sh = ss.getSheetByName(tab);
    let n = 0;
    if (sh && sh.getLastRow() >= 2) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
        if (r[0] !== '' && isTestName_(r[2])) { ids[String(r[0])] = true; n++; }
      });
    }
    counts.push(tab + ': ' + n);
  });
  let folders = 0;
  const visa = folderOrNull_(PropertiesService.getScriptProperties().getProperty('VISA_FOLDER_ID'));
  if (visa) {
    const it = visa.getFolders();
    while (it.hasNext()) {
      const m = it.next().getName().match(/^(EG-VO-\d{5}) – (.*)$/);
      if (m && (ids[m[1]] || isTestName_(m[2]))) { ids[m[1]] = true; folders++; }
    }
  }
  const list = Object.keys(ids).sort();
  Logger.log('previewTestData — nothing was changed.\ncleanupTestData would remove ' + list.length +
    ' TEST lead(s) (names starting with "TEST " in capitals):\n' + (list.length ? list.slice(0, 300).join(', ') +
    (list.length > 300 ? ' … and ' + (list.length - 300) + ' more' : '') : '(none)') +
    '\nRows: ' + counts.join(', ') + ', visa folders: ' + folders +
    '\n(plus their passenger rows, upload/correction states, Due, Email Log and archive rows).' +
    '\nIf a Lead ID here is a real customer, do NOT run cleanupTestData — rename that lead first.');
  return list;
}

function cleanupTestData() {
  const p = PropertiesService.getScriptProperties();
  const isTest = isTestName_;
  const ss = trackerSS_();
  const testIds = {};
  const removed = { tracker: 0, visa: 0, passengers: 0, custom: 0, contact: 0, folders: 0, uploads: 0, corrections: 0, legacy: 0, emails: 0 };

  // 1. Lead Tracker — remember the Lead IDs of TEST leads
  const tr = ss.getSheetByName(CONFIG.TRACKER_TAB);
  const tv = tr.getRange(2, 1, tr.getMaxRows() - 1, 3).getValues();
  for (let i = tv.length - 1; i >= 0; i--) {
    if (tv[i][0] !== '' && isTest(tv[i][2])) {
      testIds[tv[i][0]] = true;
      tr.deleteRow(i + 2);
      removed.tracker++;
    }
  }
  // keep the grid at full size so formulas/dropdowns remain on every row
  if (tr.getMaxRows() < CONFIG.TRACKER_ROWS) {
    const add = CONFIG.TRACKER_ROWS - tr.getMaxRows();
    const start = tr.getMaxRows() + 1;
    tr.insertRowsAfter(tr.getMaxRows(), add);
    applyRowRules_(tr, start, add);
  }

  // 2. Detail tabs: rows of TEST leads (by Lead ID, or by name in column C)
  const sweep = function (tab, nameCol) {
    const sh = ss.getSheetByName(tab.name);
    if (!sh || sh.getLastRow() < 2) return 0;
    const vals = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(nameCol, 1)).getValues();
    let n = 0;
    for (let i = vals.length - 1; i >= 0; i--) {
      if (testIds[vals[i][0]] || (nameCol && isTest(vals[i][nameCol - 1]))) {
        if (nameCol) testIds[vals[i][0]] = true;
        sh.deleteRow(i + 2);
        n++;
      }
    }
    return n;
  };
  removed.visa = sweep(CONFIG.TABS.VISA, 3);
  removed.custom = sweep(CONFIG.TABS.CUSTOM, 3);
  removed.contact = sweep(CONFIG.TABS.CONTACT, 3);
  removed.passengers = sweep(CONFIG.TABS.PASSENGERS, 0);

  // 3. Visa folders "EG-VO-00012 – TEST …" → Drive bin (restorable for 30 days)
  const visa = folderOrNull_(p.getProperty('VISA_FOLDER_ID'));
  if (visa) {
    const it = visa.getFolders();
    while (it.hasNext()) {
      const f = it.next();
      const m = f.getName().match(/^(EG-VO-\d{5}) – (.*)$/);
      if (m && (testIds[m[1]] || isTest(m[2]))) {
        f.setTrashed(true);
        testIds[m[1]] = true;
        removed.folders++;
      }
    }
  }

  // 4. Upload state of TEST leads, then anything older than 24 h
  Object.keys(testIds).forEach(function (id) {
    if (getUploadState_(id)) { deleteUploadState_(id); removed.uploads++; }
  });
  removed.uploads += purgeStaleUploads_();
  // … and unfinished corrections of TEST leads, then expired ones (pending files → Drive bin)
  removed.corrections = purgeStaleCorrections_(testIds);

  // 5. Retired Google Forms + their response sheets (only if they still exist)
  removed.legacy = cleanupLegacyForms_(isTest);

  // 6. Due rows, Archive Index rows and archived rows of TEST leads (round 2.5) — first, so archived TEST
  //    leads are known before the Email Log is cleaned
  removed.archived = cleanupArchive_(testIds, isTest);
  removed.due = cleanupDue_(testIds);

  // 7. Email Log + Email Queue rows of TEST leads (separate spreadsheet)
  removed.emails = cleanupEmailLog_(testIds);

  // Restart Lead IDs at 00001 only if the tracker is empty AND nothing was ever archived (archived leads keep their
  // IDs: restarting would give a new lead the ID of an archived one)
  let archivedLeads = 0;
  try { archivedLeads = Math.max(archiveIndexSheet_().getLastRow() - 1, 0); } catch (e) { archivedLeads = 1; }
  if (tr.getRange(2, 1).getValue() === '' && archivedLeads === 0) p.setProperty('LEAD_SEQ', '0');

  Logger.log('Removed TEST data — tracker rows: ' + removed.tracker + ', visa applications: ' + removed.visa + ', visa passengers: ' + removed.passengers +
    ', custom requests: ' + removed.custom + ', contact enquiries: ' + removed.contact +
    ', visa folders moved to bin: ' + removed.folders + ', upload states: ' + removed.uploads + ', correction states: ' + removed.corrections +
    ', retired-form records: ' + removed.legacy + ', email log/queue rows: ' + removed.emails +
    ', due rows: ' + (removed.due || 0) + ', archived rows: ' + (removed.archived || 0) + '.');
}

function cleanupLegacyForms_(isTest) {
  const p = PropertiesService.getScriptProperties();
  let removed = 0;
  [['SS_VISA_ID', 'FORM_VISA_ID'], ['SS_CUSTOM_ID', 'FORM_CUSTOM_ID'], ['SS_CONTACT_ID', 'FORM_CONTACT_ID']]
    .forEach(function (pair) {
      try {
        if (p.getProperty(pair[0])) {
          SpreadsheetApp.openById(p.getProperty(pair[0])).getSheets().forEach(function (sh) {
            if (sh.getLastRow() < 2) return;
            const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
            const col = head.indexOf(Q.NAME) + 1;
            if (!col) return;
            const vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
            for (let i = vals.length - 1; i >= 0; i--) {
              if (isTest(vals[i][0])) { sh.deleteRow(i + 2); removed++; }
            }
          });
        }
        if (p.getProperty(pair[1])) {
          const form = FormApp.openById(p.getProperty(pair[1]));
          form.getResponses().forEach(function (r) {
            const nameResp = r.getItemResponses().filter(function (ir) {
              return ir.getItem().getTitle().trim() === Q.NAME;
            })[0];
            if (nameResp && isTest(nameResp.getResponse())) { form.deleteResponse(r.getId()); removed++; }
          });
        }
      } catch (e) {
        Logger.log('Skipped retired ' + pair[1] + ' clean-up: ' + noEmails_(e.message));
      }
    });
  return removed;
}

// ---------------------------------------------------------------------
// ERROR NOTICES — at most one email per 10 minutes. Never include request data.
// ---------------------------------------------------------------------
function notifyError_(err, action) {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('ERR_MAIL')) return;
    cache.put('ERR_MAIL', '1', 600);
    const m = renderErrorEmail_(action, err);
    sendEmail_({ to: staffEmail_(), kind: 'error', subject: m.subject, html: m.html, text: m.text });
  } catch (ignore) { /* mail quota reached — the error is still in the Executions log */ }
}

/** Due rows of TEST leads (under the lock). */
function cleanupDue_(testIds) {
  let n = 0;
  try {
    withLock_(function () {
      const sh = dueSheet_();
      for (let r = sh.getLastRow(); r >= 2; r--) {
        if (testIds[String(sh.getRange(r, 1).getValue())]) { sh.deleteRow(r); n++; }
      }
    }, 30000);
  } catch (e) { Logger.log('Due clean-up skipped: ' + noEmails_(e.message)); }
  return n;
}

/** Archive Index rows and archive-file rows of TEST leads (by Lead ID, or a TEST name in an archived tracker row). */
function cleanupArchive_(testIds, isTest) {
  let n = 0;
  let idx;
  try { idx = archiveIndexSheet_(); } catch (e) { return 0; }
  const files = {};
  if (idx.getLastRow() >= 2) {
    const rows = idx.getRange(2, 1, idx.getLastRow() - 1, 4).getValues();
    rows.forEach(function (r) { if (r[3]) files[String(r[3])] = true; });
  }
  Object.keys(files).forEach(function (id) {
    let ss;
    try { ss = SpreadsheetApp.openById(id); } catch (e) { return; }
    const tr = ss.getSheetByName(CONFIG.TRACKER_TAB);
    if (tr && tr.getLastRow() >= 2) {
      const v = tr.getRange(2, 1, tr.getLastRow() - 1, 3).getValues();
      v.forEach(function (r) { if (r[0] && isTest(r[2])) testIds[String(r[0])] = true; });
    }
    ss.getSheets().forEach(function (sh) {
      for (let r = sh.getLastRow(); r >= 2; r--) {
        if (testIds[String(sh.getRange(r, 1).getValue())]) { sh.deleteRow(r); n++; }
      }
    });
  });
  for (let r = idx.getLastRow(); r >= 2; r--) {
    if (testIds[String(idx.getRange(r, 1).getValue())]) { idx.deleteRow(r); n++; }
  }
  return n;
}
