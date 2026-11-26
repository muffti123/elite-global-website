// setupEliteGlobal on a completely EMPTY project (production's first run: no Script Properties IDs, no tracker, no
// Email Log), then a re-run and a run after a half-done first run: nothing is created twice. Own mock instance.
module.exports = function (dir, ok) {
  const g = require('./gasmock')(dir);
  const { ctx, props, books, folders, triggers, logs } = g;
  const C = ctx.__exports.CONFIG;
  Object.assign(props, { SITE_URL: 'https://elitetravelng.com', OWNER_EMAIL: 'test@example.com', STAFF_EMAIL: 'test@example.com', ATTACH_VISA: 'on', EMAIL_PROVIDER: 'mailapp' });
  const run = () => { try { ctx.setupEliteGlobal(); return ''; } catch (e) { return e.message + ' @ ' + String(e.stack).split('\n').slice(1, 4).join(' | '); } };
  const count = () => ({
    trackers: Object.values(books).filter((b) => b.name === C.TRACKER_NAME).length,
    logs: Object.values(books).filter((b) => b.name === C.EMAIL.LOG_NAME).length,
    roots: folders.filter((f) => f.name === C.FOLDER_NAME && !f.trashed).length,
    visa: folders.filter((f) => f.name === C.VISA_FOLDER_NAME && !f.trashed).length,
    triggers: triggers.map((t) => t.handler).sort().join(','),
  });
  const tabs = () => { const t = books[props.TRACKER_ID]; return t ? t.sheets.map((s) => s.name).sort().join(',') : ''; };

  const err1 = run();
  ok('fresh project: setupEliteGlobal completes (no "Setup has not been run")', err1 === '' && logs.some((l) => /SETUP COMPLETE/.test(l)), err1);
  const ids = ['FOLDER_ID', 'VISA_FOLDER_ID', 'TRACKER_ID', 'EMAIL_LOG_ID', 'OTP_SECRET', 'LEAD_SEQ', 'SETUP_DONE', 'SCHEMA_VERSION'];
  ok('… every ID / setting it needs is stored', ids.every((k) => props[k]), ids.filter((k) => !props[k]).join(','));
  const c1 = count(), t1 = tabs();
  ok('… one root folder, one Visa Applications folder, one tracker, one Email Log', c1.roots === 1 && c1.visa === 1 && c1.trackers === 1 && c1.logs === 1, JSON.stringify(c1));
  ok('… the tracker has every tab (incl. Due, Archive Index, System Info)', [C.TRACKER_TAB, C.TABS.VISA.name, C.TABS.PASSENGERS.name, C.TABS.CUSTOM.name, C.TABS.CONTACT.name,
    C.INFO_TAB, C.DUE_TAB, C.ARCHIVE.INDEX_TAB].every((n) => t1.split(',').indexOf(n) !== -1), t1);
  ok('… four triggers', c1.triggers === 'onTrackerEdit,runArchive,runEmailJobs,sendDailySummary', c1.triggers);
  ok('… Emails Sent backfill ran on the new (empty) Email Log', props.EMAILS_SENT_FILLED === 'yes');
  ok('… staff protection on (owner-only Lead Tracker)', books[props.TRACKER_ID].getSheetByName(C.TRACKER_TAB).getProtections('SHEET').length === 1);
  ok('… schema ' + C.SCHEMA_VERSION + ', no TEST_OTP_BYPASS, nothing paused', props.SCHEMA_VERSION === C.SCHEMA_VERSION && !props.TEST_OTP_BYPASS && !props.FORMS_PAUSED);

  // a re-run: nothing duplicated
  const err2 = run();
  const c2 = count();
  ok('re-run: completes and creates nothing new (folders, tracker, Email Log, tabs, triggers)', err2 === '' && JSON.stringify(c2) === JSON.stringify(c1) && tabs() === t1, err2 + ' ' + JSON.stringify(c2));
  ok('… protections not stacked', books[props.TRACKER_ID].getSheetByName(C.TRACKER_TAB).getProtections('SHEET').length === 1 &&
    books[props.TRACKER_ID].getSheetByName(C.DUE_TAB).getProtections('SHEET').length === 1);

  // the production case: a first run that stopped after the tracker (FOLDER_ID, VISA_FOLDER_ID, TRACKER_ID set, no Email Log)
  const h = require('./gasmock')(dir);
  Object.assign(h.props, { OWNER_EMAIL: 'test@example.com', STAFF_EMAIL: 'test@example.com' });
  const realScale = h.ctx.setupScale_;
  h.ctx.setupScale_ = () => { throw new Error('Setup has not been run (no EMAIL_LOG_ID).'); };
  try { h.ctx.setupEliteGlobal(); } catch (e) { /* the old failure */ }
  h.ctx.setupScale_ = realScale;
  const half = { tr: h.props.TRACKER_ID, root: h.props.FOLDER_ID, done: h.props.SETUP_DONE };
  let err3 = '';
  try { h.ctx.setupEliteGlobal(); } catch (e) { err3 = e.message; }
  const nTr = Object.values(h.books).filter((b) => b.name === C.TRACKER_NAME).length;
  const nRoot = h.folders.filter((f) => f.name === C.FOLDER_NAME).length;
  const nLog = Object.values(h.books).filter((b) => b.name === C.EMAIL.LOG_NAME).length;
  const nTrig = h.triggers.length;
  ok('after a half-done first run (stopped after the tracker): setup completes; same tracker and folder; one Email Log; 4 triggers',
    half.tr && !half.done && err3 === '' && h.props.TRACKER_ID === half.tr && h.props.FOLDER_ID === half.root && nTr === 1 && nRoot === 1 && nLog === 1 &&
    nTrig === 4 && h.props.SETUP_DONE === 'yes', JSON.stringify([half, err3, nTr, nRoot, nLog, nTrig]));

  // backfillEmailsSent_ skips cleanly without an Email Log
  const k = require('./gasmock')(dir);
  Object.assign(k.props, { OWNER_EMAIL: 'test@example.com' });
  let err4 = '';
  try { k.ctx.backfillEmailsSent_(); } catch (e) { err4 = e.message; }
  ok('backfillEmailsSent_ without an Email Log: skipped, no error, retried next run', err4 === '' && k.props.EMAILS_SENT_FILLED !== 'yes' && k.logs.some((l) => /no Email Log yet/.test(l)), err4);
};
