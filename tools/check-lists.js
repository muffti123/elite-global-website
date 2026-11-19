#!/usr/bin/env node
/*
 * Checks that the website's answer options match the web app exactly.
 *   apps-script/Config.gs  LISTS + COUNTRIES   ↔   public/assets/js/lists.js  EG_LISTS
 *   LISTS.ENQUIRY_TYPES                        ↔   <select name="request"> in public/index.html
 * The web app rejects any value that is not in its lists, so a mismatch breaks a form.
 * Usage: node tools/check-lists.js        (exit code 1 on any mismatch). No dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let failed = 0;
const report = (ok, msg) => { console.log((ok ? 'OK    ' : 'FAIL  ') + msg); if (!ok) failed++; };

// Server lists
const gas = { Math };
vm.createContext(gas);
vm.runInContext(read('apps-script/Config.gs') + '\n;this.__L = LISTS; this.__C = COUNTRIES;', gas);
const server = Object.assign({}, gas.__L, { COUNTRIES: gas.__C });

// Website lists
const web = { window: {} };
vm.createContext(web);
vm.runInContext(read('public/assets/js/lists.js'), web);
const site = web.window.EG_LISTS || {};

const keys = new Set([...Object.keys(server), ...Object.keys(site)]);
for (const k of keys) {
  const a = JSON.stringify(server[k]), b = JSON.stringify(site[k]);
  if (a === b) { report(true, `${k} (${server[k].length} options)`); continue; }
  if (!server[k]) { report(false, `${k} exists in lists.js but not in Config.gs`); continue; }
  if (!site[k]) { report(false, `${k} exists in Config.gs but not in lists.js`); continue; }
  const missing = server[k].filter((v) => !site[k].includes(v));
  const extra = site[k].filter((v) => !server[k].includes(v));
  report(false, `${k} differs` + (missing.length ? ` — missing on website: ${JSON.stringify(missing)}` : '') +
    (extra.length ? ` — extra on website: ${JSON.stringify(extra)}` : '') + (!missing.length && !extra.length ? ' — order differs' : ''));
}

// Contact form <select> on the home page (static HTML)
const html = read('public/index.html');
const sel = html.match(/<select[^>]*name="request"[^>]*>([\s\S]*?)<\/select>/);
const opts = sel ? [...sel[1].matchAll(/<option(?: value="([^"]*)")?>([^<]*)<\/option>/g)].map((m) => (m[1] !== undefined ? m[1] : m[2])).filter(Boolean) : [];
report(JSON.stringify(opts) === JSON.stringify(server.ENQUIRY_TYPES), 'index.html enquiry <select> matches LISTS.ENQUIRY_TYPES' + (sel ? '' : ' (select not found)'));

console.log(failed ? `\n${failed} mismatch(es). Update public/assets/js/lists.js (or index.html) to match apps-script/Config.gs.` : '\nAll lists match.');
process.exit(failed ? 1 : 0);
