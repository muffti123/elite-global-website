// Static test: "Download your visa" on the Track page and the 2-minute live updates, with the web app
// MOCKED (nothing is sent to Google). Timers are shortened with window.EG_TEST (QA hook).
// Usage: node visa-download.js <baseUrl> <chrome> <fixturesDir>
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');
const [base, exe, fixtures] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ENDED = 'Please look up your application again.';
const GENERIC = 'We couldn\'t find an application with those details. Please check your reference number and the email or phone number you used.';
const token = () => (Date.now() + 60 * 60000) + '.' + (Date.now() + 8 * 3600000) + '.EG-VO-00012.c2lnbmF0dXJl';
const PROC = { ok: true, leadId: 'EG-VO-00012', service: 'Visa only', received: '20 Nov 2026', stage: 'Visa in processing',
  description: 'Your visa application has been submitted and is being processed.', nextStep: 'Processing times vary.' };
const APPROVED = Object.assign({}, PROC, { stage: 'Visa approved', description: 'Good news — your visa has been approved.',
  nextStep: 'Download your visa with the button below. Our team will also contact you about the next steps.', canDownload: true });
const PDF = fs.readFileSync(path.join(fixtures, 'passport.pdf'));
const PNG = fs.readFileSync(path.join(fixtures, 'photo-png.png'));
const FILES = [{ ref: 'r1', label: 'Visa – 1 of 2', type: 'PDF', kb: Math.round(PDF.length / 1024) }, { ref: 'r2', label: 'Visa – 2 of 2', type: 'PNG', kb: Math.round(PNG.length / 1024) }];

async function open(b, reply, opts = {}) {
  const p = await b.newPage();
  p.errors = []; p.posts = [];
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (/script\.google\.com/.test(r.url()) && r.method() === 'POST') {
      const body = JSON.parse(r.postData() || '{}'); p.posts.push(body);
      const out = reply(body, p);
      if (out === 'abort') return r.abort();
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
    }
    r.continue();
  });
  await p.evaluateOnNewDocument((t) => { window.EG_TEST = t; }, opts.timers || { pollMs: 500, visibleGapMs: 200 });
  await p.setViewport({ width: opts.width || 1280, height: 900 });
  await p.goto(base + '/track.html', { waitUntil: 'networkidle0' });
  return p;
}
const lookup = async (p) => { await p.type('[name=leadId]', 'EG-VO-00012'); await p.type('[name=contact]', 'qa@example.com'); await p.click('#trackBtn'); await p.waitForFunction(() => !document.querySelector('#trackResult').hidden, { timeout: 10000 }); };
const polls = (p) => p.posts.filter((x) => x.action === 'trackApplication' && x.poll === true);
const view = (p) => p.evaluate(() => ({ stage: document.querySelector('[data-r="stage"]').textContent, box: !document.querySelector('#visaBox').hidden,
  form: !document.querySelector('#trackFormPanel').hidden, result: !document.querySelector('#trackResult').hidden, status: document.querySelector('#trackStatus').textContent,
  live: document.querySelector('#trackLive').textContent, updated: !document.querySelector('#trackUpdated').hidden, checked: document.querySelector('#trackCheckedAt').textContent,
  offline: !document.querySelector('#trackOffline').hidden, flash: document.querySelector('#trackResult').classList.contains('track-flash') }));
