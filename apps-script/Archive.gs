/**
 * Archive (round 2.5): finished leads move out of the live tracker 90 days after their Last Change, into
 * "Elite Global – Archive <YYYY>-Q<n>" (the quarter of Date Received; same tabs and columns), so the tracker
 * stays far below Google's 10 million cells and quick to use. Drive folders are not moved.
 *
 *   finished   = Lead Status Converted / Lost, or Review Status Visa Approved / Not Approved / Closed
 *   never moved: an email still to go out (current status not in Last Customer Email), a Due row, an Email
 *                Queue row, an upload or correction in progress, a ticked Send Now
 *   per batch (≤ 200 leads, under the script lock): copy every row of the lead (Lead Tracker + Visa
 *   Applications / Visa Passengers / Custom Requests / Contact Enquiries) → read it back and compare →
 *   Archive Index row (Lead ID → archive file) → only then delete from the live tabs (contiguous blocks).
 *   A stop at any point is safe: a lead already in the archive is compared again, never copied twice.
 *
 * Trigger runArchive: daily ~02:00 Lagos, but it only works on the 1st of the month or while a run is
 * unfinished (ARCHIVE_PENDING) — a monthly archive that finishes over as many nights as it needs.
 * archiveNow (Run button) runs it at once. The Track page still finds archived leads (read-only).
 */
const ARCHIVE_INDEX_HEADERS = ['Lead ID', 'Archived At', 'Archive File', 'Spreadsheet ID'];

/** Newest of Last Change, Review Updated and Date Received (ms), or 0. */
function lastChangeMs_(get) {
  let best = 0;
  ['Last Change', 'Review Updated', 'Date Received'].forEach(function (h) {
    let v;
    try { v = get(h); } catch (e) { v = null; }
    if (v instanceof Date && !isNaN(v)) best = Math.max(best, v.getTime());
  });
  return best;
}

function quarterOf_(v) {
  const d = v instanceof Date && !isNaN(v) ? v : new Date();
  const ymd = Utilities.formatDate(d, 'Africa/Lagos', 'yyyy-MM-dd').split('-');
  return ymd[0] + '-Q' + (Math.floor((Number(ymd[1]) - 1) / 3) + 1);
}

/** Why a lead may not be archived now ('' = it may). */
function archiveBlock_(get, x, now) {
  const A = CONFIG.ARCHIVE;
  const id = String(get('Lead ID') || '');
  if (!id) return 'empty';
  const ls = String(get('Lead Status') || '').trim();
  const rs = String(get('Review Status') || '').trim();
  if (A.LEAD_FINAL.indexOf(ls) === -1 && A.REVIEW_FINAL.indexOf(rs) === -1) return 'not finished';
  const lc = lastChangeMs_(get);
  if (!lc || now - lc < A.AGE_DAYS * 864e5) return 'changed in the last ' + A.AGE_DAYS + ' days';
  if (String(get('Lead Category')) === CONFIG.FORMS.VISA.category && rs &&
    String(get('Last Customer Email') || '').indexOf('Status: ' + rs + ' ·') === -1) return 'status email not sent yet';
  if (x.due[id]) return 'on the Due list';
  if (x.queue[id]) return 'email queued';
  if (x.props['UPLOAD_' + id] || x.props['CORR_' + id]) return 'upload or correction in progress';
  if (/^Uploading/.test(String(get('Application Status') || ''))) return 'upload in progress';
  if (get('Send Now') === true) return 'Send Now ticked';
  return '';
}

/** What archiveBlock_ needs, read once per run. */
function archiveContext_() {
  const x = { due: {}, queue: {}, props: PropertiesService.getScriptProperties().getProperties() };
  readDue_().forEach(function (r) { x.due[r.id] = true; });
  try {
    const q = emailQueueSheet_();
    if (q.getLastRow() >= 2) q.getRange(2, 4, q.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) x.queue[String(r[0])] = true; });
  } catch (e) { /* no queue */ }
  return x;
}

