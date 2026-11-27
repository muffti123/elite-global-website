/**
 * System health: how much of Google's daily limits the system uses. Each trigger run and web-app action adds
 * to a small record per day (Script Property HEALTH_<yyyy-MM-dd>, under 1 KB; 8 days kept). The daily summary
 * shows yesterday's numbers with ⚠️ at 70 % of a limit. Counts can miss a few updates when requests overlap
 * (no lock, on purpose) — they are for trends, not billing. No personal data.
 */
function healthKey_(d) { return 'HEALTH_' + Utilities.formatDate(d || new Date(), 'Africa/Lagos', 'yyyy-MM-dd'); }

function healthGet_(key) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '{}'); } catch (e) { return {}; }
}
function healthUpdate_(fn) {
  try {
    const key = healthKey_();
    const h = healthGet_(key);
    fn(h);
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(h));
  } catch (e) { /* health is best-effort */ }
}

/** A trigger run (jobs / edit / summary / archive): count, total and slowest time. */
function recordRun_(kind, ms) {
  healthUpdate_(function (h) {
    const r = h[kind] || (h[kind] = { n: 0, ms: 0, max: 0 });
    r.n++; r.ms += ms; r.max = Math.max(r.max, ms);
  });
}
function countHealth_(name, n) { healthUpdate_(function (h) { h[name] = (h[name] || 0) + (n || 1); }); }

/** A web-app action: count, busy replies, slowest action, script-lock holds {n, ms, max, a: action of the longest}. */
function recordAction_(action, ms, busy, lock) {
  healthUpdate_(function (h) {
    h.act = (h.act || 0) + 1;
    if (busy) h.busy = (h.busy || 0) + 1;
    if (!h.slow || ms > h.slow[1]) h.slow = [action, ms];
    if (lock && lock.n) {
      const l = h.lock || (h.lock = { n: 0, ms: 0, max: 0, a: '' });
      l.n += lock.n; l.ms += lock.held;
      if (lock.max > l.max) { l.max = lock.max; l.a = action; }
    }
  });
}

/**
 * Codes sent vs confirmed (yesterday and today). Google can accept an email and then bounce it (outbound spam
 * block): the script never sees that bounce, but customers who never type their code show it. ⚠️ when at least
 * CODE_WARN_MIN codes went out and fewer than half were confirmed, or when sending failed.
 */
const CODE_WARN_MIN = 4;
function codeHealthText_(y, t) {
  const part = function (h, label) {
    const sent = h.code || 0, okN = h.codeOk || 0, bad = h.mailFail || 0;
    return label + ' ' + sent + ' sent · ' + okN + ' confirmed' + (bad ? ' · ' + bad + ' failed to send' : '');
  };
  const weak = function (h) { return (h.code || 0) >= CODE_WARN_MIN && (h.codeOk || 0) < (h.code || 0) / 2 || (h.mailFail || 0) > 0; };
  const text = part(y, 'yesterday') + ' — ' + part(t, 'today');
  return weak(y) || weak(t)
    ? '⚠️ customer emails may be failing (' + text + '). Check Admin console → Reporting → Email Log Search for bounces, and consider EMAIL_PROVIDER = brevo.'
    : text;
}

/** Removes health records older than 8 days. */
function pruneHealth_() {
  const p = PropertiesService.getScriptProperties();
  const cutoff = healthKey_(new Date(Date.now() - 8 * 864e5));
  Object.keys(p.getProperties()).forEach(function (k) { if (/^HEALTH_\d{4}-\d\d-\d\d$/.test(k) && k < cutoff) p.deleteProperty(k); });
}

/** gmail.com accounts have the lower limits; TRIGGER_LIMIT_MIN / MAIL_LIMIT override. */
function accountLimits_() {
  const L = CONFIG.LIMITS_GOOGLE;
  const p = PropertiesService.getScriptProperties();
  let consumer = true;
  try { consumer = /@(gmail|googlemail)\.com$/i.test(Session.getEffectiveUser().getEmail()); } catch (e) { consumer = true; }
  return {
    consumer: consumer,
    triggerMin: Number(p.getProperty('TRIGGER_LIMIT_MIN')) || (consumer ? L.TRIGGER_MIN_CONSUMER : L.TRIGGER_MIN_WORKSPACE),
    mail: Number(p.getProperty('MAIL_LIMIT')) || (consumer ? L.MAIL_CONSUMER : L.MAIL_WORKSPACE),
  };
}

