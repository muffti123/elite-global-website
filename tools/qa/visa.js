// Browser test: apply-visa.html. Usage: node visa.js <base> <chrome> <fixturesDir> [offline|live]
const path = require('path');
const puppeteer = require('puppeteer-core');
const [base, exe, FX, mode = 'offline'] = process.argv.slice(2);
const fx = (f) => path.join(FX, f);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(b) {
  const p = await b.newPage();
  p.errors = []; p.dialogs = 0;
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('dialog', async (d) => { p.dialogs++; await d.dismiss(); });
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(base + '/apply-visa.html', { waitUntil: 'networkidle0' });
  return p;
}
const label = (p) => p.$eval('#stepLabel', (e) => e.textContent);
const next = async (p) => { await p.$eval('#nextBtn', (e) => e.click()); await sleep(250); };
async function fillLead(p, tag) {
  await p.type('[name=name]', 'TEST Visa ' + tag); await p.type('[name=phone]', '+234 800 000 0004');
  await p.type('[name=email]', `qa-visa-${tag.toLowerCase()}@example.com`); await p.select('[name=country]', 'Nigeria');
  const d = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  await p.$eval('[name=travelDate]', (e, v) => { e.value = v; }, d);
  await p.select('[name=departureAirport]', 'LOS'); await p.click('#flightTicket-1'); await p.click('#priorKsa-1');
  await p.select('[name=heard]', 'Website');
}
const cards = (p) => p.$$('#paxList .pax');
async function waitIdle(p) { await p.waitForFunction(() => !/Checking…|Resizing…/.test(document.querySelector('#paxList').innerText), { timeout: 60000 }); }
async function fillCard(p, i, name, cat, passport, photo) {
  const c = (await cards(p))[i];
  await (await c.$('[data-name]')).type(name);
  await (await c.$('[data-category]')).select(cat);
  if (passport) await (await c.$('[data-passport-input]')).uploadFile(passport);
  if (photo) await (await c.$('[data-photo-input]')).uploadFile(photo);
  await waitIdle(p);
}
const cardText = async (p, i, sel) => (await cards(p))[i].$eval(sel, (e) => e.textContent);
const cardInvalid = async (p, i) => (await cards(p))[i].$$eval('.field.invalid', (els) => els.length);

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });

  if (mode === 'offline') {
    const p = await open(b);
    ok('4 steps', (await p.$$eval('#stepper li', (l) => l.length)) === 4);

    // Departure Airport follows the country; airports.json loads only when needed
    const loaded = () => p.evaluate(() => performance.getEntriesByType('resource').filter((e) => /airports\.json/.test(e.name)).length);
    const opts = () => p.$$eval('[name=departureAirport] option', (o) => o.map((x) => x.value));
    const ng = await opts();
    const fetched0 = await loaded();
    await p.select('[name=country]', 'Ghana');
    await p.waitForFunction(() => [...document.querySelectorAll('[name=departureAirport] option')].some((o) => o.value === 'ACC'), { timeout: 10000 });
    const gh = await opts();
    await p.select('[name=departureAirport]', 'ACC');
    await p.select('[name=country]', 'Nigeria'); await sleep(100);
    const back = { opts: await opts(), value: await p.$eval('[name=departureAirport]', (s) => s.value), cb: await p.$eval('[name=departureAirport]', (s) => s.closest('label').querySelector('.cb-input').value) };
    ok('airports: Nigeria list without fetching; other country loads JSON once', ng[1] === 'LOS' && ng.length === 19 && fetched0 === 0 && (await loaded()) === 1 && gh.includes('KMS') && gh[gh.length - 1] === 'OTHER', `ng=${ng.length} before=${fetched0} gh=${gh.length}`);
    ok('airports: changing country resets an airport that is not in the new list', back.opts[1] === 'LOS' && back.value === '' && back.cb === '', JSON.stringify({ value: back.value, cb: back.cb }));
    await p.select('[name=country]', '');
    await next(p);
    ok('lead step blocks empty', (await label(p)).startsWith('Step 1') && (await p.$$eval('.field.invalid', (e) => e.length)) >= 8);
    await fillLead(p, 'Offline'); await next(p);
    ok('passengers step', (await label(p)).startsWith('Step 2'));
    await next(p);
    ok('no passengers blocked', (await label(p)).startsWith('Step 2') && /at least one passenger/.test(await p.$eval('#e-passengers', (e) => e.textContent)));

    // Select all passports → one card per file
    await (await p.$('#pickAll')).uploadFile(fx('pax01.jpg'), fx('pax02.jpg'), fx('passport.pdf'));
    await waitIdle(p);
    ok('3 cards auto-created', (await cards(p)).length === 3);
    ok('pdf passport recognised', /PDF/.test(await cardText(p, 2, '[data-passport-title]')));
    ok('previews use object URLs', (await p.$$eval('#paxList img', (i) => i.filter((x) => x.src.startsWith('blob:')).length)) === 2);

    // photo rules
    const c0 = (await cards(p))[0];
    await (await c0.$('[data-photo-input]')).uploadFile(fx('photo-20kb.jpg')); await waitIdle(p);
    ok('<25 KB photo rejected', /at least 25 KB/.test(await cardText(p, 0, '[data-photo-field] .err-msg')) && (await cardInvalid(p, 0)) >= 1, await cardText(p, 0, '[data-photo-field] .err-msg'));
    // Passport photo shape: portrait 35 × 45 mm, ≥ 350 × 450 px — anything else is refused kindly
    const guide0 = await p.$eval('#photoGuide', (d) => ({ open: d.open, svg: d.querySelectorAll('svg[role=img]').length, rules: d.querySelector('.guide-rules').textContent }));
    ok('photo guide: drawn examples + rules, closed by default', !guide0.open && guide0.svg === 6 && /recent/i.test(guide0.rules) && /plain white/i.test(guide0.rules) && /centred/i.test(guide0.rules) && /looking at the camera/i.test(guide0.rules) && /no selfies/i.test(guide0.rules) && /no full-body/i.test(guide0.rules), JSON.stringify(guide0).slice(0, 160));
    for (const [file, re] of [['photo-landscape.jpg', /landscape/], ['photo-square.jpg', /square/], ['photo-selfie.jpg', /too tall and narrow/], ['photo-lowres.jpg', /too small \(280 × 360 pixels\)/]]) {
      await (await c0.$('[data-photo-input]')).uploadFile(fx(file)); await waitIdle(p);
      const msg = await cardText(p, 0, '[data-photo-field] .err-msg');
      ok('photo shape rejected: ' + file, re.test(msg) && (await cardText(p, 0, '[data-photo-title]')) === 'Photo not accepted', msg);
    }
    ok('photo guide opens after a shape problem', await p.$eval('#photoGuide', (d) => d.open));
    await (await c0.$('[data-photo-input]')).uploadFile(fx('photo-40kb.jpg')); await waitIdle(p);
    ok('portrait 35 × 45 photo accepted', /^Photo · \d/.test(await cardText(p, 0, '[data-photo-title]')), await cardText(p, 0, '[data-photo-title]'));
    await (await c0.$('[data-photo-input]')).uploadFile(fx('photo-2mb.jpg')); await waitIdle(p);
    const t2 = await cardText(p, 0, '[data-photo-title]'); const kb = parseFloat(t2.replace(/[^\d.]/g, ''));
    ok('2 MB photo compressed into 25–50 KB', kb >= 25 && kb <= 50, t2 + ' / ' + (await cardText(p, 0, '[data-photo-note]')));
    await (await c0.$('[data-photo-input]')).uploadFile(fx('fake.jpg')); await waitIdle(p);
    ok('fake .jpg photo rejected', /real JPG or PNG/.test(await cardText(p, 0, '[data-photo-field] .err-msg')));
    await (await c0.$('[data-passport-input]')).uploadFile(fx('fake.jpg')); await waitIdle(p);
    ok('fake .jpg passport rejected', /not a real PDF, JPG or PNG/.test(await cardText(p, 0, '[data-passport-field] .err-msg')));
    await (await c0.$('[data-passport-input]')).uploadFile(fx('passport-big.jpg')); await waitIdle(p);
    ok('big passport flagged for resize', /resized to about 1 MB/.test(await cardText(p, 0, '[data-passport-note]')));

    // next with incomplete cards blocked
    await next(p);
    ok('incomplete cards blocked', (await label(p)).startsWith('Step 2'));

    // + Add passenger then remove → URLs revoked
    await p.click('#addPaxBtn2');
    ok('add passenger', (await cards(p)).length === 4);
    const before = await p.evaluate(() => window.EG._visaPreviewUrls.size);
    await p.evaluate(() => { window.__revoked = 0; const o = URL.revokeObjectURL; URL.revokeObjectURL = function (u) { window.__revoked++; return o.call(URL, u); }; });
    await (await cards(p))[1].$eval('[data-remove]', (e) => e.click());
    const after = await p.evaluate(() => ({ size: window.EG._visaPreviewUrls.size, revoked: window.__revoked }));
    ok('remove card revokes its preview URL', after.revoked === 1 && after.size === before - 1, JSON.stringify({ before, after }));
    await (await cards(p))[2].$eval('[data-remove]', (e) => e.click()); // remove empty card
    ok('renumbered', (await p.$$eval('#paxList [data-no]', (n) => n.map((x) => x.textContent).join())) === '1,2');

    // fill the 2 remaining, go to review, back and forth keeps data
    await fillCard(p, 0, 'TEST Pax One', 'Adult (18+)', null, fx('photo-40kb.jpg'));
    await fillCard(p, 1, 'TEST Pax Two', 'Child (2–17)', null, fx('photo-png.png'));

    // Camera inputs on every card: passport + documents use the back camera, the photo the front camera
    const caps = await p.$$eval('#paxList .pax', (cs) => cs.map((c) => [
      c.querySelector('[data-passport-cam-input]').getAttribute('capture'), c.querySelector('[data-photo-cam-input]').getAttribute('capture'),
      ...[...c.querySelectorAll('[data-doc-cam-input]')].map((i) => i.getAttribute('capture'))].join()));
    ok('camera capture on every card (environment / user)', caps.length === 2 && caps.every((c) => c === 'environment,user,environment,environment') && (await p.$eval('#camPax', (i) => i.getAttribute('capture'))) === 'environment', caps.join(' | '));
    ok('"Take photo" hidden on desktop (no camera input there)', (await p.$$eval('.cam-only', (b) => b.filter((x) => x.offsetParent).length)) === 0);
    // Flight ticket on card 1, shared with everyone; hotel booking on card 2
    const doc = (i, kind) => `#paxList .pax:nth-child(${i}) [data-doc="${kind}"]`;
    await (await p.$(doc(1, 'ticket') + ' [data-doc-input]')).uploadFile(fx('ticket.pdf')); await waitIdle(p);
    ok('ticket added (PDF)', /Flight ticket \(PDF\)/.test(await p.$eval(doc(1, 'ticket') + ' [data-doc-title]', (e) => e.textContent)));
    await p.$eval(doc(1, 'ticket') + ' [data-doc-share]', (e) => e.click()); await sleep(100);
    const sh = await p.evaluate((a, b) => ({ title: document.querySelector(b + ' [data-doc-title]').textContent, dis: document.querySelector(b + ' [data-doc-btn]').disabled, own: document.querySelector(a + ' [data-doc-note]').textContent }), doc(1, 'ticket'), doc(2, 'ticket'));
    ok('"Use this file for all passengers" shares the ticket', sh.title === 'Shared file' && sh.dis && /all passengers/.test(sh.own), JSON.stringify(sh));
    await (await p.$(doc(2, 'hotel') + ' [data-doc-input]')).uploadFile(fx('hotel.jpg')); await waitIdle(p);
    await (await p.$(doc(1, 'hotel') + ' [data-doc-input]')).uploadFile(fx('fake.jpg')); await waitIdle(p);
    ok('fake document rejected, optional so not blocking', /not a real PDF, JPG or PNG/.test(await p.$eval(doc(1, 'hotel') + ' .err-msg', (e) => e.textContent)));
    await (await p.$(doc(1, 'hotel') + ' [data-doc-input]')).uploadFile(fx('hotel.jpg')); await waitIdle(p);
    await p.$eval(doc(1, 'hotel') + ' [data-doc-remove]', (e) => e.click()); await sleep(100);
    ok('remove document', (await p.$eval(doc(1, 'hotel') + ' [data-doc-title]', (e) => e.textContent)) === 'No file');
    await next(p);
    ok('review reached', (await label(p)).startsWith('Step 3'));
    const rv = await p.$eval('#reviewBody', (e) => e.innerText);
    ok('review counts', /2 passengers \(1 adult, 1 child, 0 infants\)/.test(rv) && /photo \d+\.\d KB/.test(rv), rv.split('\n').filter((l) => /Passengers/.test(l))[0]);
    ok('review lists documents', /Flight ticket \(all passengers\)\s+ticket\.pdf/.test(rv) && /2\. TEST Pax Two\s+Child[^\n]*hotel booking/.test(rv), rv.split('\n').filter((l) => /ticket|hotel/i.test(l)).join(' / '));
    await p.$eval('#backBtn', (e) => e.click()); await sleep(250); await p.$eval('#backBtn', (e) => e.click()); await sleep(250);
    const kept = await p.evaluate(() => ({ name: document.querySelector('[name=name]').value, cards: document.querySelectorAll('#paxList .pax').length }));
    ok('Back keeps lead + cards', kept.name === 'TEST Visa Offline' && kept.cards === 2, JSON.stringify(kept));
    await next(p); await next(p);
    await p.$eval('#submitBtn', (e) => e.click()); await sleep(250);
    ok('consent required', (await label(p)).startsWith('Step 3') && (await p.$eval('#e-consent', (e) => getComputedStyle(e).display)) === 'block');
    // beforeunload with unsaved input
    const rl = p.reload({ timeout: 3000 }).catch(() => {}); await sleep(1200);
    ok('leave-page warning with unsaved input', p.dialogs === 1, 'dialogs=' + p.dialogs); await rl;
    await p.setViewport({ width: 360, height: 740 }); await sleep(300);
    ok('no horizontal scroll at 360px (review)', (await p.evaluate(() => document.documentElement.scrollWidth)) <= 360);
    await p.$eval('#backBtn', (e) => e.click()); await sleep(250);
    for (const w of [320, 360]) {
      await p.setViewport({ width: w, height: 740 }); await sleep(200);
      const sw = await p.evaluate(() => { document.querySelectorAll('.pax-docs').forEach((d) => { d.open = true; }); return document.documentElement.scrollWidth; });
      ok(`no horizontal scroll at ${w}px (cards, documents open)`, sw <= w, 'scrollWidth=' + sw);
    }
    ok('no console errors', p.errors.length === 0, p.errors.join(' | '));
    // Phones (touch, coarse pointer): "Take photo" buttons are shown next to "Choose file"
    const t = await b.newPage();
    await t.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await t.goto(base + '/apply-visa.html', { waitUntil: 'networkidle0' });
    await t.$eval('#addPaxBtn', (e) => e.click()); await sleep(150);
    const cams = await t.$$eval('.cam-only', (b) => b.filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.textContent.trim())); // step 2 is not shown yet, so check the CSS
    ok('"Take photo" / "Scan passport with camera" shown on phones', cams.includes('Scan passport with camera') && cams.filter((c) => c === 'Take photo').length === 4, cams.join(', '));
    ok('no horizontal scroll at 390px with documents open', await t.evaluate(() => { document.querySelector('.pax-docs').open = true; return document.documentElement.scrollWidth <= 390; }));
    await t.close();
    await p.close();
  }

  if (mode === 'live') {
    async function submitAndWait(p, interceptFail) {
      await p.click('#consentField input');
      const t0 = Date.now();
      await p.click('#submitBtn');
      await p.waitForFunction(() => !document.querySelector('#successPanel').hidden || !document.querySelector('#retryAllBtn').hidden || /status err/.test(document.querySelector('#formStatus').className), { timeout: 600000 });
      return Date.now() - t0;
    }
    // 1 passenger
    {
      const p = await open(b);
      await fillLead(p, 'One'); await next(p);
      await p.click('#addPaxBtn');
      await fillCard(p, 0, 'TEST Pax Solo', 'Adult (18+)', fx('passport.jpg'), fx('photo-40kb.jpg'));
      await next(p);
      // beforeunload during upload: checked right after submit
      const ms = await submitAndWait(p);
      const id = await p.$eval('#leadId', (e) => e.textContent);
      ok('visa 1 passenger → success', /^EG-VO-\d{5}$/.test(id), id + ' in ' + ms + ' ms');
      const d0 = p.dialogs; await p.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
      ok('no leave warning after success', p.dialogs === d0);
      ok('no console errors (1)', p.errors.length === 0, p.errors.join(' | '));
      await p.close();
    }
    // 3 passengers: adult/child/infant, pdf passport, png photo, big passport; forced failure + retry on #2
    {
      const p = await open(b);
      await fillLead(p, 'Three'); await next(p);
      await (await p.$('#pickAll')).uploadFile(fx('passport-big.jpg'), fx('passport.pdf'), fx('passport.jpg'));
      await waitIdle(p);
      await fillCard(p, 0, 'TEST Pax Adult', 'Adult (18+)', null, fx('photo-2mb.jpg'));
      await fillCard(p, 1, 'TEST Pax Child', 'Child (2–17)', null, fx('photo-png.png'));
      await fillCard(p, 2, 'TEST Pax Infant', 'Infant (under 2)', null, fx('photo-40kb.jpg'));
      await (await p.$('#paxList .pax:nth-child(1) [data-doc="ticket"] [data-doc-input]')).uploadFile(fx('ticket.pdf'));
      await (await p.$('#paxList .pax:nth-child(2) [data-doc="hotel"] [data-doc-input]')).uploadFile(fx('hotel.jpg'));
      await waitIdle(p); await sleep(300);
      await p.$eval('#paxList .pax:nth-child(1) [data-doc="ticket"] [data-doc-share]', (e) => e.click());
      await next(p);
      await p.setRequestInterception(true);
      let failing = true, blocked = 0;
      p.on('request', (r) => {
        if (failing && r.method() === 'POST' && /script\.google\.com/.test(r.url()) && /"action":"uploadPassenger".*"index":2,/.test(r.postData() || '')) { blocked++; return r.abort('failed'); }
        r.continue();
      });
      let warned = false;
      p.once('dialog', () => { warned = true; });
      const ms = await submitAndWait(p);
      const retryShown = !(await p.$eval('#retryAllBtn', (e) => e.hidden));
      ok('forced failure on #2 shows Retry', retryShown && blocked >= 4, 'blocked attempts=' + blocked + ', after ' + ms + ' ms');
      const st = await p.$$eval('#upList .st', (s) => s.map((x) => x.textContent));
      ok('others uploaded, #2 failed', st[0] === 'Uploaded ✓' && st[2] === 'Uploaded ✓' && st[1] !== 'Uploaded ✓', st.join(' | '));
      // leaving now must warn (upload in progress / unfinished)
      const rl = p.reload({ timeout: 3000 }).catch(() => {}); await sleep(1200); await rl;
      ok('leave-page warning during unfinished upload', p.dialogs >= 1 || warned, 'dialogs=' + p.dialogs);
      failing = false;
      await p.click('#upList li:nth-child(2) button');
      await p.waitForFunction(() => !document.querySelector('#successPanel').hidden || !document.querySelector('#retryAllBtn').hidden, { timeout: 300000 });
      const id = await p.$eval('#leadId', (e) => e.textContent);
      ok('retry → success (3 passengers)', /^EG-VO-\d{5}$/.test(id) && !(await p.$eval('#successPanel', (e) => e.hidden)), id + ' · ' + (await p.$eval('#successCount', (e) => e.textContent)));
      ok('no console errors (3)', p.errors.filter((e) => !/ERR_FAILED|Failed to load resource/.test(e)).length === 0, p.errors.join(' | '));
      await p.close();
    }
    // 12 passengers via Select all passports
    {
      const p = await open(b);
      await fillLead(p, 'Twelve'); await next(p);
      const files = Array.from({ length: 12 }, (_, i) => fx(`pax${String(i + 1).padStart(2, '0')}.jpg`));
      await (await p.$('#pickAll')).uploadFile(...files);
      await waitIdle(p);
      ok('12 cards from Select all passports', (await cards(p)).length === 12);
      for (let i = 0; i < 12; i++) await fillCard(p, i, 'TEST Pax ' + (i + 1), i < 8 ? 'Adult (18+)' : i < 11 ? 'Child (2–17)' : 'Infant (under 2)', null, fx('photo-40kb.jpg'));
      await next(p);
      const ms = await submitAndWait(p);
      const id = await p.$eval('#leadId', (e) => e.textContent);
      ok('visa 12 passengers → success', /^EG-VO-\d{5}$/.test(id), id + ' in ' + Math.round(ms / 1000) + ' s (' + (ms / 12000).toFixed(1) + ' s/passenger)');
      ok('no console errors (12)', p.errors.length === 0, p.errors.join(' | '));
      await p.close();
    }
  }
  await b.close();
  process.exit(res.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
