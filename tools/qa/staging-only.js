// Live suites (run.js live, *-live.js, load-live.js) run against STAGING only — never production
// (CLAUDE.md rule 8, docs/LAUNCH.md). Each one refuses unless the config.js it uses points at the staging web app.
//   stagingOnlyFile(path)  — checks a config.js on disk (sync)
//   stagingOnly(base)      — checks the config.js served at <base>/assets/js/config.js (async)
const fs = require('fs');
const STAGING_ID = 'AKfycbzSBOiav81YF7eKJvqLaXJM1p2S6oRXeKVVhsGKgCtMfkdKZUrXr7cC0UQ-bRZ6kjtqXQ';
const isStaging = (src) => ((/webAppUrl:\s*'([^']+)'/.exec(src) || [])[1] || '') === 'https://script.google.com/macros/s/' + STAGING_ID + '/exec';
const refuse = () => { console.error('Refused: config.js webAppUrl is not the STAGING web app — live tests never run against production.'); process.exit(2); };
function stagingOnlyFile(file) { if (!isStaging(fs.readFileSync(file, 'utf8'))) refuse(); }
async function stagingOnly(base) {
  let src = '';
  try { src = await (await fetch(base + '/assets/js/config.js')).text(); } catch (e) { /* refuse below */ }
  if (!isStaging(src)) refuse();
}
module.exports = { STAGING_ID, isStaging, stagingOnly, stagingOnlyFile };

// Self-test (run by `node run.js static`): the guard and its use in every suite that sends.
if (require.main === module) {
  const path = require('path');
  let fails = 0;
  const ok = (n, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + n); if (!c) fails++; };
  const url = (id) => "webAppUrl: 'https://script.google.com/macros/s/" + id + "/exec'";
  ok('staging config.js is accepted', isStaging(url(STAGING_ID)));
  ok('any other web app (production) is refused', !isStaging(url('AKfycbPRODUCTIONxxxxxxxx')) && !isStaging(url(STAGING_ID + 'x')) && !isStaging(''));
  const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const guarded = { 'contact.js': /await stagingOnly\(/, 'customize.js': /flag === '--submit'\) await stagingOnly\(/, 'visa.js': /mode === 'live'\) await stagingOnly\(/,
    'track-live.js': /await stagingOnly\(/, 'correction-live.js': /await stagingOnly\(/, 'visa-live.js': /await stagingOnly\(/, 'load-live.js': /stagingOnlyFile\(/,
    'run.js': /mode === 'live'\) stagingOnlyFile\(/ };
  Object.keys(guarded).forEach((f) => ok(f + ' refuses unless config.js points at staging', guarded[f].test(read(f))));
  process.exit(fails ? 1 : 0);
}
