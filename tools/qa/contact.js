// Live test: contact form → staging web app. Usage: node contact.js <url> <chrome>
const puppeteer = require('puppeteer-core');
const [url, exe] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });
  const p = await b.newPage();
  const errors = []; p.on('console', m => m.type() === 'error' && errors.push(m.text())); p.on('pageerror', e => errors.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle0' });
  const d = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
  await p.type('input[name=name]', 'TEST Contact QA');
  await p.type('input[name=phone]', '+234 800 000 0000');
  await p.select('#requestType', 'Hotel Accommodation');
  await p.$eval('input[name=date]', (e, v) => { e.value = v; }, d);
  await p.type('input[name=travellers]', '3');
  await p.type('textarea[name=details]', 'Automated staging check. Safe to delete.');
  const t0 = Date.now();
  await p.click('#submitBtn');
  await p.waitForFunction(() => /status (ok|err)/.test(document.querySelector('#formStatus').className), { timeout: 60000 });
  const st = await p.$eval('#formStatus', e => ({ cls: e.className, text: e.textContent.trim(), id: (e.querySelector('[data-lead-id]') || {}).textContent }));
  console.log((/ok/.test(st.cls) && /^EG-GE-\d{5}$/.test(st.id) ? 'PASS' : 'FAIL') + '  contact submit → ' + st.id + ' in ' + (Date.now() - t0) + ' ms  — ' + st.text.slice(0, 120));
  // server-side validation surfaced: bypass client check with a past date via direct call
  const r = await p.evaluate(() => window.EG.postAction('submitContact', { name: 'TEST Bad', phone: '+234 800 000 0000', enquiryType: 'Not a real option' }, { retries: 0 }));
  console.log((r.ok === false && r.field === 'enquiryType' ? 'PASS' : 'FAIL') + '  server rejects bad option — ' + JSON.stringify(r));
  console.log((errors.length ? 'FAIL' : 'PASS') + '  no console errors ' + errors.join(' | '));
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
