// Static checks on all pages (CLAUDE.md). No data is sent. Usage: node site.js <baseUrl> <chrome>
const puppeteer = require('puppeteer-core');
const [base, exe] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

    // Logo lockup (logo kit): header light + footer dark, both link home; no old logo image
    const brand = await p.evaluate(() => ({
      head: [...document.querySelectorAll('.site-header .eg-brand.eg-brand--light')].map((a) => a.getAttribute('href')),
      foot: [...document.querySelectorAll('footer .eg-brand.eg-brand--dark')].map((a) => a.getAttribute('href')),
      css: [...document.styleSheets].some((s) => /brand\.css$/.test(s.href || '')),
      w: (document.querySelector('.site-header .eg-brand') || {}).offsetWidth,
      fontOk: document.fonts.check('800 20px "EG Display"'),
    }));
    ok(`${page}: logo lockup in header + footer → index.html`, brand.head.join() === 'index.html' && brand.foot.join() === 'index.html' && brand.css, JSON.stringify(brand));
    ok(`${page}: brand font loaded`, brand.fontOk);
    ok(`${page}: no old logo image`, !/logo\.jpg|data:image\/(jpe?g|png);base64/.test(html));

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

    // Header: CTA, no wrapping labels on wide screens, menu button below 1024 px
    const cta = await p.$eval('.site-header .nav-cta', (a) => ({ t: a.textContent.trim(), h: a.getAttribute('href') }));
    ok(`${page}: header CTA "Apply for Visa" → apply-visa.html`, cta.t === 'Apply for Visa' && cta.h === 'apply-visa.html', JSON.stringify(cta));
    const wraps = [];
    for (const w of [1024, 1100, 1280, 1440, 1920]) {
      await p.setViewport({ width: w, height: 900 }); await sleep(120);
      const r = await p.evaluate(() => {
        const items = [...document.querySelectorAll('.site-header .links a, .site-header .nav-cta')].filter((a) => a.offsetParent);
        const lines = (a) => { const r = document.createRange(); r.selectNodeContents(a); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
        const bad = items.filter((a) => lines(a) !== 1).map((a) => a.textContent);
        const nav = document.querySelector('.site-header .nav');
        const toggle = document.querySelector('.menu-toggle');
        const tops = new Set(items.map((a) => Math.round(a.getBoundingClientRect().top + a.offsetHeight / 2)));
        return { bad, overflow: nav.scrollWidth > nav.clientWidth + 1, toggle: !!toggle.offsetParent, rows: tops.size };
      });
      if (r.bad.length || r.overflow || r.toggle || r.rows > 1) wraps.push(w + ':' + JSON.stringify(r));
    }
    ok(`${page}: nav labels on one line, no menu button (1024–1920px)`, wraps.length === 0, wraps.join(' '));
    await p.setViewport({ width: 820, height: 1000 }); await sleep(150);
    const m0 = await p.evaluate(() => ({ toggle: !!document.querySelector('.menu-toggle').offsetParent, menu: !!document.querySelector('#siteMenu').offsetParent }));
    await p.click('.menu-toggle'); await sleep(250);
    const m1 = await p.evaluate(() => ({ exp: document.querySelector('.menu-toggle').getAttribute('aria-expanded'), menu: !!document.querySelector('#siteMenu').offsetParent, focus: document.activeElement.closest('#siteMenu') !== null }));
    await p.keyboard.press('Escape'); await sleep(150);
    const m2 = await p.evaluate(() => ({ exp: document.querySelector('.menu-toggle').getAttribute('aria-expanded'), menu: !!document.querySelector('#siteMenu').offsetParent, focus: document.activeElement.classList.contains('menu-toggle') }));
    ok(`${page}: menu button below 1024px opens/closes (Esc)`, m0.toggle && !m0.menu && m1.exp === 'true' && m1.menu && m1.focus && m2.exp === 'false' && !m2.menu && m2.focus, JSON.stringify([m0, m1, m2]));

    const scroll = [];
    for (const w of [320, 360, 768, 1024, 1440, 1920]) {
      await p.setViewport({ width: w, height: 800 }); await sleep(150);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w) scroll.push(w + '→' + sw);
    }
    ok(`${page}: no horizontal scroll 320–1920px`, scroll.length === 0, scroll.join(', '));
    await p.setViewport({ width: 360, height: 740 }); await sleep(300);
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