const setHidden = (p, hidden) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });

  // --- live updates ----------------------------------------------------------------------------------------------
  let now = PROC, fail = false;
  let p = await open(b, (body) => {
    if (body.action !== 'trackApplication') return { ok: true };
    if (body.poll && fail) return 'abort';
    if (body.session || body.contact === 'qa@example.com') return Object.assign({}, now, body.poll ? {} : { session: token() });
    return { ok: false, error: GENERIC };
  });
  await lookup(p);
  let v = await view(p);
  ok('"Last checked HH:MM" shown with the status; no download button for Visa in processing', /^Last checked \d\d:\d\d$/.test(v.checked) && !v.box, v.checked);
  const st0 = await p.evaluate(() => sessionStorage.getItem('eg-track'));
  await sleep(1300);
  const pl = polls(p);
  ok('polls trackApplication {session, poll: true} on the timer (no email, phone or reference)', pl.length >= 2 && pl.every((x) => x.session && !x.contact && !x.leadId), pl.length + ' polls');
  ok('polling is not activity: the stored token and last-activity time are unchanged', await p.evaluate(() => sessionStorage.getItem('eg-track')) === st0);
  v = await view(p);
  ok('no change → nothing announced, no "Updated just now"', !v.updated && !/updated/.test(v.live) && v.stage === 'Visa in processing');
  now = APPROVED;
  await p.waitForFunction(() => document.querySelector('[data-r="stage"]').textContent === 'Visa approved', { timeout: 5000 });
  v = await view(p);
  ok('a change (stage, next step, buttons) updates the view: "Visa approved" + "Download your visa"', v.box && v.stage === 'Visa approved', JSON.stringify(v));
  ok('… announced in the aria-live region, "Updated just now" + a gentle highlight', /^Your application was updated: Visa approved\./.test(v.live) && v.updated && v.flash, v.live);
  ok('… the highlight respects prefers-reduced-motion (CSS)', /prefers-reduced-motion:reduce\)\{\.track-result\.track-flash/.test(fs.readFileSync(path.join(__dirname, '../../public/assets/css/site.css'), 'utf8')));
  await sleep(700);
  ok('"Updated just now" clears on the next check without a change', !(await view(p)).updated);
  // hidden tab
  await setHidden(p, true);
  const n0 = polls(p).length;
  await sleep(1500);
  ok('hidden tab → polling paused', polls(p).length === n0, (polls(p).length - n0) + ' polls while hidden');
  await setHidden(p, false);
  await sleep(150);
  ok('visible again → one check at once', polls(p).length === n0 + 1);
  // failures
  fail = true;
  const f0 = polls(p).length;
  await p.waitForFunction(() => true);
  while (polls(p).length - f0 < 2) await sleep(50);
  await sleep(150);
  const twoFails = await view(p);
  while (polls(p).length - f0 < 3) await sleep(50);
  await sleep(200);
  v = await view(p);
  ok('failed checks stay quiet at first (2 failures: no note)', !twoFails.offline);
  ok('… after 3 failures in a row: "We couldn\'t refresh — check your connection"', v.offline && v.result, (polls(p).length - f0) + ' failed');
  fail = false;
  await sleep(800);
  ok('the next good check hides the note again', !(await view(p)).offline);
  // log out stops polling
  await p.click('#trackLogout');
  const n1 = p.posts.length;
  await sleep(1200);
  ok('Log out stops polling', p.posts.slice(n1).every((x) => !x.poll), JSON.stringify(p.posts.slice(n1).map((x) => x.action)));
  // idle still ends (60 minutes without activity), polls never extend it
  await lookup(p);
  await p.evaluate(() => { const real = Date.now; Date.now = () => real() + 61 * 60000; });
  const n2 = polls(p).length;
  await p.waitForFunction(() => !document.querySelector('#trackFormPanel').hidden, { timeout: 5000 });
  v = await view(p);
  ok('60 minutes without activity still ends the session (the poll timer does not keep it alive)', v.form && v.status === ENDED && polls(p).length === n2, JSON.stringify(v).slice(0, 120));
  // the server ends the session → lookup form, polling stops
  const p2 = await open(b, (body) => (body.action === 'trackApplication' ? (body.poll ? { ok: false, error: GENERIC } : Object.assign({}, PROC, { session: token() })) : { ok: true }));
  await lookup(p2);
  await p2.waitForFunction(() => !document.querySelector('#trackFormPanel').hidden, { timeout: 5000 });
  const n3 = polls(p2).length;
  await sleep(1200);
  v = await view(p2);
  ok('session ended on the server (poll → not found) → "Please look up your application again.", polling stops', v.form && v.status === ENDED && polls(p2).length === n3);
  ok('no console errors (live updates)', p.errors.length === 0 && p2.errors.length === 0, p.errors.concat(p2.errors).join(' | '));
  await p.close(); await p2.close();

  // --- download your visa -------------------------------------------------------------------------------------------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-visa-'));
  let dlReply = null;
  p = await open(b, (body) => {
    if (body.action === 'trackApplication') return Object.assign({}, APPROVED, body.poll ? {} : { session: token() });
    if (body.action === 'sendVisaCode') return { ok: true, masked: 'q•••@e•••.com', resendIn: 60 };
    if (body.action === 'verifyVisaCode') return body.code === '246810' ? { ok: true, dtoken: 'DTOKEN.x.EG-VO-00012.sig', minutes: 30, files: FILES } : { ok: false, error: 'That code is not correct. (4 attempts left)', field: 'code' };
    if (body.action === 'downloadVisaFile') {
      if (dlReply) return dlReply;
      return body.ref === 'r1' ? { ok: true, name: 'EG-VO-00012 – Visa 1 of 2.pdf', mime: 'application/pdf', size: PDF.length, b64: PDF.toString('base64') }
        : { ok: true, name: 'EG-VO-00012 – Visa 2 of 2.png', mime: 'image/png', size: PNG.length, b64: PNG.toString('base64') };
    }
    if (body.action === 'listVisaFiles') return { ok: true, files: FILES.slice(0, 1) };
    return { ok: true };
  }, { timers: { pollMs: 60000, visibleGapMs: 60000 } });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  await lookup(p);
  v = await view(p);
  ok('Visa Approved + canDownload → "Download your visa" button', v.box && await p.$eval('#visaBtn', (e) => !!e.offsetParent && /Download your visa/.test(e.textContent)));
  await p.click('#visaBtn');
  await p.waitForFunction(() => !document.querySelector('#visaCode').hidden, { timeout: 5000 });
  const sent = p.posts.find((x) => x.action === 'sendVisaCode');
  ok('step-up: code sent to the email on the application (masked), with the session only', sent && sent.session && !sent.contact && await p.$eval('#visaMasked', (e) => e.textContent) === 'q•••@e•••.com');
  ok('code field: numeric, one-time-code, focused', await p.$eval('#visaCodeIn', (e) => e.inputMode === 'numeric' && e.autocomplete === 'one-time-code' && document.activeElement === e));
  await p.type('#visaCodeIn', '111111'); await p.click('#visaConfirm');
  await p.waitForFunction(() => /not correct/.test(document.querySelector('#visaStatus').textContent), { timeout: 5000 });
  ok('wrong code → error, no files', await p.$eval('#visaFiles', (e) => e.hidden));
  await p.$eval('#visaCodeIn', (e) => { e.value = ''; });
  await p.type('#visaCodeIn', '246810'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => !document.querySelector('#visaFiles').hidden, { timeout: 5000 });
  const items = await p.$$eval('#visaFiles li', (l) => l.map((x) => x.querySelector('.visa-file-label').textContent));
  ok('file list: "Visa – 1 of 2 (PDF, N KB)" … with a Download button each; focus on the first', items.length === 2 && items[0] === 'Visa – 1 of 2 (PDF, ' + FILES[0].kb + ' KB)' && items[1] === 'Visa – 2 of 2 (PNG, ' + FILES[1].kb + ' KB)' &&
    await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-ref') === 'r1'), items.join(' | '));
  ok('the download token is kept in memory only (not in sessionStorage, localStorage or the URL)', await p.evaluate(() => !/DTOKEN/.test(JSON.stringify(sessionStorage) + JSON.stringify(localStorage) + location.href)));
  await p.click('#visaFiles li:nth-child(1) button');
  const want1 = path.join(dir, 'EG-VO-00012 – Visa 1 of 2.pdf');
  for (let i = 0; i < 50 && !fs.existsSync(want1); i++) await sleep(100);
  const dpost = p.posts.find((x) => x.action === 'downloadVisaFile');
  ok('Download → downloadVisaFile {dtoken, ref}; the saved file has the same bytes', dpost && dpost.dtoken === 'DTOKEN.x.EG-VO-00012.sig' && dpost.ref === 'r1' &&
    fs.existsSync(want1) && Buffer.compare(fs.readFileSync(want1), PDF) === 0, fs.readdirSync(dir).join(','));
  ok('"Downloaded ✓" message', /Downloaded ✓ EG-VO-00012 – Visa 1 of 2\.pdf/.test(await p.$eval('#visaStatus', (e) => e.textContent)));
  await p.click('#visaFiles li:nth-child(2) button');
  const want2 = path.join(dir, 'EG-VO-00012 – Visa 2 of 2.png');
  for (let i = 0; i < 50 && !fs.existsSync(want2); i++) await sleep(100);
  ok('several downloads with the same token (PNG too, same bytes)', fs.existsSync(want2) && Buffer.compare(fs.readFileSync(want2), PNG) === 0);
  dlReply = { ok: false, error: 'This file has changed. Please choose it again from the updated list.', relist: true };
  await p.click('#visaFiles li:nth-child(1) button');
  await p.waitForFunction(() => document.querySelectorAll('#visaFiles li').length === 1, { timeout: 5000 });
  ok('file changed (relist) → the list is loaded again', /updated/.test(await p.$eval('#visaStatus', (e) => e.textContent)));
  dlReply = { ok: false, error: 'Your download session has ended. Please confirm your email again to download your visa.', restart: true };
  await p.click('#visaFiles li:nth-child(1) button');
  await p.waitForFunction(() => document.querySelector('#visaFiles').hidden, { timeout: 5000 });
  ok('token ended (restart) → back to "Download your visa" with the message', await p.$eval('#visaBtn', (e) => !e.hidden) && /download session has ended/.test(await p.$eval('#visaStatus', (e) => e.textContent)));
  dlReply = null;
  // phones and desktops
  await p.click('#visaBtn');
  await p.waitForFunction(() => !document.querySelector('#visaCode').hidden, { timeout: 5000 });
  await p.type('#visaCodeIn', '246810'); await p.click('#visaConfirm');
  await p.waitForFunction(() => !document.querySelector('#visaFiles').hidden, { timeout: 5000 });
  const widths = [320, 360, 414, 768, 1024, 1440, 1920];
  const scroll = [];
  for (const w of widths) {
    await p.setViewport({ width: w, height: 800 });
    await sleep(80);
    const r = await p.evaluate(() => ({ sx: document.documentElement.scrollWidth > window.innerWidth + 1, box: document.querySelector('#visaBox').getBoundingClientRect().right <= window.innerWidth + 1 }));
    if (r.sx || !r.box) scroll.push(w);
  }
  ok('320–1920 px: no horizontal scroll with the download box and the file list shown', scroll.length === 0, scroll.join(','));
  // Log out clears the token in memory
  await p.setViewport({ width: 1280, height: 900 });
  await p.click('#trackLogout');
  await lookup(p);
  ok('after Log out and a new lookup the file list is gone (token cleared)', await p.$eval('#visaFiles', (e) => e.hidden) && await p.$eval('#visaBtn', (e) => !e.hidden));
  // download box closes when the poll says it is no longer available
  const p3 = await open(b, (body) => (body.action === 'trackApplication' ? Object.assign({}, p3.flag ? PROC : APPROVED, body.poll ? {} : { session: token() }) : { ok: true }));
  await lookup(p3);
  ok('(download box shown)', (await view(p3)).box);
  p3.flag = true;
  await p3.waitForFunction(() => document.querySelector('#visaBox').hidden, { timeout: 5000 });
  ok('a poll that no longer allows the download hides the box', (await view(p3)).stage === 'Visa in processing');
  ok('no console errors (download)', p.errors.length === 0 && p3.errors.length === 0, p.errors.concat(p3.errors).join(' | '));
  fs.rmSync(dir, { recursive: true, force: true });
  await b.close();
  process.exit(res.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
