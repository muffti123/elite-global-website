// Track sessions and self-service corrections (called from test.js before the clean-up tests).
'use strict';
module.exports = function (g, ok, t) {
  const { ctx, props, mail, clock, logs } = g;
  const { tok, future, setCell, colOf, tr, b64 } = t;
  const C = ctx.__exports.CONFIG;
  const MIN = 60000;
  const NF = JSON.stringify({ ok: false, error: C.TRACK.NOT_FOUND });
  const resetLimits = () => Object.keys(g.cache).filter((k) => /^RL_/.test(k)).forEach((k) => delete g.cache[k]);
  const clearW = () => Object.keys(g.cache).filter((k) => /_W$/.test(k)).forEach((k) => delete g.cache[k]);
  const cell = (id, h) => tr.get(ctx.findLeadRow_(tr, id), colOf(h));
  const edit = (id, h, value) => { setCell(id, h, value); ctx.onTrackerEdit({ range: tr.getRange(ctx.findLeadRow_(tr, id), colOf(h)) }); };
  const jobs = () => { delete g.cache.EMAIL_JOBS; delete props.LAST_FULL_SCAN; return ctx.runEmailJobs(); }; // full scan each time (the Due path: test-scale.js)
  const err = (fn) => { try { const r = fn(); return { ok: true, r }; } catch (e) { return { ok: false, msg: e.message, e }; } };
  const to = (addr) => mail.outbox.filter((m) => m.to === addr);
  const codeIn = (m) => (/code: (\d{6})/.exec(m.subject) || [])[1];
  mail.quota = 1000;
  clock.offset = 0;

  // A finished visa lead with a real-looking email (codes are emailed) and a TEST @example.com one (bypass)
  const mkVisa = (name, email, docs) => {
    const a = ctx.createVisaApplication_({ name, phone: '+234 800 000 0099', email, country: 'Nigeria', travelDate: future, departureAirport: 'KAN',
      flightTicket: 'Yes', priorKsa: 'No', westernVisa: '', extraInfo: 'First', heard: 'Website', consent: true, emailToken: tok(email),
      passengers: [{ name: name + ' P1', category: 'Adult (18+)' }, { name: name + ' P2', category: 'Child (2–17)' }], docs });
    [1, 2].forEach((i) => ctx.uploadPassenger_({ leadId: a.leadId, token: a.token, index: i, name: name + ' P' + i, category: i === 1 ? 'Adult (18+)' : 'Child (2–17)',
      passport: { name: 'passport.jpg', mime: 'image/jpeg', b64: b64('passport.jpg') }, photo: { mime: 'image/jpeg', b64: b64('photo-40kb.jpg') } }));
    if (docs) ctx.uploadDocument_({ leadId: a.leadId, token: a.token, scope: 1, kind: 'ticket', name: name + ' P1', file: { name: 't.pdf', mime: 'application/pdf', b64: b64('passport.pdf') } });
    ctx.finalizeVisaApplication_({ leadId: a.leadId, token: a.token });
    return a.leadId;
  };
  const K = mkVisa('TEST Fix', 'k@e.co', { passengers: [{ ticket: true }, {}] });

  // --- Track session ------------------------------------------------------------------------------
  resetLimits();
  const first = ctx.trackApplication_({ leadId: K, contact: 'k@e.co' });
  const s1 = first.session;
  ok('lookup returns a session "<idle>.<max>.<Lead ID>.<HMAC>" without email or phone', first.ok && /^\d{13}\.\d{13}\.EG-VO-\d{5}\.[\w-]+$/.test(s1) && !/@|e\.co|0099/.test(s1), s1);
  const [idle1, max1] = s1.split('.').map(Number);
  ok('session: idle expiry 60 min, max 8 h after the lookup', Math.abs(idle1 - Date.now() - 60 * MIN) < 5000 && Math.abs(max1 - Date.now() - 8 * 60 * MIN) < 5000);
  const r2 = ctx.trackApplication_({ session: s1 });
  ok('refresh: a session lookup needs no contact and returns the same status + a new token', r2.ok && r2.leadId === K && r2.stage === first.stage && r2.session && r2.session.split('.')[1] === s1.split('.')[1], JSON.stringify(r2).slice(0, 120));
  const tampered = s1.slice(0, -2) + (s1.slice(-2) === 'AA' ? 'BB' : 'AA');
  ok('tampered session → the same not-found reply', JSON.stringify(ctx.trackApplication_({ session: tampered })) === NF);
  const parts = s1.split('.'); const other = [parts[0], parts[1], 'EG-VO-00001', parts[3]].join('.');
  ok('session for another lead (same signature) → not found', JSON.stringify(ctx.trackApplication_({ session: other })) === NF);
  ok('junk session → not found', JSON.stringify(ctx.trackApplication_({ session: 'x.y' })) === NF);
  clock.offset = 50 * MIN;
  const r3 = ctx.trackApplication_({ session: r2.session });
  clock.offset = 100 * MIN; // 100 min after login, 50 min after the last use
  ok('sliding: active within 60 min keeps the session alive past the first hour', ctx.trackApplication_({ session: r3.session }).ok === true);
  clock.offset = 100 * MIN + 61 * MIN;
  ok('idle 61 min → not found (look up again)', JSON.stringify(ctx.trackApplication_({ session: r3.session })) === NF);
  // 8 h cap: refresh every 50 minutes
  clock.offset = 0; resetLimits();
  let s = ctx.trackApplication_({ leadId: K, contact: 'k@e.co' }).session; let alive = 0; let lastOk = 0;
  for (let i = 1; i <= 11; i++) {
    clock.offset = i * 50 * MIN; resetLimits();
    const r = ctx.trackApplication_({ session: s });
    if (r.ok) { alive++; lastOk = i; s = r.session; } else break;
  }
  ok('max 8 h: refreshed every 50 min, the session ends after 8 h', lastOk === 9 && alive === 9, 'last ok refresh ' + lastOk + ' (450 min)');
  clock.offset = 0; resetLimits();
  const lo = ctx.trackApplication_({ leadId: K, contact: 'k@e.co' });
  const lo2 = ctx.trackApplication_({ session: lo.session });
  ok('log out → ok', ctx.endTrackSession_({ session: lo2.session }).ok === true);
  ok('after log out the token and an earlier token of that session → not found', JSON.stringify(ctx.trackApplication_({ session: lo2.session })) === NF &&
    JSON.stringify(ctx.trackApplication_({ session: lo.session })) === NF);
  ok('log out with junk is still ok (nothing to reveal)', ctx.endTrackSession_({ session: 'junk' }).ok === true);
  ok('a new lookup after log out works', ctx.trackApplication_({ leadId: K, contact: 'k@e.co' }).ok === true);
  resetLimits();
  const sl = ctx.trackApplication_({ leadId: K, contact: 'k@e.co' }).session;
  for (let i = 0; i < 4; i++) ctx.trackApplication_({ leadId: K, contact: 'k@e.co' }); // the contact limit for this ID is now used up
  ok('contact lookups exhausted (5 per ID) do not block the session', JSON.stringify(ctx.trackApplication_({ leadId: K, contact: 'k@e.co' })) === NF && ctx.trackApplication_({ session: sl }).ok);
  let n = 1; while (n < 40 && ctx.trackApplication_({ session: sl }).ok) n++;
  ok('session lookups: own per-Lead-ID limit (30 per 10 min), then not found', n === 30, 'refused at ' + (n + 1));
  resetLimits();

  // --- canCorrect --------------------------------------------------------------------------------------
  const sess = () => { resetLimits(); return ctx.trackApplication_({ leadId: K, contact: 'k@e.co' }); };
  ok('Under Review: no canCorrect', sess().canCorrect === undefined);
  edit(K, 'Message to Customer', 'Please send a photo with a plain white background.');
  setCell(K, 'Correction For', 'Passport photo');
  edit(K, 'Review Status', 'Correction Needed');
  const tc = sess();
  ok('Correction Needed: canCorrect + "Action needed" + message', tc.canCorrect === true && tc.stage === 'Action needed' && /plain white/.test(tc.message), JSON.stringify(tc).slice(0, 160));
  setCell(K, 'Lead Status', 'Lost');
  ok('Lost: no canCorrect (shows Closed)', sess().canCorrect === undefined && sess().stage === 'Closed');
  setCell(K, 'Lead Status', 'New Lead');

  // --- Correction Needed email: gold "Fix my application" button → track.html?id=<Lead ID> ----------
  clock.offset = 6 * MIN; jobs();
  const cn = to('k@e.co').filter((m) => /needs a correction/.test(m.subject)).pop();
  const btn = cn && /<td style="border-radius:9px;background:#F5AE00"><a href="([^"]+)"[^>]*>Fix my application<\/a>/.exec(cn.htmlBody);
  ok('Correction Needed email: gold "Fix my application" button', !!btn, cn && cn.subject);
  ok('… linking to SITE_URL/track.html?id=<Lead ID> only (no token, email or phone)', btn && btn[1] === 'https://elite-global-staging.netlify.app/track.html?id=' + K && /Fix my application: https:\/\/elite-global-staging\.netlify\.app\/track\.html\?id=EG-VO-\d{5}\n/.test(cn.body), btn && btn[1]);
  clock.offset = 0;

  // --- step-up code ------------------------------------------------------------------------------------
  const S = sess().session;
  ok('sendCorrectionCode without a session → "look up again"', err(() => ctx.sendCorrectionCode_({ session: 'bad' })).e.relogin === true);
  const before = to('k@e.co').length;
  const sc = ctx.sendCorrectionCode_({ session: S });
  const codeMail = to('k@e.co').slice(before).pop();
  ok('code sent to the email ON THE APPLICATION; the reply shows it masked only', sc.ok && sc.masked === 'k•••@e•••.co' && !/k@e\.co/.test(JSON.stringify(sc)) && codeMail && /^\d{6}$/.test(codeIn(codeMail)), JSON.stringify(sc));
  ok('resend within 60 s refused', /wait a minute/.test(err(() => ctx.sendCorrectionCode_({ session: S })).msg));
  const code = codeIn(codeMail);
  ok('a Step 1 email check cannot use the correction code', /expired or was replaced/.test(err(() => ctx.verifyEmailCode_({ email: 'k@e.co', code })).msg));
  ok('wrong code → attempts left', /4 attempts left/.test(err(() => ctx.verifyCorrectionCode_({ session: S, code: code === '000000' ? '111111' : '000000' })).msg));
  const v1 = ctx.verifyCorrectionCode_({ session: S, code });
  ok('correct code → correction token (60 min)', v1.ok && /^\d{13}\.EG-VO-\d{5}\.\w+\.[\w-]+$/.test(v1.ctoken) && v1.minutes === 60);
  ok('the code is used once', /expired or was replaced/.test(err(() => ctx.verifyCorrectionCode_({ session: S, code })).msg));
  // 5 wrong attempts
  clearW(); clock.offset = 61000;
  ctx.sendCorrectionCode_({ session: S });
  for (let i = 0; i < 4; i++) err(() => ctx.verifyCorrectionCode_({ session: S, code: '000001' }));
  ok('5th wrong attempt → request a new code', /Too many wrong attempts/.test(err(() => ctx.verifyCorrectionCode_({ session: S, code: '000001' })).msg));
  clock.offset = 0;
  ok('the earlier correction token still works (a wrong code does not end it)', ctx.loadCorrection_({ ctoken: v1.ctoken }).ok === true);

  // --- loadCorrection -----------------------------------------------------------------------------------
  const L = ctx.loadCorrection_({ ctoken: v1.ctoken });
  const LJ = JSON.stringify(L);
  ok('load: passengers (names, categories) and file types only', L.passengers.length === 2 && L.passengers[0].name === 'TEST Fix P1' && L.passengers[1].category === 'Child (2–17)' &&
    L.passengers[0].files.passport === 'jpg' && L.passengers[0].files.photo === 'jpg' && L.passengers[0].files.ticket === 'pdf' && L.passengers[1].files.ticket === '', LJ.slice(0, 300));
  ok('load: Correction For, staff message, masked email, answers (airport code)', L.correctionFor === 'Passport photo' && /plain white/.test(L.message) && L.email === 'k•••@e•••.co' &&
    L.answers.departureAirport === 'KAN' && L.answers.travelDate === future && L.answers.flightTicket === 'Yes' && L.answers.extraInfo === 'First', JSON.stringify([L.correctionFor, L.message, L.email, L.answers]));
  ok('load: no files, links, email or phone sent back', !/k@e\.co|0099|drive\.google|HYPERLINK|base64|b64/.test(LJ));
  ok('tampered correction token → start again', err(() => ctx.loadCorrection_({ ctoken: v1.ctoken.slice(0, -1) + 'x' })).e.restart === true);

  // --- uploadCorrectionFile -------------------------------------------------------------------------------
  const up = (slot, kind, f) => err(() => ctx.uploadCorrectionFile_({ ctoken: v1.ctoken, slot, kind, file: f }));
  const photo = { name: 'p.jpg', mime: 'image/jpeg', b64: b64('photo-40kb.jpg') };
  const pdf = { name: 'h.pdf', mime: 'application/pdf', b64: b64('passport.pdf') };
  ok('passport/photo for the shared slot refused', /Invalid passenger/.test(up(0, 'photo', photo).msg));
  ok('passenger 3 (does not exist) refused', /Invalid passenger/.test(up(3, 'photo', photo).msg));
  ok('photo rules: a PDF is refused as a photo', !up(1, 'photo', pdf).ok);
  ok('fake file refused', /real PDF, JPG or PNG/.test(up(1, 'passport', { name: 'x.pdf', mime: 'application/pdf', b64: b64('fake.jpg') }).msg));
  ok('replacement photo for passenger 1 uploaded', up(1, 'photo', photo).ok);
  ok('a retry replaces the pending file', up(1, 'photo', photo).ok);
  ok('shared hotel booking added', up(0, 'hotel', pdf).ok);
  const stC = JSON.parse(props['CORR_' + K]);
  const pending = g.folders.find((f) => f.id === stC.f);
  ok('pending replacements wait in "Correction (pending)" (retry binned the first try)', pending && pending.name === 'Correction (pending)' &&
    pending.files.filter((f) => !f.trashed).length === 2 && pending.files.filter((f) => f.trashed).length === 1);

  // --- submitCorrection ---------------------------------------------------------------------------------------
  const app = g.folders.find((f) => f.name.indexOf(K + ' – ') === 0);
  const p1 = app.subs.find((f) => /^01 – /.test(f.name));
  const oldPhoto = p1.files.find((f) => f.name === 'photo.jpg');
  setCell(K, 'Follow-up Notes', 'staff: called twice');
  const ans = Object.assign({}, L.answers, { extraInfo: 'Updated by the customer' });
  const paxIn = L.passengers.map((p) => ({ index: p.index, name: p.name, category: p.category }));
  ok('submit: the number of passengers cannot change', /cannot change here/.test(err(() => ctx.submitCorrection_({ ctoken: v1.ctoken, answers: ans, passengers: paxIn.slice(0, 1) })).msg));
  paxIn[1].category = 'Adult (18+)';
  const staffBefore = to('staff@example.org').length;
  const custBefore = to('k@e.co').length;
  const sub = err(() => ctx.submitCorrection_({ ctoken: v1.ctoken, answers: ans, passengers: paxIn }));
  ok('submit ok', sub.ok && sub.r.ok && sub.r.leadId === K, sub.msg);
  const replaced = app.subs.find((f) => /^Replaced \d{1,2} \w{3} \d{4} \d\d:\d\d$/.test(f.name));
  ok('old photo moved to "Replaced <date>" as "01 – photo.jpg" — not deleted', replaced && oldPhoto.parent === replaced && oldPhoto.name === '01 – photo.jpg' && !oldPhoto.trashed, replaced && replaced.name);
  const newPhoto = p1.files.find((f) => f.name === 'photo.jpg' && !f.trashed);
  ok('new photo in place (passenger folder), shared hotel booking at the application folder', newPhoto && newPhoto.id !== oldPhoto.id && app.files.some((f) => f.name === 'hotel-booking.pdf'));
  const inApp = (f) => { for (let p = f.parent; p; p = g.folders.find((x) => x.subs.includes(p))) if (p === app) return true; return false; };
  ok('originals never binned; pending folder binned', g.allFiles.filter((f) => f.trashed && inApp(f)).every((f) => f.parent === pending) && pending.trashed === true);
  ok('Review Status → Correction Received, Review Updated stamped', cell(K, 'Review Status') === 'Correction Received' && Date.now() - cell(K, 'Review Updated').getTime() < 5000);
  const notes = cell(K, 'Follow-up Notes');
  ok('Notes: staff text kept + "Correction submitted <date>: <what changed>"', /^staff: called twice\nCorrection submitted \d{1,2} \w{3} \d{4} \d\d:\d\d: .*Passenger 1 photo replaced/.test(notes) &&
    /Passenger 2 category changed/.test(notes) && /Additional information changed/.test(notes) && /Shared hotel booking \(all passengers\) added/.test(notes), notes);
  ok('tracker counts follow the categories', cell(K, 'Adults') === 2 && cell(K, 'Children') === 0);
  const ps = g.ss.getSheetByName('Visa Passengers');
  const prow = (i) => { for (let r = 2; r <= ps.getLastRow(); r++) if (ps.get(r, 1) === K && ps.get(r, 2) === i) return r; return 0; };
  ok('Visa Passengers: new photo link, category, shared hotel on every row', ps.get(prow(1), 7).indexOf(newPhoto.getUrl()) !== -1 && ps.get(prow(2), 4) === 'Adult (18+)' &&
    /hotel-booking\.pdf \(all passengers\)/.test(ps.get(prow(1), 10)) && /hotel-booking\.pdf \(all passengers\)/.test(ps.get(prow(2), 10)));
  const vaS = g.ss.getSheetByName('Visa Applications');
  let vr = 0; for (let r = 2; r <= vaS.getLastRow(); r++) if (vaS.get(r, 1) === K) vr = r;
  ok('Visa Applications: answers updated, shared hotel link', vaS.get(vr, 18) === 'Updated by the customer' && vaS.get(vr, 13) === 2 && vaS.get(vr, 14) === 0 && /hotel-booking\.pdf/.test(vaS.get(vr, 17)));
  const alert = to('staff@example.org').slice(staffBefore).find((m) => /Correction submitted: EG-VO-/.test(m.subject));
  ok('staff alert at once: what changed + links to the row and the folder', alert && /Passenger 1 photo replaced/.test(alert.htmlBody) && /#gid=\d+&amp;range=A\d+/.test(alert.htmlBody) &&
    /drive\.google\.com\/drive\/folders\//.test(alert.htmlBody) && /Correction For/.test(alert.htmlBody), alert && alert.subject);
  ok('no extra customer email at submit', to('k@e.co').length === custBefore);
  ok('the correction token is used once', err(() => ctx.submitCorrection_({ ctoken: v1.ctoken, answers: ans, passengers: paxIn })).e.restart === true);
  const after = sess();
  ok('Track: "Correction received", no button', after.stage === 'Correction received' && after.canCorrect === undefined);
  ok('a code cannot be requested now (one submission per round)', /does not need a correction/.test(err(() => ctx.sendCorrectionCode_({ session: after.session })).msg));
  clock.offset = 6 * MIN; jobs();
  ok('the normal Correction Received email follows (after 5 minutes)', to('k@e.co').slice(custBefore).some((m) => /Correction received/.test(m.subject)));

  // --- second round ---------------------------------------------------------------------------------------------
  clock.offset = 10 * MIN; clearW(); resetLimits();
  edit(K, 'Message to Customer', 'Please send the passport page of passenger 2 again.');
  setCell(K, 'Correction For', 'Passport data page');
  edit(K, 'Review Status', 'Correction Needed');
  const S2 = sess().session;
  ok('round 2: canCorrect again', sess().canCorrect === true);
  const b2 = to('k@e.co').length;
  ctx.sendCorrectionCode_({ session: S2 });
  const v2 = ctx.verifyCorrectionCode_({ session: S2, code: codeIn(to('k@e.co').slice(b2).pop()) });
  const L2 = ctx.loadCorrection_({ ctoken: v2.ctoken });
  ok('round 2: load shows the new Correction For and the shared hotel booking', L2.correctionFor === 'Passport data page' && L2.shared.hotel === 'pdf' && L2.passengers[1].category === 'Adult (18+)');
  ctx.uploadCorrectionFile_({ ctoken: v2.ctoken, slot: 2, kind: 'passport', file: { name: 'p.pdf', mime: 'application/pdf', b64: b64('passport.pdf') } });
  clock.offset = 12 * MIN;
  const sub2 = err(() => ctx.submitCorrection_({ ctoken: v2.ctoken, answers: L2.answers, passengers: L2.passengers.map((p) => ({ index: p.index, name: p.name, category: p.category })) }));
  const p2 = app.subs.find((f) => /^02 – /.test(f.name));
  ok('round 2 submitted: passport.pdf in place, the old passport.jpg in a Replaced folder', sub2.ok && p2.files.some((f) => f.name === 'passport.pdf') &&
    app.subs.some((f) => /^Replaced /.test(f.name) && f.files.some((x) => x.name === '02 – passport.jpg')), sub2.msg);
  ok('round 2: a second Notes line', (cell(K, 'Follow-up Notes').match(/Correction submitted/g) || []).length === 2 && /Passenger 2 passport replaced/.test(cell(K, 'Follow-up Notes')));
  ok('round 2: Correction Received again', cell(K, 'Review Status') === 'Correction Received');

  // --- wrong status, expired token, nothing changed ---------------------------------------------------------------
  clock.offset = 20 * MIN; clearW(); resetLimits();
  edit(K, 'Review Status', 'Correction Needed');
  const S3 = sess().session;
  const b3 = to('k@e.co').length;
  ctx.sendCorrectionCode_({ session: S3 });
  const v3 = ctx.verifyCorrectionCode_({ session: S3, code: codeIn(to('k@e.co').slice(b3).pop()) });
  const L3 = ctx.loadCorrection_({ ctoken: v3.ctoken });
  const same = { ctoken: v3.ctoken, answers: L3.answers, passengers: L3.passengers.map((p) => ({ index: p.index, name: p.name, category: p.category })) };
  ok('submit with nothing changed → asked to change something', /Nothing has been changed yet/.test(err(() => ctx.submitCorrection_(same)).msg));
  edit(K, 'Review Status', 'Verified');
  ok('staff changed the status → upload/submit refused (start again)', err(() => ctx.uploadCorrectionFile_({ ctoken: v3.ctoken, slot: 1, kind: 'photo', file: photo })).e.restart === true &&
    /does not need a correction/.test(err(() => ctx.submitCorrection_(same)).msg));
  edit(K, 'Review Status', 'Correction Needed');
  clearW(); resetLimits();
  const S4 = sess().session;
  const b4 = to('k@e.co').length;
  clock.offset = 22 * MIN;
  ctx.sendCorrectionCode_({ session: S4 });
  const v4 = ctx.verifyCorrectionCode_({ session: S4, code: codeIn(to('k@e.co').slice(b4).pop()) });
  ctx.uploadCorrectionFile_({ ctoken: v4.ctoken, slot: 1, kind: 'photo', file: photo });
  const st4 = JSON.parse(props['CORR_' + K]);
  const pend4 = g.folders.find((f) => f.id === st4.f);
  const liveBefore = g.allFiles.filter((f) => !f.trashed && f.parent !== pend4).length;
  clock.offset = 22 * MIN + 61 * MIN;
  ok('expired correction token → start again', err(() => ctx.loadCorrection_({ ctoken: v4.ctoken })).e.restart === true);
  jobs();
  ok('runEmailJobs bins the expired pending upload folder and drops the state; originals untouched', !props['CORR_' + K] && pend4.trashed === true &&
    g.allFiles.filter((f) => !f.trashed && f.parent !== pend4).length === liveBefore);

  // --- staging test code + testRequestCorrection ----------------------------------------------------------------------
  clock.offset = 0; clearW(); resetLimits();
  const X = mkVisa('TEST Bypass', 'qa-fix@example.com');
  props.TEST_OTP_BYPASS = 'on';
  const logStart = logs.length;
  const id = ctx.testRequestCorrection();
  ok('testRequestCorrection: newest finished TEST @example.com visa lead → Correction Needed + Correction For + message', id === X && cell(X, 'Review Status') === 'Correction Needed' &&
    cell(X, 'Correction For') === 'Passport photo' && /^TEST:/.test(cell(X, 'Message to Customer')));
  const tlog = logs.slice(logStart).join('\n');
  ok('testRequestCorrection logs the Lead ID only', /EG-VO-\d{5}/.test(tlog) && !/TEST Bypass|example\.com/.test(tlog), tlog);
  const SX = ctx.trackApplication_({ leadId: X, contact: 'qa-fix@example.com' }).session;
  const bx = mail.outbox.length;
  ctx.sendCorrectionCode_({ session: SX });
  ok('TEST_OTP_BYPASS: TEST @example.com lead gets no email and the test code works', mail.outbox.length === bx && ctx.verifyCorrectionCode_({ session: SX, code: C.OTP.TEST_CODE }).ok);
  clearW();
  const bk = to('k@e.co').length;
  ctx.sendCorrectionCode_({ session: S4 });
  ok('TEST_OTP_BYPASS does not cover other leads (the code is emailed)', to('k@e.co').length === bk + 1 &&
    /not correct/.test(err(() => ctx.verifyCorrectionCode_({ session: S4, code: C.OTP.TEST_CODE })).msg));
  delete props.TEST_OTP_BYPASS;
  const prevSite = props.SITE_URL;
  props.SITE_URL = 'https://www.example.org';
  ok('testRequestCorrection refuses outside staging', /staging only/.test(err(() => ctx.testRequestCorrection()).msg));
  if (prevSite === undefined) delete props.SITE_URL; else props.SITE_URL = prevSite;

  // --- logs: never the email, name, code or tokens ----------------------------------------------------------------------
  const all = logs.join('\n');
  ok('logs never contain the email, names, codes or tokens', !/k@e\.co|qa-fix@example\.com|TEST Fix|TEST Bypass/.test(all) && all.indexOf(v1.ctoken) === -1 && all.indexOf(S) === -1 && all.indexOf(code) === -1);
  clock.offset = 0;
};
