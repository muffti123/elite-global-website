/**
 * Status emails that are due — a hidden "Due" tab in the tracker (Lead ID, Due At, Reason), written under the
 * script lock. runEmailJobs reads only this small tab every 5 minutes, so a run with nothing due is cheap; an
 * hourly full scan of the Lead Tracker stays as the safety net (an edit the trigger missed, a paste …).
 * Rows are removed once handled; waiting / held rows stay (re-checked every run).
 * Not Script Properties: a property value is limited to ~9 KB (500 KB in total), which a busy day could exceed.
 */
const DUE_HEADERS = ['Lead ID', 'Due At', 'Reason'];

function dueSheet_() {
  const ss = trackerSS_();
  let sh = ss.getSheetByName(CONFIG.DUE_TAB);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.DUE_TAB);
    sh.getRange(1, 1, 1, 3).setValues([DUE_HEADERS]).setFontWeight('bold');
    try { if (sh.getMaxColumns() > 3) sh.deleteColumns(4, sh.getMaxColumns() - 3); } catch (e) { /* keep */ }
    try { sh.hideSheet(); } catch (e) { /* mock */ }
  }
  return sh;
}

/** Adds due rows [{id, at, reason}]. Under the lock (taken here unless this execution already holds it). Never throws. */
function addDueMany_(items) {
  if (!items || !items.length) return;
  const write = function () {
    const sh = dueSheet_();
    const at = sh.getLastRow() + 1;
    if (at + items.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), items.length + 100);
    sh.getRange(at, 1, items.length, 3).setValues(items.map(function (x) {
      return [x.id, x.at instanceof Date ? x.at : new Date(x.at || Date.now()), String(x.reason || '').slice(0, 80)];
    }));
  };
  try {
    const lock = LockService.getScriptLock();
    if (lock.hasLock && lock.hasLock()) write();
    else withLock_(write, 5000);
  } catch (e) { console.error('Due not written (the hourly scan catches it): ' + e.message); }
}
function addDue_(leadId, reason, at) { addDueMany_([{ id: leadId, at: at || Date.now() + CONFIG.EMAIL.UNDO_MIN * 60000, reason: reason }]); }

/** All due rows: [{id, at (ms), reason}] ('' rows skipped). */
function readDue_() {
  const sh = dueSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 3).getValues().filter(function (r) { return r[0]; }).map(function (r) {
    const t = r[1] instanceof Date ? r[1].getTime() : Number(r[1]) || 0;
    return { id: String(r[0]), at: t, reason: String(r[2] || '') };
  });
}

/**
 * Status emails for the due Lead IDs (reviewEmailRow_, same rules as the full scan). Returns the same counts
 * as processReviewEmails_ plus due (rows left). The tab is rewritten under the lock: handled leads removed,
 * waiting / held ones kept with their next check time, rows added meanwhile kept.
 */
function processDue_(deadline) {
  const out = { sent: 0, queued: 0, skipped: 0, held: 0, waiting: 0, due: 0, handled: 0 };
  const rows = readDue_();
  if (!rows.length) return out;
  const now = Date.now();
  const byId = {};
  rows.forEach(function (r) { if (!byId[r.id] || r.at < byId[r.id].at) byId[r.id] = r; });
  const ids = Object.keys(byId).filter(function (id) { return byId[id].at <= now; }).slice(0, CONFIG.LIMITS_GOOGLE.DUE_MAX);
  if (!ids.length) { out.due = Object.keys(byId).length; return out; }
  const sh = trackerSheet_();
  const cols = trackerCols_(sh);
  const width = Math.max.apply(null, CONFIG.HEADERS.map(function (h) { return cols[h]; }));
  const remove = {}, keep = {}, decisions = [];
  ids.forEach(function (id) {
    if (Date.now() > deadline) return;
    const row = findLeadRow_(sh, id);
    if (!row) { remove[id] = true; return; } // archived or removed
    const v = sh.getRange(row, 1, 1, width).getValues()[0];
    const r = reviewEmailRow_(sh, cols, v, row, { deadline: deadline, now: now });
    if (r.decision) decisions.push(r.decision);
    if (out[r.outcome] !== undefined) out[r.outcome]++;
    out.handled++;
    if (r.outcome === 'waiting') {
      const up = v[cols['Review Updated'] - 1];
      const at = up instanceof Date ? up.getTime() + CONFIG.EMAIL.UNDO_MIN * 60000 : Date.now() + CONFIG.EMAIL.UNDO_MIN * 60000;
      keep[id] = { id: id, at: Math.max(at, Date.now()), reason: 'waiting (undo window)' };
    } else if (r.outcome === 'held') {
      keep[id] = { id: id, at: Date.now(), reason: 'held: ' + r.reason };
    } else remove[id] = true;
  });
  saveReviewDecisions_(decisions);
  rewriteDue_(now, remove, keep);
  out.due = readDue_().length;
  return out;
}

/** Under the lock: drop rows (that existed at `seen`) of removed / kept leads, add the kept ones once. */
function rewriteDue_(seen, remove, keep) {
  if (!Object.keys(remove).length && !Object.keys(keep).length) return;
  withLock_(function () {
    const sh = dueSheet_();
    const last = sh.getLastRow();
    const cur = last >= 2 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
    const next = [];
    cur.forEach(function (r) {
      if (!r[0]) return;
      const id = String(r[0]);
      const t = r[1] instanceof Date ? r[1].getTime() : Number(r[1]) || 0;
      if ((remove[id] || keep[id]) && t <= seen) return; // handled (a newer row added meanwhile stays)
      next.push(r);
    });
    Object.keys(keep).forEach(function (id) { next.push([id, new Date(keep[id].at), keep[id].reason]); });
    if (last >= 2) sh.getRange(2, 1, last - 1, 3).clearContent();
    if (next.length) {
      if (next.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), next.length);
      sh.getRange(2, 1, next.length, 3).setValues(next);
    }
  }, 20000);
}