// ---------------------------------------------------------------------
// ARCHIVE FILES + INDEX
// ---------------------------------------------------------------------
function archiveIndexSheet_() {
  const ss = trackerSS_();
  let sh = ss.getSheetByName(CONFIG.ARCHIVE.INDEX_TAB);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.ARCHIVE.INDEX_TAB);
    sh.getRange(1, 1, 1, 4).setValues([ARCHIVE_INDEX_HEADERS]).setBackground(CONFIG.NAVY).setFontColor('#ffffff').setFontWeight('bold');
    try { if (sh.getMaxColumns() > 4) sh.deleteColumns(5, sh.getMaxColumns() - 4); } catch (e) { /* keep */ }
    sh.setFrozenRows(1);
    sh.getRange(2, 1, sh.getMaxRows() - 1, 4).protect().setDescription('Archive Index is written by the archive job').setWarningOnly(true);
  }
  return sh;
}

/** The archive spreadsheet of a quarter ("2026-Q4"), created with the live headers when missing. */
function archiveFile_(q) {
  const p = PropertiesService.getScriptProperties();
  let map = {};
  try { map = JSON.parse(p.getProperty('ARCHIVE_FILES') || '{}'); } catch (e) { map = {}; }
  if (map[q]) { try { return SpreadsheetApp.openById(map[q]); } catch (e) { /* recreate */ } }
  const ss = SpreadsheetApp.create(CONFIG.ARCHIVE.NAME + q);
  const root = folderOrNull_(p.getProperty('FOLDER_ID'));
  if (root) {
    const it = root.getFoldersByName(CONFIG.ARCHIVE.FOLDER);
    const folder = it.hasNext() ? it.next() : root.createFolder(CONFIG.ARCHIVE.FOLDER);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
  }
  const live = trackerSheet_();
  const head = live.getRange(1, 1, 1, live.getLastColumn()).getValues()[0];
  const first = ss.getSheets()[0];
  first.setName(CONFIG.TRACKER_TAB);
  if (first.getMaxColumns() < head.length) first.insertColumnsAfter(first.getMaxColumns(), head.length - first.getMaxColumns());
  first.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  textColumns_(first, head, ['Phone Number', 'Email']);
  [CONFIG.TABS.VISA, CONFIG.TABS.PASSENGERS, CONFIG.TABS.CUSTOM, CONFIG.TABS.CONTACT].forEach(function (tab) {
    const sh = ss.insertSheet(tab.name);
    if (sh.getMaxColumns() < tab.headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), tab.headers.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, tab.headers.length).setValues([tab.headers]).setFontWeight('bold');
    tab.textCols.forEach(function (c) { sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
  });
  map[q] = ss.getId();
  p.setProperty('ARCHIVE_FILES', JSON.stringify(map));
  Logger.log('Created archive file ' + CONFIG.ARCHIVE.NAME + q);
  return ss;
}
function textColumns_(sh, head, names) {
  names.forEach(function (n) { const c = head.indexOf(n) + 1; if (c) sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
}

// ---------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------
/** Run button: archive now (finished leads 90 days after their last change). Logs counts and Lead IDs' count only. */
function archiveNow() { return archiveRun_(true); }

/** Trigger (daily ~02:00): works on the 1st of the month, or while the last run is unfinished. */
function runArchive() {
  const p = PropertiesService.getScriptProperties();
  const first = Utilities.formatDate(new Date(), 'Africa/Lagos', 'yyyy-MM-dd').slice(8) === '01';
  if (!first && p.getProperty('ARCHIVE_PENDING') !== '1') return null;
  return archiveRun_(false);
}

function archiveRun_(manual) {
  const t0 = Date.now();
  const A = CONFIG.ARCHIVE;
  const deadline = t0 + A.BUDGET_MS;
  const p = PropertiesService.getScriptProperties();
  const out = { archived: 0, checked: 0, unfinished: false, files: {} };
  try {
    const sh = trackerSheet_();
    const cols = trackerCols_(sh);
    const last = sh.getLastRow();
    if (last >= 2) {
      const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
      const data = sh.getRange(2, 1, last - 1, width).getValues();
      const x = archiveContext_();
      const now = Date.now();
      const groups = {}; // quarter → [Lead ID] in row order
      data.forEach(function (v) {
        const get = function (h) { return v[cols[h] - 1]; };
        if (!v[0]) return;
        out.checked++;
        if (archiveBlock_(get, x, now)) return;
        const q = quarterOf_(get('Date Received'));
        (groups[q] = groups[q] || []).push(String(v[0]));
      });
      const quarters = Object.keys(groups).sort();
      for (let qi = 0; qi < quarters.length && !out.unfinished; qi++) {
        const q = quarters[qi], ids = groups[q];
        const arch = archiveFile_(q);
        for (let i = 0; i < ids.length; i += A.BATCH) {
          if (Date.now() > deadline) { out.unfinished = true; break; }
          const pos = archivePositions_(); // column A of each tab: read OUTSIDE the lock, re-checked inside
          const n = withLock_(function () { return archiveBatch_(ids.slice(i, i + A.BATCH), arch, x, pos); }, 30000);
          out.archived += n;
          out.files[q] = (out.files[q] || 0) + n;
        }
      }
      keepTrackerRows_(sh);
    }
  } catch (e) {
    out.unfinished = true;
    out.error = e.message;
    console.error('archive stopped: ' + e.message);
  } finally {
    p.setProperty('ARCHIVE_PENDING', out.unfinished ? '1' : '0');
    p.setProperty('ARCHIVE_LAST', Utilities.formatDate(new Date(), 'Africa/Lagos', 'd MMM yyyy HH:mm') + ' — ' + out.archived + ' archived' +
      (out.unfinished ? ' (continues tonight)' : '') + (out.error ? ' ⚠️ ' + out.error.slice(0, 80) : ''));
    recordRun_('archive', Date.now() - t0);
  }
  const line = 'archive ' + (manual ? 'manual' : 'trigger') + ' archived=' + out.archived + ' checked=' + out.checked +
    (out.unfinished ? ' unfinished' : '') + ' ' + Object.keys(out.files).map(function (q) { return q + ':' + out.files[q]; }).join(' ');
  console.log(line);
  if (manual) Logger.log(line + (out.unfinished ? '\nNot finished in time — run archiveNow again (or it continues tonight).' : ''));
  return out;
}

/** Keeps the Lead Tracker at least MIN_ROWS rows (pre-formatted) after deletes. */
function keepTrackerRows_(sh) {
  const max = sh.getMaxRows();
  if (max < CONFIG.ARCHIVE.MIN_ROWS) {
    sh.insertRowsAfter(max, CONFIG.ARCHIVE.MIN_ROWS - max);
    applyRowRules_(sh, max + 1, CONFIG.ARCHIVE.MIN_ROWS - max);
  }
  // rows were deleted: the stored next row is stale — the next lead finds it outside the lock (nextRowFallback_)
  PropertiesService.getScriptProperties().deleteProperty('NEXT_ROW_' + sh.getSheetId());
}

/** Value for the archive: HYPERLINK formulas kept, other formulas as their value, text never turned into a formula. */
function archiveCell_(value, formula) {
  if (formula && /^=HYPERLINK\(/i.test(formula)) return formula;
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}
function sameCell_(a, b, formula) {
  if (formula && /^=HYPERLINK\(/i.test(formula)) return true; // compared on the formula below
  // Sheets keeps dates to the second and shows text typed with a leading apostrophe without it
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && Math.abs(a.getTime() - b.getTime()) < 1000;
  const t = function (x) { return String(x === null || x === undefined ? '' : x).replace(/^'/, ''); };
  return t(a) === t(b);
}

/**
 * Outside the lock: column A (Lead IDs) of the Lead Tracker and the 4 detail tabs — the slow full-column reads.
 * Rows only move when rows are deleted (staff, clean-up, the archive itself), so archiveBatch_ re-checks every
 * row by its Lead ID under the lock and stops (nothing lost, resumed next night) if one moved.
 */
function archivePositions_() {
  const live = trackerSS_();
  const sh = trackerSheet_();
  const pos = { colA: sh.getLastRow() >= 1 ? sh.getRange(1, 1, sh.getLastRow(), 1).getValues() : [], tabs: {} };
  [CONFIG.TABS.VISA, CONFIG.TABS.PASSENGERS, CONFIG.TABS.CUSTOM, CONFIG.TABS.CONTACT].forEach(function (tab) {
    const d = live.getSheetByName(tab.name);
    pos.tabs[tab.name] = d && d.getLastRow() >= 2 ? d.getRange(2, 1, d.getLastRow() - 1, 1).getValues() : [];
  });
  return pos;
}

/**
 * Inside the lock. Copies → verifies → indexes → deletes one batch of Lead IDs. Re-checks each lead on fresh
 * rows (a change since the scan keeps it live). pos = archivePositions_() (read outside the lock). Returns the number archived.
 */
function archiveBatch_(ids, arch, x, pos) {
  const live = trackerSS_();
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const lastCol = sh.getLastColumn();
  const now = Date.now();
  pos = pos || archivePositions_();
  const colA = pos.colA;
  const rowOf = {};
  colA.forEach(function (r, i) { if (r[0] && i > 0) rowOf[String(r[0])] = i + 1; });
  // fresh tracker rows (one block over the batch span)
  const rows = ids.map(function (id) { return rowOf[id]; }).filter(Boolean);
  if (!rows.length) return 0;
  const r1 = Math.min.apply(null, rows), r2 = Math.max.apply(null, rows);
  const blockV = sh.getRange(r1, 1, r2 - r1 + 1, lastCol).getValues();
  const blockF = sh.getRange(r1, 1, r2 - r1 + 1, lastCol).getFormulas();
  const go = ids.filter(function (id) {
    const r = rowOf[id];
    if (!r) return false;
    const v = blockV[r - r1];
    if (String(v[0]) !== id) throw new Error('row moved during the archive (' + CONFIG.TRACKER_TAB + ') — stopped, nothing lost');
    return !archiveBlock_(function (h) { return v[cols[h] - 1]; }, x, now);
  });
  if (!go.length) return 0;
  const tabs = [{ sh: sh, name: CONFIG.TRACKER_TAB, width: lastCol, rows: {} }];
  go.forEach(function (id) { tabs[0].rows[id] = [rowOf[id]]; });
  [CONFIG.TABS.VISA, CONFIG.TABS.PASSENGERS, CONFIG.TABS.CUSTOM, CONFIG.TABS.CONTACT].forEach(function (tab) {
    const d = live.getSheetByName(tab.name);
    const a = pos.tabs[tab.name] || [];
    if (!d || !a.length) return;
    const t = { sh: d, name: tab.name, width: tab.headers.length, rows: {} };
    const want = {};
    go.forEach(function (id) { want[id] = true; });
    a.forEach(function (r, i) { const id = String(r[0] || ''); if (want[id]) (t.rows[id] = t.rows[id] || []).push(i + 2); });
    tabs.push(t);
  });
  // 1. copy (a lead already in the archive is rewritten in place, never twice) + 2. verify
  const idxSh = archiveIndexSheet_();
  tabs.forEach(function (t) {
    const all = [];
    Object.keys(t.rows).forEach(function (id) { t.rows[id].forEach(function (r) { all.push([id, r]); }); });
    if (!all.length) return;
    all.sort(function (a, b) { return a[1] - b[1]; });
    const lo = all[0][1], hi = all[all.length - 1][1];
    const span = hi - lo + 1 <= 5000;
    const V = span ? t.sh.getRange(lo, 1, hi - lo + 1, t.width).getValues() : null;
    const F = span ? t.sh.getRange(lo, 1, hi - lo + 1, t.width).getFormulas() : null;
    const src = all.map(function (e) {
      const v = span ? V[e[1] - lo] : t.sh.getRange(e[1], 1, 1, t.width).getValues()[0];
      const f = span ? F[e[1] - lo] : t.sh.getRange(e[1], 1, 1, t.width).getFormulas()[0];
      if (String(v[0]) !== e[0]) throw new Error('row moved during the archive (' + t.name + ') — stopped, nothing lost');
      return { id: e[0], v: v, f: f, out: v.map(function (val, j) { return archiveCell_(val, f[j]); }) };
    });
    const at = arch.getSheetByName(t.name);
    if (at.getMaxColumns() < t.width) at.insertColumnsAfter(at.getMaxColumns(), t.width - at.getMaxColumns());
    // rows already in the archive (an earlier stopped run): rewrite them in place
    const existing = {};
    if (at.getLastRow() >= 2) {
      at.getRange(2, 1, at.getLastRow() - 1, 1).getValues().forEach(function (r, i) {
        const id = String(r[0] || '');
        if (t.rows[id]) (existing[id] = existing[id] || []).push(i + 2);
      });
    }
    const fresh = [], placed = [];
    const used = {};
    src.forEach(function (s) {
      const ex = existing[s.id] || [];
      const k = (used[s.id] = (used[s.id] || 0) + 1) - 1;
      if (ex[k]) { at.getRange(ex[k], 1, 1, t.width).setValues([s.out]); placed.push([ex[k], s]); } else fresh.push(s);
    });
    if (fresh.length) {
      const start = at.getLastRow() + 1;
      if (start + fresh.length - 1 > at.getMaxRows()) at.insertRowsAfter(at.getMaxRows(), fresh.length + 500);
      at.getRange(start, 1, fresh.length, t.width).setValues(fresh.map(function (s) { return s.out; }));
      fresh.forEach(function (s, i) { placed.push([start + i, s]); });
    }
    placed.forEach(function (pl) {
      const gotV = at.getRange(pl[0], 1, 1, t.width).getValues()[0];
      const gotF = at.getRange(pl[0], 1, 1, t.width).getFormulas()[0];
      pl[1].v.forEach(function (val, j) {
        const f = pl[1].f[j];
        const ok = f && /^=HYPERLINK\(/i.test(f) ? gotF[j] === f : sameCell_(gotV[j], val, '');
        if (!ok) throw new Error('archive copy check failed (' + t.name + ', ' + pl[1].id + ') — nothing was deleted');
      });
    });
  });
  // 3. index (once per lead)
  const known = {};
  if (idxSh.getLastRow() >= 2) idxSh.getRange(2, 1, idxSh.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) known[String(r[0])] = true; });
  const url = arch.getUrl(), name = arch.getName().replace(/"/g, '');
  const idxRows = go.filter(function (id) { return !known[id]; }).map(function (id) {
    return [id, new Date(), '=HYPERLINK("' + url + '","' + name + '")', arch.getId()];
  });
  if (idxRows.length) {
    const start = idxSh.getLastRow() + 1;
    if (start + idxRows.length - 1 > idxSh.getMaxRows()) idxSh.insertRowsAfter(idxSh.getMaxRows(), idxRows.length + 500);
    idxSh.getRange(start, 1, idxRows.length, 4).setValues(idxRows);
  }
  // 4. delete from the live tabs: bottom-up, contiguous blocks, each row re-checked by its Lead ID
  tabs.forEach(function (t) {
    const del = [];
    Object.keys(t.rows).forEach(function (id) { t.rows[id].forEach(function (r) { del.push([r, id]); }); });
    del.sort(function (a, b) { return b[0] - a[0]; });
    let i = 0;
    while (i < del.length) {
      let j = i;
      while (j + 1 < del.length && del[j + 1][0] === del[j][0] - 1) j++;
      const top = del[j][0], n = j - i + 1;
      const check = t.sh.getRange(top, 1, n, 1).getValues();
      const okRows = check.every(function (r, k) { return String(r[0]) === del[j - k][1]; });
      if (!okRows) throw new Error('row moved during the archive (' + t.name + ') — stopped, nothing lost');
      t.sh.deleteRows(top, n);
      i = j + 1;
    }
  });
  return go.length;
}

// ---------------------------------------------------------------------
// LOOKUP (Track page, visa download): a lead that is no longer in the live tracker
// ---------------------------------------------------------------------
/** {leadId, row, get, archived: true, sheet} from the archive file in the Archive Index, or null. Read-only. */
function archivedLead_(leadId) {
  const idx = trackerSS_().getSheetByName(CONFIG.ARCHIVE.INDEX_TAB);
  if (!idx || idx.getLastRow() < 2) return null;
  const hit = idx.getRange(2, 1, idx.getLastRow() - 1, 1).createTextFinder(leadId).matchEntireCell(true).findNext();
  if (!hit) return null;
  const ssId = String(idx.getRange(hit.getRow(), 4).getValue() || '');
  let sh;
  try { sh = SpreadsheetApp.openById(ssId).getSheetByName(CONFIG.TRACKER_TAB); } catch (e) { return null; }
  if (!sh) return null;
  const row = findLeadRow_(sh, leadId);
  if (!row) return null;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const vals = sh.getRange(row, 1, 1, head.length).getValues()[0];
  const col = {};
  head.forEach(function (h, i) { if (h !== '' && !col[h]) col[h] = i + 1; });
  return { leadId: leadId, row: row, archived: true, sheet: sh, get: function (h) { return col[h] ? vals[col[h] - 1] : ''; } };
}
