// LIVE test (staging only): one full visa-delivery round in two phases, with a staff step in between.
//   node visa-live.js <base> <chrome> <fixturesDir> create
//        → a TEST visa application (1 passenger, SPECIMEN files); prints its Lead ID. Then run
//          testApproveVisa in the Apps Script editor (2 SPECIMEN visa PDFs + Visa Approved).
//   node visa-live.js <base> <chrome> <fixturesDir> download <Lead ID>
//        → Track lookup, "Download your visa", a Step 1 code is refused, the staging test code, the list
//          (1 of 2, 2 of 2), both files downloaded through the web app and compared byte for byte with the
//          SPECIMEN files (built from apps-script/Specimen.gs; the second is ~4.5 MB), a poll returns no
//          token, Log out ends the download token.
// Needs TEST_OTP_BYPASS on (enableTestOtpBypass). Sends TEST data only. Run cleanupTestData() afterwards.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');
const [base, exe, FX, phase, leadArg] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const b64 = (f) => fs.readFileSync(path.join(FX, f)).toString('base64');
const NAME = 'TEST Visa Delivery Live', EMAIL = 'qa-visa-delivery@example.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the SPECIMEN bytes, from the same generator the Apps Script uses
const spec = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Specimen.gs'), 'utf8') + ';out.pdf = specimenVisaPdf_;', { out: spec });
const SPEC = [Buffer.from(spec.pdf(1), 'latin1'), Buffer.from(spec.pdf(2), 'latin1')];

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });
  const p = await b.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const bodies = [];
  p.on('request', (r) => { if (/script\.google\.com/.test(r.url()) && r.method() === 'POST') { try { bodies.push(JSON.parse(r.postData() || '{}')); } catch (e) { /* ignore */ } } });
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(base + '/track', { waitUntil: 'networkidle0' });
  const call = (action, payload) => p.evaluate((a, d) => window.EG.postAction(a, d, { retries: 0, timeout: 180000 }), action, payload);

  if (phase === 'create') {
    const s1 = await call('sendEmailCode', { hp: '', email: EMAIL, name: NAME });
    const s2 = s1.ok ? await call('verifyEmailCode', { hp: '', email: EMAIL, code: '246810' }) : s1;
    if (!s2.ok) throw new Error('email code: ' + s2.error + ' — is TEST_OTP_BYPASS on in staging?');
    const future = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
    const vo = await call('createVisaApplication', { hp: '', name: NAME, phone: '+234 800 000 0024', email: EMAIL, country: 'Nigeria', travelDate: future,
      departureAirport: 'KAN', departureAirportOther: '', flightTicket: 'No', priorKsa: 'No', westernVisa: '', extraInfo: 'Live visa delivery test', heard: '',
      consent: true, passengers: [{ name: 'TEST Visa Pax', category: 'Adult (18+)' }], emailToken: s2.token });
    ok('TEST visa application created', vo.ok, vo.error || vo.leadId);
    const u = vo.ok && await call('uploadPassenger', { leadId: vo.leadId, token: vo.token, index: 1, name: 'TEST Visa Pax', category: 'Adult (18+)',
      passport: { name: 'passport.jpg', mime: 'image/jpeg', b64: b64('passport.jpg') }, photo: { mime: 'image/jpeg', b64: b64('photo-40kb.jpg') } });
    ok('passenger uploaded', u && u.ok, u && u.error);
    const fin = vo.ok && await call('finalizeVisaApplication', { leadId: vo.leadId, token: vo.token });
    ok('finalized (Under Review)', fin && fin.ok, fin && fin.error);
    const t = await call('trackApplication', { hp: '', leadId: vo.leadId, contact: EMAIL });
    ok('Track: Under review, no download button yet', t.ok && t.stage === 'Under review' && !t.canDownload, JSON.stringify(t).slice(0, 160));
    console.log('\nLead ID: ' + vo.leadId + '\nNow run testApproveVisa in the staging Apps Script editor, then:\n  node visa-live.js ' + base + ' <chrome> <fixtures> download ' + vo.leadId);
  } else if (phase === 'download') {
    const leadId = leadArg;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-visa-live-'));
    const cdp = await p.target().createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
    await p.type('[name=leadId]', leadId); await p.type('[name=contact]', EMAIL); await p.click('#trackBtn');
    await p.waitForFunction(() => !document.querySelector('#trackResult').hidden, { timeout: 60000 });
    const v1 = await p.evaluate(() => ({ stage: document.querySelector('[data-r="stage"]').textContent, box: !document.querySelector('#visaBox').hidden,
      next: document.querySelector('[data-r="nextStep"]').textContent, checked: document.querySelector('#trackCheckedAt').textContent }));
    ok('Track: "Visa approved", "Download your visa" button, next step, "Last checked"', v1.stage === 'Visa approved' && v1.box && /Download your visa/.test(v1.next) && /^Last checked \d\d:\d\d$/.test(v1.checked), JSON.stringify(v1));
    const session = JSON.parse(await p.evaluate(() => sessionStorage.getItem('eg-track'))).t;
    const poll = await call('trackApplication', { session, poll: true });
    ok('poll: same status, canDownload, no new token', poll.ok && poll.stage === 'Visa approved' && poll.canDownload === true && poll.session === undefined, JSON.stringify(poll).slice(0, 160));
    // a Step 1 code (other scope) cannot open a download
    const e1 = await call('sendEmailCode', { hp: '', email: EMAIL, name: NAME });
    const wrongScope = await call('verifyVisaCode', { hp: '', session, code: '246810' });
    ok('a Step 1 email code cannot open the download (no visa code requested yet)', e1.ok && wrongScope.ok === false && /expired or was replaced/.test(wrongScope.error), JSON.stringify(wrongScope));
    await p.click('#visaBtn');
    await p.waitForFunction(() => !document.querySelector('#visaCode').hidden || /err/.test(document.querySelector('#visaStatus').className), { timeout: 60000 });
    const masked = await p.$eval('#visaMasked', (e) => e.textContent);
    ok('code "sent" to the stored email, shown masked', masked === 'q•••@e•••.com', masked + ' ' + await p.$eval('#visaStatus', (e) => e.textContent));
    await p.type('#visaCodeIn', '246810');
    await p.click('#visaConfirm');
    await p.waitForFunction(() => !document.querySelector('#visaFiles').hidden || /err/.test(document.querySelector('#visaStatus').className), { timeout: 120000 });
    const items = await p.$$eval('#visaFiles li .visa-file-label', (l) => l.map((x) => x.textContent));
    ok('list: "Visa – 1 of 2 (PDF, 1 KB)" and "Visa – 2 of 2 (PDF, ~4,608 KB)"', items.length === 2 && /^Visa – 1 of 2 \(PDF, \d KB\)$/.test(items[0]) && /^Visa – 2 of 2 \(PDF, 4,6\d\d KB\)$/.test(items[1]), items.join(' | '));
    const names = [leadId + ' – Visa 1 of 2.pdf', leadId + ' – Visa 2 of 2.pdf'];
    for (let i = 0; i < 2; i++) {
      const t0 = Date.now();
      await p.click('#visaFiles li:nth-child(' + (i + 1) + ') button');
      const want = path.join(dir, names[i]);
      for (let k = 0; k < 600 && !fs.existsSync(want); k++) await sleep(200);
      await sleep(500);
      const got = fs.existsSync(want) ? fs.readFileSync(want) : Buffer.alloc(0);
      ok('download ' + (i + 1) + ' of 2 (' + (SPEC[i].length / 1048576).toFixed(2) + ' MB): neutral name, bytes match the SPECIMEN exactly', Buffer.compare(got, SPEC[i]) === 0,
        got.length + ' bytes, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, ' + fs.readdirSync(dir).join(','));
    }
    ok('"Downloaded ✓" message', /Downloaded ✓/.test(await p.$eval('#visaStatus', (e) => e.textContent)));
    const dtoken = (bodies.find((x) => x.action === 'downloadVisaFile') || {}).dtoken;
    ok('the download token is not in sessionStorage or the URL', !!dtoken && await p.evaluate((t) => !JSON.stringify(sessionStorage).includes(t) && !location.href.includes(t), dtoken));
    const again = await call('listVisaFiles', { hp: '', dtoken });
    ok('the token works several times within 30 minutes (list again)', again.ok && again.files.length === 2 && again.files.every((f) => !/drive|google/i.test(JSON.stringify(f))));
    await p.click('#trackLogout'); await sleep(2500);
    const after = await call('listVisaFiles', { hp: '', dtoken });
    ok('Log out ends the download token', after.ok === false && after.restart === true, JSON.stringify(after));
    ok('Log out clears the session', !(await p.evaluate(() => sessionStorage.getItem('eg-track'))) && await p.evaluate(() => !document.querySelector('#trackFormPanel').hidden));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('\nCheck in the tracker / Drive: ' + leadId + ' Visa Files 2, "Approved Visa" with SPECIMEN-visa-1.pdf and SPECIMEN-visa-2.pdf;\n' +
      'checkRecentEmailJobs: Visa Approved skipped (test lead); then run cleanupTestData.');
  } else {
    console.error('Usage: node visa-live.js <base> <chrome> <fixturesDir> create | download <Lead ID>');
    process.exit(2);
  }
  ok('no console errors', errors.length === 0, errors.join(' | '));
  await b.close();
  process.exit(res.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
