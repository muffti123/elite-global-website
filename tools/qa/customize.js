// Browser test: customize-umrah.html (+ live TEST submit). Usage: node customize.js <base> <chrome> [--submit]
const puppeteer = require('puppeteer-core');
const [base, exe, flag] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });
  const p = await b.newPage();
  const errors = []; p.on('console', m => m.type() === 'error' && errors.push(m.text())); p.on('pageerror', e => errors.push(String(e)));
  let dialogs = 0; p.on('dialog', async d => { dialogs++; await d.dismiss(); });
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(base + '/customize-umrah.html', { waitUntil: 'networkidle0' });

  const label = () => p.$eval('#stepLabel', e => e.textContent);
  const next = async () => { await p.$eval('#nextBtn', e => e.click()); await new Promise(r => setTimeout(r, 200)); };
  const invalid = () => p.$$eval('.step:not([hidden]) .field.invalid', els => els.map(e => (e.querySelector('[name]') || {}).name));

  ok('7 steps in stepper', (await p.$$eval('#stepper li', l => l.length)) === 7);
  ok('country list filled', (await p.$$eval('select[name=country] option', o => o.length)) > 190);
  await next();
  ok('step 1 blocks empty', (await label()).startsWith('Step 1') && (await invalid()).join() === 'name,phone,email,country', (await invalid()).join());
  await p.type('[name=name]', 'TEST Customize QA'); await p.type('[name=phone]', '+234 800 000 0003');
  await p.type('[name=email]', 'qa-customize@example.com');
  // Country combobox: type to filter, accents ignored, Esc restores, Enter chooses
  const cbIn = '.cb-input';
  await p.click(cbIn); await p.keyboard.type('cote');
  const cb1 = await p.evaluate(() => ({ exp: document.querySelector('.cb-input').getAttribute('aria-expanded'), first: document.querySelector('.cb-option.active').textContent, ad: !!document.querySelector('.cb-input').getAttribute('aria-activedescendant') }));
  await p.keyboard.press('Escape');
  const cb2 = await p.evaluate(() => ({ v: document.querySelector('[name=country]').value, t: document.querySelector('.cb-input').value }));
  await p.click(cbIn); await p.keyboard.type('Nig'); await p.keyboard.press('Enter');
  const cb3 = await p.evaluate(() => ({ v: document.querySelector('[name=country]').value, t: document.querySelector('.cb-input').value, exp: document.querySelector('.cb-input').getAttribute('aria-expanded'), step: document.querySelector('#stepLabel').textContent }));
  ok('country combobox: filter, Esc, Enter', cb1.exp === 'true' && cb1.first === "Côte d'Ivoire" && cb1.ad && cb2.v === '' && cb2.t === '' && cb3.v === 'Nigeria' && cb3.t === 'Nigeria' && cb3.exp === 'false' && cb3.step.startsWith('Step 1'), JSON.stringify([cb1, cb2, cb3]));
  await next();
  ok('step 2 reached', (await label()).startsWith('Step 2'));
  await next();
  ok('step 2 blocks empty', (await invalid()).length >= 6, (await invalid()).join());
  for (const [n, v] of [['adults', '0'], ['children', '0'], ['infants', '0']]) await p.type(`[name=${n}]`, v);
  await p.type('[name=departureCity]', 'Kano');
  // Date picker: keyboard only, past days refused, PgDn = next month
  await p.focus('.dp-button'); await p.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 150));
  const dp1 = await p.evaluate(() => ({ open: !document.querySelector('.dp-dialog').hidden, exp: document.querySelector('.dp-button').getAttribute('aria-expanded'), focus: document.activeElement.getAttribute('data-date'), past: document.querySelectorAll('.dp-day[aria-disabled]').length }));
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 100));
  const dp2 = await p.evaluate(() => ({ v: document.querySelector('[name=travelDate]').value, open: !document.querySelector('.dp-dialog').hidden }));
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('PageDown'); await p.keyboard.press('PageDown'); await p.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 150));
  const dp3 = await p.evaluate(() => ({ v: document.querySelector('[name=travelDate]').value, open: !document.querySelector('.dp-dialog').hidden, focus: document.activeElement.className, text: document.querySelector('.dp-text').textContent }));
  const want = (() => { const t = new Date(dp1.focus); const m = new Date(t.getFullYear(), t.getMonth() + 2, 1); const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate(); const x = new Date(m.getFullYear(), m.getMonth(), Math.min(t.getDate(), last)); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); })();
  ok('date picker: keyboard, past days refused, min = today', dp1.open && dp1.exp === 'true' && dp1.focus === new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) && dp1.past >= 1 && dp2.v === '' && dp2.open && dp3.v === want && !dp3.open && /dp-button/.test(dp3.focus), JSON.stringify([dp1, dp2, dp3, want]));
  await p.click('#flightTicket-1'); await p.click('#arrivalCity-0');
  await next();
  ok('zero travellers blocked', (await label()).startsWith('Step 2') && (await invalid()).includes('adults'));
  await p.$eval('[name=adults]', e => { e.value = ''; }); await p.type('[name=adults]', '2');
  await p.$eval('[name=children]', e => { e.value = ''; }); await p.type('[name=children]', '1');
  await next();
  await p.type('[name=nightsMadinah]', '4'); await p.type('[name=nightsMakkah]', '7');
  await p.select('[name=hotelCategory]', '4-star'); await p.select('[name=haramDistance]', 'Close / short walk');
  await next();
  ok('step 4 reached', (await label()).startsWith('Step 4'));
  await p.click('#services-0'); await p.click('#services-4'); await p.click('[name=servicesOtherOn]');
  await next();
  ok('Other without text blocked', (await label()).startsWith('Step 4'));
  await p.type('[name=servicesOther]', 'Wheelchair assistance');
  await next();
  await p.click('#visaAssist-0'); await p.select('[name=budget]', '₦2,000,000 – ₦3,000,000');
  await next();
  await p.select('[name=experience]', 'Premium'); await p.type('[name=special]', 'Automated staging check. Safe to delete.'); await p.select('[name=heard]', 'Website');
  await next();
  ok('review reached', (await label()).startsWith('Step 7'));
  const review = await p.$eval('#reviewBody', e => e.innerText);
  ok('review shows answers', /TEST Customize QA/.test(review) && /2 \/ 1 \/ 0/.test(review) && /Other: Wheelchair assistance/.test(review));

  // Back/Next keeps values
  for (let i = 0; i < 3; i++) await p.$eval('#backBtn', e => e.click()); await new Promise(r => setTimeout(r, 150));
  const kept = await p.evaluate(() => ({ other: document.querySelector('[name=servicesOther]').value, svc: document.querySelectorAll('[name=services]:checked').length, name: document.querySelector('[name=name]').value }));
  ok('values kept after Back', kept.other === 'Wheelchair assistance' && kept.svc === 2 && kept.name === 'TEST Customize QA', JSON.stringify(kept));
  // Edit link from review
  for (let i = 0; i < 3; i++) await next();
  await p.click('#reviewBody .link-btn'); await new Promise(r => setTimeout(r, 150));
  ok('review Edit jumps to step 1', (await label()).startsWith('Step 1'));
  for (let i = 0; i < 6; i++) await next();
  ok('back on review', (await label()).startsWith('Step 7'));

  // beforeunload while dirty
  const reload = p.reload({ timeout: 3000 }).catch(() => {}); await new Promise(r => setTimeout(r, 1200));
  ok('leave-page warning when dirty', dialogs === 1, 'dialogs=' + dialogs);
  await reload;

  // mobile overflow on every step
  await p.setViewport({ width: 360, height: 740 }); await new Promise(r => setTimeout(r, 300));
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok('no horizontal scroll at 360px', sw <= 360, 'scrollWidth=' + sw);
  await p.setViewport({ width: 1280, height: 900 });

  if (flag === '--submit') {
    const t0 = Date.now();
    await p.click('#submitBtn');
    await p.waitForFunction(() => !document.querySelector('#successPanel').hidden || /status err/.test(document.querySelector('#formStatus').className), { timeout: 90000 });
    const id = await p.$eval('#leadId', e => e.textContent);
    ok('live submit → Lead ID', /^EG-CE-\d{5}$/.test(id), id + ' in ' + (Date.now() - t0) + ' ms ' + (await p.$eval('#formStatus', e => e.textContent)));
    const before = dialogs;
    await p.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    ok('no leave warning after success', dialogs === before);
  }
  ok('no console errors', errors.length === 0, errors.join(' | '));
  await b.close();
  console.log(res.join('\n'));
  process.exit(res.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
