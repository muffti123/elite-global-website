#!/usr/bin/env node
/*
 * Responsive screenshots of the header, team, contact and footer (desktop / tablet / phone).
 * Sends nothing. Serves public/ itself on http://localhost:3001.
 *   cd tools/qa && node shots.js [outDir]       (default: tools/qa/screenshots, git-ignored)
 * Chrome/Edge path: CHROME_PATH, otherwise the usual install paths (same as run.js).
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const out = path.resolve(process.argv[2] || path.join(__dirname, 'screenshots'));
const publicDir = path.resolve(__dirname, '../../public');
const base = 'http://localhost:3001';
const exe = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));
if (!exe) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(2); }

const VIEWS = [['desktop', 1440, 900], ['tablet', 820, 1180], ['phone', 390, 844]];
const SECTIONS = [['header', '.site-header'], ['team', '#management'], ['contact', '#contact'], ['footer', 'footer']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = spawn(process.execPath, [require.resolve('serve/build/main.js'), '-l', '3001', '--no-clipboard', publicDir], { stdio: 'ignore' });
  const b = await puppeteer.launch({ executablePath: exe, headless: true });
  const files = [];
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(base); break; } catch (e) { await sleep(250); } }
    for (const [view, w, h] of VIEWS) {
      const p = await b.newPage();
      await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      // reduced motion: every reveal is shown at once, so screenshots are stable
      await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await p.goto(base + '/index.html', { waitUntil: 'networkidle0' });
      await p.evaluate(() => document.fonts.ready);
      // load lazy images up front so every photo is in the screenshot
      await p.evaluate(() => Promise.all([...document.images].map((i) => { i.loading = 'eager'; return i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }); })));
      for (const [name, sel] of SECTIONS) {
        const el = await p.$(sel);
        if (!el || !(await el.boundingBox())) { console.log('skip', view, name, '(not visible)'); continue; }
        await el.evaluate((e) => e.scrollIntoView({ block: 'start' }));
        await sleep(300);
        const f = path.join(out, `${view}-${name}.png`);
        await el.screenshot({ path: f });
        files.push(f);
      }
      // menu open (tablet / phone only)
      const toggle = await p.$('.menu-toggle');
      if (toggle && await toggle.boundingBox()) {
        await p.evaluate(() => window.scrollTo(0, 0));
        await toggle.click(); await sleep(300);
        const f = path.join(out, `${view}-menu-open.png`);
        await p.screenshot({ path: f });
        files.push(f);
      }
      // application pages: header only
      for (const page of ['apply-visa', 'customize-umrah']) {
        await p.goto(base + '/' + page + '.html', { waitUntil: 'networkidle0' });
        const f = path.join(out, `${view}-${page}-header.png`);
        await (await p.$('.site-header')).screenshot({ path: f });
        files.push(f);
      }
      await p.close();
    }
  } finally {
    await b.close();
    server.kill();
  }
  console.log(files.join('\n'));
})().catch((e) => { console.error(e); process.exit(2); });
