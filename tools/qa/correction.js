// Static test: Track session (restore, idle, log out), "Make the correction" and correct-visa.html,
// with the web app MOCKED (nothing is sent to Google). Usage: node correction.js <baseUrl> <chrome> <fixturesDir>
const path = require('path');
const puppeteer = require('puppeteer-core');
const [base, exe, fixtures] = process.argv.slice(2);
const res = []; const ok = (n, c, i = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); console.log(res[res.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fx = (f) => path.join(fixtures, f);
const ENDED = 'Please look up your application again.';
const token = (idleMin = 60) => (Date.now() + idleMin * 60000) + '.' + (Date.now() + 8 * 3600000) + '.EG-VO-00012.c2lnbmF0dXJl';
const FOUND = (extra) => Object.assign({ ok: true, leadId: 'EG-VO-00012', service: 'Visa only', received: '20 Nov 2026', stage: 'Under review',
  description: 'We have received all your documents and our team is checking them.', nextStep: 'No action needed for now.', session: token() }, extra || {});
const ACTION = (extra) => FOUND(Object.assign({ stage: 'Action needed', description: 'We need a correction or more information to continue your application.',
  nextStep: 'Please read the message below, then use “Make the correction”, or contact us on WhatsApp.', message: 'Please replace the photo.', canCorrect: true }, extra || {}));

/** Page whose web app calls are answered by reply(body) (an object, or 'abort'); records every POST body. */
async function open(b, reply, opts = {}) {
  const p = await (opts.context || b).newPage();
  p.errors = []; p.posts = [];
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errors.push(m.text()));
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('dialog', (d) => d.accept());
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (/script\.google\.com/.test(r.url()) && r.method() === 'POST') {
      const body = JSON.parse(r.postData() || '{}'); p.posts.push(body);
      const out = reply(body, p);
      if (out === 'abort') return r.abort();
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
    }
    r.continue();
  });
  await p.setViewport({ width: opts.width || 1280, height: 900 });
  if (opts.corr) await p.evaluateOnNewDocument((t) => { if (!sessionStorage.getItem('eg-corr-set')) { sessionStorage.setItem('eg-corr', JSON.stringify({ t, id: 'EG-VO-00012', x: Date.now() + 3600000 })); sessionStorage.setItem('eg-corr-set', '1'); } }, opts.corr);
  if (opts.path) await p.goto(base + '/' + opts.path, { waitUntil: 'networkidle0' });
  return p;
}
const store = (p, k) => p.evaluate((key) => sessionStorage.getItem(key), k);
const lookup = async (p) => { await p.type('[name=leadId]', 'EG-VO-00012'); await p.type('[name=contact]', 'qa@example.com'); await p.click('#trackBtn'); await p.waitForFunction(() => !document.querySelector('#trackResult').hidden, { timeout: 10000 }); };
const shown = (p) => p.evaluate(() => ({ result: !document.querySelector('#trackResult').hidden, form: !document.querySelector('#trackFormPanel').hidden, status: document.querySelector('#trackStatus').textContent }));

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });

  // --- session: stored, restored after a refresh, not in a new tab ----------------------------------------
  let reply = (body) => (body.action === 'trackApplication' && (body.session || body.contact === 'qa@example.com') ? FOUND() : { ok: true });
  let p = await open(b, (body) => reply(body), { path: 'track.html' });
  await lookup(p);
  const st = JSON.parse(await store(p, 'eg-track') || '{}');
  ok('after a lookup the tab keeps the session token only (no email or phone)', /^\d{13}\.\d{13}\.EG-VO-00012\./.test(st.t) && st.id === 'EG-VO-00012' && !/qa@example|contact/.test(JSON.stringify(st)), JSON.stringify(st).slice(0, 90));
  ok('the contact field is cleared after the lookup', await p.$eval('[name=contact]', (e) => e.value === ''));
  ok('"Log out" visible on the status view', await p.$eval('#trackLogout', (e) => !!e.offsetParent && e.textContent === 'Log out'));
  p.posts = [];
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForFunction(() => !document.querySelector('#trackResult').hidden, { timeout: 10000 });
  ok('refresh: the status comes back without asking again (lookup with the session only)', p.posts.length === 1 && p.posts[0].session === st.t && !p.posts[0].contact && !p.posts[0].leadId && (await shown(p)).result, JSON.stringify(p.posts[0]).slice(0, 120));
  const ctx2 = await b.createBrowserContext();
  const p2 = await open(b, (body) => reply(body), { path: 'track.html', context: ctx2 });
  ok('a new tab (closed tab) asks again', (await shown(p2)).form && p2.posts.length === 0);
  await p2.close(); await ctx2.close();

  // --- activity keeps the token fresh; 60 minutes idle ends the session -------------------------------------
  reply = (body) => (body.action === 'trackApplication' ? FOUND({ session: token(10) }) : { ok: true }); // token with 10 min left
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  p.posts = [];
  await p.keyboard.press('Shift'); await sleep(500);
  ok('activity with < 30 min left on the token → a quiet session refresh', p.posts.some((x) => x.action === 'trackApplication' && x.session), JSON.stringify(p.posts.map((x) => x.action)));
  reply = (body) => (body.action === 'trackApplication' && (body.session || body.contact === 'qa@example.com') ? FOUND() : { ok: true });
  await p.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('eg-track')); s.a = Date.now() - 61 * 60000; sessionStorage.setItem('eg-track', JSON.stringify(s)); });
  p.posts = [];
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  let v = await shown(p);
  ok('60 min without activity → lookup form + "Please look up your application again."', v.form && !v.result && v.status === ENDED && !p.posts.some((x) => x.action === 'trackApplication') && !(await store(p, 'eg-track')), JSON.stringify(v));
  ok('… the reference is kept, the contact is not', await p.$eval('[name=leadId]', (e) => e.value === 'EG-VO-00012') && await p.$eval('[name=contact]', (e) => e.value === ''));

  // --- expired / refused token on the server ---------------------------------------------------------------
  await lookup(p);
  reply = (body) => (body.session ? { ok: false, error: 'not found' } : body.action === 'trackApplication' ? FOUND() : { ok: true });
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(400);
  v = await shown(p);
  ok('server refuses the session (expired / 8 h) → back to the form with the message, storage cleared', v.form && v.status === ENDED && !(await store(p, 'eg-track')), JSON.stringify(v));

  // --- log out ------------------------------------------------------------------------------------------------
  reply = (body) => (body.action === 'trackApplication' && (body.session || body.contact === 'qa@example.com') ? FOUND() : { ok: true });
  await p.$eval('[name=leadId]', (e) => { e.value = ''; });
  await lookup(p);
  const tk = JSON.parse(await store(p, 'eg-track')).t;
  p.posts = [];
  await p.click('#trackLogout'); await sleep(300);
  v = await shown(p);
  ok('Log out → form, storage cleared, the server is told (endTrackSession with the token)', v.form && !v.result && !(await store(p, 'eg-track')) && p.posts.some((x) => x.action === 'endTrackSession' && x.session === tk) && /logged out/.test(v.status), JSON.stringify(v));
  await p.reload({ waitUntil: 'networkidle0' });
  ok('after log out a refresh shows the form', (await shown(p)).form);
  ok('no console errors (session)', p.errors.length === 0, p.errors.join(' | '));
  await p.close();

  // --- "Make the correction" --------------------------------------------------------------------------------------
  p = await open(b, (body) => (body.action === 'trackApplication' ? FOUND() : { ok: true }), { path: 'track.html' });
  await lookup(p);
  ok('no "Make the correction" without canCorrect', await p.$eval('#correctBox', (e) => e.hidden));
  await p.close();
  let codeReply = { ok: false, error: 'That code is not correct. Please check the latest email from us and try again. (4 attempts left)', field: 'code' };
  p = await open(b, (body) => {
    if (body.action === 'trackApplication') return ACTION();
    if (body.action === 'sendCorrectionCode') return { ok: true, masked: 'q•••@e•••.com', resendIn: 60 };
    if (body.action === 'verifyCorrectionCode') return codeReply;
    return { ok: true };
  }, { path: 'track.html' });
  await lookup(p);
  ok('Correction Needed: "Make the correction" button shown', await p.$eval('#correctBtn', (e) => !!e.offsetParent && /Make the correction/.test(e.textContent)));
  await p.click('#correctBtn');
  await p.waitForFunction(() => !document.querySelector('#correctCode').hidden, { timeout: 5000 });
  const cs = await p.evaluate(() => ({ masked: document.querySelector('#corrMasked').textContent, focus: document.activeElement.id,
    resend: document.querySelector('#corrResend').disabled, wa: (document.querySelector('#corrInbox a') || {}).href || '', otc: document.querySelector('#corrCode').autocomplete }));
  const sent = p.posts.find((x) => x.action === 'sendCorrectionCode');
  ok('code sent with the session only; masked address shown; code field focused; resend waits', sent && sent.session && !sent.email && cs.masked === 'q•••@e•••.com' && cs.focus === 'corrCode' && cs.resend && cs.otc === 'one-time-code', JSON.stringify(cs));
  ok('spam / WhatsApp note under the code', /wa\.me\/2347062152046/.test(cs.wa), cs.wa);
  await p.type('#corrCode', '12a34'); await p.click('#corrConfirm'); await sleep(200);
  ok('fewer than 6 digits → error, nothing sent', !p.posts.some((x) => x.action === 'verifyCorrectionCode') && await p.$eval('#corrCode', (e) => e.closest('.field').classList.contains('invalid')));
  await p.$eval('#corrCode', (e) => { e.value = ''; }); await p.type('#corrCode', '000000'); await p.click('#corrConfirm'); await sleep(400);
  ok('wrong code → the server message (attempts left)', /4 attempts left/.test(await p.$eval('#corrStatus', (e) => e.textContent)));
  codeReply = { ok: true, ctoken: (Date.now() + 3600000) + '.EG-VO-00012.abc.sig', minutes: 60 };
  await p.$eval('#corrCode', (e) => { e.value = ''; }); await p.type('#corrCode', '246810');
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('#corrConfirm')]);
  const cst = JSON.parse(await store(p, 'eg-corr') || '{}');
  ok('right code → correct-visa.html, correction token kept in this tab (not in the URL)', /correct-visa(\.html)?$/.test(p.url()) && cst.t === codeReply.ctoken && p.url().indexOf('abc') === -1, p.url());
  await p.close();
  p = await open(b, (body) => (body.action === 'trackApplication' ? ACTION() : body.action === 'sendCorrectionCode' ? { ok: false, error: ENDED, relogin: true } : { ok: true }), { path: 'track.html' });
  await lookup(p); await p.click('#correctBtn'); await sleep(400);
  v = await shown(p);
  ok('session ended when asking for a code → back to the form with the message', v.form && v.status === ENDED, JSON.stringify(v));
  ok('no console errors (correction button)', p.errors.length === 0, p.errors.join(' | '));
  await p.close();

  // --- correct-visa.html -------------------------------------------------------------------------------------------
  const future = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
  const LOAD = { ok: true, leadId: 'EG-VO-00012', message: 'Replace the photo <img src=x onerror="window.__xss=1">', correctionFor: 'Passport photo', email: 'q•••@e•••.com', minutesLeft: 58,
    answers: { name: 'TEST Fixer', country: 'Nigeria', travelDate: future, departureAirport: 'KAN', departureAirportOther: '', flightTicket: 'Yes', priorKsa: 'No', westernVisa: '', extraInfo: 'First' },
    passengers: [{ index: 1, name: 'TEST Pax One', category: 'Adult (18+)', files: { passport: 'jpg', photo: 'jpg', ticket: '', hotel: '' } },
      { index: 2, name: 'TEST Pax Two', category: 'Child (2–17)', files: { passport: 'pdf', photo: 'jpg', ticket: 'pdf', hotel: '' } }],
    shared: { ticket: '', hotel: 'pdf' } };
  let failUpload = true;
  const corrReply = (body) => {
    if (body.action === 'loadCorrection') return LOAD;
    if (body.action === 'uploadCorrectionFile') { if (failUpload) { failUpload = false; return { ok: false, error: 'Upload failed (test).' }; } return { ok: true, slot: body.slot, kind: body.kind }; }
    if (body.action === 'submitCorrection') return { ok: true, leadId: 'EG-VO-00012' };
    return { ok: true };
  };
  p = await open(b, corrReply, { path: 'correct-visa.html', corr: 'CTOKEN-1' });
  await p.waitForFunction(() => !document.querySelector('#corrForm').hidden, { timeout: 10000 });
  await sleep(300);
  const pg = await p.evaluate(() => ({
    load: window.__xss || 0, msg: document.querySelector('[data-message]').textContent, forLine: document.querySelector('[data-for]').textContent,
    hi: [...document.querySelectorAll('.corr-highlight')].map((e) => e.getAttribute('data-kind') || e.getAttribute('data-section')),
    emailInputs: document.querySelectorAll('#corrForm input[type=email], #corrForm input[name=email], #corrForm input[name=phone], #corrForm input[type=tel]').length,
    contact: document.querySelector('.corr-contact').textContent, wa: (document.querySelector('.corr-contact a') || {}).href,
    name: document.querySelector('[name=name]').value, country: document.querySelector('[name=country]').value, airport: document.querySelector('[name=departureAirport]').value,
    date: document.querySelector('[name=travelDate]').value, ft: (document.querySelector('[name=flightTicket]:checked') || {}).value,
    pax: [...document.querySelectorAll('[data-pax-name]')].map((e) => e.value), cats: [...document.querySelectorAll('[data-pax-category]')].map((e) => e.value),
    titles: [...document.querySelectorAll('.corr-file [data-title]')].map((e) => e.textContent), imgs: document.querySelectorAll('#corrForm img').length,
    shared: !document.querySelector('#secShared').hidden, sharedFiles: document.querySelectorAll('#corrShared .corr-file').length,
  }));
  ok('load: staff message as text, Correction For line', pg.msg === LOAD.message && pg.load === 0 && pg.forLine === 'Passport photo', JSON.stringify([pg.msg, pg.forLine]));
  ok('Correction For "Passport photo" highlights both photo slots', pg.hi.join() === 'photo,photo', pg.hi.join());
  ok('email/phone not editable: masked email + "contact us on WhatsApp" link', pg.emailInputs === 0 && /q•••@e•••\.com/.test(pg.contact) && /To change your email or phone, contact us on WhatsApp/.test(pg.contact) && /wa\.me\/2347062152046/.test(pg.wa), pg.contact);
  ok('answers filled (name, country, airport code, date, Yes/No)', pg.name === 'TEST Fixer' && pg.country === 'Nigeria' && pg.airport === 'KAN' && pg.date === future && pg.ft === 'Yes', JSON.stringify([pg.name, pg.country, pg.airport, pg.date, pg.ft]));
  ok('passengers: names + categories editable', pg.pax.join('|') === 'TEST Pax One|TEST Pax Two' && pg.cats.join('|') === 'Adult (18+)|Child (2–17)');
  ok('each existing file "Uploaded ✓", missing optional ones "No file"; no old images shown', pg.titles.filter((t) => t === 'Uploaded ✓').length === 6 && pg.titles.filter((t) => t === 'No file').length === 3 && pg.imgs === 0, pg.titles.join(','));
  ok('shared documents section shows the existing shared hotel booking', pg.shared && pg.sharedFiles === 1);
  // nothing changed
  await p.click('#corrSubmit'); await sleep(300);
  ok('submit with no change → "Nothing has been changed yet", nothing sent', /Nothing has been changed yet/.test(await p.$eval('#corrStatus', (e) => e.textContent)) && !p.posts.some((x) => x.action === 'submitCorrection'));
  // replace the photo of passenger 1
  const photoSlot = await p.$('.corr-file[data-kind="photo"][data-slot="1"]');
  await (await photoSlot.$('[data-input]')).uploadFile(fx('photo-40kb.jpg'));
  await p.waitForFunction(() => /New photo/.test(document.querySelector('.corr-file[data-kind="photo"][data-slot="1"] [data-title]').textContent), { timeout: 20000 });
  ok('Replace → photo checked: "New photo · … KB", option to keep the uploaded file', await photoSlot.$eval('[data-undo]', (e) => !e.hidden));
  await p.$eval('[data-pax-name]', (e) => { e.value = ''; }); await p.type('[data-pax-name]', 'TEST Pax Renamed');
  // first upload fails → Retry
  await p.click('#corrSubmit');
  await p.waitForFunction(() => !document.querySelector('#corrRetry').hidden, { timeout: 15000 });
  ok('failed upload → "Retry failed uploads", the form keeps the changes', /could not be sent/.test(await p.$eval('#corrStatus', (e) => e.textContent)) && !p.posts.some((x) => x.action === 'submitCorrection'));
  await p.click('#corrRetry');
  await p.waitForFunction(() => !document.querySelector('#corrDone').hidden, { timeout: 15000 });
  const ups = p.posts.filter((x) => x.action === 'uploadCorrectionFile');
  const subm = p.posts.find((x) => x.action === 'submitCorrection');
  ok('retry uploads the photo (slot 1, kind photo, JPEG base64, with the correction token)', ups.length === 2 && ups[1].slot === 1 && ups[1].kind === 'photo' && ups[1].file.mime === 'image/jpeg' && ups[1].file.b64.length > 30000 && ups[1].ctoken === 'CTOKEN-1');
  ok('submitCorrection sends answers + passengers (no email or phone)', subm && subm.answers.departureAirport === 'KAN' && subm.passengers[0].name === 'TEST Pax Renamed' && subm.passengers.length === 2 &&
    !/qa@|example\.com|\+234|"email"|"phone"/.test(JSON.stringify(subm)), JSON.stringify(subm).slice(0, 200));
  const done = await p.evaluate(() => ({ h: document.querySelector('#corrDone h2').textContent, back: document.querySelector('#corrBack').getAttribute('href'), corr: sessionStorage.getItem('eg-corr') }));
  ok('success: "Thank you — your correction has been received." + back to the Track page; token removed', done.h === 'Thank you — your correction has been received.' && done.back === 'track.html' && !done.corr, JSON.stringify(done));
  ok('no console errors (correction page)', p.errors.length === 0, p.errors.join(' | '));
  await p.close();

  // ended token at load → error + way back; responsive
  p = await open(b, (body) => (body.action === 'loadCorrection' ? { ok: false, error: 'Your correction session has ended. Please go back to the Track page and confirm your email again.', restart: true } : { ok: true }),
    { path: 'correct-visa.html', corr: 'CTOKEN-OLD' });
  await sleep(500);
  const e1 = await p.evaluate(() => ({ err: !document.querySelector('#corrError').hidden, text: document.querySelector('#corrError [data-error]').textContent, corr: sessionStorage.getItem('eg-corr') }));
  ok('ended correction token → message, back to Track, token removed', e1.err && /has ended/.test(e1.text) && !e1.corr, JSON.stringify(e1));
  await p.close();
  p = await open(b, corrReply, { path: 'correct-visa.html', corr: 'CTOKEN-2' });
  await p.waitForFunction(() => !document.querySelector('#corrForm').hidden, { timeout: 10000 });
  const scroll = [];
  for (const w of [320, 360, 768, 1024, 1440, 1920]) {
    await p.setViewport({ width: w, height: 800 }); await sleep(150);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) scroll.push(w + '→' + sw);
  }
  ok('correction page: no horizontal scroll 320–1920 px', scroll.length === 0, scroll.join(', '));
  await p.close();
  p = await open(b, (body) => (body.action === 'trackApplication' ? ACTION() : { ok: true }), { path: 'track.html' });
  await lookup(p); await p.click('#correctBtn'); await sleep(300);
  const tscroll = [];
  for (const w of [320, 360, 768, 1440]) {
    await p.setViewport({ width: w, height: 800 }); await sleep(150);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) tscroll.push(w + '→' + sw);
  }
  ok('Track page with the correction code box: no horizontal scroll 320–1440 px', tscroll.length === 0, tscroll.join(', '));
  await p.close();

  await b.close();
  process.exit(res.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
