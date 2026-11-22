// LIVE test (staging only): create TEST leads and track them. Usage: node track-live.js <base> <chrome> <fixturesDir>
// Sends TEST data + SPECIMEN files to SITE_CONFIG.webAppUrl. Run cleanupTestData() afterwards.
// Email confirmation uses the staging test code: Script Property TEST_OTP_BYPASS=on (setTestOtpBypass(true)).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const [base, exe, FX] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const GENERIC = 'We couldn\'t find an application with those details. Please check your reference number and the email or phone number you used.';
const ALLOWED = ['ok', 'leadId', 'service', 'received', 'stage', 'description', 'nextStep', 'message', 'upload', 'session', 'canCorrect'];
const b64 = (f) => fs.readFileSync(path.join(FX, f)).toString('base64');

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });
  const p = await b.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(base + '/track', { waitUntil: 'networkidle0' });
  const call = (action, payload) => p.evaluate((a, d) => window.EG.postAction(a, d, { retries: 0, timeout: 120000 }), action, payload);
  const track = (leadId, contact) => call('trackApplication', { hp: '', leadId, contact });
  const future = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  // verified-email token through the real actions (TEST name + @example.com → staging test code, no email sent)
  const tokenFor = async (email, name) => {
    const s1 = await call('sendEmailCode', { hp: '', email, name });
    const s2 = s1.ok ? await call('verifyEmailCode', { hp: '', email, code: '246810' }) : s1;
    if (!s2.ok) throw new Error('email code for ' + email + ': ' + s2.error + ' — is TEST_OTP_BYPASS on in staging?');
    return s2.token;
  };
  const clean = (r) => Object.keys(r).every((k) => ALLOWED.includes(k)) && !/TEST|@|\+?234|0800|drive|docs\.google/i.test(JSON.stringify(r));

  // 1. Contact enquiry → track by phone in another format
  const ge = await call('submitContact', { hp: '', name: 'TEST Track Contact', phone: '0800 000 0005', enquiryType: 'Other Travel Enquiry', details: 'Automated staging check. Safe to delete.' });
  const t1 = await track(ge.leadId, '+234 800 000 0005');
  ok('contact lead (0800 000 0005) tracked with +234 800 000 0005', ge.ok && t1.ok && t1.service === 'General enquiry' && t1.stage === 'Received' && clean(t1), ge.leadId + ' ' + JSON.stringify(t1));

  // 2. Customise request → track by email in upper case (needs a verified-email token)
  const ceBody = {
    hp: '', name: 'TEST Track Custom', phone: '+234 800 000 0006', email: 'qa-track@example.com', country: 'Nigeria',
    adults: '1', children: '0', infants: '0', departureAirport: 'KAN', departureAirportOther: '', travelDate: future,
    flightTicket: 'No', arrivalCity: 'Jeddah', nightsMadinah: '3', nightsMakkah: '4', hotelCategory: '4-star',
    haramDistance: 'Walking distance', preferredHotel: '', services: [], servicesOther: '', visaAssist: 'Yes',
    budget: 'I need guidance on the budget', experience: '', hotelOrAirline: '', special: 'Automated staging check.', heard: 'Website',
  };
  const noTok = await call('submitCustomRequest', ceBody);
  const otherTok = await call('submitCustomRequest', Object.assign({ emailToken: await tokenFor('qa-track-other@example.com', 'TEST Track Other') }, ceBody));
  ok('without a verified-email token, or with another email\'s token → refused (reverify)', [noTok, otherTok].every((r) => !r.ok && r.reverify === true && r.field === 'email'), JSON.stringify(noTok));
  const ce = await call('submitCustomRequest', Object.assign({ emailToken: await tokenFor('qa-track@example.com', 'TEST Track Custom') }, ceBody));
  ok('customise accepted with the token; no confirmation email for TEST @example.com (emailed:false)', ce.ok && ce.emailed === false, JSON.stringify(ce));
  const t2 = await track(ce.leadId.toLowerCase(), 'QA-TRACK@EXAMPLE.COM');
  ok('customise lead tracked by email in UPPER CASE (lower-case ID)', ce.ok && t2.ok && t2.leadId === ce.leadId && t2.service === 'Customised Umrah' && t2.upload === undefined && clean(t2), ce.leadId + ' ' + JSON.stringify(t2));

  // 3. Visa application with 1 passenger (SPECIMEN files) → upload line
  const vo = await call('createVisaApplication', {
    hp: '', name: 'TEST Track Visa', phone: '+234 800 000 0007', email: 'qa-track-visa@example.com', country: 'Nigeria',
    travelDate: future, departureAirport: 'LOS', departureAirportOther: '', flightTicket: 'No', priorKsa: 'No', westernVisa: '',
    extraInfo: '', heard: '', consent: true, passengers: [{ name: 'TEST Track Pax', category: 'Adult (18+)' }],
    emailToken: await tokenFor('qa-track-visa@example.com', 'TEST Track Visa'),
  });
  const up = vo.ok && await call('uploadPassenger', {
    leadId: vo.leadId, token: vo.token, index: 1, name: 'TEST Track Pax', category: 'Adult (18+)',
    passport: { name: 'passport.jpg', mime: 'image/jpeg', b64: b64('passport.jpg') }, photo: { mime: 'image/jpeg', b64: b64('photo-40kb.jpg') },
  });
  const t3a = await track(vo.leadId, 'qa-track-visa@example.com');
  const fin = up && up.ok && await call('finalizeVisaApplication', { leadId: vo.leadId, token: vo.token });
  const t3 = await track(vo.leadId, '08000000007');
  ok('visa lead before finalize: "Upload not finished (1 of 1 …)"', t3a.ok && t3a.upload === 'Upload not finished (1 of 1 passengers received)', JSON.stringify(t3a));
  ok('visa lead after finalize: "All documents for your 1 passenger received"', fin && fin.ok && t3.ok && t3.service === 'Visa only' && t3.upload === 'All documents for your 1 passenger received' && clean(t3), vo.leadId + ' ' + JSON.stringify(t3));
  ok('visa after finalize: Review Status Under Review → stage "Under review"; emailed:false (TEST @example.com)', t3.stage === 'Under review' && fin.emailed === false, JSON.stringify({ stage: t3.stage, emailed: fin && fin.emailed }));
  ok('before finalize the visa lead has no review stage yet', t3a.stage === 'Received', t3a.stage);

  // 4. Wrong contact and unknown ID → the same generic reply
  const w1 = await track(vo.leadId, 'wrong@example.com');
  const w2 = await track('EG-VO-99999', 'qa-track-visa@example.com');
  ok('wrong contact and unknown ID → identical generic reply', JSON.stringify(w1) === JSON.stringify({ ok: false, error: GENERIC }) && JSON.stringify(w2) === JSON.stringify(w1), JSON.stringify(w1));

  // 5. The page itself against the live web app (lookup 5 on this ID — the limit is 5 per 10 min)
  await p.goto(base + '/track?id=' + encodeURIComponent(ce.leadId), { waitUntil: 'networkidle0' });
  await p.type('[name=contact]', '0800 000 0006');
  await p.click('#trackBtn');
  await p.waitForFunction(() => !document.querySelector('#trackResult').hidden || /status err/.test(document.querySelector('#trackStatus').className), { timeout: 60000 });
  const ui = await p.evaluate(() => ({ stage: document.querySelector('[data-r="stage"]').textContent, id: document.querySelector('[data-r="leadId"]').textContent, url: location.href }));
  ok('track.html against staging: result shown, URL has no contact', ui.id === ce.leadId && ui.stage === 'Received' && !/0800|0006|contact/.test(ui.url), JSON.stringify(ui));
  ok('no page errors', errors.length === 0, errors.join(' | '));
  console.log('TEST leads created: ' + [ge.leadId, ce.leadId, vo.leadId].join(', ') + ' — run cleanupTestData() in staging.');
  await b.close();
  process.exit(res.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
