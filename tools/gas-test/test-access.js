// Staff access: system columns and tabs are owner-only; staff edit only CONFIG.STAFF_COLUMNS (docs/LAUNCH.md).
module.exports = function (g, ok, t) {
  const { ctx, ss } = g;
  const C = ctx.__exports.CONFIG;
  const tr = t.tr;
  // an earlier setup left warning-only protections on the tracker
  tr.getRange(2, 1, 10, 1).protect().setDescription('Lead ID is generated automatically').setWarningOnly(true);
  tr.getRange(2, 30, 10, 1).protect().setDescription('Last Change is updated automatically').setWarningOnly(true);
  const keep = tr.getRange(2, 14, 5, 1).protect().setDescription('staff: my own note lock');
  ['System Info', 'Due', 'Archive Index'].forEach((n) => { if (!ss.getSheetByName(n)) ss.insertSheet(n); });
  ctx.protectForStaff_(ss);
  ctx.protectForStaff_(ss); // idempotent
  const sheetProt = (sh) => sh.getProtections('SHEET');
  const p = sheetProt(tr);
  const cols = ctx.trackerCols_(tr);
  const openCols = p[0] ? p[0].open.map((r) => r.c).sort((a, b) => a - b) : [];
  const want = C.STAFF_COLUMNS.map((h) => cols[h]).sort((a, b) => a - b);
  ok('STAFF_COLUMNS are all real tracker headers', C.STAFF_COLUMNS.every((h) => C.HEADERS.indexOf(h) !== -1));
  ok('Lead Tracker: one owner-only sheet protection (not a warning, no other editors, not the whole domain)', p.length === 1 && !p[0].warning &&
    p[0].editors.join() === 'test@example.com' && p[0].domain === false, JSON.stringify(p.map((x) => ({ w: x.warning, e: x.editors, d: x.domain }))));
  ok('… staff can edit exactly the staff columns, rows 2 → end of the grid', JSON.stringify(openCols) === JSON.stringify(want) &&
    p[0].open.every((r) => r.r === 2 && r.nr === tr.getMaxRows() - 1 && r.nc === 1), openCols.join(','));
  const sys = ['Lead ID', 'Date Received', 'Lead Category', 'Total Travellers', 'Drive Folder', 'Passengers', 'Lead Source', 'Application Status',
    'Review Updated', 'Last Customer Email', 'Visa Files', 'Last Change', 'Emails Sent'];
  ok('… system columns stay protected (Lead ID, Application Status, Review Updated, Last Customer Email, Visa Files, Last Change, Emails Sent, …)',
    sys.every((h) => cols[h] && openCols.indexOf(cols[h]) === -1), sys.filter((h) => openCols.indexOf(cols[h]) !== -1).join(','));
  ok('… the header row is protected (no open range covers row 1)', p[0].open.every((r) => r.r >= 2));
  const ranges = tr.getProtections('RANGE');
  ok('… the old warning-only protections are replaced; a protection staff made themselves is kept', ranges.length === 1 && ranges[0] === keep, ranges.map((x) => x.desc).join(' | '));
  const tabs = [C.TABS.VISA.name, C.TABS.PASSENGERS.name, C.TABS.CUSTOM.name, C.TABS.CONTACT.name, 'System Info', 'Due', 'Archive Index'];
  const bad = tabs.filter((n) => { const sh = ss.getSheetByName(n); const q = sh && sheetProt(sh); return !q || q.length !== 1 || q[0].warning || q[0].open.length || q[0].editors.join() !== 'test@example.com' || q[0].domain; });
  ok('Visa Applications, Visa Passengers, Custom Requests, Contact Enquiries, System Info, Due, Archive Index: owner-only, nothing open', bad.length === 0, bad.join(', '));
  // the grid grows (a full tracker): the staff columns open on the new rows too
  const before = tr.getMaxRows();
  tr.insertRowsAfter(before, 500);
  ctx.applyRowRules_(tr, before + 1, 500);
  ok('when the grid grows, the staff ranges stretch to the new rows', sheetProt(tr)[0].open.every((r) => r.r === 2 && r.nr === tr.getMaxRows() - 1));
  const other = ss.insertSheet('My notes');
  ctx.protectForStaff_(ss);
  ok('a tab staff added themselves is left alone', other.getProtections('SHEET').length === 0);
  ss.sheets.splice(ss.sheets.indexOf(other), 1);
};
