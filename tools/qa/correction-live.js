// LIVE test (staging only): one full correction round in two phases, with a staff step in between.
//   node correction-live.js <base> <chrome> <fixturesDir> create
//        → a TEST visa application (2 passengers, SPECIMEN files); prints its Lead ID. Then run
//          testRequestCorrection in the Apps Script editor (Correction Needed on the newest TEST lead).
//   node correction-live.js <base> <chrome> <fixturesDir> correct <Lead ID>
//        → Track page lookup, refresh (session), "Make the correction", the staging test code, correction
//          page (replace passenger 1's photo, change passenger 2's category), submit, Track shows
//          "Correction received", the correction token cannot be used again, Log out.
// Needs TEST_OTP_BYPASS on (enableTestOtpBypass). Sends TEST data only. Run cleanupTestData() afterwards.
// Serve public/ first (run.js does; or: npx serve public -l 3000).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const [base, exe, FX, phase, leadArg] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const b64 = (f) => fs.readFileSync(path.join(FX, f)).toString('base64');
const NAME = 'TEST Correction Live', EMAIL = 'qa-correction@example.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { stagingOnly } = require('./staging-only');
(async () => {
  await stagingOnly(base); // live suite: staging only
  const b = await puppeteer.launch({ executablePath: exe, headless: true });
  const p = await b.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('dialog', (d) => d.accept());
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(base + '/track', { waitUntil: 'networkidle0' });
  const call = (action, payload) => p.evaluate((a, d) => window.EG.postAction(a, d, { retries: 0, timeout: 120000 }), action, payload);

  if (phase === 'create') {
    const s1 = await call('sendEmailCode', { hp: '', email: EMAIL, name: NAME });
    const s2 = s1.ok ? await call('verifyEmailCode', { hp: '', email: EMAIL, code: '246810' }) : s1;
    if (!s2.ok) throw new Error('email code: ' + s2.error + ' — is TEST_OTP_BYPASS on in staging?');
    const future = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
    const pax = [{ name: 'TEST Live Pax One', category: 'Adult (18+)' }, { name: 'TEST Live Pax Two', category: 'Child (2–17)' }];
    const vo = await call('createVisaApplication', { hp: '', name: NAME, phone: '+234 800 000 0023', email: EMAIL, country: 'Nigeria', travelDate: future,
      departureAirport: 'KAN', departureAirportOther: '', flightTicket: 'No', priorKsa: 'No', westernVisa: '', extraInfo: 'Live correction test', heard: '',
      consent: true, passengers: pax, emailToken: s2.token });
    ok('TEST visa application created', vo.ok, vo.error || vo.leadId);
    for (let i = 1; i <= 2 && vo.ok; i++) {
      const u = await call('uploadPassenger', { leadId: vo.leadId, token: vo.token, index: i, name: pax[i - 1].name, category: pax[i - 1].category,
        passport: { name: 'passport.jpg', mime: 'image/jpeg', b64: b64('passport.jpg') }, photo: { mime: 'image/jpeg', b64: b64('photo-40kb.jpg') } });
      ok('passenger ' + i + ' uploaded', u.ok, u.error || '');
    }
    const fin = vo.ok && await call('finalizeVisaApplication', { leadId: vo.leadId, token: vo.token });
    ok('finalized (Review Status Under Review)', fin && fin.ok, fin && fin.error);
    const t = await call('trackApplication', { hp: '', leadId: vo.leadId, contact: EMAIL });
    ok('Track: Under review, no correction button yet', t.ok && t.stage === 'Under review' && !t.canCorrect && /^\d{13}\.\d{13}\.EG-VO-\d{5}\./.test(t.session || ''), JSON.stringify(t).slice(0, 160));
    console.log('\nLead ID: ' + vo.leadId + '\nNow run testRequestCorrection in the staging Apps Script editor, then:\n  node correction-live.js ' + base + ' <chrome> <fixtures> correct ' + vo.leadId);
  } else if (phase === 'correct') {
    const leadId = leadArg;
    await p.type('[name=leadId]', leadId); await p.type('[name=contact]', EMAIL); await p.click('#trackBtn');
    await p.waitForFunction(() => !document.querySelector('#trackResult').hidden, { timeout: 60000 });
    const v1 = await p.evaluate(() => ({ stage: document.querySelector('[data-r="stage"]').textContent, btn: !document.querySelector('#correctBox').hidden,
      msg: document.querySelector('[data-r="message"]').textContent }));
    ok('Track: "Action needed", staff message and "Make the correction"', v1.stage === 'Action needed' && v1.btn && /^TEST:/.test(v1.msg), JSON.stringify(v1));
    await p.reload({ waitUntil: 'networkidle0' });
    await p.waitForFunction(() => !document.querySelector('#trackResult').hidden, { timeout: 60000 });
    ok('refresh keeps the session (status shown without asking again)', await p.evaluate(() => document.querySelector('#trackFormPanel').hidden && !!sessionStorage.getItem('eg-track')));
    await p.click('#correctBtn');
    await p.waitForFunction(() => !document.querySelector('#correctCode').hidden || /err/.test(document.querySelector('#corrStatus').className), { timeout: 60000 });
    const masked = await p.$eval('#corrMasked', (e) => e.textContent);
    ok('code "sent" to the stored email, shown masked', masked === 'q•••@e•••.com', masked + ' ' + await p.$eval('#corrStatus', (e) => e.textContent));
    await p.type('#corrCode', '246810');
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }), p.click('#corrConfirm')]);
    await p.waitForFunction(() => !document.querySelector('#corrForm').hidden || !document.querySelector('#corrError').hidden, { timeout: 60000 });
    const pg = await p.evaluate(() => ({ form: !document.querySelector('#corrForm').hidden, err: document.querySelector('#corrError [data-error]').textContent,
      hi: [...document.querySelectorAll('.corr-highlight')].map((e) => e.getAttribute('data-kind')).join(','), pax: document.querySelectorAll('[data-pax-name]').length,
      uploaded: [...document.querySelectorAll('.corr-file [data-title]')].filter((e) => e.textContent === 'Uploaded ✓').length, ctoken: (JSON.parse(sessionStorage.getItem('eg-corr') || '{}')).t }));
    ok('correction page: 2 passengers, 4 files "Uploaded ✓", photos highlighted', pg.form && pg.pax === 2 && pg.uploaded === 4 && pg.hi === 'photo,photo', JSON.stringify(pg).slice(0, 200));
    const slot = await p.$('.corr-file[data-kind="photo"][data-slot="1"]');
    await (await slot.$('[data-input]')).uploadFile(path.join(FX, 'photo-png.png'));
    await p.waitForFunction(() => /New photo/.test(document.querySelector('.corr-file[data-kind="photo"][data-slot="1"] [data-title]').textContent), { timeout: 30000 });
    await p.select('.pax:nth-of-type(2) [data-pax-category]', 'Adult (18+)');
    await p.click('#corrSubmit');
    await p.waitForFunction(() => !document.querySelector('#corrDone').hidden || /err/.test(document.querySelector('#corrStatus').className), { timeout: 180000 });
    const done = await p.evaluate(() => ({ ok: !document.querySelector('#corrDone').hidden, status: document.querySelector('#corrStatus').textContent }));
    ok('submitted: "Thank you — your correction has been received."', done.ok, done.status);
    const again = await call('submitCorrection', { hp: '', ctoken: pg.ctoken, answers: {}, passengers: [] });
    ok('the correction token cannot be used again', again.ok === false && again.restart === true, JSON.stringify(again));
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('#corrBack')]);
    await p.waitForFunction(() => !document.querySelector('#trackResult').hidden, { timeout: 60000 });
    await sleep(300);
    const v2 = await p.evaluate(() => ({ stage: document.querySelector('[data-r="stage"]').textContent, btn: !document.querySelector('#correctBox').hidden }));
    ok('back on Track (same session): "Correction received", no button', v2.stage === 'Correction received' && !v2.btn, JSON.stringify(v2));
    await p.click('#trackLogout'); await sleep(1500);
    const tok = await p.evaluate(() => sessionStorage.getItem('eg-track'));
    ok('Log out clears the session', !tok && await p.evaluate(() => !document.querySelector('#trackFormPanel').hidden));
    console.log('\nCheck in the tracker / Drive: ' + leadId + ' Review Status "Correction Received", a "Correction submitted …" Notes line,\n' +
      'passenger 2 category Adult, a "Replaced <date>" folder with "01 – photo.jpg", the staff alert email; then run cleanupTestData.');
  } else {
    console.error('Usage: node correction-live.js <base> <chrome> <fixturesDir> create | correct <Lead ID>');
    process.exit(2);
  }
  ok('no console errors', errors.length === 0, errors.join(' | '));
  await b.close();
  process.exit(res.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
