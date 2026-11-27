// Static test: every dropdown on the forms (searchable + pick-only comboboxes, date picker) and the
// deliverability notes. Sends nothing (the email-code actions are mocked). Usage: node dropdowns.js <baseUrl> <chrome>
const puppeteer = require('puppeteer-core');
const emailcode = require('./emailcode');
const [base, exe] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOTE = "If it isn't in your inbox within 5 minutes, check Spam/Junk or Promotions and mark it 'Not spam' — or message us on WhatsApp.";
const CODE_NOTE = 'Check your Spam/Junk folder too. If no code arrives within 2 minutes, email info@elitetravelng.com or message us on WhatsApp.';

async function open(b, page, opts = {}) {
  const p = await b.newPage();
  p.errors = [];
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('dialog', (d) => d.dismiss());
  if (opts.touch) await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  else await p.setViewport({ width: 1280, height: 900 });
  await emailcode.mock(p, opts.reply);
  await p.goto(base + '/' + page, { waitUntil: 'networkidle0' });
  return p;
}
/** State of the combobox that enhances select `sel`. */
const state = (p, sel) => p.$eval(sel, (s) => {
  const w = s.previousElementSibling, i = w.querySelector('.cb-input'), l = w.querySelector('.cb-list');
  return { open: !l.hidden, exp: i.getAttribute('aria-expanded'), text: i.value, value: s.value, focused: document.activeElement === i,
    active: (l.querySelector('.cb-option.active') || {}).textContent || '' };
});
const inputOf = async (p, sel) => (await p.$(sel)).evaluateHandle((s) => s.previousElementSibling.querySelector('.cb-input'));
async function clickOption(p, sel, text, tap) {
  const handle = await p.$eval(sel, (s, t) => {
    const li = [...s.previousElementSibling.querySelectorAll('.cb-option')].find((x) => x.firstChild.textContent.trim() === t && !x.hidden);
    if (!li) return false;
    li.scrollIntoView({ block: 'nearest' }); li.setAttribute('data-qa-pick', '1'); return true;
  }, text);
  if (!handle) throw new Error('option not found: ' + text);
  if (tap) await p.tap('[data-qa-pick]'); else await p.click('[data-qa-pick]');
  await p.$eval('[data-qa-pick]', (e) => e.removeAttribute('data-qa-pick')).catch(() => {});
  await sleep(150);
}

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });

  // 1. Every select on every form page is a brand combobox (no browser-styled dropdowns left)
  for (const page of ['index.html', 'apply-visa.html', 'customize-umrah.html']) {
    const p = await open(b, page);
    if (page === 'apply-visa.html') { await p.$eval('#addPaxBtn', (e) => e.click()); await sleep(200); } // passenger card category (step 2)
    const r = await p.evaluate(() => [...document.querySelectorAll('form select')].map((s) => {
      const w = s.previousElementSibling, i = w && w.classList.contains('cb') ? w.querySelector('.cb-input') : null;
      const c = i ? getComputedStyle(i) : null, t = i ? getComputedStyle(w.querySelector('.cb-toggle')) : null;
      return { name: s.name || (s.hasAttribute('data-category') ? 'category' : s.id), native: getComputedStyle(s).opacity !== '0',
        enhanced: !!i, radius: c && c.borderRadius, border: c && c.borderTopColor, font: c && c.fontFamily.split(',')[0], size: c && c.fontSize,
        weight: c && c.fontWeight, chevron: t && /svg/.test(t.backgroundImage), pick: s.getAttribute('data-combobox') === 'select', readOnly: i && i.readOnly };
    }));
    const bad = r.filter((x) => x.native || !x.enhanced || x.radius !== '8px' || x.border !== 'rgb(201, 209, 224)' || x.font !== 'Arial' || x.size !== '16px' || x.weight !== '400' || !x.chevron);
    ok(page + ': every dropdown uses the brand style (' + r.length + ': border, 8px radius, Arial 16px regular, gold chevron)', r.length > 0 && bad.length === 0, JSON.stringify(bad.length ? bad : r.map((x) => x.name + (x.pick ? '(pick)' : ''))));
    const short = r.filter((x) => !['country', 'departureAirport'].includes(x.name));
    ok(page + ': short lists are pick-only (no typing / phone keyboard)', short.every((x) => x.pick && x.readOnly), JSON.stringify(short.map((x) => x.name + ':' + x.readOnly)));
    await p.close();
  }

  // 2. Country (searchable): click, Enter, Esc, click outside; airport closes on click too (visa page)
  {
    const p = await open(b, 'apply-visa.html');
    const C = '[name=country]';
    await (await inputOf(p, C)).click(); await sleep(150);
    const opened = await state(p, C);
    await p.$eval(C, (s) => { const l = s.previousElementSibling.querySelector('.cb-list'); l.scrollTop = 0; });
    await (await inputOf(p, C)).type('nig'); await sleep(150);
    await clickOption(p, C, 'Nigeria');
    const clicked = await state(p, C);
    const next = await p.evaluate(() => document.activeElement && (document.activeElement.className || document.activeElement.name));
    ok('country: clicking an option closes the list, shows the value and moves focus on', opened.open && !clicked.open && clicked.exp === 'false' &&
      clicked.text === 'Nigeria' && clicked.value === 'Nigeria' && !clicked.focused && !!next, JSON.stringify({ clicked, next }));
    await (await inputOf(p, C)).click(); await (await inputOf(p, C)).type('gha'); await p.keyboard.press('Enter'); await sleep(150);
    const entered = await state(p, C);
    ok('country: Enter chooses, closes and moves focus on (form not submitted)', !entered.open && entered.value === 'Ghana' && !entered.focused &&
      (await p.$eval('#stepLabel', (e) => e.textContent)).startsWith('Step 1'), JSON.stringify(entered));
    await (await inputOf(p, C)).click(); await sleep(100); await p.keyboard.press('Escape'); await sleep(100);
    const esc = await state(p, C);
    ok('country: Esc closes and keeps the value', !esc.open && esc.value === 'Ghana' && esc.text === 'Ghana', JSON.stringify(esc));
    await (await inputOf(p, C)).click(); await sleep(100);
    await p.mouse.click(5, 300); await sleep(150);
    const outside = await state(p, C);
    ok('country: a click outside closes the list', !outside.open && outside.value === 'Ghana', JSON.stringify(outside));
    await p.select(C, 'Nigeria'); await sleep(100);
    const A = '[name=departureAirport]';
    await (await inputOf(p, A)).click(); await sleep(150);
    await clickOption(p, A, (await p.$eval(A, (s) => s.options[1].textContent.trim())));
    const ap = await state(p, A);
    ok('departure airport: clicking an option closes the list and sets the value', !ap.open && ap.value === 'LOS', JSON.stringify(ap));
    // pick-only: "How did you hear" — click, letter jump + Enter
    const H = '[name=heard]';
    await (await inputOf(p, H)).click(); await sleep(150);
    await clickOption(p, H, 'Instagram');
    const h1 = await state(p, H);
    ok('pick-only (How did you hear): click chooses and closes', !h1.open && h1.value === 'Instagram' && h1.text === 'Instagram', JSON.stringify(h1));
    // type-ahead continues from the current choice (Instagram): "w" → WhatsApp, "w" again → Website (wraps)
    await (await inputOf(p, H)).focus(); await p.keyboard.press('w'); await sleep(100);
    const h2 = await state(p, H);
    await p.keyboard.press('w'); await sleep(100);
    const h2b = await state(p, H);
    await p.keyboard.press('Enter'); await sleep(150);
    const h3 = await state(p, H);
    ok('pick-only: letters jump between matching options, Enter chooses and closes', h2.open && h2.active === 'WhatsApp' && h2b.active === 'Website' &&
      !h3.open && h3.value === 'Website', JSON.stringify({ h2: h2.active, h2b: h2b.active, h3 }));
    // date picker: clicking a day closes it and sets the date
    await p.click('.dp-button'); await sleep(150);
    const dpOpen = await p.$eval('.dp-dialog', (d) => !d.hidden && getComputedStyle(d).display !== 'none');
    await p.click('.dp-dialog .dp-day:not(.dp-off):not(.dp-out)'); await sleep(150);
    const dp = await p.evaluate(() => ({ open: !document.querySelector('.dp-dialog').hidden && getComputedStyle(document.querySelector('.dp-dialog')).display !== 'none', value: document.querySelector('[name=travelDate]').value }));
    ok('date picker: clicking a day closes it and sets the date', dpOpen && !dp.open && /^\d{4}-\d\d-\d\d$/.test(dp.value), JSON.stringify(dp));
    // passenger card category (cards are added on step 2, after the page loaded)
    await p.type('[name=name]', 'TEST Dropdown'); await p.type('[name=phone]', '+234 800 000 0009'); await p.type('[name=email]', 'qa-dd@example.com');
    await p.select('[name=departureAirport]', 'LOS'); await p.click('#flightTicket-1'); await p.click('#priorKsa-1');
    await emailcode.confirm(p);
    await p.$eval('#nextBtn', (e) => e.click()); await sleep(300);
    await p.click('#addPaxBtn'); await sleep(200);
    const CAT = '#paxList [data-category]';
    await (await inputOf(p, CAT)).click(); await sleep(150);
    await clickOption(p, CAT, 'Child (2–17)');
    const cat = await state(p, CAT);
    ok('passenger category (step 2): click chooses and closes', (await p.$eval('#stepLabel', (e) => e.textContent)).startsWith('Step 2') && !cat.open && cat.value === 'Child (2–17)', JSON.stringify(cat));
    ok('no console errors (visa dropdowns)', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }

  // 3. Tap on a phone (customise) and the home enquiry dropdown
  {
    const p = await open(b, 'customize-umrah.html', { touch: true });
    const C = '[name=country]';
    await p.tap('.cb-input'); await sleep(150);
    await (await inputOf(p, C)).type('ken'); await sleep(150);
    await clickOption(p, C, 'Kenya', true);
    const t = await state(p, C);
    ok('phone: tapping an option closes the list and sets the value', !t.open && t.value === 'Kenya' && t.text === 'Kenya', JSON.stringify(t));
    await p.close();
    const h = await open(b, 'index.html');
    const R = '#requestType';
    await (await inputOf(h, R)).click(); await sleep(150);
    await clickOption(h, R, 'Hotel Accommodation');
    const rq = await state(h, R);
    ok('home enquiry dropdown: click chooses and closes', !rq.open && rq.value === 'Hotel Accommodation', JSON.stringify(rq));
    await h.close();
  }

  // 4. Deliverability notes: after "Send code", on the success screens and on the Track page
  {
    const p = await open(b, 'apply-visa.html');
    await p.type('[name=name]', 'TEST Note'); await p.type('[name=email]', 'qa-note@example.com');
    await p.click('[data-verify-send]');
    await p.waitForFunction(() => !document.querySelector('[data-verify-code]').hidden, { timeout: 5000 });
    const sent = await p.$eval('[data-verify-status]', (s) => ({ text: s.textContent, wa: (s.querySelector('[data-inbox-note] a[href*="wa.me"]') || {}).href || '',
      mail: (s.querySelector('[data-inbox-note] a[href^="mailto:"]') || {}).href || '' }));
    ok('after "Send code": "Check your Spam/Junk folder too. If no code arrives within 2 minutes, email info@… or WhatsApp" with both links',
      sent.text.indexOf(CODE_NOTE) !== -1 && /^https:\/\/wa\.me\/2347062152046$/.test(sent.wa) && sent.mail === 'mailto:info@elitetravelng.com', JSON.stringify(sent));
    await p.close();
    for (const page of ['customize-umrah.html', 'apply-visa.html']) {
      const q = await open(b, page);
      const note = await q.$eval('#successPanel [data-emailed]', (e) => ({ text: e.textContent, hidden: e.hidden }));
      ok(page + ': success screen carries the note (shown when the confirmation email was sent)', note.text === "We've emailed you. " + NOTE && note.hidden, JSON.stringify(note));
      await q.close();
    }
    const t = await open(b, 'track.html');
    const tn = await t.$eval('[data-inbox-note]', (e) => ({ text: e.textContent, wa: (e.querySelector('a') || {}).href || '', visible: e.getClientRects().length > 0 }));
    ok('Track page: visible note with the WhatsApp link', tn.visible && tn.text === 'We email you about every update. ' + NOTE && /wa\.me\/2347062152046$/.test(tn.wa), JSON.stringify(tn));
    await t.close();
  }

  await b.close();
  process.exit(res.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
