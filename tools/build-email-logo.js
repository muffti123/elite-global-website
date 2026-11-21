#!/usr/bin/env node
/*
 * Renders the email header logo: the footer lockup (white emblem + wordmark, assets/css/brand.css)
 * on the email header navy #06163F → public/assets/brand/email-logo.png (2× for sharp screens).
 * Emails link it from SITE_URL, so deploy public/ after changing it.
 *   cd tools/qa && node ../build-email-logo.js        (uses puppeteer-core from tools/qa)
 * Chrome/Edge path: CHROME_PATH, otherwise the usual install paths.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const puppeteer = require(path.join(__dirname, 'qa/node_modules/puppeteer-core'));

const pub = path.resolve(__dirname, '../public');
const out = path.join(pub, 'assets/brand/email-logo.png');
const exe = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));
if (!exe) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(2); }

const html = `<!doctype html><html><head><meta charset="utf-8">
<base href="${pathToFileURL(pub).href}/">
<link rel="stylesheet" href="assets/css/brand.css">
<style>html,body{margin:0;background:#06163F}#logo{display:inline-block;padding:6px 8px;background:#06163F}</style></head>
<body><div id="logo"><span class="eg-brand eg-brand--dark">
<img class="eg-brand__mark eg-brand__mark--light" src="assets/brand/emblem.svg" alt="" width="194" height="218">
<img class="eg-brand__mark eg-brand__mark--dark" src="assets/brand/emblem-white.svg" alt="" width="194" height="218">
<span class="eg-brand__rc">RC: 7787410</span>
<span class="eg-brand__name">ELITE</span>
<span class="eg-brand__sub1">Global World</span>
<span class="eg-brand__sub2">Travel &amp; Tours Ltd.</span>
<span class="eg-brand__rule eg-brand__rule--top"></span>
<span class="eg-brand__tag">YOUR JOURNEY • OUR PRIORITY</span>
<span class="eg-brand__rule eg-brand__rule--bottom"></span>
</span></div></body></html>`;

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--allow-file-access-from-files'] });
  try {
    const p = await b.newPage();
    await p.setViewport({ width: 800, height: 400, deviceScaleFactor: 2 });
    // a file:// page may load the local brand files (setContent's about:blank may not)
    const tmp = path.join(os.tmpdir(), 'eg-email-logo-' + process.pid + '.html');
    fs.writeFileSync(tmp, html);
    await p.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle0' });
    fs.unlinkSync(tmp);
    await p.evaluate(() => document.fonts.ready);
    const el = await p.$('#logo');
    const box = await el.boundingBox();
    await el.screenshot({ path: out, omitBackground: false });
    console.log(path.relative(process.cwd(), out), Math.round(box.width * 2) + '×' + Math.round(box.height * 2) + ' px,',
      (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
