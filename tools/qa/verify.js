// Static test: the email confirmation code on Step 1 of customize-umrah.html and apply-visa.html,
// with sendEmailCode / verifyEmailCode MOCKED (nothing is sent). Usage: node verify.js <baseUrl> <chrome>
const puppeteer = require('puppeteer-core');
const emailcode = require('./emailcode');
const [base, exe] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(b, page, others) {
  const p = await b.newPage();
  p.errors = [];
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.setViewport({ width: 1280, height: 900 });
  await emailcode.mock(p, others);
  await p.goto(base + '/' + page, { waitUntil: 'networkidle0' });
  return p;
}
const hidden = (p, sel) => p.$eval(sel, (e) => e.hidden);
const statusText = (p) => p.$eval('[data-verify-status]', (e) => e.textContent);

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });

  for (const page of ['customize-umrah.html', 'apply-visa.html']) {
    const tag = page.split('.')[0];
    const p = await open(b, page);
    // ARIA + markup
    const aria = await p.evaluate(() => {
      const s = document.querySelector('[data-verify-status]'), i = document.querySelector('[data-verify-input]');
      return { role: s.getAttribute('role'), live: s.getAttribute('aria-live'), mode: i.inputMode, ac: i.autocomplete, max: i.maxLength,
        label: !!i.closest('label'), codeHidden: document.querySelector('[data-verify-code]').hidden, okHidden: document.querySelector('[data-verify-ok]').hidden };
    });
    ok(tag + ': code field: label, numeric keypad, one-time-code; status is a live region', aria.role === 'status' && aria.live === 'polite' && aria.mode === 'numeric' &&
      aria.ac === 'one-time-code' && aria.max === 6 && aria.label && aria.codeHidden && aria.okHidden, JSON.stringify(aria));

    // Send code with an invalid email → email error, nothing sent
    await p.type('[name=email]', 'not-an-email');
    await p.click('[data-verify-send]'); await sleep(200);
    ok(tag + ': invalid email → field error, no request', (await p.$eval('[name=email]', (e) => e.closest('.field').classList.contains('invalid'))) && p.verifyCalls.length === 0);
    await p.$eval('[name=email]', (e) => { e.value = ''; });
    await p.type('[name=name]', 'TEST Verify QA'); await p.type('[name=email]', 'qa-verify@example.com');

    // Next without confirming → stays on Step 1, verify field marked, focus on "Send code"
    if (tag === 'customize-umrah') {
      await p.type('[name=phone]', '+234 800 000 0005'); await p.select('[name=country]', 'Nigeria');
    } else {
      await p.type('[name=phone]', '+234 800 000 0005'); await p.select('[name=country]', 'Nigeria');
      const d = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
      await p.$eval('[name=travelDate]', (e, v) => { e.value = v; }, d);
      await p.select('[name=departureAirport]', 'LOS'); await p.click('#flightTicket-1'); await p.click('#priorKsa-1');
    }
    await p.$eval('#nextBtn', (e) => e.click()); await sleep(250);
    const blocked = await p.evaluate(() => ({ step: document.querySelector('#stepLabel').textContent, inv: document.querySelector('[data-verify]').classList.contains('invalid'),
      focus: document.activeElement && document.activeElement.hasAttribute('data-verify-send'), msg: document.querySelector('#e-emailCode').textContent }));
    ok(tag + ': Next blocked until the email is confirmed (focus on "Send code")', blocked.step.startsWith('Step 1') && blocked.inv && blocked.focus && /Send code/.test(blocked.msg), JSON.stringify(blocked));

    // Send → code field focused, countdown, spam + WhatsApp help
    await p.focus('[data-verify-send]'); await p.keyboard.press('Enter');
    await p.waitForFunction(() => !document.querySelector('[data-verify-code]').hidden, { timeout: 5000 });
    const sent = await p.evaluate(() => ({ focus: document.activeElement && document.activeElement.hasAttribute('data-verify-input'),
      resend: document.querySelector('[data-verify-resend]').textContent, disabled: document.querySelector('[data-verify-resend]').disabled,
      wa: !!document.querySelector('[data-verify-status] a[href*="wa.me"]') }));
    ok(tag + ': code sent: code field focused, "Resend code (60 s)" disabled, spam + WhatsApp help', sent.focus && /Resend code \(\d+ s\)/.test(sent.resend) && sent.disabled &&
      /spam/.test(await statusText(p)) && sent.wa && p.verifyCalls[0].email === 'qa-verify@example.com' && p.verifyCalls[0].name === 'TEST Verify QA', JSON.stringify(sent));
    await sleep(1300);
    ok(tag + ': countdown ticks', /Resend code \((5[0-9]) s\)/.test(await p.$eval('[data-verify-resend]', (e) => e.textContent)));

    // Wrong code (keyboard: Enter in the code field confirms and does not move to Step 2)
    await p.type('[data-verify-input]', '11a1111');
    ok(tag + ': code field keeps digits only (max 6)', (await p.$eval('[data-verify-input]', (e) => e.value)) === '111111');
    await p.keyboard.press('Enter'); await sleep(300);
    const wrong = await p.evaluate(() => ({ step: document.querySelector('#stepLabel').textContent, inv: document.querySelector('[data-verify]').classList.contains('invalid'),
      focus: document.activeElement && document.activeElement.hasAttribute('data-verify-input'), ok: !document.querySelector('[data-verify-ok]').hidden }));
    ok(tag + ': wrong code → error, focus back in the code field, still Step 1', wrong.step.startsWith('Step 1') && wrong.inv && wrong.focus && !wrong.ok && /not correct/.test(await statusText(p)), JSON.stringify(wrong));

    // Right code
    await p.$eval('[data-verify-input]', (e) => { e.value = ''; });
    await p.type('[data-verify-input]', emailcode.CODE); await p.keyboard.press('Enter');
    await p.waitForFunction(() => !document.querySelector('[data-verify-ok]').hidden, { timeout: 5000 });
    const store = await p.evaluate(() => JSON.stringify(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)])));
    ok(tag + ': right code → "Email confirmed ✓", Send hidden, field valid', (await p.$eval('[data-verify-ok]', (e) => e.textContent)) === 'Email confirmed ✓' &&
      await hidden(p, '[data-verify-send]') && await hidden(p, '[data-verify-code]') && !(await p.$eval('[data-verify]', (e) => e.classList.contains('invalid'))));
    ok(tag + ': sessionStorage keeps the token + a hash, never the email', /eg-email-ok-/.test(store) && !/qa-verify|@|%40/.test(store) && /"h\\":\\"[0-9a-f]{64}/.test(store), store.slice(0, 140));

    // Changing the email resets the confirmation
    await p.type('[name=email]', 'x');
    ok(tag + ': changing the email resets it', await hidden(p, '[data-verify-ok]') && !(await hidden(p, '[data-verify-send]')) &&
      (await p.evaluate(() => Object.keys(sessionStorage).filter((k) => /eg-email-ok/.test(k)).length)) === 0);
    await p.keyboard.press('Backspace');

    // Confirm again and continue to Step 2
    ok(tag + ': confirm again', await emailcode.confirm(p));
    await p.$eval('#nextBtn', (e) => e.click()); await sleep(250);
    ok(tag + ': Step 2 reached after confirming', (await p.$eval('#stepLabel', (e) => e.textContent)).startsWith('Step 2'));

    // Reload in the same tab: the confirmation is restored for the same email only
    p.on('dialog', (d) => d.accept());
    await p.reload({ waitUntil: 'networkidle0' });
    await p.type('[name=email]', 'qa-verify@example.com'); await p.$eval('[name=email]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(300);
    ok(tag + ': after a reload, the same email is still confirmed (this tab only)', !(await hidden(p, '[data-verify-ok]')));

    // Success note hidden until a real confirmation email is reported
    ok(tag + ': success note "We\'ve emailed you…" exists and starts hidden', (await p.$eval('[data-emailed]', (e) => e.hidden && /check your spam folder/.test(e.textContent))));

    // 320–1920 px with the code field open
    await p.$eval('[name=email]', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await p.type('[name=email]', 'qa-other@example.com');
    await p.click('[data-verify-send]');
    await p.waitForFunction(() => !document.querySelector('[data-verify-code]').hidden, { timeout: 5000 });
    const scroll = [];
    for (const w of [320, 360, 390, 768, 1024, 1280, 1920]) {
      await p.setViewport({ width: w, height: 800 }); await sleep(150);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w) scroll.push(w + '→' + sw);
    }
    ok(tag + ': no horizontal scroll 320–1920 px (code field open)', scroll.length === 0, scroll.join(', '));
    ok(tag + ': no console errors', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }

  // The server asks to confirm again (expired token) → back to Step 1 with the message
  {
    const p = await open(b, 'customize-umrah.html', (d) => (d.action === 'submitCustomRequest'
      ? { ok: false, field: 'email', reverify: true, error: 'Please confirm your email address with the code we sent you.' } : null));
    p.on('dialog', (d) => d.dismiss());
    await p.type('[name=name]', 'TEST Verify QA'); await p.type('[name=phone]', '+234 800 000 0005');
    await p.type('[name=email]', 'qa-verify@example.com'); await p.select('[name=country]', 'Nigeria');
    await emailcode.confirm(p);
    // jump straight to the review step with the minimum answers, then submit
    await p.evaluate(() => {
      const f = document.querySelector('#customForm');
      const set = (n, v) => { f.elements[n].value = v; };
      set('adults', '1'); set('children', '0'); set('infants', '0'); set('nightsMadinah', '3'); set('nightsMakkah', '4');
      const dd = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10); set('travelDate', dd);
      set('departureAirport', 'LOS');
      ['flightTicket', 'arrivalCity', 'visaAssist'].forEach((n) => { f.querySelector('input[name="' + n + '"]').checked = true; });
      set('hotelCategory', f.elements.hotelCategory.options[1].value); set('haramDistance', f.elements.haramDistance.options[1].value);
      set('budget', f.elements.budget.options[1].value);
    });
    for (let i = 0; i < 6; i++) { await p.$eval('#nextBtn', (e) => e.click()); await sleep(150); }
    await p.$eval('#submitBtn', (e) => e.click()); await sleep(800);
    const back = await p.evaluate(() => ({ step: document.querySelector('#stepLabel').textContent, ok: !document.querySelector('[data-verify-ok]').hidden,
      inv: document.querySelector('[data-verify]').classList.contains('invalid'), msg: document.querySelector('[data-verify-status]').textContent }));
    ok('server asks to confirm again → back to Step 1, confirmation cleared, message shown', back.step.startsWith('Step 1') && !back.ok && back.inv && /confirm your email/.test(back.msg), JSON.stringify(back));
    await p.close();
  }

  await b.close();
  process.exit(res.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
