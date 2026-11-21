#!/usr/bin/env node
/*
 * Local tests of apps-script/*.gs against an in-memory mock of Sheets, Drive, Properties, Cache, Lock, MailApp,
 * UrlFetchApp and triggers
 * (gasmock.js). Nothing is sent to Google. No dependencies.
 *   node tools/gas-test/test.js
 * Needs the SPECIMEN files in tools/qa/fixtures (made by `cd tools/qa && node run.js static` once).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || path.resolve(__dirname, '../..');
if (!fs.existsSync(path.join(dir, 'tools/qa/fixtures/VERSION'))) {
  console.error('SPECIMEN fixtures missing: run `cd tools/qa && node run.js static` once first.');
  process.exit(2);
}
const g = require('./gasmock')(dir);
const { ctx, ss, props, logs } = g;
const C = ctx.__exports.CONFIG;
let fails = 0;
const ok = (n, c, info) => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (info ? '  — ' + info : '')); if (!c) fails++; };

// --- a v2 tracker (15 columns) with three earlier leads -------------------------------------
const tr = new g.Sheet('Lead Tracker', 2000, 15);
ss.sheets = [tr];
const H2 = C.HEADERS.slice(0, 15);
H2.forEach((h, i) => tr.set(1, i + 1, h));
const old = [
  ['EG-VO-00001', 'x', 'TEST Old Visa', '+234', 'Visa Only', 2, 0, 0, '', '', 'N/A', 'Contacted', 'Ade', '[Complete: 2 passengers] [Auto] Email: a@b.co | Country: Nigeria | Departure: Kano | Flight ticket: No | Been to KSA: No | UK/US/Schengen visa: — | Passengers: 2 | Source: Website', '=HYPERLINK("x","📁")'],
  ['EG-CE-00002', 'x', 'Real Person', '+234', 'Customised Experience', 1, 0, 0, '', '', 'band', 'New Lead', '', '[Auto] Email: c@d.co | Country: Ghana | Departure: Accra | Arrive: Jeddah | Source: Instagram  · staff note: called twice', ''],
  ['EG-GE-00003', 'x', 'Someone', '+234', 'General Enquiry', 3, '', '', '', '', '', 'New Lead', '', '[Auto] Enquiry: Hotel Accommodation', ''],
];
old.forEach((r, i) => r.forEach((v, j) => tr.set(i + 2, j + 1, v)));
const staffNote = tr.get(3, 14);
props.TRACKER_ID = 'SSID';
const root = ctx.DriveApp.createFolder('root');
const visaRoot = root.createFolder('Visa Applications');
props.VISA_FOLDER_ID = visaRoot.getId();
props.LEAD_SEQ = '3';

// --- migration, twice --------------------------------------------------------------------------
ctx.upgradeTracker_(ss);
const snap1 = JSON.stringify(tr.cells);
ctx.upgradeTracker_(ss);
ok('migration is idempotent (second run changes nothing)', JSON.stringify(tr.cells) === snap1);
const head = []; for (let c = 1; c <= tr.getMaxColumns(); c++) head.push(tr.get(1, c));
ok('v3 headers appended P–U in order', head.slice(15, 21).join('|') === 'Email|Country|Departure|Passengers|Lead Source|Application Status', head.slice(15).join('|'));
ok('v4: Message to Customer appended as column V with its note', head[21] === 'Message to Customer' && /Visible to the customer on the Track page/.test((tr.notes || {})['1,22']), head[21]);
ok('v5: only Review Status has the dropdown (not the columns inserted after it)', (tr.validation || {})[23] && (tr.validation[23].list || []).length === 7 && !(tr.validation || {})[24] && !(tr.validation || {})[25],
  JSON.stringify([23, 24, 25].map((c) => (tr.validation || {})[c] ? 'list' : null)));
tr.validation[24] = tr.validation[23]; tr.validation[25] = tr.validation[23]; // a tracker set up before this fix
ctx.upgradeTracker_(ss);
ok('setup repairs a copied dropdown on Review Updated / Last Customer Email (Review Status keeps it)', !tr.validation[24] && !tr.validation[25] && tr.validation[23] && tr.validation[23].list.length === 7);
ok('v5: Review Status, Review Updated, Last Customer Email appended W–Y (Review Status has its note)', head.slice(22, 25).join('|') === 'Review Status|Review Updated|Last Customer Email' && /emailed once the status has stayed the same for 5 minutes/.test((tr.notes || {})['1,23']), head.slice(22).join('|'));
ok('first 15 columns and Lead IDs unchanged', H2.every((h, i) => tr.get(1, i + 1) === h) && [2, 3, 4].map((r) => tr.get(r, 1)).join() === 'EG-VO-00001,EG-CE-00002,EG-GE-00003');
ok('old notes kept as they were', tr.get(3, 14) === staffNote && /^\[Complete/.test(tr.get(2, 14)));
const row = (r) => [16, 17, 18, 19, 20, 21].map((c) => tr.get(r, c));
ok('backfill visa row', JSON.stringify(row(2)) === JSON.stringify(['a@b.co', 'Nigeria', 'Kano', 2, 'Website', 'Complete: 2 passengers']), JSON.stringify(row(2)));
ok('backfill custom row (staff text not copied)', JSON.stringify(row(3)) === JSON.stringify(['c@d.co', 'Ghana', 'Accra', '', 'Instagram', 'Received']), JSON.stringify(row(3)));
ok('backfill contact row: status only', JSON.stringify(row(4)) === JSON.stringify(['', '', '', '', '', 'Received']), JSON.stringify(row(4)));
ok('tabs: Visa Applications added after Lead Tracker', ss.sheets.map((s) => s.name).join('|') === 'Lead Tracker|Visa Applications|Visa Passengers|Custom Requests|Contact Enquiries', ss.sheets.map((s) => s.name).join('|'));
// staff fills a cell later → a re-run never overwrites it
tr.set(4, 17, 'Typed by staff');
ctx.upgradeTracker_(ss);
ok('re-run keeps staff-entered values', tr.get(4, 17) === 'Typed by staff');

ok('schema version 5', C.SCHEMA_VERSION === '5');
ok('health check reports the stored schema', (() => { props.SCHEMA_VERSION = '5'; return JSON.parse(ctx.doGet()).schema === 5; })());

// --- Email Log spreadsheet + settings + triggers (setup pieces), twice ---------------------------
ctx.ensureEmailLog_(root); ctx.ensureEmailLog_(root);
const elog = g.books[props.EMAIL_LOG_ID];
ok('Email Log: separate spreadsheet with Email Log + Email Queue tabs (idempotent)', elog && elog !== ss && elog.name === 'Elite Global – Email Log' &&
  elog.sheets.map((x) => x.name).sort().join('|') === 'Email Log|Email Queue' && Object.keys(g.books).length === 2, elog && elog.sheets.map((x) => x.name).join('|'));
ok('Email Log is not inside the Central Lead Tracker', !ss.getSheetByName('Email Log') && !ss.getSheetByName('Email Queue'));
ctx.ensureEmailSettings_();
ok('STAFF_EMAIL defaults to the script owner; OTP_SECRET created', props.STAFF_EMAIL === 'test@example.com' && (props.OTP_SECRET || '').length > 20);
props.STAFF_EMAIL = 'staff@example.org'; ctx.ensureEmailSettings_();
ok('STAFF_EMAIL is only set when empty', props.STAFF_EMAIL === 'staff@example.org');
ctx.ensureTriggers_(ss); ctx.ensureTriggers_(ss);
ok('3 triggers created once (onTrackerEdit, runEmailJobs, sendDailySummary)', g.triggers.map((t) => t.handler).sort().join('|') === 'onTrackerEdit|runEmailJobs|sendDailySummary', g.triggers.map((t) => t.handler).join('|'));
ok('System Info shows the Email Log link', ctx.collectInfo_().some((r) => /Email Log/.test(r[0]) && r[1] === 'https://sheet/' + props.EMAIL_LOG_ID));
const tok = (e) => ctx.makeEmailToken_(e);

// --- new leads ---------------------------------------------------------------------------------
const today = new Date(); const future = new Date(today.getTime() + 40 * 864e5).toISOString().slice(0, 10);
const c1 = ctx.submitContact_({ name: 'TEST Contact', phone: '+234 800 000 0000', enquiryType: 'Hotel Accommodation', travellers: '2', details: 'hi' });
const r5 = ctx.findLeadRow_(tr, c1.leadId);
ok('contact → notes empty, status Received', tr.get(r5, 14) === '' && tr.get(r5, 21) === 'Received' && tr.get(r5, 6) === 2, JSON.stringify(row(r5)));
const cu = ctx.submitCustomRequest_({ name: 'TEST Custom', phone: '+234 800 000 0001', email: 'q@e.co', country: 'Nigeria', adults: '1', children: '0', infants: '0',
  departureAirport: 'KAN', travelDate: future, flightTicket: 'No', arrivalCity: 'Jeddah', nightsMadinah: '3', nightsMakkah: '4', hotelCategory: '4-star',
  haramDistance: 'Walking distance', visaAssist: 'Yes', budget: 'Above ₦5,000,000', heard: 'Website', emailToken: tok('q@e.co') });
const r6 = ctx.findLeadRow_(tr, cu.leadId);
ok('custom → email/country/departure/source, notes empty', tr.get(r6, 14) === '' && JSON.stringify(row(r6)) === JSON.stringify(['q@e.co', 'Nigeria', 'Kano – Mallam Aminu Kano International Airport (KAN)', '', 'Website', 'Received']), JSON.stringify(row(r6)));

const FX = path.join(dir, 'tools/qa/fixtures');
const b64 = (f) => fs.readFileSync(path.join(FX, f)).toString('base64');
const v = ctx.createVisaApplication_({ name: 'TEST Visa', phone: '+234 800 000 0002', email: 'v@e.co', country: 'Nigeria', travelDate: future, departureAirport: 'KAN',
  flightTicket: 'Yes', priorKsa: 'No', westernVisa: '', extraInfo: '', heard: 'Instagram', consent: true, emailToken: tok('v@e.co'),
  passengers: [{ name: 'TEST P1', category: 'Adult (18+)' }, { name: 'TEST P2', category: 'Child (2–17)' }] });
const r7 = ctx.findLeadRow_(tr, v.leadId);
ok('visa create → status Uploading 0/2, passengers 2, notes empty', tr.get(r7, 18) === 'Kano – Mallam Aminu Kano International Airport (KAN)' && tr.get(r7, 21) === 'Uploading 0/2' && tr.get(r7, 19) === 2 && tr.get(r7, 14) === '', JSON.stringify(row(r7)));
const va = ss.getSheetByName('Visa Applications');
ok('Visa Applications row: one column per answer + folder link', va.get(2, 1) === v.leadId && va.get(2, 8) === 'Kano – Mallam Aminu Kano International Airport (KAN)' && va.get(2, 9) === 'Yes' && va.get(2, 12) === 2 && va.get(2, 13) === 1 && va.get(2, 14) === 1 && /^=HYPERLINK/.test(va.get(2, 20)) && va.get(2, 19) === 'Instagram',
  JSON.stringify([1, 8, 9, 12, 13, 14, 19, 20].map((c) => va.get(2, c))));
for (const [i, cat] of [[1, 'Adult (18+)'], [2, 'Child (2–17)']]) {
  ctx.uploadPassenger_({ leadId: v.leadId, token: v.token, index: i, name: 'TEST P' + i, category: cat,
    passport: { name: 'passport.jpg', mime: 'image/jpeg', b64: b64('passport.jpg') }, photo: { mime: 'image/jpeg', b64: b64('photo-40kb.jpg') } });
  if (i === 1) ok('upload 1 → Uploading 1/2', tr.get(r7, 21) === 'Uploading 1/2', tr.get(r7, 21));
}
ctx.finalizeVisaApplication_({ leadId: v.leadId, token: v.token });
ok('finalize → Complete: 2 passengers', tr.get(r7, 21) === 'Complete: 2 passengers');
ok('repeat finalize is fine', ctx.finalizeVisaApplication_({ leadId: v.leadId, token: v.token }).ok === true);
ok('legacy finalize check (old [Complete] tag in notes)', ctx.isComplete_('EG-VO-00001') === true);

// --- optional documents: shared flight ticket + hotel booking for passenger 1 -------------------
const vd = ctx.createVisaApplication_({ name: 'TEST Docs', phone: '+234 800 000 0002', email: 'd@e.co', country: 'Nigeria', travelDate: future,
  departureAirport: 'LOS', flightTicket: 'Yes', priorKsa: 'No', heard: '', consent: true, emailToken: tok('d@e.co'),
  passengers: [{ name: 'TEST D1', category: 'Adult (18+)' }, { name: 'TEST D2', category: 'Adult (18+)' }],
  docs: { shared: { ticket: true, hotel: false }, passengers: [{ ticket: true, hotel: true }, { ticket: false, hotel: false }] } });
const stD = JSON.parse(props['UPLOAD_' + vd.leadId]);
ok('docs declared: shared ticket, passenger 1 hotel only (shared ticket stored once)', stD.d === '120', stD.d);
const tryU = (o) => { try { return ctx.uploadDocument_(Object.assign({ leadId: vd.leadId, token: vd.token }, o)); } catch (e) { return 'ERR ' + e.message; } };
ok('undeclared document rejected', /not part of your application/.test(tryU({ scope: 2, kind: 'hotel', name: 'TEST D2', file: { name: 'h.pdf', mime: 'application/pdf', b64: b64('passport.pdf') } })));
ok('fake document rejected', /must be a real PDF, JPG or PNG/.test(tryU({ scope: 'all', kind: 'ticket', file: { name: 't.pdf', mime: 'application/pdf', b64: b64('fake.jpg') } })));
ok('shared ticket uploaded', tryU({ scope: 'all', kind: 'ticket', file: { name: 'flight-ticket.pdf', mime: 'application/pdf', b64: b64('passport.pdf') } }).ok === true);
const pp = (i) => ctx.uploadPassenger_({ leadId: vd.leadId, token: vd.token, index: i, name: 'TEST D' + i, category: 'Adult (18+)',
  passport: { name: 'passport.jpg', mime: 'image/jpeg', b64: b64('passport.jpg') }, photo: { mime: 'image/jpeg', b64: b64('photo-40kb.jpg') } });
pp(1); pp(2);
let fin; try { ctx.finalizeVisaApplication_({ leadId: vd.leadId, token: vd.token }); fin = 'no error'; } catch (e) { fin = e.message + ' ' + JSON.stringify(e.missing); }
ok('finalize waits for the declared hotel booking (passenger 1)', /\[1\]$/.test(fin), fin);
ok('hotel booking for passenger 1 uploaded', tryU({ scope: 1, kind: 'hotel', name: 'TEST D1', file: { name: 'hotel.jpg', mime: 'image/jpeg', b64: b64('photo-40kb.jpg') } }).ok === true);
pp(1); // a retry of passenger 1 must keep the hotel booking (file + row)
ok('finalize after documents', ctx.finalizeVisaApplication_({ leadId: vd.leadId, token: vd.token }).ok === true);
const app = g.folders.find((f) => /TEST Docs/.test(f.name));
const live = (f) => f.files.filter((x) => !x.trashed).map((x) => x.name).sort().join(',');
const p1 = app.subs.find((f) => /^01 – /.test(f.name)), p2 = app.subs.find((f) => /^02 – /.test(f.name));
ok('Drive: shared ticket at application root, hotel in 01 – name/', live(app) === 'flight-ticket.pdf' && live(p1) === 'hotel-booking.jpg,passport.jpg,photo.jpg' && live(p2) === 'passport.jpg,photo.jpg', [live(app), live(p1), live(p2)].join(' | '));
const ps = ss.getSheetByName('Visa Passengers');
const prow = (i) => { for (let r = 2; r <= ps.getLastRow(); r++) if (ps.get(r, 1) === vd.leadId && ps.get(r, 2) === i) return [ps.get(r, 9), ps.get(r, 10)]; return null; };
ok('Visa Passengers: shared ticket on every row, hotel on passenger 1', /flight-ticket\.pdf \(all passengers\)/.test(prow(1)[0]) && /flight-ticket\.pdf \(all passengers\)/.test(prow(2)[0]) && /hotel-booking\.jpg/.test(prow(1)[1]) && prow(2)[1] === '', JSON.stringify([prow(1), prow(2)]));
const vaRow = ctx.findLeadRow_(va, vd.leadId);
ok('Visa Applications: Shared Flight Ticket link', /flight-ticket\.pdf/.test(va.get(vaRow, 16)) && va.get(vaRow, 17) === '', va.get(vaRow, 16));

// --- airport validation ---------------------------------------------------------------------
const tryA = (code, other, country) => { try { return ctx.vAirport_(code, other, country); } catch (e) { return 'ERR ' + e.field + ': ' + e.message; } };
ok('airport: Ghana ACC ok', tryA('ACC', '', 'Ghana') === 'Accra – Kotoka International Airport (ACC)', tryA('ACC', '', 'Ghana'));
ok('airport: code from another country rejected', /^ERR departureAirport/.test(tryA('ACC', '', 'Nigeria')), tryA('ACC', '', 'Nigeria'));
ok('airport: Nigeria DKA ok', tryA('DKA', '', 'Nigeria') === "Katsina – Umaru Musa Yar'Adua International Airport (DKA)", tryA('DKA', '', 'Nigeria'));
ok('airport: Other needs text', /^ERR departureAirportOther/.test(tryA('OTHER', ' ', 'Ghana')) && tryA('OTHER', 'Kumasi', 'Ghana') === 'Other: Kumasi');
ok('airport: empty / junk rejected', /^ERR departureAirport/.test(tryA('', '', 'Nigeria')) && /^ERR departureAirport/.test(tryA('=SUM(A1)', '', 'Nigeria')));
ok('airport: country Other → only Other', /^ERR/.test(tryA('LOS', '', 'Other')) && tryA('OTHER', 'Somewhere', 'Other') === 'Other: Somewhere');

// --- purge → Expired ---------------------------------------------------------------------------
const v2 = ctx.createVisaApplication_({ name: 'TEST Abandoned', phone: '+234 800 000 0002', email: 'v@e.co', country: 'Nigeria', travelDate: future, departureAirport: 'KAN',
  flightTicket: 'No', priorKsa: 'No', heard: '', consent: true, emailToken: tok('v@e.co'), passengers: [{ name: 'TEST P1', category: 'Adult (18+)' }] });
ctx.testBackdateUpload(v2.leadId);
ctx.purgeStaleUploads_();
ok('purge after 24 h → Expired', tr.get(ctx.findLeadRow_(tr, v2.leadId), 21) === 'Expired');

// --- trackApplication ---------------------------------------------------------------------------
const resetLimits = () => Object.keys(g.cache).forEach((k) => delete g.cache[k]);
// every lookup starts with fresh rate-limit counters, except in the rate-limit tests below
const track = (leadId, contact) => { resetLimits(); return ctx.trackApplication_({ leadId, contact }); };
const trackRaw = (leadId, contact) => ctx.trackApplication_({ leadId, contact });
const NF = JSON.stringify({ ok: false, error: C.TRACK.NOT_FOUND });
const ALLOWED = ['ok', 'leadId', 'service', 'received', 'stage', 'description', 'nextStep', 'message', 'upload'];
const colOf = (h) => ctx.trackerCols_(tr)[h];
const setCell = (id, h, v) => tr.set(ctx.findLeadRow_(tr, id), colOf(h), v);

const tv = track(v.leadId.toLowerCase(), '  V@E.CO ');
ok('track visa by email (any case, spaces, lower-case ID); finalized → "Under review"', tv.ok && tv.leadId === v.leadId && tv.service === 'Visa only' && tv.stage === 'Under review' && /^\d{1,2} \w{3} \d{4}$/.test(tv.received), JSON.stringify(tv));
ok('visa upload line: complete', tv.upload === "All 2 passengers' documents received", tv.upload);
ok('reply has only the allowed fields (no name, phone, email, links, notes)', Object.keys(tv).every((k) => ALLOWED.includes(k)) && !/TEST|@|\+234|drive|HYPERLINK/i.test(JSON.stringify(tv)), Object.keys(tv).join(','));
for (const ph of ['0800 000 0001', '+234 800 000 0001', '234-800-000-0001', '00234 8000000001']) {
  const r = track(cu.leadId, ph);
  ok('custom lead by phone ' + ph, r.ok && r.service === 'Customised Umrah' && r.upload === undefined, JSON.stringify(r));
}
ok('general enquiry by phone', track(c1.leadId, '08000000000').service === 'General enquiry');
ok('general enquiry cannot match by email (it has none)', JSON.stringify(track(c1.leadId, 'q@e.co')) === NF);
const replies = [
  track('EG-VO-99999', 'v@e.co'),            // unknown ID
  track(v.leadId, 'someone@else.co'),         // wrong email
  track(v.leadId, '0811 111 1111'),           // wrong phone
  track('EG-XX-1', 'v@e.co'),                 // bad ID format
  track(v.leadId, '12'),                      // contact too short
  JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'trackApplication', hp: 'bot', leadId: v.leadId, contact: 'v@e.co' }) } })), // honeypot
].map((r) => JSON.stringify(r));
ok('unknown ID, wrong contact, bad format, honeypot: byte-identical reply', replies.every((r) => r === NF), replies.filter((r) => r !== NF).join(' | '));

// stage mapping, Lost / Expired precedence, upload lines
const stageOf = (status, app) => { setCell(v2.leadId, 'Lead Status', status); if (app !== undefined) setCell(v2.leadId, 'Application Status', app); return track(v2.leadId, 'v@e.co'); };
const want = { 'New Lead': 'Received', 'Contacted': 'In progress', 'Awaiting Response': 'Waiting for your reply', 'Quotation Sent': 'Quotation sent', 'Payment Pending': 'Awaiting payment', 'Converted': 'Confirmed', 'Lost': 'Closed', '': 'Received', 'Something new': 'Received' };
const got = Object.keys(want).map((s) => [s, stageOf(s, 'Uploading 1/3').stage]);
ok('stage mapping for every Lead Status (blank/unknown → Received)', got.every(([s, st]) => st === want[s]), JSON.stringify(got));
const up = stageOf('Contacted', 'Uploading 1/3');
ok('upload line: Uploading 1/3', up.upload === 'Upload not finished (1 of 3 passengers received)', up.upload);
const ex = stageOf('Contacted', 'Expired');
ok('Expired → "Upload not finished" stage + line', ex.stage === 'Upload not finished' && ex.description === 'Upload not finished — please contact us or apply again.' && ex.upload === 'Upload not finished', JSON.stringify(ex));
const lost = stageOf('Lost', 'Expired');
ok('Lost wins over Expired → Closed', lost.stage === 'Closed' && lost.nextStep === 'Contact us if you have questions.', JSON.stringify(lost));
const one = stageOf('New Lead', 'Complete: 1 passenger');
ok('upload line for 1 passenger', one.upload === 'All documents for your 1 passenger received', one.upload);

// staff message: trimmed to 300, control characters removed, plain text
setCell(v2.leadId, 'Message to Customer', '  Hello\u0007 <b>there</b> ' + 'x'.repeat(400));
const msg = track(v2.leadId, 'v@e.co').message;
ok('Message to Customer: ≤ 300 chars, no control characters, returned as plain text', msg.length === 300 && !/[\u0000-\u001F]/.test(msg) && msg.startsWith('Hello <b>there</b>'), msg.length + ' ' + msg.slice(0, 30));
setCell(v2.leadId, 'Message to Customer', '');
ok('no message key when the cell is empty', !('message' in track(v2.leadId, 'v@e.co')));

// rate limits: 5 per Lead ID, 20 per contact value (10 min); refusal looks like a miss
resetLimits();
const rl = [1, 2, 3, 4, 5, 6].map(() => trackRaw(vd.leadId, 'd@e.co').ok);
ok('6th lookup on one Lead ID refused (same reply), even with the right contact', rl.slice(0, 5).every(Boolean) && rl[5] === false && JSON.stringify(trackRaw(vd.leadId, 'd@e.co')) === NF, rl.join(','));
resetLimits();
for (let i = 0; i < 20; i++) trackRaw('EG-VO-8' + String(i).padStart(4, '0'), 'q@e.co');
ok('21st lookup with one contact refused (same reply), even for the right lead', JSON.stringify(trackRaw(cu.leadId, 'q@e.co')) === NF);
ok('another contact is not affected by that limit', trackRaw(cu.leadId, '0800 000 0001').ok);
const tlogs = logs.filter((l) => /^trackApplication/.test(l));
ok('logs: only found / not-found / limited — never the contact or a missed ID', tlogs.length > 10 && tlogs.every((l) => /^trackApplication (found|not-found|limited)$/.test(l)), [...new Set(tlogs)].join(' | '));

require('./test-email')(g, ok, { v, vd, v2, cu, c1, tok, future, track, setCell, colOf, tr, elog });

// --- cleanup -----------------------------------------------------------------------------------
ctx.cleanupTestData();
const leftIds = []; for (let r = 2; r <= tr.getLastRow(); r++) if (tr.get(r, 1)) leftIds.push(tr.get(r, 1));
ok('cleanupTestData removes TEST rows from Lead Tracker + Visa Applications', leftIds.join() === 'EG-CE-00002,EG-GE-00003' && va.getLastRow() === 1, leftIds.join() + ' / visa rows ' + (va.getLastRow() - 1));
const elIds = elog.getSheetByName('Email Log').getRange(2, 4, Math.max(elog.getSheetByName('Email Log').getLastRow() - 1, 1), 1).getValues().map((r) => r[0]).filter(String);
ok('cleanupTestData removes the TEST leads\' Email Log rows', elIds.length === 0, elIds.join(','));
console.log(fails ? fails + ' failure(s)' : 'all passed');
console.log(logs.filter((l) => /Added|Filled|Removed/.test(l)).join('\n'));
process.exit(fails ? 1 : 0);
