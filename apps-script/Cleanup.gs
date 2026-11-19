/**
 * Test-data clean-up and error notices.
 */

// ---------------------------------------------------------------------
// TEST DATA CLEAN-UP
// Submit test enquiries with a name starting with "TEST", then run this to remove them from
// every tracker tab, move their visa folders to the Drive bin and drop their upload state.
// ---------------------------------------------------------------------
function cleanupTestData() {
  const p = PropertiesService.getScriptProperties();
  const isTest = function (name) { return /^\s*'?TEST/i.test(String(name || '')); };
  const ss = trackerSS_();
  const testIds = {};
  const removed = { tracker: 0, passengers: 0, custom: 0, contact: 0, folders: 0, uploads: 0, legacy: 0 };

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

  // 5. Retired Google Forms + their response sheets (only if they still exist)
  removed.legacy = cleanupLegacyForms_(isTest);

  // Restart Lead IDs at 00001 if the tracker is now empty
  if (tr.getRange(2, 1).getValue() === '') p.setProperty('LEAD_SEQ', '0');

  Logger.log('Removed TEST data — tracker rows: ' + removed.tracker + ', visa passengers: ' + removed.passengers +
    ', custom requests: ' + removed.custom + ', contact enquiries: ' + removed.contact +
    ', visa folders moved to bin: ' + removed.folders + ', upload states: ' + removed.uploads +
    ', retired-form records: ' + removed.legacy + '.');
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
        Logger.log('Skipped retired ' + pair[1] + ' clean-up: ' + e.message);
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
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      '⚠️ Elite Global web app error',
      'A website submission failed' + (action ? ' (' + action + ')' : '') + '.\n' +
      'The customer was asked to try again. Check Apps Script → Executions for details.\n\n' +
      'Error: ' + (err && err.message) + '\n\nStack: ' + (err && err.stack));
  } catch (ignore) { /* mail quota reached — the error is still in the Executions log */ }
}
