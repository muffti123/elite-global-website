// Visa delivery: Approved Visa folder, Visa Files, held email, attachments, download step-up, polling
// (called from test.js after the correction tests, before the clean-up tests).
'use strict';
module.exports = function (g, ok, t) {
  const { ctx, props, mail, clock, logs, fetch } = g;
  const { tok, future, setCell, colOf, tr, b64 } = t;
  const C = ctx.__exports.CONFIG;
  const MIN = 60000, MB = 1024 * 1024;
  const NF = JSON.stringify({ ok: false, error: C.TRACK.NOT_FOUND });
  const resetLimits = () => Object.keys(g.cache).filter((k) => /^RL_/.test(k)).forEach((k) => delete g.cache[k]);
  const clearW = () => Object.keys(g.cache).filter((k) => /_W$/.test(k)).forEach((k) => delete g.cache[k]);
  const cell = (id, h) => tr.get(ctx.findLeadRow_(tr, id), colOf(h));
  const note = (id, h) => (tr.notes || {})[ctx.findLeadRow_(tr, id) + ',' + colOf(h)] || '';
  const edit = (id, h, value) => { setCell(id, h, value); ctx.onTrackerEdit({ range: tr.getRange(ctx.findLeadRow_(tr, id), colOf(h)) }); };
  const jobs = () => { delete g.cache.EMAIL_JOBS; delete props.LAST_FULL_SCAN; return ctx.runEmailJobs(); }; // full scan each time (the Due path: test-scale.js)
  const err = (fn) => { try { const r = fn(); return { ok: true, r }; } catch (e) { return { ok: false, msg: e.message, e }; } };
  const to = (addr) => mail.outbox.filter((m) => m.to === addr);
  const codeIn = (m) => (/\n(\d{6})\n/.exec(m.body) || [])[1];
  const logSh = () => g.books[Object.keys(g.books).find((k) => g.books[k].getSheetByName('Email Log'))].getSheetByName('Email Log');
  const logRows = () => { const sh = logSh(); return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues(); };
  const queueSh = () => g.books[Object.keys(g.books).find((k) => g.books[k].getSheetByName('Email Queue'))].getSheetByName('Email Queue');
  const PDF = ctx.specimenVisaPdf_(1);
  mail.quota = 1000; clock.offset = 0; resetLimits(); clearW();
  delete props.EMAIL_PROVIDER; delete props.ATTACH_VISA; delete props.TEST_OTP_BYPASS;

  let n = 0;
  const mkVisa = (name, email) => {
    const a = ctx.createVisaApplication_({ name, phone: '+234 800 000 0' + String(100 + n++).slice(-3), email, country: 'Nigeria', travelDate: future, departureAirport: 'KAN',
      flightTicket: 'No', priorKsa: 'No', westernVisa: '', extraInfo: '', heard: '', consent: true, emailToken: tok(email),
      passengers: [{ name: name + ' P1', category: 'Adult (18+)' }] });
    ctx.uploadPassenger_({ leadId: a.leadId, token: a.token, index: 1, name: name + ' P1', category: 'Adult (18+)',
      passport: { name: 'passport.jpg', mime: 'image/jpeg', b64: b64('passport.jpg') }, photo: { mime: 'image/jpeg', b64: b64('photo-40kb.jpg') } });
    ctx.finalizeVisaApplication_({ leadId: a.leadId, token: a.token });
    return a.leadId;
  };
  const leadFolder = (id) => ctx.leadFolder_(ctx.trackRow_(id));
  const approved = (id) => ctx.approvedVisaFolder_(leadFolder(id), false);
  const put = (id, name, mime, bytes, size) => { const f = ctx.approvedVisaFolder_(leadFolder(id), true).createFile(ctx.Utilities.newBlob(bytes, mime, name)); if (size) f.size = size; return f; };
  const approve = (id) => { edit(id, 'Review Status', 'Visa Approved'); };
  const decisions = () => JSON.parse(props.REVIEW_DECISIONS || '[]');
  const lastDecision = (id) => decisions().filter((d) => d[1] === id).pop() || [];

  // --- Approved Visa folder ----------------------------------------------------------------------------------------
  const A = mkVisa('TEST Visa Alpha', 'alpha@e.co');
  ok('finalize creates "Approved Visa" in the lead folder (empty)', !!approved(A) && approved(A).getName() === 'Approved Visa' && !approved(A).getFiles().hasNext());
  approved(A).setTrashed(true);
  ok('… (folder removed for the next check)', !approved(A));
  const setupLog = logs.length;
  ctx.setupVisaDelivery_();
  ok('setupEliteGlobal adds "Approved Visa" to existing visa lead folders', !!approved(A) && /Approved Visa folders added: [1-9]/.test(logs.slice(setupLog).join('\n')), logs.slice(setupLog).join(' | '));
  approved(A).setTrashed(true);
  ok('on demand: created when missing (refreshVisaFiles_)', ctx.refreshVisaFiles_(ctx.trackRow_(A), false) && !!approved(A));
  const nf = g.folders.filter((f) => f.name === 'Approved Visa' && !f.trashed && f === approved(A)).length;
  ctx.setupVisaDelivery_();
  ok('setup is idempotent (no second Approved Visa folder)', leadFolder(A).subs.filter((f) => f.name === 'Approved Visa' && !f.trashed).length === 1 && nf === 1);

  // --- Visa Files count -------------------------------------------------------------------------------------------
  edit(A, 'Review Status', 'Visa Processing');
  clock.offset += 6 * MIN; jobs();
  ok('Visa Processing: runEmailJobs writes Visa Files = 0', cell(A, 'Visa Files') === 0, String(cell(A, 'Visa Files')));
  put(A, 'visa-a.pdf', 'application/pdf', PDF);
  jobs();
  ok('… a PDF in Approved Visa → Visa Files 1 (no note)', cell(A, 'Visa Files') === 1 && note(A, 'Visa Files') === '');
  put(A, 'visa-b.heic', 'image/heic', 'xxxx');
  put(A, 'visa-c.pdf', 'application/pdf', PDF, 6 * MB);
  jobs();
  ok('HEIC and a 6 MB PDF are ignored (count stays 1)', cell(A, 'Visa Files') === 1);
  ok('… note: "1 file ignored: too large (max 5 MB) — please upload a smaller PDF, JPG or PNG" + the wrong type',
    note(A, 'Visa Files').split('\n')[0] === '1 file ignored: too large (max 5 MB) — please upload a smaller PDF, JPG or PNG' &&
    /1 file ignored: not a PDF, JPG or PNG/.test(note(A, 'Visa Files')), note(A, 'Visa Files'));
  put(A, 'visa-d.png', 'image/png', ctx.Utilities.base64Decode(b64('photo-png.png')));
  put(A, 'visa-e.jpg', 'image/jpeg', ctx.Utilities.base64Decode(b64('photo-40kb.jpg')), 5 * MB);
  jobs();
  ok('PNG and a JPG of exactly 5 MB count (3 valid)', cell(A, 'Visa Files') === 3, String(cell(A, 'Visa Files')));
  ok('trashed files do not count', (() => { const f = put(A, 'gone.pdf', 'application/pdf', PDF); jobs(); const a = cell(A, 'Visa Files'); f.setTrashed(true); jobs(); return a === 4 && cell(A, 'Visa Files') === 3; })());
  const fake = put(A, 'visa-f.jpg', 'image/jpeg', PDF); // says JPEG, is a PDF
  jobs();
  ok('runEmailJobs counts by Drive type/size only (a mislabelled file counts here: 4) …', cell(A, 'Visa Files') === 4);

  // --- Track: canDownload ----------------------------------------------------------------------------------------
  resetLimits();
  const tA = ctx.trackApplication_({ leadId: A, contact: 'alpha@e.co' });
  ok('Visa Processing with files: no download button', tA.ok && tA.canDownload === undefined && tA.stage === 'Visa in processing');
  // --- Visa Approved: email waits for a file; Visa Files refreshed only until the email -------------------------------------
  const B = mkVisa('TEST Visa Bravo', 'bravo@e.co');
  approve(B);
  clock.offset += 6 * MIN; jobs();
  ok('Visa Approved with no file → customer email HELD ("held: no visa file yet")', !to('bravo@e.co').some((m) => /Visa approved/.test(m.subject)) &&
    lastDecision(B)[3] === 'held' && lastDecision(B)[4] === 'no visa file yet', JSON.stringify(lastDecision(B)));
  ok('… listed by checkRecentEmailJobs and in the daily summary', ctx.checkRecentEmailJobs().some((l) => l.indexOf(B + '  Visa Approved  → held (no visa file yet)') !== -1) &&
    ctx.collectSummary_().held.some((h) => h === B + ' — Visa Approved, no visa file yet in "Approved Visa"'));
  resetLimits();
  const tB0 = ctx.trackApplication_({ leadId: B, contact: 'bravo@e.co' });
  ok('Track: Visa approved but no file → no download button, normal next step', tB0.stage === 'Visa approved' && tB0.canDownload === undefined && tB0.nextStep === C.TRACK.REVIEW['Visa Approved'][2]);
  put(B, 'visa.pdf', 'application/pdf', PDF);
  jobs();
  const eB = to('bravo@e.co').filter((m) => /Visa approved/.test(m.subject));
  ok('file added → sent on the next check (once)', eB.length === 1 && cell(B, 'Visa Files') === 1 && /Status: Visa Approved ·/.test(cell(B, 'Last Customer Email')));
  const btn = eB[0] && /<td style="border-radius:9px;background:#F5AE00"><a href="([^"]+)"[^>]*>Download your visa<\/a>/.exec(eB[0].htmlBody);
  ok('Visa Approved email: gold "Download your visa" → SITE_URL/track.html?id=<Lead ID> (no token, email or phone)', btn && btn[1] === 'https://elite-global-staging.netlify.app/track.html?id=' + B &&
    /Download your visa: https:\/\/elite-global-staging\.netlify\.app\/track\.html\?id=EG-VO-\d{5}\n/.test(eB[0].body) && !/bravo|0800|token/i.test(btn[1]));
  ok('ATTACH_VISA off (default): no attachment; Email Log "not attached (ATTACH_VISA off)"', eB[0] && !eB[0].attachments &&
    logRows().some((r) => r[1] === B + '|status:Visa Approved' && r[4] === 'ok' && r[6] === 'not attached (ATTACH_VISA off)'));
  ok('held decision no longer in the summary once sent', !ctx.collectSummary_().held.some((h) => h.indexOf(B) === 0));
  put(B, 'visa2.pdf', 'application/pdf', PDF);
  jobs(); jobs();
  ok('after the email: runEmailJobs no longer rechecks Visa Files (still 1 with 2 files)', cell(B, 'Visa Files') === 1);
  resetLimits();
  const tB = ctx.trackApplication_({ leadId: B, contact: 'bravo@e.co' });
  ok('Track: Visa Approved + Visa Files > 0 → canDownload + "Download your visa" next step', tB.canDownload === true && tB.nextStep === C.VISA_DELIVERY.NEXT_STEP && tB.canCorrect === undefined, JSON.stringify(tB).slice(0, 200));
  setCell(B, 'Lead Status', 'Lost');
  ok('Lost lead: never the download button (Closed)', (() => { resetLimits(); const r = ctx.trackApplication_({ leadId: B, contact: 'bravo@e.co' }); return r.canDownload === undefined && r.stage === 'Closed'; })());
  setCell(B, 'Lead Status', 'New Lead');

  // --- attachments ---------------------------------------------------------------------------------------------
  props.ATTACH_VISA = 'on';
  const Cc = mkVisa('TEST Visa Charlie', 'charlie@e.co');
  put(Cc, 'b-second.pdf', 'application/pdf', PDF);
  put(Cc, 'a-first.jpg', 'image/jpeg', ctx.Utilities.base64Decode(b64('photo-40kb.jpg')));
  put(Cc, 'zz.heic', 'image/heic', 'xxxx');
  approve(Cc); clock.offset += 6 * MIN; jobs();
  const eC = to('charlie@e.co').filter((m) => /Visa approved/.test(m.subject)).pop();
  ok('ATTACH_VISA on: the valid files are attached with neutral names (sorted by name), the HEIC is not', eC && eC.attachments && eC.attachments.length === 2 &&
    eC.attachments.map((a) => a.getName()).join('|') === Cc + ' – Visa 1 of 2.jpg|' + Cc + ' – Visa 2 of 2.pdf', eC && JSON.stringify((eC.attachments || []).map((a) => a.getName())));
  ok('… attached bytes are the file bytes; the email says it is attached and keeps the button', eC && Buffer.from(eC.attachments[1].getBytes().map((b) => b & 255)).toString('latin1') === PDF &&
    /Your visa is attached to this email \(2 files\)/.test(eC.body) && /Download your visa/.test(eC.htmlBody));
  const cRow = logRows().filter((r) => r[3] === Cc);
  ok('Email Log: only "attached 2 files" — no file names or contents', cRow.some((r) => r[6] === 'attached 2 files') &&
    !cRow.some((r) => /%PDF|JVBER|a-first|b-second|\.pdf|\.jpg/i.test(r.join(' '))), cRow.map((r) => r[6]).join(','));
  const D = mkVisa('TEST Visa Delta', 'delta@e.co');
  [1, 2, 3, 4].forEach((i) => put(D, 'v' + i + '.pdf', 'application/pdf', PDF, Math.round(4.5 * MB)));
  approve(D); clock.offset += 6 * MIN; jobs();
  const eD = to('delta@e.co').filter((m) => /Visa approved/.test(m.subject)).pop();
  ok('over 15 MB together: nothing attached + "Your visa is too large to attach — please download it from the Track page."', eD && !eD.attachments &&
    /Your visa is too large to attach — please download it from the Track page\./.test(eD.body) && logRows().some((r) => r[3] === D && r[6] === 'not attached (too large)'));
  // Brevo + the queue
  props.EMAIL_PROVIDER = 'brevo'; props.BREVO_API_KEY = 'xkeysib-test'; props.SENDER_EMAIL = 'sender@example.org';
  const E = mkVisa('TEST Visa Echo', 'echo@e.co');
  put(E, 'visa.pdf', 'application/pdf', PDF);
  fetch.calls.length = 0; fetch.responses.length = 0;
  approve(E); clock.offset += 6 * MIN; jobs();
  const call = fetch.calls.map((c) => JSON.parse(c.o.payload)).find((pl) => pl.to[0].email === 'echo@e.co' && /Visa approved/.test(pl.subject));
  ok('Brevo: attachment [{name, content base64}] with the file bytes', call && call.attachment && call.attachment.length === 1 && call.attachment[0].name === E + ' – Visa 1 of 1.pdf' &&
    Buffer.from(call.attachment[0].content, 'base64').toString('latin1') === PDF);
  const F = mkVisa('TEST Visa Foxtrot', 'fox@e.co');
  put(F, 'visa.pdf', 'application/pdf', PDF);
  approve(F); clock.offset += 6 * MIN;
  fetch.responses.push(503, 503); // transient twice → queued
  jobs();
  const qs = queueSh();
  const qrow = qs.getLastRow() >= 2 ? qs.getRange(2, 1, qs.getLastRow() - 1, 11).getValues().find((r) => r[3] === F) : null;
  ok('queued Visa Approved email: the queue row holds no file content (only the Lead ID flag)', qrow && !/%PDF|JVBER/.test(qrow.join(' ')) && /"visa":\{"id":"EG-VO-\d{5}","attach":true/.test(qrow[10]), qrow && qrow[10]);
  fetch.calls.length = 0;
  jobs();
  const qcall = fetch.calls.map((c) => JSON.parse(c.o.payload)).find((pl) => pl.to[0].email === 'fox@e.co');
  ok('… sent from the queue later with the files read from Drive again', qcall && qcall.attachment && qcall.attachment.length === 1 &&
    logRows().some((r) => r[3] === F && r[4] === 'ok' && r[6] === 'from queue · attached 1 file'));
  delete props.EMAIL_PROVIDER; delete props.BREVO_API_KEY; delete props.SENDER_EMAIL;
  props.ATTACH_VISA = 'off';
  ok('checkEmailSettings shows ATTACH_VISA', (() => { const l = logs.length; ctx.checkEmailSettings(); return /ATTACH_VISA +off/.test(logs.slice(l).join('\n')); })());
  props.ATTACH_VISA = 'on';
  ok('… on', (() => { const l = logs.length; ctx.checkEmailSettings(); return /ATTACH_VISA +on/.test(logs.slice(l).join('\n')); })());
  delete props.ATTACH_VISA;

  // --- download: step-up code --------------------------------------------------------------------------------------
  clock.offset = 0; resetLimits(); clearW();
  const sessB = ctx.trackApplication_({ leadId: B, contact: 'bravo@e.co' }).session;
  const sessA = ctx.trackApplication_({ leadId: A, contact: 'alpha@e.co' }).session;
  ok('sendVisaCode: only when the download is offered (Visa Processing → refused)', err(() => ctx.sendVisaCode_({ session: sessA })).e.restart === true);
  ok('sendVisaCode without a session → "look up again"', err(() => ctx.sendVisaCode_({ session: 'bad' })).e.relogin === true);
  const nb = to('bravo@e.co').length;
  const sv = ctx.sendVisaCode_({ session: sessB });
  const vmail = to('bravo@e.co').slice(nb).pop();
  const vcode = codeIn(vmail);
  ok('code sent to the email ON THE APPLICATION; reply shows it masked only', sv.ok && sv.masked === 'b•••@e•••.co' && /^\d{6}$/.test(vcode || '') && !/bravo@/.test(JSON.stringify(sv)), JSON.stringify(sv));
  ok('a Step 1 email check cannot use the download code', /expired or was replaced/.test(err(() => ctx.verifyEmailCode_({ email: 'bravo@e.co', code: vcode })).msg));
  ok('a correction cannot use it either (scope visa|… ≠ corr|…)', /expired or was replaced/.test(err(() => ctx.checkCode_('corr|' + B + '|bravo@e.co', vcode, 'x')).msg));
  clearW();
  ctx.sendEmailCode_({ email: 'bravo@e.co', name: 'TEST Visa Bravo', hp: '' });
  const s1code = codeIn(to('bravo@e.co').pop());
  ok('… and a Step 1 code cannot open a download', s1code !== vcode && !err(() => ctx.verifyVisaCode_({ session: sessB, code: s1code })).ok);
  clearW();
  ctx.sendVisaCode_({ session: sessB });
  const vcode2 = codeIn(to('bravo@e.co').pop());
  const v1 = ctx.verifyVisaCode_({ session: sessB, code: vcode2 });
  ok('correct code → download token (30 min) bound to the Lead ID + file list', v1.ok && /^\d{13}\.\d{13}\.EG-VO-\d{5}\.[\w-]+$/.test(v1.dtoken) && v1.dtoken.split('.')[2] === B && v1.minutes === 30 &&
    v1.files.length === 2 && v1.files[0].label === 'Visa – 1 of 2' && v1.files[0].type === 'PDF' && v1.files[0].kb >= 1, JSON.stringify(v1.files));
  ok('opening the download recounts Visa Files (now 2)', cell(B, 'Visa Files') === 2);
  const ids = g.allFiles.filter((f) => f.parent === approved(B)).map((f) => f.id);
  ok('the list has no Drive link, file ID or staff file name', !/drive\.google|visa2?\.pdf/.test(JSON.stringify(v1)) && v1.files.every((f) => ids.indexOf(f.ref) === -1 && Object.keys(f).join() === 'ref,label,type,kb'));
  ok('the code is used once', /expired or was replaced/.test(err(() => ctx.verifyVisaCode_({ session: sessB, code: vcode2 })).msg));
  const d1 = ctx.downloadVisaFile_({ dtoken: v1.dtoken, ref: v1.files[0].ref });
  ok('downloadVisaFile: the file bytes (base64), neutral name, type', d1.ok && Buffer.from(d1.b64, 'base64').toString('latin1') === PDF && d1.name === B + ' – Visa 1 of 2.pdf' && d1.mime === 'application/pdf' && !d1.url && !d1.id);
  ok('several downloads within the 30 minutes', ctx.downloadVisaFile_({ dtoken: v1.dtoken, ref: v1.files[1].ref }).ok && ctx.listVisaFiles_({ dtoken: v1.dtoken }).files.length === 2);
  ok('unknown file reference → "choose it again" (relist)', err(() => ctx.downloadVisaFile_({ dtoken: v1.dtoken, ref: 'nope' })).e.relist === true);
  // a mislabelled file (lead A) is not listed or downloadable, and the recount drops it
  setCell(A, 'Review Status', 'Visa Approved'); setCell(A, 'Last Customer Email', 'Status: Visa Approved · test');
  resetLimits(); clearW();
  const sessA2 = ctx.trackApplication_({ leadId: A, contact: 'alpha@e.co' }).session;
  ctx.sendVisaCode_({ session: sessA2 });
  const vA = ctx.verifyVisaCode_({ session: sessA2, code: codeIn(to('alpha@e.co').pop()) });
  ok('file type/size filter at download: only PDF/JPG/PNG ≤ 5 MB with matching first bytes are listed (3 of 6)', vA.files.length === 3 && cell(A, 'Visa Files') === 3 &&
    vA.files.map((f) => f.type).join() === 'PDF,PNG,JPG', JSON.stringify(vA.files.map((f) => f.type)));
  ok('… the mislabelled file can never be downloaded', err(() => ctx.downloadVisaFile_({ dtoken: vA.dtoken, ref: ctx.visaRef_(fake.id) })).e.relist === true);
  // expiry, tampering, status change, log out
  const tampered = v1.dtoken.slice(0, -2) + (v1.dtoken.slice(-2) === 'AA' ? 'BB' : 'AA');
  ok('tampered token → confirm the email again (restart)', err(() => ctx.listVisaFiles_({ dtoken: tampered })).e.restart === true);
  const p = v1.dtoken.split('.');
  ok('token for another lead (same signature) → restart', err(() => ctx.listVisaFiles_({ dtoken: [p[0], p[1], A, p[3]].join('.') })).e.restart === true);
  ok('a correction token is not a download token', err(() => ctx.listVisaFiles_({ dtoken: 'x.' + B + '.j.sig' })).e.restart === true);
  clock.offset = 31 * MIN;
  ok('after 30 minutes → restart ("Your download session has ended…")', (() => { const e = err(() => ctx.downloadVisaFile_({ dtoken: v1.dtoken, ref: v1.files[0].ref })).e; return e.restart && /download session has ended/.test(e.message); })());
  clock.offset = 0;
  edit(B, 'Review Status', 'Visa Processing');
  ok('Review Status changed → not available (restart)', (() => { const e = err(() => ctx.listVisaFiles_({ dtoken: v1.dtoken })).e; return e.restart && /not available to download/.test(e.message); })());
  setCell(B, 'Review Status', 'Visa Approved');
  setCell(B, 'Lead Status', 'Lost');
  ok('Lost lead → not available', err(() => ctx.listVisaFiles_({ dtoken: v1.dtoken })).e.restart === true);
  setCell(B, 'Lead Status', 'New Lead');
  ok('(still valid before log out)', ctx.listVisaFiles_({ dtoken: v1.dtoken }).ok === true);
  ctx.endTrackSession_({ session: sessB });
  ok('Log out ends the download token', err(() => ctx.listVisaFiles_({ dtoken: v1.dtoken })).e.restart === true);
  // download limit: 20 per Lead ID per hour
  resetLimits(); clearW();
  const sB2 = ctx.trackApplication_({ leadId: B, contact: 'bravo@e.co' }).session;
  ctx.sendVisaCode_({ session: sB2 });
  const v2 = ctx.verifyVisaCode_({ session: sB2, code: codeIn(to('bravo@e.co').pop()) });
  let k = 0; while (k < 30 && err(() => ctx.downloadVisaFile_({ dtoken: v2.dtoken, ref: v2.files[0].ref })).ok) k++;
  ok('download limit: 20 per Lead ID per hour, then refused', k === 20 && /20 times in the last hour/.test(err(() => ctx.downloadVisaFile_({ dtoken: v2.dtoken, ref: v2.files[0].ref })).msg), 'downloads ' + k);
  // honeypot
  const hp = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'downloadVisaFile', hp: 'x', dtoken: v2.dtoken }) } }));
  ok('honeypot on the download actions → "look up again", nothing sent', hp.ok === false && hp.relogin === true && !hp.b64);

  // --- polling --------------------------------------------------------------------------------------------------
  resetLimits();
  const s0 = ctx.trackApplication_({ leadId: B, contact: 'bravo@e.co' }).session;
  const poll = ctx.trackApplication_({ session: s0, poll: true });
  ok('poll reply: the status without a new token', poll.ok && poll.stage === 'Visa approved' && poll.canDownload === true && poll.session === undefined);
  edit(B, 'Message to Customer', 'Your visa is ready.');
  ok('poll sees a change (message)', ctx.trackApplication_({ session: s0, poll: true }).message === 'Your visa is ready.');
  for (let i = 1; i <= 29; i++) { clock.offset = i * 2 * MIN; ctx.trackApplication_({ session: s0, poll: true }); }
  clock.offset = 61 * MIN;
  ok('polling is not activity: the session still ends 60 minutes after the last lookup', JSON.stringify(ctx.trackApplication_({ session: s0, poll: true })) === NF);
  clock.offset = 0; resetLimits();
  const s5 = ctx.trackApplication_({ leadId: B, contact: 'bravo@e.co' }).session;
  let pn = 0; while (pn < 40 && ctx.trackApplication_({ session: s5, poll: true }).ok) pn++;
  ok('polls share the session limit (30 per 10 min)', pn === 30, String(pn));
  resetLimits();

  // --- staging helper ------------------------------------------------------------------------------------------------
  const T = mkVisa('TEST Visa Ready', 'qa-visa@example.com');
  const l0 = logs.length;
  const tid = ctx.testApproveVisa();
  const files = approved(T).files.filter((f) => !f.trashed);
  ok('testApproveVisa: newest finished TEST @example.com lead → 2 SPECIMEN PDFs + Visa Approved + Visa Files 2', tid === T && files.length === 2 &&
    files.every((f) => /^SPECIMEN-visa-[12]\.pdf$/.test(f.name) && f.mime === 'application/pdf') && cell(T, 'Review Status') === 'Visa Approved' && cell(T, 'Visa Files') === 2);
  ok('… the SPECIMEN files: "SPECIMEN" / "NOT A VISA", a small one and one of about 4.5 MB (under 5 MB)', files.every((f) => /SPECIMEN/.test(f.bytes) && /NOT A VISA/.test(f.bytes) && /^%PDF-1\.4/.test(f.bytes)) &&
    files[0].getSize() < 4096 && Math.abs(files[1].getSize() - 4.5 * MB) < 2048 && files[1].getSize() < 5 * MB, files.map((f) => f.getSize()).join(','));
  ok('… logs the Lead ID only', /EG-VO-\d{5}/.test(logs.slice(l0).join('\n')) && !/TEST Visa Ready|example\.com/.test(logs.slice(l0).join('\n')));
  ctx.testApproveVisa();
  ok('… run again: the earlier SPECIMEN files go to the bin (still 2)', approved(T).files.filter((f) => !f.trashed).length === 2 && approved(T).files.filter((f) => f.trashed).length === 2);
  const prevSite = props.SITE_URL;
  props.SITE_URL = 'https://www.example.org';
  ok('testApproveVisa refuses outside staging', /staging only/.test(err(() => ctx.testApproveVisa()).msg));
  if (prevSite === undefined) delete props.SITE_URL; else props.SITE_URL = prevSite;
  clock.offset += 6 * MIN; jobs();
  ok('TEST lead: Visa Approved customer email skipped (test lead), not held', lastDecision(T)[3] === 'skipped');

  // --- Send Now tick box ----------------------------------------------------------------------------------------------
  clock.offset = 0; resetLimits(); mail.quota = 1000; delete props.ATTACH_VISA;
  const tick = (ids) => {
    const rows = ids.map((id) => ctx.findLeadRow_(tr, id));
    rows.forEach((r) => tr.set(r, colOf('Send Now'), true));
    const r1 = Math.min(...rows), r2 = Math.max(...rows);
    ctx.onTrackerEdit({ range: tr.getRange(r1, colOf('Send Now'), r2 - r1 + 1, 1) });
  };
  const sn = (id) => note(id, 'Send Now');
  const G = mkVisa('TEST Visa Golf', 'golf@e.co');
  approve(G);
  tick([G]);
  ok('Send Now, Visa Approved, no file → "Not sent — no visa file in Approved Visa", box unticked, no email', /^Not sent — no visa file in Approved Visa/.test(sn(G)) &&
    cell(G, 'Send Now') === false && !to('golf@e.co').some((m) => /Visa approved/.test(m.subject)), sn(G));
  put(G, 'visa.pdf', 'application/pdf', PDF);
  tick([G]);
  const eG = to('golf@e.co').filter((m) => /Visa approved/.test(m.subject));
  ok('file added, ticked again within the 5-minute window → recounted and sent at once', eG.length === 1 && cell(G, 'Visa Files') === 1 && cell(G, 'Send Now') === false &&
    /^Sent \d{1,2} \w{3} \d\d:\d\d — Visa Approved, Download button only \(ATTACH_VISA off\)$/.test(sn(G)) && /Status: Visa Approved ·/.test(cell(G, 'Last Customer Email')), sn(G));
  ok('… recorded for checkRecentEmailJobs', lastDecision(G)[3] === 'sent' && /Send Now/.test(lastDecision(G)[4]));
  tick([G]); jobs(); clock.offset += 6 * MIN; jobs();
  ok('once per status: a second tick says already emailed; the 5-minute job does not send it again', to('golf@e.co').filter((m) => /Visa approved/.test(m.subject)).length === 1 &&
    /^Not sent — Visa Approved was already emailed/.test(sn(G)), sn(G));
  props.ATTACH_VISA = 'on';
  const H1 = mkVisa('TEST Visa Hotel', 'hotel@e.co');
  const H2 = mkVisa('TEST Visa India', 'india@e.co');
  [H1, H2].forEach((id) => { put(id, 'visa.pdf', 'application/pdf', PDF); approve(id); });
  edit(H2, 'Message to Customer', '');
  tick([H1, H2]);
  ok('several rows ticked at once (select + Space): each sent, "1 file attached", with the attachment', [H1, H2].every((id) => /— Visa Approved, 1 file attached$/.test(sn(id)) &&
    to(id === H1 ? 'hotel@e.co' : 'india@e.co').some((m) => /Visa approved/.test(m.subject) && m.attachments && m.attachments.length === 1)), sn(H1) + ' / ' + sn(H2));
  delete props.ATTACH_VISA;
  const J = mkVisa('TEST Visa Juliett', 'juliett@e.co');
  edit(J, 'Review Status', 'Correction Needed');
  tick([J]);
  ok('Correction Needed without a message → "Not sent — Correction Needed needs a Message to Customer"', sn(J) === 'Not sent — Correction Needed needs a Message to Customer' && !to('juliett@e.co').some((m) => /correction/.test(m.subject)));
  edit(J, 'Message to Customer', 'Please send a clearer photo.');
  tick([J]);
  ok('… with a message → sent at once ("Sent … — Correction Needed")', /^Sent .* — Correction Needed$/.test(sn(J)) && to('juliett@e.co').some((m) => /needs a correction/.test(m.subject)), sn(J));
  edit(J, 'Review Status', 'Verified');
  jobs();
  ok('a normal status change still waits 5 minutes (undo window kept)', !to('juliett@e.co').some((m) => /Documents verified/.test(m.subject)));
  clock.offset += 6 * MIN; jobs();
  ok('… and is sent by the 5-minute job afterwards', to('juliett@e.co').filter((m) => /Documents verified/.test(m.subject)).length === 1);
  const Kq = mkVisa('TEST Visa Kilo', 'kilo@e.co');
  edit(Kq, 'Review Status', 'Verified');
  mail.quota = 0;
  tick([Kq]);
  ok('no quota → "Queued … (daily email quota used up …)"', /^Queued .* — Verified \(daily email quota used up/.test(sn(Kq)) && /^Queued: Status: Verified/.test(cell(Kq, 'Last Customer Email')), sn(Kq));
  mail.quota = 1000;
  const L = mkVisa('TEST Visa Lima', 'qa-lima@example.com');
  put(L, 'visa.pdf', 'application/pdf', PDF); approve(L);
  tick([L]);
  ok('TEST @example.com → "Not sent — … TEST lead", no email', /^Not sent — Visa Approved: TEST lead/.test(sn(L)) && !to('qa-lima@example.com').length, sn(L));
  tick(['EG-CE-00002']);
  ok('a tick on a non-visa row is ignored: unticked + note', cell('EG-CE-00002', 'Send Now') === false && /^Ignored — Send Now is only for visa applications/.test(sn('EG-CE-00002')));
  const M = mkVisa('TEST Visa Mike', 'mike@e.co');
  edit(M, 'Review Status', 'Verified');
  g.cache.EMAIL_JOBS = '1';
  tick([M]);
  delete g.cache.EMAIL_JOBS;
  ok('while the 5-minute job is running → "tick again in a minute", nothing sent (no double email)', /automatic email check is running/.test(sn(M)) && !to('mike@e.co').some((m) => /Documents verified/.test(m.subject)) && cell(M, 'Send Now') === false);
  ok('Send Now logs Lead IDs + result only', logs.filter((l) => /^sendNow /.test(l)).every((l) => /^sendNow (EG-(VO|CE)-\d{5}|row) (Sent \d{1,2} \w{3} \d\d:\d\d|Not sent|Queued \d{1,2} \w{3} \d\d:\d\d|Ignored)$/.test(l)) &&
    logs.filter((l) => /^sendNow /.test(l)).length >= 9, [...new Set(logs.filter((l) => /^sendNow /.test(l)))].slice(0, 3).join(' | '));

  // --- Track page: instant recount (Visa Approved + Visa Files 0) ------------------------------------------------------
  const N = mkVisa('TEST Visa November', 'november@e.co');
  approve(N); clock.offset += 6 * MIN; jobs();
  ok('(Visa Approved, Visa Files 0, email held)', cell(N, 'Visa Files') === 0 && lastDecision(N)[3] === 'held');
  put(N, 'visa.pdf', 'application/pdf', PDF);
  resetLimits();
  const tN = ctx.trackApplication_({ leadId: N, contact: 'november@e.co' });
  ok('Track lookup recounts that one folder at once: download button + Visa Files 1', tN.canDownload === true && cell(N, 'Visa Files') === 1);
  // --- recountVisaFiles (Run button) ------------------------------------------------------------------------------------
  const P = mkVisa('TEST Visa Papa', 'papa@e.co');
  edit(P, 'Review Status', 'Visa Processing');
  put(P, 'a.pdf', 'application/pdf', PDF); put(P, 'b.pdf', 'application/pdf', PDF);
  const rl0 = logs.length;
  const lines = ctx.recountVisaFiles();
  const rlog = logs.slice(rl0).join('\n');
  ok('recountVisaFiles: Visa Processing / Visa Approved-not-yet-emailed rows recounted; logs Lead ID + count only', cell(P, 'Visa Files') === 2 && lines.indexOf(P + ': 2 files') !== -1 &&
    lines.every((l) => /^EG-VO-\d{5}: (\d+ files?|Drive folder missing)$/.test(l)) && lines.indexOf(G + ': 1 file') === -1 && !/papa|TEST Visa/.test(rlog), lines.join(', '));
  clock.offset = 0;

  // --- logs ----------------------------------------------------------------------------------------------------------
  const all = logs.join('\n');
  ok('logs never contain the email, name, code or token', !/bravo@e\.co|alpha@e\.co|TEST Visa Bravo|TEST Visa Alpha/.test(all) && all.indexOf(v1.dtoken) === -1 && all.indexOf(vcode) === -1 && all.indexOf(sessB) === -1);
  const dl = logs.filter((l) => /^(downloadVisaFile|listVisaFiles|verifyVisaCode)/.test(l));
  ok('download logs: Lead ID + file count only', dl.length > 5 && dl.every((l) => /^(downloadVisaFile ok|listVisaFiles|verifyVisaCode ok) EG-VO-\d{5} files=\d+$/.test(l) || /^verifyVisaCode (wrong|locked)$/.test(l)), [...new Set(dl)].slice(0, 4).join(' | '));
  clock.offset = 0;
};
