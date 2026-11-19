/**
 * Test-data clean-up and error notices.
 */

// ---------------------------------------------------------------------
// TEST DATA CLEAN-UP
// Submit your test enquiries with a Full Name starting with "TEST",
// then run this to remove them from forms, response sheets and tracker.
// ---------------------------------------------------------------------
function cleanupTestData() {
  const p = PropertiesService.getScriptProperties();
  const isTest = function (name) { return /^\s*TEST/i.test(String(name || '')); };
  let removed = 0;

  // 1. Central tracker
  const tr = SpreadsheetApp.openById(p.getProperty('TRACKER_ID')).getSheetByName(CONFIG.TRACKER_TAB);
  const tv = tr.getRange(2, 3, tr.getMaxRows() - 1, 1).getValues();
  for (let i = tv.length - 1; i >= 0; i--) {
    if (isTest(tv[i][0])) { tr.deleteRow(i + 2); removed++; }
  }
  // keep the grid at full size so formulas/dropdowns remain on every row
  if (tr.getMaxRows() < CONFIG.TRACKER_ROWS) {
    const add = CONFIG.TRACKER_ROWS - tr.getMaxRows();
    const start = tr.getMaxRows() + 1;
    tr.insertRowsAfter(tr.getMaxRows(), add);
    applyRowRules_(tr, start, add);
  }

  // 2. Response spreadsheets + 3. Form responses
  [['SS_VISA_ID', 'FORM_VISA_ID'], ['SS_CUSTOM_ID', 'FORM_CUSTOM_ID'], ['SS_CONTACT_ID', 'FORM_CONTACT_ID']]
    .forEach(function (pair) {
      const ss = SpreadsheetApp.openById(p.getProperty(pair[0]));
      ss.getSheets().forEach(function (sh) {
        if (sh.getLastRow() < 2) return;
        const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
        const col = head.indexOf(Q.NAME) + 1;
        if (!col) return;
        const vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
        for (let i = vals.length - 1; i >= 0; i--) {
          if (isTest(vals[i][0])) { sh.deleteRow(i + 2); removed++; }
        }
      });
      const form = FormApp.openById(p.getProperty(pair[1]));
      form.getResponses().forEach(function (r) {
        const nameResp = r.getItemResponses().filter(function (ir) {
          return ir.getItem().getTitle().trim() === Q.NAME;
        })[0];
        if (nameResp && isTest(nameResp.getResponse())) { form.deleteResponse(r.getId()); removed++; }
      });
    });

  // Restart Lead IDs at 00001 if the tracker is now empty
  if (tr.getRange(2, 1).getValue() === '') p.setProperty('LEAD_SEQ', '0');

  Logger.log('Removed ' + removed + ' test records. ' +
    'Delete any test passport files manually from the forms\' upload folders in Drive.');
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