/** Cells of every tab's grid (Google counts empty cells too). */
function spreadsheetCells_(ss) {
  return ss.getSheets().reduce(function (a, sh) { return a + sh.getMaxRows() * sh.getMaxColumns(); }, 0);
}

/** Rows for the daily summary's System health section: [[label, value]], ⚠️ at 70 %. */
function healthRows_() {
  const L = CONFIG.LIMITS_GOOGLE;
  const lim = accountLimits_();
  const y = healthGet_(healthKey_(new Date(Date.now() - 864e5)));
  const pct = function (v, max) { return max ? Math.round(v / max * 100) : 0; };
  const warn = function (v, max) { return max && v >= max * L.WARN ? '⚠️ ' : ''; };
  const rows = [];
  const trigMs = ['jobs', 'edit', 'summary', 'archive'].reduce(function (a, k) { return a + (y[k] ? y[k].ms : 0); }, 0);
  const trigMin = Math.round(trigMs / 6000) / 10;
  rows.push(['Trigger time yesterday', warn(trigMin, lim.triggerMin) + trigMin + ' of ' + lim.triggerMin + ' min (' + pct(trigMin, lim.triggerMin) + ' %) — ' +
    'email checks ' + (y.jobs ? y.jobs.n + ' runs, slowest ' + Math.round(y.jobs.max / 100) / 10 + ' s' : '0 runs') +
    ' · sheet edits ' + (y.edit ? y.edit.n : 0)]);
  const s = settings_();
  const mail = y.mail || 0;
  rows.push(['Emails sent yesterday', s.provider === 'brevo' ? mail + ' (Brevo — see the Brevo dashboard for its limit)'
    : warn(mail, lim.mail) + mail + ' of ' + lim.mail + ' (MailApp, ' + pct(mail, lim.mail) + ' %)']);
  rows.push(['Email codes', codeHealthText_(y, healthGet_(healthKey_(new Date())))]);
  rows.push(['Website requests yesterday', String(y.act || 0) + ' · busy replies ' + (y.busy || 0) + (y.slow ? ' · slowest ' + y.slow[0] + ' ' + Math.round(y.slow[1] / 100) / 10 + ' s' : '')]);
  // Every create / upload waits for the script lock: a long hold means bursts queue up (⚠️ at 70 % of the 20 s wait)
  const lk = y.lock;
  rows.push(['Script lock yesterday', lk && lk.n ? warn(lk.max, L.LOCK_WAIT_MS) + lk.n + ' holds · average ' + Math.round(lk.ms / lk.n) + ' ms · longest ' +
    lk.max + ' ms (' + lk.a + ')' : 'not used']);
  let cells = 0, rowsN = 0, due = 0;
  try {
    const ss = trackerSS_();
    cells = spreadsheetCells_(ss);
    rowsN = Math.max(trackerSheet_().getLastRow() - 1, 0);
    due = readDue_().length;
  } catch (e) { /* tracker unavailable */ }
  rows.push(['Lead Tracker size', warn(cells, L.CELLS) + (Math.round(cells / 1e5) / 10) + ' M of 10 M cells (' + pct(cells, L.CELLS) + ' %) · ' +
    rowsN + ' rows in the Lead Tracker']);
  let logCells = 0;
  try { logCells = spreadsheetCells_(emailLogSS_()); } catch (e) { logCells = 0; }
  rows.push(['Email Log size', warn(logCells, L.CELLS) + (Math.round(logCells / 1e5) / 10) + ' M of 10 M cells (' + pct(logCells, L.CELLS) + ' %)']);
  rows.push(['Due list / email queue', due + ' due · ' + emailQueueCount_() + ' queued']);
  const p = PropertiesService.getScriptProperties();
  const last = p.getProperty('ARCHIVE_LAST');
  rows.push(['Last archive run', last ? last : 'not run yet (runs monthly; archiveNow to run it now)']);
  return rows;
}
