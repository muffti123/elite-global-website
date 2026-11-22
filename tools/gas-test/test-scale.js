// Round 2.5 scale safety: busy replies, submission keys, row cache, Due tab, Emails Sent, archive, health.
// Called from test.js after the visa tests, before the clean-up tests.
'use strict';
module.exports = function (g, ok, t) {
  const { ctx, props, mail, clock, logs, lockState } = g;
  const { tok, future, setCell, colOf, tr, b64 } = t;
  const C = ctx.__exports.CONFIG;
  const MIN = 60000, DAY = 864e5;
  const resetLimits = () => Object.keys(g.cache).filter((k) => /^RL_/.test(k)).forEach((k) => delete g.cache[k]);
  const clearW = () => Object.keys(g.cache).filter((k) => /_W$/.test(k)).forEach((k) => delete g.cache[k]);
  const cell = (id, h) => tr.get(ctx.findLeadRow_(tr, id), colOf(h));
  const edit = (id, h, value) => { setCell(id, h, value); ctx.onTrackerEdit({ range: tr.getRange(ctx.findLeadRow_(tr, id), colOf(h)) }); };
  const err = (fn) => { try { const r = fn(); return { ok: true, r }; } catch (e) { return { ok: false, msg: e.message, e }; } };
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }));
  const to = (addr) => mail.outbox.filter((m) => m.to === addr);
  const idsInTracker = () => { const o = []; for (let r = 2; r <= tr.getLastRow(); r++) if (tr.get(r, 1)) o.push(tr.get(r, 1)); return o; };
  const due = () => ctx.readDue_();
  const idle = () => { delete g.cache.EMAIL_JOBS; props.LAST_FULL_SCAN = String(Date.now()); return ctx.runEmailJobs(); }; // Due path only
  const sid = (n) => 'sid-test-' + String(n).padStart(12, '0');
  mail.quota = 1000; clock.offset = 0; resetLimits(); clearW();
  delete props.ATTACH_VISA; delete props.TEST_OTP_BYPASS;
  const contact = (name, phone, s) => ({ action: 'submitContact', hp: '', name, phone, enquiryType: 'Other Travel Enquiry', details: 'x', sid: s });

  // --- busy replies -----------------------------------------------------------------------------------------------
  const before = idsInTracker().length, errMails = mail.outbox.filter((m) => /Web app error/.test(m.subject)).length;
  lockState.busy = true;
  const b1 = post(contact('TEST Busy Person', '+234 800 000 0301', sid(1)));
  lockState.busy = false;
  ok('lock busy (another request holds it > 10 s) → {ok:false, busy:true} JSON, no lead', b1.ok === false && b1.busy === true && /busy/.test(b1.error) && idsInTracker().length === before, JSON.stringify(b1));
  const realCreate = ctx.DriveApp.createFolder;
  const visaRoot = ctx.visaRootFolder_();
  const realSub = visaRoot.createFolder.bind(visaRoot);
  visaRoot.createFolder = () => { throw new Error('Service invoked too many times in a short time: driveapp. Try Utilities.sleep(1000) between calls.'); };
  resetLimits();
  const vBody = { action: 'createVisaApplication', hp: '', name: 'TEST Burst Visa', phone: '+234 800 000 0302', email: 'burst@e.co', country: 'Nigeria', travelDate: future,
    departureAirport: 'KAN', flightTicket: 'No', priorKsa: 'No', westernVisa: '', extraInfo: '', heard: '', consent: true,
    passengers: [{ name: 'Burst Pax', category: 'Adult (18+)' }], emailToken: tok('burst@e.co'), sid: sid(2) };
  const b2 = post(vBody);
  visaRoot.createFolder = realSub;
  ok('Google "Service invoked too many times" → busy JSON (no HTML error, no error email)', b2.ok === false && b2.busy === true &&
    mail.outbox.filter((m) => /Web app error/.test(m.subject)).length === errMails, JSON.stringify(b2));
  resetLimits();
  const b3 = post(vBody);
  ok('… the retry with the same sid works (the key was freed, the skipped number is just a gap)', b3.ok === true && /^EG-VO-\d{5}$/.test(b3.leadId), JSON.stringify(b3).slice(0, 90));
  void realCreate;

  // --- submission keys: retries never create a second lead ---------------------------------------------------------
  resetLimits();
  const s1 = post(contact('TEST Retry Person', '+234 800 000 0303', sid(3)));
  const s2 = post(contact('TEST Retry Person', '+234 800 000 0303', sid(3)));
  ok('contact: same sid twice → the same reply, one lead', s1.ok && s2.ok && s1.leadId === s2.leadId && idsInTracker().filter((x) => x === s1.leadId).length === 1);
  const v1 = post(Object.assign({}, vBody, { sid: sid(4), email: 'burst2@e.co', emailToken: tok('burst2@e.co') }));
  const folders = () => g.folders.filter((f) => /^EG-VO-\d{5} – Burst Visa$/.test(f.name) && !f.trashed).length;
  const nf = folders();
  const v2 = post(Object.assign({}, vBody, { sid: sid(4), email: 'burst2@e.co', emailToken: tok('burst2@e.co') }));
  ok('visa create: same sid → same Lead ID + upload token, no second folder', v1.ok && v2.ok && v1.leadId === v2.leadId && v1.token === v2.token && folders() === nf);
  const cuBody = { action: 'submitCustomRequest', hp: '', name: 'TEST Retry Custom', phone: '+234 800 000 0304', email: 'rc@e.co', country: 'Nigeria', adults: '1', children: '0', infants: '0',
    departureAirport: 'KAN', departureAirportOther: '', travelDate: future, flightTicket: 'No', arrivalCity: 'Jeddah', nightsMadinah: '3', nightsMakkah: '4', hotelCategory: '4-star',
    haramDistance: 'Walking distance', preferredHotel: '', services: [], servicesOther: '', visaAssist: 'Yes', budget: 'I need guidance on the budget', experience: '', hotelOrAirline: '',
    special: '', heard: '', emailToken: tok('rc@e.co'), sid: sid(5) };
  const c1 = post(cuBody), c2 = post(cuBody);
  ok('customise: same sid → same reply (emailed flag too), one lead, one confirmation', c1.ok && c2.ok && c1.leadId === c2.leadId && c2.emailed === c1.emailed &&
    to('rc@e.co').filter((m) => /We received your Umrah request/.test(m.subject)).length === 1);
  const pendKey = ctx.sidKey_(sid(6));
  g.cache[pendKey] = 'pending';
  const p1 = post(contact('TEST Pending Person', '+234 800 000 0305', sid(6)));
  ok('the first request still running (pending) → the retry gets busy, not a second lead', p1.ok === false && p1.busy === true && !idsInTracker().some((x, i, a) => false));
  delete g.cache[pendKey];
  const s3 = post(contact('TEST Retry Person', '+234 800 000 0303', sid(7)));
  ok('a new submit (new sid) is a new lead', s3.ok && s3.leadId !== s1.leadId);
  ok('no sid (older page) still works', post(contact('TEST Old Page', '+234 800 000 0306')).ok === true);
  resetLimits();
  const burst = [];
  for (let i = 0; i < 30; i++) burst.push(post(contact('TEST Burst ' + i, '+234 800 001 ' + String(1000 + i), sid(100 + i))).leadId);
  const nums = burst.map((x) => Number(x.slice(-5)));
  ok('30 submissions: 30 unique, increasing Lead IDs', new Set(burst).size === 30 && nums.every((n, i) => !i || n > nums[i - 1]));

  // --- row cache ---------------------------------------------------------------------------------------------------
  const target = burst[20], above = burst[5];
  const rTarget = ctx.findLeadRow_(tr, target);
  tr.deleteRow(ctx.findLeadRow_(tr, above)); // staff delete a row above (or the archive does)
  ok('cached Lead ID → row is checked: after a row above is deleted the lead is still found at its new row', ctx.findLeadRow_(tr, target) === rTarget - 1 && tr.get(rTarget - 1, 1) === target);
  ok('an unknown Lead ID → 0 (no stale cache hit)', ctx.findLeadRow_(tr, 'EG-GE-99999') === 0);
  const nextBefore = tr.getLastRow() + 1;
  const fbLogs = () => logs.filter((l) => /^next row fallback: row \d+$/.test(l)).length;
  const fb0 = fbLogs(), nd0 = tr.nextDataCalls || 0;
  const s4 = post(contact('TEST After Delete', '+234 800 000 0307', sid(8)));
  ok('after a staff delete the stored next row fails its check → found outside the lock (one Ctrl+↑ lookup, logged with the row number only), the lead lands right after the last one',
    ctx.findLeadRow_(tr, s4.leadId) === nextBefore && fbLogs() === fb0 + 1 && (tr.nextDataCalls || 0) === nd0 + 1, 'row ' + ctx.findLeadRow_(tr, s4.leadId) + ' vs ' + nextBefore);
  const nd1 = tr.nextDataCalls || 0;
  const s5 = post(contact('TEST Next Row', '+234 800 000 0308', sid(9)));
  ok('the next lead uses the stored counter (checked: row above filled, row empty) — no fallback, no lookup',
    ctx.findLeadRow_(tr, s5.leadId) === nextBefore + 1 && fbLogs() === fb0 + 1 && (tr.nextDataCalls || 0) === nd1 && props['NEXT_ROW_' + tr.getSheetId()] === String(nextBefore + 2));
  // staff type something in the next row → the check fails → fallback, never an overwrite
  tr.set(nextBefore + 2, 1, 'staff note');
  const s6 = post(contact('TEST Not Overwritten', '+234 800 000 0309', sid(10)));
  ok('a row staff filled in is never overwritten (check fails → fallback → the row after it)', tr.get(nextBefore + 2, 1) === 'staff note' && ctx.findLeadRow_(tr, s6.leadId) === nextBefore + 3);
  tr.set(nextBefore + 2, 1, '');
  // the grid is full → 500 rows added outside the lock
  const maxBefore = tr.getMaxRows();
  props['NEXT_ROW_' + tr.getSheetId()] = String(maxBefore + 1);
  const lastRealRow = tr.getLastRow();
  for (let r = lastRealRow + 1; r <= maxBefore; r++) tr.set(r, 1, 'EG-XX-' + r); // fill to the bottom
  const s7 = post(contact('TEST Full Grid', '+234 800 000 0310', sid(11)));
  ok('a full grid: 500 rows added (outside the lock), the lead goes on the first new row', tr.getMaxRows() === maxBefore + 500 && ctx.findLeadRow_(tr, s7.leadId) === maxBefore + 1);
  for (let r = lastRealRow + 1; r <= maxBefore; r++) tr.set(r, 1, '');
  tr.deleteRow(maxBefore + 1); // keep the rest of the suite as it was
  delete props['NEXT_ROW_' + tr.getSheetId()];
  // what runs under the lock for a contact: claim, Lead ID, the 2-row check + the row write — never the detail tab
  const realAppend = ctx.appendDetailRow_;
  let appendLocked = null;
  ctx.appendDetailRow_ = function () { appendLocked = lockState.held; return realAppend.apply(this, arguments); };
  const s8 = post(contact('TEST Lock Scope', '+234 800 000 0311', sid(12)));
  ctx.appendDetailRow_ = realAppend;
  ok('the detail tab row (Contact Enquiries) is written after the lock is released', s8.ok && appendLocked === false);

  // --- Due tab ---------------------------------------------------------------------------------------------------
  resetLimits();
  const mkVisa = (name, email) => {
    const a = ctx.createVisaApplication_({ name, phone: '+234 800 000 0399', email, country: 'Nigeria', travelDate: future, departureAirport: 'KAN',
      flightTicket: 'No', priorKsa: 'No', westernVisa: '', extraInfo: '', heard: '', consent: true, emailToken: tok(email), passengers: [{ name: name + ' P1', category: 'Adult (18+)' }] });
    ctx.uploadPassenger_({ leadId: a.leadId, token: a.token, index: 1, name: name + ' P1', category: 'Adult (18+)',
      passport: { name: 'passport.jpg', mime: 'image/jpeg', b64: b64('passport.jpg') }, photo: { mime: 'image/jpeg', b64: b64('photo-40kb.jpg') } });
    ctx.finalizeVisaApplication_({ leadId: a.leadId, token: a.token });
    return a.leadId;
  };
  const D = mkVisa('TEST Due Delta', 'duedelta@e.co');
  clock.offset += 6 * MIN; idle(); // finalize put Under Review on the list; its email was the confirmation
  ok('Due tab: finalize\'s Under Review is handled (confirmation already sent) and removed', !due().some((x) => x.id === D));
  ok('Emails Sent holds this lead\'s keys (no Email Log search needed)', /confirmation/.test(cell(D, 'Emails Sent')) && /status:Under Review/.test(cell(D, 'Emails Sent')), cell(D, 'Emails Sent'));
  edit(D, 'Review Status', 'Verified');
  ok('a Review Status edit → a Due row (Lead ID, due time, reason) and Last Change stamped', due().some((x) => x.id === D && x.reason === 'status change') && cell(D, 'Last Change') instanceof Date);
  idle();
  ok('within the undo window: not sent, still due', !to('duedelta@e.co').some((m) => /Documents verified/.test(m.subject)) && due().some((x) => x.id === D));
  clock.offset += 6 * MIN; idle();
  ok('after 5 minutes: sent from the Due list (no full scan), row removed', to('duedelta@e.co').filter((m) => /Documents verified/.test(m.subject)).length === 1 && !due().some((x) => x.id === D));
  const logN = logs.length;
  idle();
  ok('nothing due → a quick run (Due path, queue skipped)', /^runEmailJobs due sent=0 queued=0 .* · queue sent=0 waiting=0 failed=0 ·/.test(logs.slice(logN).find((l) => /^runEmailJobs/.test(l)) || '') && props.QUEUE_PENDING === '0', logs.slice(logN).find((l) => /^runEmailJobs/.test(l)));
  edit(D, 'Review Status', 'Correction Needed');
  clock.offset += 6 * MIN; idle();
  ok('held (Correction Needed without a message) stays on the Due list with its reason', due().some((x) => x.id === D && /^held: Message to Customer is empty/.test(x.reason)), JSON.stringify(due().filter((x) => x.id === D)));
  setCell(D, 'Message to Customer', 'Please send a clearer photo.');
  idle();
  ok('… message filled in → sent on the next run, removed', to('duedelta@e.co').some((m) => /needs a correction/.test(m.subject)) && !due().some((x) => x.id === D));
  setCell(D, 'Review Status', 'Visa Processing'); setCell(D, 'Review Updated', new Date(Date.now() - 10 * MIN)); // a change the trigger missed
  idle();
  ok('a change the trigger missed is not seen by the Due path …', !to('duedelta@e.co').some((m) => /Visa in processing/.test(m.subject)));
  delete props.LAST_FULL_SCAN; delete g.cache.EMAIL_JOBS; ctx.runEmailJobs();
  ok('… but by the hourly full scan', to('duedelta@e.co').some((m) => /Visa in processing/.test(m.subject)));
  // Emails Sent: never twice, even with the Email Log gone
  const logSs = ctx.emailLogSS_().getSheetByName('Email Log');
  for (let r = logSs.getLastRow(); r >= 2; r--) logSs.deleteRow(r);
  setCell(D, 'Last Customer Email', '');
  delete props.LAST_FULL_SCAN; delete g.cache.EMAIL_JOBS; ctx.runEmailJobs();
  ok('Emails Sent prevents a repeat even when the Email Log rows are gone', to('duedelta@e.co').filter((m) => /Visa in processing/.test(m.subject)).length === 1);

  // --- archive --------------------------------------------------------------------------------------------------
  clock.offset = -120 * DAY; resetLimits();
  const old = {};
  old.lost = post(contact('TEST Arch Lost', '+234 800 000 0401', sid(201))).leadId;
  old.active = post(contact('TEST Arch Active', '+234 800 000 0402', sid(202))).leadId;
  old.formula = post(contact('TEST Arch Formula', '+234 800 000 0403', sid(203))).leadId;
  old.visa = mkVisa('TEST Arch Visa', 'archvisa@e.co');
  old.held = mkVisa('TEST Arch Held', 'archheld@e.co');
  old.queued = post(contact('TEST Arch Queued', '+234 800 000 0404', sid(204))).leadId;
  old.tick = post(contact('TEST Arch Tick', '+234 800 000 0405', sid(205))).leadId;
  old.upload = ctx.createVisaApplication_({ name: 'TEST Arch Upload', phone: '+234 800 000 0406', email: 'archup@e.co', country: 'Nigeria', travelDate: future, departureAirport: 'KAN',
    flightTicket: 'No', priorKsa: 'No', westernVisa: '', extraInfo: '', heard: '', consent: true, emailToken: tok('archup@e.co'), passengers: [{ name: 'Arch Up P1', category: 'Adult (18+)' }] }).leadId;
  old.recent = post(contact('TEST Arch Recent', '+234 800 000 0407', sid(206))).leadId;
  // statuses (written 120 days ago → Last Change old)
  ['lost', 'formula', 'queued', 'tick', 'upload', 'recent'].forEach((k) => setCell(old[k], 'Lead Status', 'Lost'));
  setCell(old.visa, 'Review Status', 'Visa Approved'); setCell(old.visa, 'Last Customer Email', 'Status: Visa Approved · x');
  setCell(old.held, 'Review Status', 'Visa Approved'); // its email never went out
  setCell(old.tick, 'Send Now', true);
  setCell(old.formula, 'Assigned Agent', '=1+1'); // text that looks like a formula (shown as text in Sheets)
  ctx.emailQueueSheet_().appendRow([new Date(), old.queued + '|x', 'status', old.queued, 'q@e.co', 's', 'h', 't', 0, '', '']);
  ctx.approvedVisaFolder_(ctx.leadFolder_(ctx.trackRow_(old.visa)), true).createFile(ctx.Utilities.newBlob(ctx.specimenVisaPdf_(1), 'application/pdf', 'visa.pdf'));
  setCell(old.visa, 'Visa Files', 1);
  clock.offset = -10 * DAY;
  edit(old.recent, 'Follow-up Notes', 'called again'); // a staff edit 10 days ago
  clock.offset = 0;
  const rowsBefore = idsInTracker().length;
  const paxBefore = ctx.passengerRows_(old.visa).length;
  clock.offset += 6 * MIN; idle(); clock.offset = 0; // the 5-minute job has handled finalize's Due rows
  const arch1 = ctx.archiveNow();
  const left = idsInTracker();
  ok('archive: finished + 90 days unchanged → moved (Lost contact, "=…" name, emailed Visa Approved)', [old.lost, old.formula, old.visa].every((id) => left.indexOf(id) === -1) && arch1.archived === 3, JSON.stringify(arch1));
  ok('never moved: active, email still to go out, queued email, upload in progress, Send Now ticked, changed 10 days ago',
    [old.active, old.held, old.queued, old.upload, old.tick, old.recent].every((id) => left.indexOf(id) !== -1));
  const files = JSON.parse(props.ARCHIVE_FILES || '{}');
  const q = Object.keys(files)[0];
  const arch = g.books[files[q]];
  ok('archive file "Elite Global – Archive <YYYY>-Q<n>" (quarter of Date Received) with the same tabs', /^\d{4}-Q[1-4]$/.test(q) && arch && arch.name === 'Elite Global – Archive ' + q &&
    ['Lead Tracker', 'Visa Applications', 'Visa Passengers', 'Custom Requests', 'Contact Enquiries'].every((n) => arch.getSheetByName(n)), q);
  const at = arch.getSheetByName('Lead Tracker');
  const aIds = []; for (let r = 2; r <= at.getLastRow(); r++) aIds.push(at.get(r, 1));
  ok('… all rows of a lead moved together (tracker + Visa Applications + Visa Passengers + Contact Enquiries)', aIds.sort().join() === [old.lost, old.formula, old.visa].sort().join() &&
    arch.getSheetByName('Visa Passengers').getLastRow() - 1 === paxBefore && arch.getSheetByName('Visa Applications').getLastRow() === 2 &&
    arch.getSheetByName('Contact Enquiries').getLastRow() === 3 && ctx.passengerRows_(old.visa).length === 0);
  let fr = 0; for (let r = 2; r <= at.getLastRow(); r++) if (at.get(r, 1) === old.visa) fr = r;
  ok('… Drive Folder link kept as a formula; Total Travellers as a value; "=…" text stays text', /^=HYPERLINK\("https:\/\/drive\.google\.com/.test(at.formulas[fr + ',15'] || '') &&
    !at.formulas[fr + ',9'] && (() => { let r2 = 0; for (let r = 2; r <= at.getLastRow(); r++) if (at.get(r, 1) === old.formula) r2 = r; return !at.formulas[r2 + ',13'] && at.get(r2, 13) === "'=1+1"; })());
  const idx = g.ss.getSheetByName('Archive Index');
  ok('Archive Index: Lead ID → archive file + date (one row each)', idx.getLastRow() - 1 === 3 && [2, 3, 4].every((r) => /^=HYPERLINK\(/.test(idx.formulas[r + ',3'] || '') && idx.get(r, 4) === files[q] && idx.get(r, 2) instanceof Date));
  ok('live tracker keeps its ' + C.ARCHIVE.MIN_ROWS + ' pre-formatted rows; lookups of the remaining leads still right', tr.getMaxRows() >= C.ARCHIVE.MIN_ROWS &&
    [old.active, old.held, s4.leadId].every((id) => tr.get(ctx.findLeadRow_(tr, id), 1) === id) && left.length === rowsBefore - 3);
  const again = ctx.archiveNow();
  ok('re-run: nothing more to move, nothing copied twice', again.archived === 0 && at.getLastRow() === 4 && idx.getLastRow() === 4);
  // resumable: stop after the copy (deleteRows fails once) → next run finishes without duplicates
  clock.offset = -120 * DAY;
  old.resume = post(contact('TEST Arch Resume', '+234 800 000 0408', sid(207))).leadId;
  setCell(old.resume, 'Lead Status', 'Converted');
  clock.offset = 0;
  const realDel = tr.deleteRows;
  let thrown = false;
  tr.deleteRows = function () { if (!thrown) { thrown = true; throw new Error('Service Spreadsheets failed while accessing document'); } return realDel.apply(this, arguments); };
  const r1 = ctx.archiveNow();
  tr.deleteRows = realDel;
  const copies = () => { let n = 0; for (let r = 2; r <= at.getLastRow(); r++) if (at.get(r, 1) === old.resume) n++; return n; };
  ok('stopped after the copy: the lead is still live (never lost) and the run is marked unfinished', r1.unfinished === true && idsInTracker().indexOf(old.resume) !== -1 && copies() === 1 && props.ARCHIVE_PENDING === '1');
  const r2 = ctx.runArchive();
  ok('… the next night continues: deleted from live, still one copy, one index row', r2 && r2.archived === 1 && idsInTracker().indexOf(old.resume) === -1 && copies() === 1 &&
    (() => { let n = 0; for (let r = 2; r <= idx.getLastRow(); r++) if (idx.get(r, 1) === old.resume) n++; return n === 1; })() && props.ARCHIVE_PENDING === '0');
  ok('runArchive does nothing on other days when no run is unfinished', ctx.runArchive() === null || new Date().getDate() === 1);
  // column A positions are read outside the lock: if a row moved before the lock, the batch stops — nothing copied or lost
  clock.offset = -120 * DAY;
  old.moved = post(contact('TEST Arch Moved', '+234 800 000 0410', sid(209))).leadId;
  setCell(old.moved, 'Lead Status', 'Converted');
  clock.offset = 0;
  const pos = ctx.archivePositions_();
  pos.colA.splice(1, 0, ['EG-XX-00000']); // as if a row above was deleted after the positions were read
  const archQ = ctx.archiveFile_(ctx.quarterOf_(tr.get(ctx.findLeadRow_(tr, old.moved), colOf('Date Received'))));
  const before2 = archQ.getSheetByName('Lead Tracker').getLastRow();
  const moved = err(() => ctx.withLock_(() => ctx.archiveBatch_([old.moved], archQ, ctx.archiveContext_(), pos)));
  ok('archive: a row that moved after the positions were read (outside the lock) → stopped under the lock, nothing copied, lead still live',
    !moved.ok && /row moved during the archive/.test(moved.msg) && idsInTracker().indexOf(old.moved) !== -1 && archQ.getSheetByName('Lead Tracker').getLastRow() === before2, moved.msg);
  const fresh = ctx.archiveNow();
  ok('… the next run (fresh positions) archives it', fresh.archived === 1 && idsInTracker().indexOf(old.moved) === -1);
  // Track page + visa download from the archive
  resetLimits(); clearW();
  const ta = ctx.trackApplication_({ leadId: old.lost, contact: '+234 800 000 0401' });
  ok('Track: an archived lead can still be looked up (read-only stage)', ta.ok && ta.leadId === old.lost && ta.stage === 'Closed' && ta.canCorrect === undefined, JSON.stringify(ta).slice(0, 120));
  const tv = ctx.trackApplication_({ leadId: old.visa, contact: 'archvisa@e.co' });
  ok('archived Visa Approved lead: "Visa approved" + the download is still offered', tv.ok && tv.stage === 'Visa approved' && tv.canDownload === true);
  ctx.sendVisaCode_({ session: tv.session });
  const code = (/code: (\d{6})/.exec(to('archvisa@e.co').pop().subject) || [])[1];
  const vv = ctx.verifyVisaCode_({ session: tv.session, code });
  const dl = ctx.downloadVisaFile_({ dtoken: vv.dtoken, ref: vv.files[0].ref });
  ok('… code → list → download works from the archive (Drive folders never move)', vv.ok && vv.files.length === 1 && dl.ok && Buffer.from(dl.b64, 'base64').toString('latin1') === ctx.specimenVisaPdf_(1));
  ok('… and nothing is written to the archive row', at.get(fr, colOf('Last Change')) instanceof Date && at.get(fr, colOf('Visa Files')) === 1);

  // --- script-lock timing ------------------------------------------------------------------------------------------
  resetLimits();
  post(contact('TEST Lock Warm', '+234 800 000 0414', sid(16))); // the archive above deleted the stored next row: one fallback first
  const ln = logs.length;
  const q1 = post(Object.assign(contact('TEST Lock Timing', '+234 800 000 0411', sid(13)), { qaTiming: true }));
  const lockLog = logs.slice(ln).filter((l) => /^lock /.test(l));
  ok('every lock hold is logged with the action and times only ("lock submitContact held N ms (waited N ms)")', lockLog.length === 1 && /^lock submitContact held \d+ ms \(waited \d+ ms\)$/.test(lockLog[0]), lockLog.join(' | '));
  ok('qaTiming without TEST_OTP_BYPASS → no timings in the reply (production never shows them)', q1.ok && q1.qa === undefined);
  props.TEST_OTP_BYPASS = 'on';
  const q2 = post(Object.assign(contact('TEST Lock Timing 2', '+234 800 000 0412', sid(14)), { qaTiming: true }));
  const q3 = post(contact('TEST Lock Timing 3', '+234 800 000 0413', sid(15)));
  delete props.TEST_OTP_BYPASS;
  ok('staging (bypass on) + qaTiming → {qa: {n, held, max, wait, ms}} numbers only; without qaTiming nothing extra', q2.ok && q2.qa && q2.qa.n === 1 && typeof q2.qa.held === 'number' &&
    typeof q2.qa.wait === 'number' && Object.keys(q2.qa).join() === 'n,held,max,wait,ms' && q3.qa === undefined, JSON.stringify(q2.qa));
  ok('the lock wait is 20 s (LOCK_WAIT_MS)', C.LIMITS_GOOGLE.LOCK_WAIT_MS === 20000);
  ok('lock holds are counted in today\'s health record (count, total, longest + its action)', (() => { const h = JSON.parse(props[ctx.healthKey_()] || '{}'); return h.lock && h.lock.n > 5 && h.lock.max >= 0 && typeof h.lock.a === 'string'; })());

  // --- health ----------------------------------------------------------------------------------------------------
  const yKey = ctx.healthKey_(new Date(Date.now() - DAY));
  props[yKey] = JSON.stringify({ jobs: { n: 288, ms: 66 * MIN, max: 9000 }, edit: { n: 900, ms: 4 * MIN, max: 800 }, mail: 40, act: 1200, busy: 7, slow: ['uploadPassenger', 8400],
    lock: { n: 1500, ms: 450000, max: 15000, a: 'uploadPassenger' } });
  props.TRIGGER_LIMIT_MIN = '90'; props.MAIL_LIMIT = '100'; // gmail.com limits
  const rows = ctx.healthRows_();
  const txt = rows.map((r) => r[0] + ': ' + r[1]).join('\n');
  ok('System health: trigger time vs the gmail.com limit with ⚠️ at 70 % (70 of 90 min)', /Trigger time yesterday: ⚠️ 70 of 90 min \(78 %\)/.test(txt), txt.split('\n')[0]);
  ok('… emails vs quota, busy replies, slowest action, tracker cells/rows, Due + queue, last archive run', /Emails sent yesterday: 40 of 100/.test(txt) && /busy replies 7 · slowest uploadPassenger 8\.4 s/.test(txt) &&
    /Lead Tracker size: [\d.]+ M of 10 M cells/.test(txt) && /Due list \/ email queue: \d+ due · \d+ queued/.test(txt) && /Last archive run: .*archived/.test(txt), txt);
  ok('… script lock: holds, average, longest + action, ⚠️ when the longest hold reaches 70 % of the 20 s wait', /Script lock yesterday: ⚠️ 1500 holds · average 300 ms · longest 15000 ms \(uploadPassenger\)/.test(txt), txt.split('\n').find((l) => /Script lock/.test(l)));
  ok('web-app actions and trigger runs are recorded today (no personal data)', (() => { const h = JSON.parse(props[ctx.healthKey_()] || '{}'); return h.act > 30 && h.busy >= 2 && h.jobs && h.jobs.n > 3 && h.edit && !/@|Person/.test(JSON.stringify(h)); })());
  props.TRIGGER_LIMIT_MIN = '360'; delete props.MAIL_LIMIT;
  ok('TRIGGER_LIMIT_MIN (Workspace) changes the limit: no ⚠️ at 70 of 360 min', /Trigger time yesterday: 70 of 360 min/.test(ctx.healthRows_()[0][1] ? 'Trigger time yesterday: ' + ctx.healthRows_()[0][1] : ''));
  delete props.TRIGGER_LIMIT_MIN;
  clock.offset = -400 * DAY; resetLimits();
  const stale = post(contact('TEST Never Closed', '+234 800 000 0409', sid(208))).leadId;
  clock.offset = 0;
  const sum = ctx.collectSummary_();
  ok('daily summary: never-closed leads listed under "please close"', sum.stale.some((x) => x.indexOf(stale + ' — New Lead, unchanged since') === 0), sum.stale.join(' | '));
  const html = ctx.renderSummary_(sum).htmlBody || ctx.renderSummary_(sum).html;
  ok('… and the System health section is in the email', /System health/.test(html) && /Trigger time yesterday/.test(html));

  // --- staging load test helpers ------------------------------------------------------------------------------------
  ok('loadTestReport refused without TEST_OTP_BYPASS', post({ action: 'loadTestReport', hp: '', tag: 'AB12' }).ok === false);
  props.TEST_OTP_BYPASS = 'on';
  resetLimits();
  const staffN = mail.outbox.filter((m) => /New general enquiry/.test(m.subject)).length;
  post(contact('TEST Load AB12 0001', '+234 800 000 0501', sid(301)));
  post(contact('TEST Load AB12 0002', '+234 800 000 0502', sid(302)));
  post(contact('TEST Load AB12 0002', '+234 800 000 0502', sid(302))); // a retry: no second lead
  const rep = post({ action: 'loadTestReport', hp: '', tag: 'AB12' });
  ok('loadTestReport: counts only (rows, distinct names) — retries made no duplicates', rep.ok && rep.rows === 2 && rep.names === 2 && Object.keys(rep).join() === 'ok,rows,names', JSON.stringify(rep));
  ok('"TEST Load" leads send no staff alert (saves the gmail.com quota)', mail.outbox.filter((m) => /New general enquiry/.test(m.subject)).length === staffN);
  delete props.TEST_OTP_BYPASS;

  ctx.addDue_('EG-VO-00099', 'test'); // not a TEST lead's row: kept by cleanupTestData
  clock.offset = 0;
};
