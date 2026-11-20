#!/usr/bin/env node
/*
 * Browser QA for the website. Serves public/ on http://localhost:3000 and runs the suites.
 *
 *   cd tools/qa && npm install            (once: puppeteer-core + serve, no browser download)
 *   node run.js static                    checks only — sends NOTHING to the web app
 *   node run.js live                      ⚠️ submits TEST leads + SPECIMEN files to the web app in
 *                                         SITE_CONFIG.webAppUrl. Use staging only, then run
 *                                         cleanupTestData() in the Apps Script editor.
 *
 * Chrome/Edge path: set CHROME_PATH, otherwise the usual Windows install paths are tried.
 */
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'static';
const here = __dirname;
const publicDir = path.resolve(here, '../../public');
const fixtures = path.join(here, 'fixtures');
const base = 'http://localhost:3000';
const chrome = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));
if (!chrome) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(2); }

const node = (args) => spawnSync(process.execPath, args, { stdio: 'inherit', cwd: here }).status;

(async () => {
  let failed = node([path.resolve(here, '../check-lists.js')]) !== 0;

  const server = spawn(process.execPath, [require.resolve('serve/build/main.js'), '-l', '3000', '--no-clipboard', publicDir], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(base); break; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
    const suites = mode === 'live'
      ? [['contact.js', base, chrome], ['customize.js', base, chrome, '--submit'], ['visa.js', base, chrome, fixtures, 'live'], ['track-live.js', base, chrome, fixtures]]
      : [['site.js', base, chrome], ['track.js', base, chrome], ['customize.js', base, chrome], ['visa.js', base, chrome, fixtures, 'offline']];
    const NEED = ['passport.jpg', 'passport.pdf', 'photo-40kb.jpg', 'photo-png.png', 'fake.jpg', 'hotel.jpg', 'ticket.pdf', 'pax12.jpg', 'photo-landscape.jpg', 'photo-lowres.jpg'];
    const version = fs.existsSync(path.join(fixtures, 'VERSION')) ? fs.readFileSync(path.join(fixtures, 'VERSION'), 'utf8').trim() : '';
    const wanted = (fs.readFileSync(path.join(here, 'fixtures.js'), 'utf8').match(/FIXTURES_VERSION = '(\w+)'/) || [])[1];
    if (version !== wanted || NEED.some((f) => !fs.existsSync(path.join(fixtures, f)))) failed = node(['fixtures.js', chrome, fixtures]) !== 0 || failed;
    for (const [script, ...args] of suites) {
      console.log('\n=== ' + script + ' ' + args.slice(-1)[0] + ' ===');
      failed = node([script, ...args]) !== 0 || failed;
    }
  } finally {
    server.kill();
  }
  console.log(failed ? '\n❌ Some checks failed.' : '\n✅ All checks passed.');
  process.exit(failed ? 1 : 0);
})();
