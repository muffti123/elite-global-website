// Static test: "We're busy" handling on every form page, with the web app MOCKED (nothing is sent to Google).
// Busy = {busy:true}, Google's HTML error page, or HTTP 503 → automatic retries with backoff + jitter, a notice
// "We're busy — still sending, please keep this page open", and the same submission key on every retry.
// Usage: node busy.js <baseUrl> <chrome>
const puppeteer = require('puppeteer-core');
const [base, exe] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOTICE = 'We\'re busy — still sending, please keep this page open.';

async function open(b, path, plan, opts = {}) {
  const p = await b.newPage();
  p.errors = []; p.posts = [];
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|status of 50\d|blocked by CORS policy/.test(m.text()) && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (/script\.google\.com/.test(r.url()) && r.method() === 'POST') {
      const body = JSON.parse(r.postData() || '{}'); p.posts.push(body);
      const step = plan(body, p.posts.filter((x) => x.action === body.action).length);
      if (step === 'html') return r.respond({ status: 200, contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: '<html><body>Too many simultaneous invocations: Spreadsheets</body></html>' });
      // Google's overload page as browsers really see it: no CORS header → a network error in fetch
      if (step === 'cors') return r.respond({ status: 200, contentType: 'text/html', body: '<html><body>Too many simultaneous invocations</body></html>' });
      if (step === '503') return r.respond({ status: 503, contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Service unavailable' });
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(step) });
    }
    r.continue();
  });
  await p.evaluateOnNewDocument(() => { window.EG_TEST = { busyWaits: [300, 400, 500, 600], pollMs: 600000 }; });
  await p.setViewport({ width: opts.width || 1280, height: 900 });
  await p.goto(base + '/' + path, { waitUntil: 'networkidle0' });
  return p;
}
const notice = (p) => p.evaluate(() => { const n = document.querySelector('.busy-notice'); return n ? { shown: !n.hidden, text: n.textContent } : { shown: false, text: '' }; });

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });
  const BUSY = { ok: false, busy: true, error: 'We\'re very busy right now. Please try again in a moment.' };
  const cases = [
    ['index.html', 'submitContact', { hp: '', name: 'TEST Busy', phone: '+234 800 000 0001', enquiryType: 'Other Travel Enquiry', details: '' }, { ok: true, leadId: 'EG-GE-00012' }],
    ['customize-umrah.html', 'submitCustomRequest', { hp: '', name: 'TEST Busy', email: 'qa@example.com' }, { ok: true, leadId: 'EG-CE-00013', emailed: false }],
    ['apply-visa.html', 'createVisaApplication', { hp: '', name: 'TEST Busy', email: 'qa@example.com' }, { ok: true, leadId: 'EG-VO-00014', token: 't', total: 1 }],
    ['track.html', 'trackApplication', { hp: '', leadId: 'EG-VO-00014', contact: 'qa@example.com' }, { ok: false, error: 'not found' }],
  ];
  for (const [path, action, payload, final] of cases) {
    // busy JSON → Google's HTML page → the same page without CORS (a network error) → HTTP 503 → success
    const p = await open(b, path, (body, n) => (body.action !== action ? { ok: true } : n === 1 ? BUSY : n === 2 ? 'html' : n === 3 ? 'cors' : n === 4 ? '503' : final));
    const done = p.evaluate((a, d) => window.EG.postAction(a, d, { retries: 0, timeout: 20000 }).then((r) => { window.__res = r; return r; }), action, payload);
    let seen = null;
    for (let i = 0; i < 60 && !seen; i++) { const s = await notice(p); if (s.shown) seen = s; else await sleep(50); }
    const out = await done;
    const after = await notice(p);
    const mine = p.posts.filter((x) => x.action === action);
    ok(path + ': busy JSON, Google\'s HTML page (with and without CORS) and HTTP 503 are retried automatically → the real reply', JSON.stringify(out) === JSON.stringify(final) && mine.length === 5, mine.length + ' requests');
    ok(path + ': "' + NOTICE + '" while retrying, gone afterwards', seen && seen.text === NOTICE && !after.shown);
    if (action !== 'trackApplication') {
      ok(path + ': the same submission key (sid) on every retry', mine.every((x) => /^sid-[0-9a-f]{32}$/.test(x.sid) && x.sid === mine[0].sid), mine.map((x) => x.sid).join(','));
      const again = await p.evaluate((a, d) => window.EG.postAction(a, d, { retries: 0 }).then(() => 1), action, payload);
      ok(path + ': submitting the same answers again reuses that key (a lost reply can never make a second lead)', again && p.posts.filter((x) => x.action === action).pop().sid === mine[0].sid);
    } else {
      ok(path + ': lookups carry no submission key', mine.every((x) => !x.sid));
    }
    ok(path + ': no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }
  // still busy after every retry → a clear message, not an endless wait
  const p2 = await open(b, 'index.html', (body) => (body.action === 'submitContact' ? BUSY : { ok: true }));
  const r2 = await p2.evaluate(() => window.EG.postAction('submitContact', { hp: '', name: 'TEST', phone: '+234 800 000 0002' }, { retries: 0 }));
  ok('still busy after 4 retries → {busy:true} with "Please try again in a few minutes" (5 requests in all)', r2.ok === false && r2.busy === true && /few minutes/.test(r2.error) &&
    p2.posts.filter((x) => x.action === 'submitContact').length === 5 && !(await notice(p2)).shown);
  await p2.close();
  // the contact form itself: busy first, then the thank-you with the reference
  const p3 = await open(b, 'index.html', (body, n) => (body.action !== 'submitContact' ? { ok: true } : n <= 2 ? BUSY : { ok: true, leadId: 'EG-GE-00015' }), { width: 390 });
  await p3.type('[name=name]', 'TEST Busy Form');
  await p3.type('[name=phone]', '+234 800 000 0003');
  await p3.evaluate(() => { const s = document.querySelector('[name=request]'); s.value = 'Other Travel Enquiry'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p3.$eval('#submitBtn', (e) => e.click()); // the form slides in on scroll; a mouse click can miss it
  let seen3 = false;
  for (let i = 0; i < 60 && !seen3; i++) { seen3 = (await notice(p3)).shown; if (!seen3) await sleep(50); }
  const box = await p3.evaluate(() => { const n = document.querySelector('.busy-notice'); const r = n.getBoundingClientRect(); return { right: r.right <= window.innerWidth, left: r.left >= 0 }; });
  await p3.waitForFunction(() => /EG-GE-00015/.test(document.body.innerText), { timeout: 10000 });
  ok('contact form (phone width): the notice shows during the busy retries (on screen), then the thank-you with the reference', seen3 && box.right && box.left &&
    p3.posts.filter((x) => x.action === 'submitContact').length === 3 && !(await notice(p3)).shown);
  ok('no console errors (contact form)', p3.errors.length === 0, p3.errors.join(' | '));
  // email-code actions are never repeated after a network error (a second code would be sent)
  const p4 = await open(b, 'apply-visa.html', (body) => (body.action === 'sendEmailCode' ? 'cors' : { ok: true }));
  const r4 = await p4.evaluate(() => window.EG.postAction('sendEmailCode', { hp: '', email: 'qa@example.com', name: 'TEST' }, { retries: 0 }).then(() => 'resolved', (e) => (e.network ? 'network' : 'other')));
  ok('sendEmailCode after a network error: not repeated (no second code), the page shows its connection message', r4 === 'network' && p4.posts.filter((x) => x.action === 'sendEmailCode').length === 1);
  await p4.close();
  // uploads have their own retry loop + Retry button: api.js must not also wait out a network error (no stacked retries)
  const p5 = await open(b, 'apply-visa.html', (body) => (body.action === 'uploadPassenger' ? 'cors' : { ok: true }));
  const r5 = await p5.evaluate(() => window.EG.postAction('uploadPassenger', { leadId: 'EG-VO-00014', token: 't', index: 1 }, { retries: 0, networkBusy: false }).then(() => 'resolved', (e) => (e.network ? 'network' : 'other')));
  ok('uploadPassenger with networkBusy:false after a network error: one request, then the page\'s own retry decides', r5 === 'network' && p5.posts.filter((x) => x.action === 'uploadPassenger').length === 1);
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../public/assets/js/visa.js'), 'utf8') + require('fs').readFileSync(require('path').join(__dirname, '../../public/assets/js/correct.js'), 'utf8');
  ok('visa.js and correct.js upload calls pass networkBusy:false', (src.match(/networkBusy: false/g) || []).length === 2);
  await p5.close();
  await b.close();
  process.exit(res.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
