/**
 * STAGING ONLY (Run button): measures how long the tracker reads take with 1,000 and 20,000 rows. Builds a
 * temporary spreadsheet "Elite Global – Benchmark (temporary)" with synthetic TEST rows (no real data), times the
 * read patterns the system uses, then moves it to the Drive bin. Also times one runEmailJobs on the real
 * tracker. Logs timings only.
 */
function benchmarkScale() {
  const site = settings_().siteUrl;
  if (!/staging/i.test(site)) throw new Error('benchmarkScale is for staging only (SITE_URL is ' + site + ').');
  const W = CONFIG.HEADERS.length, MAXN = 20000;
  const ss = SpreadsheetApp.create('Elite Global – Benchmark (temporary)');
  const lines = [];
  try {
    const sh = ss.getSheets()[0];
    sh.insertRowsAfter(sh.getMaxRows(), MAXN + 1 - sh.getMaxRows() + 1);
    if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
    sh.getRange(1, 1, 1, W).setValues([CONFIG.HEADERS]);
    const now = new Date();
    for (let start = 0; start < MAXN; start += 5000) {
      const block = [];
      for (let i = start; i < start + 5000; i++) {
        const row = CONFIG.HEADERS.map(function (h, j) { return j === 0 ? 'EG-VO-' + ('0000' + (i + 1)).slice(-5) : j === 1 ? now : j === 2 ? 'TEST Bench ' + i : 'x' + (i % 97); });
        block.push(row);
      }
      sh.getRange(2 + start, 1, 5000, W).setValues(block);
    }
    SpreadsheetApp.flush();
    const time = function (label, fn) { const t = Date.now(); fn(); lines.push(label + ': ' + (Date.now() - t) + ' ms'); };
    [1000, 20000].forEach(function (n) {
      lines.push('— ' + n + ' rows —');
      time('  all columns (getValues ' + n + ' × ' + W + ')', function () { sh.getRange(2, 1, n, W).getValues(); });
      time('  8 needed columns (8 reads)', function () { [1, 5, 12, 21, 23, 24, 25, 27].forEach(function (c) { sh.getRange(2, c, n, 1).getValues(); }); });
      time('  column A only (next empty row scan)', function () { sh.getRange(2, 1, n, 1).getValues(); });
      time('  TextFinder (Lead ID near the end)', function () { sh.getRange(2, 1, n, 1).createTextFinder('EG-VO-' + ('0000' + (n - 3)).slice(-5)).matchEntireCell(true).findNext(); });
      time('  one row (cached row number)', function () { sh.getRange(n, 1, 1, W).getValues(); });
    });
  } finally {
    try { DriveApp.getFileById(ss.getId()).setTrashed(true); } catch (e) { /* bin it by hand */ }
  }
  const t = Date.now();
  runEmailJobs();
  lines.push('runEmailJobs on the real tracker: ' + (Date.now() - t) + ' ms');
  Logger.log('benchmarkScale\n' + lines.join('\n'));
  return lines;
}
