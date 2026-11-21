// Static test: track.html with the web app MOCKED (nothing is sent to Google).
// Usage: node track.js <baseUrl> <chrome>
const puppeteer = require('puppeteer-core');
const [base, exe] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GENERIC = 'We couldn\'t find an application with those details. Please check your reference number and the email or phone number you used.';
const FOUND = {
  ok: true, leadId: 'EG-VO-00012', service: 'Visa only', received: '20 Nov 2026', stage: 'Received',
  description: 'We have received your request and it is in our queue.',
  nextStep: 'A member of our team will contact you shortly by phone or WhatsApp.',
  upload: "All 3 passengers' documents received",
  message: 'Hello <img src=x onerror="window.__xss=1"> your visa is being reviewed <script>window.__xss=2</script>',
};

// NOTE: the local server (serve) redirects track.html?id=… to /track and drops the query, so tests open
// /track?id=… directly. Netlify serves track.html?id=… as is.
/** Page whose web app calls are answered by `reply(body)`; records every POST body. */
async function open(b, path, reply, opts = {}) {
  const p = await b.newPage();
  p.errors = []; p.posts = [];
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  if (opts.reduce) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (/script\.google\.com/.test(r.url()) && r.method() === 'POST') {
      const body = JSON.parse(r.postData() || '{}'); p.posts.push(body);
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(reply(body)) });
    }
    if (/script\.google\.com/.test(r.url())) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true}' });
    r.continue();
  });
  await p.setViewport({ width: opts.width || 1280, height: 900 });
  await p.goto(base + '/' + path, { waitUntil: 'networkidle0' });
  return p;
}
const replyFor = (body) => (body.action === 'trackApplication' && body.leadId === 'EG-VO-00012' && /^(qa@example\.com|\+?234 ?800 ?000 ?0012|08000000012)$/i.test(body.contact) ? FOUND : { ok: false, error: GENERIC });

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });

  // Prefill from ?id= (case-insensitive, trimmed); junk is ignored
  let p = await open(b, 'track?id=%20eg-vo-00012%20', replyFor);
  ok('?id= prefills the reference (upper-case, trimmed)', (await p.$eval('[name=leadId]', (e) => e.value)) === 'EG-VO-00012');
  await p.close();
  p = await open(b, 'track?id=junk', replyFor);
  ok('?id=junk is ignored', (await p.$eval('[name=leadId]', (e) => e.value)) === '');
  ok('noindex meta', await p.$eval('meta[name=robots]', (m) => m.content === 'noindex'));
  ok('form uses POST (contact can never land in a URL), no action', await p.$eval('#trackForm', (f) => f.method === 'post' && !f.getAttribute('action')));

  // Validation: nothing is sent for empty/bad input
  await p.click('#trackBtn'); await sleep(200);
  const inv0 = await p.$$eval('#trackForm .field.invalid [name]', (e) => e.map((x) => x.name));
  await p.type('[name=leadId]', 'EG-VO-123'); await p.type('[name=contact]', 'not an email');
  await p.click('#trackBtn'); await sleep(200);
  const inv1 = await p.$$eval('#trackForm .field.invalid [name]', (e) => e.map((x) => x.name));
  ok('empty and bad input flagged, nothing sent', inv0.join() === 'leadId,contact' && inv1.join() === 'leadId,contact' && p.posts.length === 0, JSON.stringify({ inv0, inv1, posts: p.posts.length }));
  ok('first invalid field gets focus', await p.evaluate(() => document.activeElement.name === 'leadId'));

  // Not found: generic message, URL unchanged
  await p.$eval('[name=leadId]', (e) => { e.value = ''; }); await p.type('[name=leadId]', 'eg-vo-00099');
  await p.$eval('[name=contact]', (e) => { e.value = ''; }); await p.type('[name=contact]', 'qa@example.com');
  await p.keyboard.press('Enter'); await sleep(400);
  const nf = await p.evaluate(() => ({ cls: document.querySelector('#trackStatus').className, text: document.querySelector('#trackStatus').textContent, shown: !document.querySelector('#trackResult').hidden }));
  ok('not found → the generic message (Enter submits)', /status err/.test(nf.cls) && nf.text.startsWith(GENERIC) && !nf.shown, nf.text.slice(0, 80));
  ok('request: upper-case ID, trimmed contact, action trackApplication', p.posts.length === 1 && p.posts[0].action === 'trackApplication' && p.posts[0].leadId === 'EG-VO-00099' && p.posts[0].contact === 'qa@example.com', JSON.stringify(p.posts[0]));

  // Found: every field as plain text; staff message cannot inject HTML
  await p.$eval('[name=leadId]', (e) => { e.value = ''; }); await p.type('[name=leadId]', 'EG-VO-00012');
  await p.$eval('[name=contact]', (e) => { e.value = ''; }); await p.type('[name=contact]', '+234 800 000 0012');
  await p.click('#trackBtn'); await sleep(500);
  const r = await p.evaluate(() => {
    const t = (n) => document.querySelector('[data-r="' + n + '"]').textContent;
    return {
      shown: !document.querySelector('#trackResult').hidden, formHidden: document.querySelector('#trackFormPanel').hidden,
      leadId: t('leadId'), stage: t('stage'), service: t('service'), received: t('received'), upload: t('upload'),
      next: t('nextStep'), msg: t('message'), imgs: document.querySelectorAll('#trackResult img').length,
      scripts: document.querySelectorAll('#trackResult script').length, xss: window.__xss || 0,
      focus: document.activeElement.id, live: document.querySelector('#trackLive').textContent,
      liveAttr: document.querySelector('#trackLive').getAttribute('aria-live'), statusRole: document.querySelector('#trackStatus').getAttribute('role'),
    };
  });
  ok('found → result rendered', r.shown && r.formHidden && r.leadId === 'EG-VO-00012' && r.stage === 'Received' && r.service === 'Visa only' && r.received === '20 Nov 2026' && r.upload === FOUND.upload && r.next === FOUND.nextStep, JSON.stringify(r).slice(0, 200));
  ok('staff message shown as text: no <img>/<script>, nothing executed', r.msg === FOUND.message && r.imgs === 0 && r.scripts === 0 && r.xss === 0, JSON.stringify({ imgs: r.imgs, scripts: r.scripts, xss: r.xss }));
  ok('focus moves to the result heading; live regions announce', r.focus === 'resultTitle' && /EG-VO-00012: Received/.test(r.live) && r.liveAttr === 'polite' && r.statusRole === 'status', JSON.stringify({ focus: r.focus, live: r.live }));
  const url = p.url();
  ok('URL never contains the email or phone', !/@|%40|234|0012|contact/i.test(url.replace(/EG-VO-00012/, '')), url);
  // Track another
  await p.click('#trackAgain'); await sleep(200);
  ok('"Track another application" returns to the form (contact cleared)', await p.evaluate(() => !document.querySelector('#trackFormPanel').hidden && document.querySelector('#trackResult').hidden && document.querySelector('[name=contact]').value === '' && document.activeElement.name === 'leadId'));
  ok('no console errors', p.errors.length === 0, p.errors.join(' | '));
  await p.close();

  // Keyboard only: Tab order reaches reference → contact → button; Enter submits
  p = await open(b, 'track?id=EG-VO-00012', replyFor);
  await p.focus('[name=leadId]');
  await p.keyboard.press('Tab');
  const k1 = await p.evaluate(() => document.activeElement.name);
  await p.keyboard.type('qa@example.com');
  await p.keyboard.press('Tab');
  const k2 = await p.evaluate(() => document.activeElement.id);
  await p.keyboard.press('Enter'); await sleep(500);
  ok('keyboard only: Tab order + Enter on the button', k1 === 'contact' && k2 === 'trackBtn' && (await p.evaluate(() => !document.querySelector('#trackResult').hidden)), k1 + ' → ' + k2);
  // Responsive
  const scroll = [];
  for (const w of [320, 360, 768, 1024, 1440, 1920]) {
    await p.setViewport({ width: w, height: 800 }); await sleep(120);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) scroll.push(w + '→' + sw);
  }
  ok('no horizontal scroll 320–1920 px (result shown)', scroll.length === 0, scroll.join(', '));
  await p.close();

  // Reduced motion: result appears with no animation
  p = await open(b, 'track?id=EG-VO-00012', replyFor, { reduce: true });
  await p.type('[name=contact]', '08000000012'); await p.click('#trackBtn'); await sleep(400);
  const anim = await p.$eval('#trackResult', (e) => ({ shown: !e.hidden, name: getComputedStyle(e).animationName, op: getComputedStyle(e).opacity }));
  ok('reduced motion: result visible, no animation', anim.shown && anim.name === 'none' && anim.op === '1', JSON.stringify(anim));
  await p.close();

  // Home contact success links to the Track page (mocked submitContact)
  p = await open(b, 'index.html', () => ({ ok: true, leadId: 'EG-GE-00042' }));
  await p.type('input[name=name]', 'TEST Track Link'); await p.type('input[name=phone]', '+234 800 000 0042');
  await p.select('#requestType', 'Other Travel Enquiry');
  await p.$eval('#submitBtn', (e) => e.click()); await sleep(600);
  const link = await p.$eval('#formStatus', (s) => { const a = s.querySelector('a[href*="track.html"]'); return a ? a.getAttribute('href') + ' | ' + a.textContent.trim() : ''; }).catch(() => '');
  ok('home contact success: "Track this application" → track.html?id=EG-GE-00042', link === 'track.html?id=EG-GE-00042 | Track this application', link);
  await p.close();

  // Visa review stage "Action needed": amber badge, the staff message first ("What we need from you")
  const ACTION = Object.assign({}, FOUND, { stage: 'Action needed', description: 'We need a correction or more information to continue your application.',
    nextStep: 'Please read the message below, then reply to our email or contact us on WhatsApp.', message: 'Please upload a clearer passport photo.' });
  p = await open(b, 'track?id=EG-VO-00012', (body) => (replyFor(body).ok ? ACTION : replyFor(body)));
  await p.type('[name=contact]', 'qa@example.com'); await p.click('#trackBtn');
  await p.waitForFunction(() => !document.querySelector('#trackResult').hidden, { timeout: 10000 });
  const act = await p.evaluate(() => {
    const box = document.querySelector('[data-r-msgbox]'), next = document.querySelector('.next-step');
    return { tone: document.querySelector('[data-r="stage"]').getAttribute('data-tone'), title: box.querySelector('b').textContent, shown: !box.hidden,
      first: !!(box.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING), bg: getComputedStyle(document.querySelector('[data-r="stage"]')).backgroundColor };
  });
  ok('"Action needed": action tone, message shown first as "What we need from you"', act.tone === 'action' && act.shown && act.first && act.title === 'What we need from you' && act.bg === 'rgb(255, 233, 214)', JSON.stringify(act));
  await p.close();

  // Success screens of the application pages carry the link placeholder (href set with the Lead ID on success)
  for (const pg of ['apply-visa', 'customize-umrah']) {
    p = await open(b, pg + '.html', () => ({ ok: false }));
    const a = await p.$eval('#successPanel [data-track-link]', (e) => e.textContent.trim()).catch(() => '');
    ok(pg + ': success screen has "Track this application"', a === 'Track this application', a);
    await p.close();
  }

  await b.close();
  process.exit(res.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
