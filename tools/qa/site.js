// Static checks on all pages (CLAUDE.md). No data is sent. Usage: node site.js <baseUrl> <chrome>
const puppeteer = require('puppeteer-core');
const [base, exe] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const PAGES = ['index.html', 'customize-umrah.html', 'apply-visa.html'];

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });
  for (const page of PAGES) {
    const p = await b.newPage();
    const errors = [];
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    p.on('pageerror', (e) => errors.push(String(e)));
    let posted = 0;
    p.on('request', (r) => { if (r.method() === 'POST') posted++; });
    p.on('dialog', (d) => d.dismiss());
    await p.setViewport({ width: 1280, height: 900 });
    await p.goto(base + '/' + page, { waitUntil: 'networkidle0', timeout: 60000 });

    const html = await p.evaluate(() => document.documentElement.outerHTML);
    ok(`${page}: no Google Forms URLs`, !/docs\.google\.com\/forms/.test(html));
    ok(`${page}: no "sign in to Google" text`, !/sign in to (a )?Google/i.test(await p.evaluate(() => document.body.innerText)));
    const ph = html.match(/\[(Add [^\]]*|Full Name)\]/g) || [];
    ok(`${page}: no [Add …]/[Full Name] placeholders`, ph.length === 0, ph.join(', '));
    ok(`${page}: webAppUrl is an /exec URL`, await p.evaluate(() => window.EG && window.EG.apiReady && window.EG.apiReady()));

    if (page === 'index.html') {
      const ctas = await p.$$eval('.hero .btn, .cta-band .btn', (as) => as.map((a) => ({ t: a.textContent.trim(), h: a.getAttribute('href'), target: a.target })));
      const want = { 'Request Umrah Visa Only': 'apply-visa.html', 'Customize My Umrah Experience': 'customize-umrah.html' };
      ok('index: 4 CTAs → local pages, same tab', ctas.length === 4 && ctas.every((c) => want[c.t.replace(/\s*→\s*$/, '').replace(/ /g, ' ').trim()] === c.h && !c.target), JSON.stringify(ctas));
      await p.click('#submitBtn'); await new Promise((r) => setTimeout(r, 300));
      const invalid = await p.$$eval('#enquiryForm .field.invalid', (els) => els.map((e) => e.querySelector('input,select,textarea').name));
      ok('index: empty enquiry flags name, phone, request', ['name', 'phone', 'request'].every((n) => invalid.includes(n)), invalid.join());
    } else {
      await p.click('#nextBtn'); await new Promise((r) => setTimeout(r, 300));
      const n = await p.$$eval('.step:not([hidden]) .field.invalid', (e) => e.length);
      ok(`${page}: empty step 1 shows errors`, n >= 4, n + ' invalid fields');
    }
    ok(`${page}: nothing sent by empty submit`, posted === 0);

    await p.setViewport({ width: 360, height: 740 }); await new Promise((r) => setTimeout(r, 300));
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(`${page}: no horizontal scroll at 360px`, sw <= 360, 'scrollWidth=' + sw);
    ok(`${page}: no console errors`, errors.length === 0, errors.join(' | '));
    await p.close();
  }

  // Web app health (GET only — writes nothing)
  const p = await b.newPage();
  await p.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
  const url = await p.evaluate(() => window.SITE_CONFIG.webAppUrl);
  const health = await (await fetch(url)).json().catch(() => ({}));
  ok('web app health check (doGet)', health.ok === true, JSON.stringify(health));
  await b.close();
  console.log(res.join('\n'));
  process.exit(res.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
