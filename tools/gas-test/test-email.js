// Review workflow, emails, providers, queue and email verification (called from test.js with its leads).
'use strict';
module.exports = function (g, ok, t) {
  const { ctx, props, mail, fetch, clock, logs } = g;
  const { v, vd, v2, cu, c1, tok, future, track, setCell, colOf, tr, elog } = t;
  const C = ctx.__exports.CONFIG;
  const MIN = 60000;
  const logSh = elog.getSheetByName('Email Log');
  const queueSh = elog.getSheetByName('Email Queue');
  const to = (addr) => mail.outbox.filter((m) => m.to === addr);
  const cell = (id, h) => tr.get(ctx.findLeadRow_(tr, id), colOf(h));
  const edit = (id, h, value) => { setCell(id, h, value); ctx.onTrackerEdit({ range: tr.getRange(ctx.findLeadRow_(tr, id), colOf(h)) }); };
  const jobs = () => { delete g.cache.EMAIL_JOBS; delete props.LAST_FULL_SCAN; return ctx.runEmailJobs(); }; // full scan each time (the Due path: test-scale.js)
  const logRows = () => logSh.getRange(2, 1, Math.max(logSh.getLastRow() - 1, 1), 7).getValues().filter((r) => r[1] || r[2]);
  const clearW = () => Object.keys(g.cache).filter((k) => /_W$/.test(k)).forEach((k) => delete g.cache[k]);
  const resetLimits = () => Object.keys(g.cache).forEach((k) => delete g.cache[k]);

  // --- emails sent by the submissions in test.js ------------------------------------------------
  ok('finalize → Review Status "Under Review" + Review Updated; Lead Status unchanged', cell(v.leadId, 'Review Status') === 'Under Review' &&
    cell(v.leadId, 'Review Updated') instanceof Date && cell(v.leadId, 'Lead Status') === 'New Lead', cell(v.leadId, 'Review Status'));
  const staff = to('staff@example.org');
  ok('staff alert for every new lead (contact, customise, both finished visas)', [c1, cu, v, vd].every((l) => staff.some((m) => m.subject.indexOf(l.leadId) !== -1)) &&
    !staff.some((m) => m.subject.indexOf(v2.leadId) !== -1), staff.map((m) => m.subject).join(' | '));
  const alert = staff.find((m) => m.subject.indexOf(vd.leadId) !== -1);
  ok('visa staff alert: name, phone, email, country, travel date, passengers, tracker row + Drive folder links, no attachments',
    /TEST Docs/.test(alert.htmlBody) && /\+234 800 000 0002/.test(alert.htmlBody) && /d@e\.co/.test(alert.htmlBody) && /Nigeria/.test(alert.htmlBody) &&
    /Passengers/.test(alert.htmlBody) && /#gid=\d+&amp;range=A\d+/.test(alert.htmlBody) && /https:\/\/drive\.google\.com\/drive\/folders\//.test(alert.htmlBody) && !alert.attachments, alert.subject);
  const conf = to('v@e.co');
  ok('visa: ONE combined "received + under review" email (not two)', conf.length === 1 && /under review/i.test(conf[0].htmlBody) &&
    /track\.html\?id=EG-VO-/.test(conf[0].htmlBody) && /spam/.test(conf[0].htmlBody), conf.map((m) => m.subject).join(' | '));
  ok('confirmation: branded (navy header, text wordmark — NO remote image, gold button, RC, Reply-To company), plain text too',
    /#06163F/.test(conf[0].htmlBody) && !/<img /.test(conf[0].htmlBody) && />Elite Global<\/p>/.test(conf[0].htmlBody) &&
    /#F5AE00/.test(conf[0].htmlBody) && /RC: 7787410/.test(conf[0].htmlBody) && conf[0].replyTo === 'info@elitetravelng.com' &&
    /Reference number: EG-VO-/.test(conf[0].body) && /^Elite Global — /.test(conf[0].subject), conf[0].subject);
  ok('confirmation: one link only (the Track button), no footer link', (conf[0].htmlBody.match(/<a /g) || []).length === 1 && /track\.html\?id=EG-VO-/.test(conf[0].htmlBody) &&
    (conf[0].body.match(/track\.html/g) || []).length === 1, (conf[0].htmlBody.match(/href="[^"]*"/g) || []).join(' '));
  ok('staff alert keeps the logo from SITE_URL and the Track link', /assets\/brand\/email-logo\.png/.test(alert.htmlBody) && /Track your application<\/a>/.test(alert.htmlBody));
  ok('Last Customer Email after finalize', /^Confirmation \+ Status: Under Review · /.test(cell(v.leadId, 'Last Customer Email')), cell(v.leadId, 'Last Customer Email'));
  ok('customise: confirmation to the customer, contact form: none (no email address)', to('q@e.co').length === 1 && /customised Umrah/i.test(to('q@e.co')[0].htmlBody));
  const before = mail.outbox.length;
  ctx.finalizeVisaApplication_({ leadId: v.leadId, token: v.token });
  ok('repeat finalize sends nothing again', mail.outbox.length === before);

  // TEST + @example.com → customer emails skipped; escaping
  const qa = ctx.submitCustomRequest_({ name: 'TEST QA', phone: '+234 800 000 0009', email: 'qa@example.com', country: 'Nigeria', adults: '1', children: '0', infants: '0',
    departureAirport: 'KAN', travelDate: future, flightTicket: 'No', arrivalCity: 'Jeddah', nightsMadinah: '3', nightsMakkah: '4', hotelCategory: '4-star',
    haramDistance: 'Walking distance', visaAssist: 'Yes', budget: 'Above ₦5,000,000', heard: 'Website', emailToken: tok('qa@example.com') });
  ok('TEST lead with @example.com: no customer email (emailed:false), staff alert still sent', qa.emailed === false && to('qa@example.com').length === 0 &&
    to('staff@example.org').some((m) => m.subject.indexOf(qa.leadId) !== -1));
  const xs = ctx.submitCustomRequest_({ name: 'TEST <script>alert(1)</script> & "Co"', phone: '+234 800 000 0010', email: 'x@e.co', country: 'Nigeria', adults: '1', children: '0', infants: '0',
    departureAirport: 'KAN', travelDate: future, flightTicket: 'No', arrivalCity: 'Jeddah', nightsMadinah: '3', nightsMakkah: '4', hotelCategory: '4-star',
    haramDistance: 'Walking distance', visaAssist: 'Yes', budget: 'Above ₦5,000,000', heard: 'Website', emailToken: tok('x@e.co') });
  const xm = to('x@e.co')[0];
  ok('every customer value escaped in HTML (customer + staff emails)', xs.emailed === true && !/<script>alert/.test(xm.htmlBody) && /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;Co&quot;/.test(xm.htmlBody) &&
    !/<script>alert/.test(to('staff@example.org').find((m) => m.subject.indexOf(xs.leadId) !== -1).htmlBody));

  // --- review workflow: undo window, once per status, held Correction Needed ----------------------
  edit(v.leadId, 'Review Status', 'Verified');
  jobs();
  ok('a change is not emailed immediately (undo window)', to('v@e.co').length === 1);
  clock.offset += 3 * MIN;
  edit(v.leadId, 'Review Status', 'Under Review'); // undo within 5 minutes
  clock.offset += 6 * MIN;
  jobs();
  ok('changed and changed back within 5 minutes → nothing sent', to('v@e.co').length === 1, to('v@e.co').map((m) => m.subject).join(' | '));
  edit(v.leadId, 'Review Status', 'Verified');
  clock.offset += 4 * MIN; jobs();
  ok('still nothing after 4 minutes', to('v@e.co').length === 1);
  clock.offset += 2 * MIN; jobs(); jobs();
  const vm = to('v@e.co');
  ok('sent once after 5 unchanged minutes (two job runs → one email)', vm.length === 2 && /Documents verified/.test(vm[1].subject) && /track\.html\?id=/.test(vm[1].htmlBody), vm.map((m) => m.subject).join(' | '));
  ok('Last Customer Email updated', /^Status: Verified · /.test(cell(v.leadId, 'Last Customer Email')), cell(v.leadId, 'Last Customer Email'));
  edit(v.leadId, 'Review Status', 'Correction Needed');
  clock.offset += 6 * MIN; jobs();
  ok('Correction Needed held while Message to Customer is empty', to('v@e.co').length === 2);
  ok('held email is listed in the daily summary data', ctx.collectSummary_().held.some((h) => h.indexOf(v.leadId) === 0));
  edit(v.leadId, 'Message to Customer', 'Please send a clearer <photo> & passport.');
  clock.offset += 1 * MIN; jobs();
  const cn = to('v@e.co')[2];
  ok('held Correction Needed is released on the next run once the message is filled in (escaped message, correction subject)', cn &&
    /needs a correction/.test(cn.subject) && /clearer &lt;photo&gt; &amp; passport/.test(cn.htmlBody) && /What we need from you:\nPlease send a clearer <photo> & passport\./.test(cn.body), cn && cn.subject);
  const tcn = track(v.leadId, 'v@e.co');
  ok('Track page: Correction Needed → "Action needed" + message', tcn.stage === 'Action needed' && /clearer <photo>/.test(tcn.message), JSON.stringify(tcn));
  edit(v.leadId, 'Review Status', 'Verified');
  clock.offset += 6 * MIN; jobs(); jobs();
  ok('a status already emailed is never sent again (Verified twice → one email)', to('v@e.co').filter((m) => /Documents verified/.test(m.subject)).length === 1);
  // Visa Approved waits for a file in "Approved Visa" (VisaDelivery.gs; tested in test-visa.js)
  const giveVisa = (id) => ctx.approvedVisaFolder_(ctx.leadFolder_(ctx.trackRow_(id)), true)
    .createFile(ctx.Utilities.newBlob(ctx.specimenVisaPdf_(1), 'application/pdf', 'visa.pdf'));
  giveVisa(v.leadId); giveVisa(vd.leadId);
  const want = { 'Correction Received': 'Correction received', 'Visa Processing': 'Visa in processing', 'Visa Approved': 'Visa approved', 'Not Approved / Closed': 'Closed' };
  Object.keys(want).forEach((st) => { edit(v.leadId, 'Review Status', st); clock.offset += 6 * MIN; jobs(); });
  ok('every other Review Status emailed once with its wording', Object.keys(want).every((st) => to('v@e.co').filter((m) => m.subject.indexOf(want[st]) !== -1).length === 1),
    to('v@e.co').map((m) => m.subject).join(' | '));
  // --- every order of events for correction emails (fresh visa leads) ---------------------------------
  let seqN = 0;
  const visaLead = (email) => {
    const id = 'EG-VO-9' + String(++seqN).padStart(4, '0');
    ctx.appendTrackerRow_({ leadId: id, date: new Date(), name: 'TEST Ada Example', phone: '+234 800 000 0099', category: 'Visa Only',
      adults: 1, children: 0, infants: 0, travelDate: future, budget: '', email, country: 'Nigeria', status: 'Complete: 1 passenger' });
    return id;
  };
  const corr = (addr) => to(addr).filter((m) => /needs a correction/.test(m.subject));
  // A. status first, message later → held, then sent on the next run (no new 5-minute wait)
  const A = visaLead('order-a@e.co');
  edit(A, 'Review Status', 'Correction Needed');
  clock.offset += 6 * MIN; jobs();
  const heldA = corr('order-a@e.co').length;
  edit(A, 'Message to Customer', 'Please resend page 2 of the passport.');
  jobs();
  ok('order: status first, message later → held, then sent on the next run', heldA === 0 && corr('order-a@e.co').length === 1 && /page 2 of the passport/.test(corr('order-a@e.co')[0].htmlBody));
  // B. message first, then status → sent once the status is 5 minutes old
  const B = visaLead('order-b@e.co');
  edit(B, 'Message to Customer', 'Your photo background must be white.');
  edit(B, 'Review Status', 'Correction Needed');
  jobs();
  const earlyB = corr('order-b@e.co').length;
  clock.offset += 6 * MIN; jobs(); jobs();
  ok('order: message first, then status → sent once, 5 minutes after the status change', earlyB === 0 && corr('order-b@e.co').length === 1 && /background must be white/.test(corr('order-b@e.co')[0].htmlBody));
  // D. editing the message after the email was sent does not send it again
  edit(B, 'Message to Customer', 'Your photo background must be plain white (edited).');
  clock.offset += 6 * MIN; jobs(); jobs();
  ok('editing the message after sending does not resend', corr('order-b@e.co').length === 1);
  // C. second round: Correction Needed → Correction Received → Correction Needed again (new message) → emailed again
  edit(A, 'Review Status', 'Correction Received');
  clock.offset += 6 * MIN; jobs();
  const recA = to('order-a@e.co').filter((m) => /Correction received/.test(m.subject)).length;
  setCell(A, 'Message to Customer', 'Thanks — now please send the hotel booking.');
  edit(A, 'Review Status', 'Correction Needed');
  clock.offset += 6 * MIN; jobs(); jobs();
  const rounds = corr('order-a@e.co');
  ok('second round (Needed → Received → Needed) emails again with the new message', recA === 1 && rounds.length === 2 && /hotel booking/.test(rounds[1].htmlBody) && !/hotel booking/.test(rounds[0].htmlBody), rounds.length + '');
  edit(A, 'Review Status', 'Correction Received');
  clock.offset += 6 * MIN; jobs();
  ok('Correction Received is also emailed again in the second round', to('order-a@e.co').filter((m) => /Correction received/.test(m.subject)).length === 2);
  // E. undo inside a round: Correction Needed then back to Correction Received within 5 minutes → nothing new
  const nA = to('order-a@e.co').length;
  edit(A, 'Review Status', 'Correction Needed'); clock.offset += 2 * MIN;
  edit(A, 'Review Status', 'Correction Received'); clock.offset += 6 * MIN; jobs(); jobs();
  ok('a correction change undone within 5 minutes sends nothing', to('order-a@e.co').length === nA);
  // checkRecentEmailJobs: decisions without personal data
  const recent = ctx.checkRecentEmailJobs();
  const recentText = recent.join('\n');
  ok('checkRecentEmailJobs: last 20 decisions (Lead ID, status, decision, reason, time)', recent.length > 0 && recent.length <= 20 &&
    recent.some((l) => /EG-VO-9\d{4}  Correction Needed  → held \(Message to Customer is empty\)/.test(l)) &&
    recent.some((l) => /Correction Needed  → sent/.test(l)) && recent.some((l) => /→ waiting \(changed less than 5 minutes ago/.test(l)) &&
    recent.every((l) => /^\d{1,2} \w{3} \d{4} \d\d:\d\d  EG-/.test(l)), recent.slice(0, 4).join(' | '));
  ok('checkRecentEmailJobs shows no addresses, names or messages', !/@|Ada|Example|passport|hotel|photo/i.test(recentText + (props.REVIEW_DECISIONS || '')));

  ok('Track page: Review Status decides the visa stage', Object.keys(C.TRACK.REVIEW).every((st) => { setCell(v.leadId, 'Review Status', st); return track(v.leadId, 'v@e.co').stage === C.TRACK.REVIEW[st][0]; }));
  setCell(v.leadId, 'Review Status', 'Visa Processing');
  setCell(v.leadId, 'Lead Status', 'Contacted');
  ok('Review Status wins over other Lead Statuses for visa leads', track(v.leadId, 'v@e.co').stage === 'Visa in processing');
  setCell(v.leadId, 'Lead Status', 'Lost');
  const lostR = track(v.leadId, 'v@e.co');
  ok('Lost always shows Closed, even with a Review Status', lostR.stage === 'Closed' && lostR.nextStep === 'Contact us if you have questions.', JSON.stringify(lostR));
  setCell(v.leadId, 'Lead Status', 'New Lead');
  // a non-visa row is ignored; a missed edit (blank Review Updated) starts the window when first seen
  setCell(cu.leadId, 'Review Status', 'Verified'); ctx.onTrackerEdit({ range: tr.getRange(ctx.findLeadRow_(tr, cu.leadId), colOf('Review Status')) });
  ok('onTrackerEdit ignores non-visa rows', cell(cu.leadId, 'Review Updated') === '');
  setCell(cu.leadId, 'Review Status', '');
  setCell(vd.leadId, 'Review Status', 'Visa Approved'); setCell(vd.leadId, 'Review Updated', '');
  jobs();
  ok('missed edit: Review Updated stamped, email waits', cell(vd.leadId, 'Review Updated') instanceof Date && !to('d@e.co').some((m) => /Visa approved/.test(m.subject)));
  clock.offset += 6 * MIN; jobs();
  ok('… and is sent 5 minutes later', to('d@e.co').some((m) => /Visa approved/.test(m.subject)));

  // --- provider switch (Brevo) -------------------------------------------------------------------
  const send = (n) => ctx.sendEmail_({ to: 'p' + n + '@e.co', kind: 'test', key: 'T|' + n, leadId: '', subject: 'S', html: '<b>h</b>', text: 'h' });
  props.EMAIL_PROVIDER = 'brevo';
  ok('Brevo without BREVO_API_KEY/SENDER_EMAIL → queued (nothing lost)', send(1) === 'queued' && queueSh.getLastRow() === 2);
  props.BREVO_API_KEY = 'xkeysib-test'; props.SENDER_EMAIL = 'sender@example.org';
  fetch.responses = [201]; fetch.calls = [];
  const sentBrevo = send(2);
  const call = fetch.calls[0];
  const pl = call && JSON.parse(call.o.payload);
  ok('Brevo: POST to the transactional API with api-key header, sender, Reply-To company, html + text', sentBrevo === 'ok' && call.url === 'https://api.brevo.com/v3/smtp/email' &&
    call.o.headers['api-key'] === 'xkeysib-test' && pl.sender.email === 'sender@example.org' && pl.replyTo.email === 'info@elitetravelng.com' && pl.htmlContent && pl.textContent && pl.to[0].email === 'p2@e.co');
  fetch.responses = [503, 201]; fetch.calls = [];
  ok('Brevo 503 → retried once → ok', send(3) === 'ok' && fetch.calls.length === 2);
  fetch.responses = [429, 'throw']; fetch.calls = [];
  ok('Brevo still failing after one retry → queued', send(4) === 'queued' && fetch.calls.length === 2);
  fetch.responses = [400]; fetch.calls = [];
  ok('Brevo 400 (permanent) → failed, not queued, not retried', send(5) === 'failed' && fetch.calls.length === 1 && queueSh.getLastRow() === 3);
  ok('the API key never appears in the logs', !logs.some((l) => /xkeysib/.test(l)) && !JSON.stringify(logRows()).includes('xkeysib'));
  fetch.responses = []; jobs();
  ok('runEmailJobs sends the queue once Brevo works (rows removed)', queueSh.getLastRow() === 1 && logRows().filter((r) => r[1] === 'T|1' && r[4] === 'ok').length === 1);
  ok('a sent key is never sent twice', send(2) === 'duplicate');
  delete props.EMAIL_PROVIDER;

  // --- MailApp quota: queue + reserve for codes ---------------------------------------------------
  mail.quota = C.EMAIL.QUOTA_RESERVE;
  ok('quota at the reserve: normal email queued, not failed', send(6) === 'queued');
  props.TEST_OTP_BYPASS = '';
  resetLimits();
  const codeRes = ctx.sendEmailCode_({ email: 'o@e.co', name: 'Ola' });
  ok('…but a verification code can still use the reserved quota', codeRes.ok && to('o@e.co').length === 1);
  mail.quota = 0;
  const lead0 = ctx.submitContact_({ name: 'TEST Quota', phone: '+234 800 000 0011', enquiryType: 'Hotel Accommodation' });
  ok('quota exhausted: the lead is still saved, its staff alert waits in the queue', lead0.ok && /^EG-GE-/.test(lead0.leadId) &&
    queueSh.getRange(2, 4, queueSh.getLastRow() - 1, 1).getValues().some((r) => r[0] === lead0.leadId));
  clearW(); resetLimits();
  let codeErr = ''; try { ctx.sendEmailCode_({ email: 'o2@e.co', name: 'Ola' }); } catch (e) { codeErr = e.message; }
  ok('quota 0: a code cannot be sent → friendly message with WhatsApp (never queued)', /could not send the code/.test(codeErr) && /WhatsApp/.test(codeErr));
  ok('daily summary data shows the queue size', ctx.collectSummary_().queue >= 2);
  mail.quota = 100; jobs();
  ok('quota back → runEmailJobs sends the queue', queueSh.getLastRow() === 1 && to('staff@example.org').some((m) => m.subject.indexOf(lead0.leadId) !== -1));

  // --- never block a submission -----------------------------------------------------------------
  const realLog = props.EMAIL_LOG_ID; props.EMAIL_LOG_ID = 'missing';
  let blocked = ''; let r9;
  try { r9 = ctx.submitContact_({ name: 'TEST NoLog', phone: '+234 800 000 0012', enquiryType: 'Hotel Accommodation' }); } catch (e) { blocked = e.message; }
  props.EMAIL_LOG_ID = realLog;
  ok('email layer broken (no Email Log) → the submission still succeeds', !blocked && r9 && r9.ok, blocked);

  // --- verification codes ------------------------------------------------------------------------
  resetLimits();
  const codeOf = (addr) => /\n(\d{6})\n/.exec(to(addr).slice(-1)[0].body)[1];
  const verify = (email, code) => { try { return ctx.verifyEmailCode_({ email, code }); } catch (e) { return { ok: false, error: e.message, field: e.field }; } };
  const sendCode = (email, name) => { try { return ctx.sendEmailCode_({ email, name: name || 'Ola' }); } catch (e) { return { ok: false, error: e.message }; } };
  ok('code email: 6 digits, no visitor-typed text (name not included)', sendCode('k@e.co', 'Mallory <a href=x>Click</a>').ok && /^\d{6}$/.test(codeOf('k@e.co')) && !/Mallory|Click|href=x/.test(to('k@e.co')[0].htmlBody + to('k@e.co')[0].body));
  const ce = to('k@e.co')[0];
  ok('code email: code NOT in the subject ("Your Elite Global confirmation code"), sender name + Reply-To info@', ce.subject === 'Your Elite Global confirmation code' &&
    !/\d/.test(ce.subject) && ce.name === C.EMAIL.SENDER_NAME && ce.replyTo === 'info@elitetravelng.com', ce.subject);
  ok('code email: minimal — no image, no link, no button/table, no hidden preheader; code in the HTML and the plain text',
    !/<img |<a |<table|display:none|https?:\/\//.test(ce.htmlBody) && ce.htmlBody.indexOf(codeOf('k@e.co')) !== -1 && /^Hello,\n\nYour confirmation code/.test(ce.body) &&
    !/https?:\/\/|www\./.test(ce.body) && ce.htmlBody.length < 1200, ce.htmlBody.length + ' bytes');
  ok('resend within 60 s refused', /wait a minute/.test(sendCode('k@e.co').error));
  const right = codeOf('k@e.co');
  const wrong = right === '000000' ? '111111' : '000000';
  const w1 = verify('k@e.co', wrong);
  ok('wrong code → error with attempts left', !w1.ok && w1.field === 'code' && /4 attempts left/.test(w1.error), w1.error);
  ok('malformed code → asks for 6 digits', /6-digit/.test(verify('k@e.co', '12ab').error));
  const good = verify('K@E.CO', right);
  ok('right code (any email case) → token', good.ok && typeof good.token === 'string' && good.token.split('.').length === 3, JSON.stringify(good).slice(0, 80));
  ok('token does not contain the email', !/k@e\.co/i.test(good.token) && !/k%40/i.test(good.token));
  ok('a used code cannot be reused', /expired or was replaced/.test(verify('k@e.co', right).error));
  ok('token valid only for its email', ctx.emailTokenValid_(good.token, 'k@e.co') && ctx.emailTokenValid_(good.token, ' K@E.co ') && !ctx.emailTokenValid_(good.token, 'other@e.co'));
  const parts = good.token.split('.');
  ok('tampered token rejected (expiry or hash changed)', !ctx.emailTokenValid_((Number(parts[0]) + 1) + '.' + parts[1] + '.' + parts[2], 'k@e.co') &&
    !ctx.emailTokenValid_(parts[0] + '.' + ctx.sha256Hex_('other@e.co') + '.' + parts[2], 'other@e.co'));
  ok('token expires after 24 hours', (() => { const old = ctx.makeEmailToken_('k@e.co', Date.now() - 25 * 3600 * 1000); return !ctx.emailTokenValid_(old, 'k@e.co'); })());
  clearW(); sendCode('k@e.co');
  for (let i = 0; i < 4; i++) verify('k@e.co', wrong);
  const w5 = verify('k@e.co', wrong);
  ok('5 wrong attempts → "request a new code"; then even the right code fails', /Too many wrong attempts/.test(w5.error) && /expired or was replaced/.test(verify('k@e.co', codeOf('k@e.co')).error), w5.error);
  clearW(); sendCode('k@e.co');
  clock.offset += 31 * MIN;
  ok('code expires after 30 minutes', /expired/.test(verify('k@e.co', codeOf('k@e.co')).error));
  resetLimits();
  const hour = [1, 2, 3, 4, 5, 6].map(() => { clearW(); return sendCode('h@e.co').ok; });
  ok('5 codes per hour per email (6th refused)', hour.slice(0, 5).every(Boolean) && hour[5] === false, hour.join(','));
  resetLimits();
  const cap = []; props.TEST_OTP_BYPASS = 'on';
  for (let i = 0; i <= C.OTP.GLOBAL_HOURLY; i++) cap.push(sendCode('t' + i + '@example.com', 'TEST Cap').ok);
  ok('global hourly cap (' + C.OTP.GLOBAL_HOURLY + ')', cap.slice(0, -1).every(Boolean) && cap[cap.length - 1] === false);
  resetLimits();
  const nb = mail.outbox.length;
  ok('TEST_OTP_BYPASS: TEST name + @example.com → no email, fixed code works', sendCode('qa2@example.com', 'TEST QA').ok && mail.outbox.length === nb &&
    verify('qa2@example.com', C.OTP.TEST_CODE).ok);
  ok('TEST_OTP_BYPASS never applies to other names or domains', sendCode('qa3@example.com', 'Real Person').ok && mail.outbox.length === nb + 1 &&
    sendCode('qa4@e.co', 'TEST QA').ok && mail.outbox.length === nb + 2);
  props.TEST_OTP_BYPASS = '';
  ok('bypass off → TEST names get a real code email', (() => { clearW(); resetLimits(); const n = mail.outbox.length; sendCode('qa5@example.com', 'TEST QA'); return mail.outbox.length === n + 1; })());
  props.SITE_URL = 'https://www.example.org';
  let refused = ''; try { ctx.enableTestOtpBypass(); } catch (e) { refused = e.message; }
  ok('enableTestOtpBypass() (no arguments) refused outside staging', /staging only/.test(refused) && props.TEST_OTP_BYPASS !== 'on');
  delete props.SITE_URL;
  ctx.enableTestOtpBypass();
  ok('enableTestOtpBypass() on staging → on; disableTestOtpBypass() → off', props.TEST_OTP_BYPASS === 'on' && (ctx.disableTestOtpBypass(), !('TEST_OTP_BYPASS' in props)));
  // Run-button settings: no argument → instructions only, nothing changed; edited Script Properties are checked
  const staffBefore = props.STAFF_EMAIL;
  ctx.setStaffEmail(); ctx.setSiteUrl(); ctx.setStaffEmail({ authMode: 'FULL' });
  ok('setStaffEmail() / setSiteUrl() with no argument explain how to edit Script Properties, change nothing',
    props.STAFF_EMAIL === staffBefore && !('SITE_URL' in props) && logs.some((l) => /Script Properties/.test(l) && /STAFF_EMAIL = /.test(l)) && logs.some((l) => /SITE_URL = https/.test(l)));
  props.STAFF_EMAIL = 'staff@example.org, not-an-email';
  ctx.checkEmailSettings();
  ok('checkEmailSettings flags an invalid STAFF_EMAIL entry; only valid addresses are used', ctx.staffEmail_() === 'staff@example.org' && logs.some((l) => /some addresses are not valid/.test(l)));
  props.SITE_URL = 'www.no-https.example'; ctx.checkEmailSettings();
  ok('an invalid SITE_URL is flagged and the default is used', ctx.settings_().siteUrl === 'https://elite-global-staging.netlify.app' && logs.some((l) => /SITE_URL is not a valid https/.test(l)));
  props.STAFF_EMAIL = staffBefore; delete props.SITE_URL;

  // submissions need a valid token for the same email
  resetLimits();
  const base = { name: 'TEST Tok', phone: '+234 800 000 0013', email: 'tok@e.co', country: 'Nigeria', adults: '1', children: '0', infants: '0',
    departureAirport: 'KAN', travelDate: future, flightTicket: 'No', arrivalCity: 'Jeddah', nightsMadinah: '3', nightsMakkah: '4', hotelCategory: '4-star',
    haramDistance: 'Walking distance', visaAssist: 'Yes', budget: 'Above ₦5,000,000', heard: 'Website' };
  const post = (o) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }));
  const noTok = post(Object.assign({ action: 'submitCustomRequest' }, base));
  const otherTok = post(Object.assign({ action: 'submitCustomRequest', emailToken: tok('someone@e.co') }, base));
  const visaNoTok = post({ action: 'createVisaApplication', name: 'TEST Tok', phone: '+234 800 000 0013', email: 'tok@e.co', country: 'Nigeria', travelDate: future,
    departureAirport: 'KAN', flightTicket: 'No', priorKsa: 'No', consent: true, passengers: [{ name: 'TEST P', category: 'Adult (18+)' }] });
  ok('customise without a token / with another email\'s token → refused with reverify', [noTok, otherTok].every((r) => !r.ok && r.field === 'email' && r.reverify === true && /confirm your email/.test(r.error)), JSON.stringify(noTok));
  ok('visa without a token → refused with reverify', !visaNoTok.ok && visaNoTok.reverify === true);
  ok('with the right token → accepted', post(Object.assign({ action: 'submitCustomRequest', emailToken: tok('tok@e.co') }, base)).ok === true);
  ok('honeypot: sendEmailCode pretends, sends nothing', (() => { const n = mail.outbox.length; const r = post({ action: 'sendEmailCode', hp: 'x', email: 'b@e.co' }); return r.ok && mail.outbox.length === n; })());

  // --- daily summary, pruning, samples -----------------------------------------------------------
  edit(vd.leadId, 'Review Status', 'Correction Needed'); setCell(vd.leadId, 'Message to Customer', '');
  setCell(vd.leadId, 'Review Updated', new Date(Date.now() - 4 * 864e5));
  const sum = ctx.collectSummary_();
  ok('summary: counts per Review Status, waiting > 3 days, held', sum.counts['Correction Needed'] >= 1 && sum.waitingReview.some((x) => x.indexOf(vd.leadId) === 0) &&
    sum.held.some((x) => x.indexOf(vd.leadId) === 0) && typeof sum.quota === 'string', JSON.stringify(sum.counts));
  logSh.getRange(2, 1).setValue(new Date(Date.now() - 100 * 864e5)); // make the oldest row 100 days old
  const oldKey = logSh.get(2, 2) + '|' + logSh.get(2, 3), secondKey = logSh.get(3, 2) + '|' + logSh.get(3, 3);
  ok('daily summary sent to STAFF_EMAIL (once per day)', ctx.sendDailySummary() === 'ok' && ctx.sendDailySummary() === 'duplicate' &&
    /Daily summary/.test(to('staff@example.org').slice(-1)[0].subject) && /Email quota left today/.test(to('staff@example.org').slice(-1)[0].htmlBody));
  ok('Email Log rows older than 90 days pruned (newer rows kept)', logSh.get(2, 2) + '|' + logSh.get(2, 3) === secondKey && secondKey !== oldKey, oldKey + ' → ' + logSh.get(2, 2));
  const nS = mail.outbox.length;
  ctx.sendEmailSamples();
  const samples = mail.outbox.slice(nS);
  ok('sendEmailSamples: one of every email type to STAFF_EMAIL', samples.length === 18 && samples.every((m) => m.to === 'staff@example.org' && /^\[SAMPLE \d+\/18\] (Elite Global — |Your Elite Global confirmation code$)/.test(m.subject)), samples.length + '');
  ok('samples are not written to the Email Log', !logRows().some((r) => r[2] === 'sample'));

  // --- deliverability: every email type -----------------------------------------------------------
  const SITE = 'https://elite-global-staging.netlify.app';
  const subj = (m) => m.subject.replace(/^\[SAMPLE \d+\/\d+\] /, '');
  const visible = (h) => h.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  const customer = [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => samples[i]);
  const staffMail = [1, 2, 3, 15, 16, 17].map((i) => samples[i]);
  const va = samples.slice(11, 14);
  const dl = /<td style="border-radius:9px;background:#F5AE00"><a href="https:\/\/elite-global-staging\.netlify\.app\/track\.html\?id=EG-VO-01234"[^>]*>Download your visa<\/a>/;
  ok('samples: Visa Approved with the gold "Download your visa" button (Track link only) in all 3 versions', va.length === 3 && va.every((m) => /Visa approved/.test(m.subject) && dl.test(m.htmlBody) &&
    /Download your visa: https:\/\/elite-global-staging\.netlify\.app\/track\.html\?id=EG-VO-01234\n/.test(m.body)), va.map((m) => m.subject).join(' | '));
  ok('samples: button only (no attachment) · SPECIMEN PDF attached · too large → "please download it from the Track page"',
    !va[0].attachments && !/attached/.test(va[0].body) &&
    va[1].attachments && va[1].attachments.length === 1 && va[1].attachments[0].getName() === 'EG-VO-01234 – Visa 1 of 1.pdf' && /Your visa is attached to this email/.test(va[1].body) &&
    !va[2].attachments && /Your visa is too large to attach — please download it from the Track page\./.test(va[2].body));
  ok('every email has an HTML and a plain-text version (no tags in the text)', samples.every((m) => m.htmlBody && m.body && m.body.length > 200 && !/<\/?(p|a|div|table|tr|td|br|b|img|h1|ul|li|span)\b/i.test(m.body)));
  ok('sender name "Elite Global World Travel & Tours", Reply-To = company email', samples.every((m) => m.name === 'Elite Global World Travel & Tours' && m.replyTo === 'info@elitetravelng.com'));
  const caps = samples.map((m) => (subj(m) + ' ' + visible(m.htmlBody) + ' ' + m.body).replace(/https?:\/\/\S+/g, ' ').match(/\b[A-Z]{4,}\b/g) || []).flat();
  ok('no ALL-CAPS words, no "!!", no urgent / free / act now', caps.length === 0 && samples.every((m) => !/!!|\burgent\b|\bfree\b|act now/i.test(subj(m) + m.htmlBody + m.body)), caps.slice(0, 5).join(','));
  ok('customer emails: no image at all (no remote logo, no tracking pixel)', customer.every((m) => !/<img\b/.test(m.htmlBody)));
  ok('staff emails: only the logo image (alt, width, height)', staffMail.every((m) => (m.htmlBody.match(/<img\b/g) || []).length === 1 &&
    /<img src="https:\/\/elite-global-staging\.netlify\.app\/assets\/brand\/email-logo\.png" width="220" height="141" alt="Elite Global[^"]+"/.test(m.htmlBody)));
  ok('customer emails: at most one link (the button); the code email none', customer.every((m) => (m.htmlBody.match(/<a /g) || []).length <= 1) && !/<a /.test(samples[0].htmlBody));
  const hrefs = customer.map((m) => (m.htmlBody.match(/href="([^"]*)"/g) || []).map((h) => h.slice(6, -1))).flat();
  ok('customer emails: every link is https on SITE_URL (no shorteners, no other domains)', hrefs.length > 0 && hrefs.every((h) => h.indexOf(SITE + '/') === 0), hrefs.filter((h) => h.indexOf(SITE + '/') !== 0).join(','));
  ok('footer: company address, RC number and why the email was sent (all but the minimal code email)', customer.slice(1).every((m) => /RC: 7787410/.test(m.htmlBody) && /No\. 335, Suite 3/.test(m.htmlBody) &&
    /You&#39;re receiving this because you applied on our website\./.test(m.htmlBody) && /You're receiving this because you applied on our website\./.test(m.body)) &&
    staffMail.every((m) => /Staff notification from the Elite Global lead system\./.test(m.body)));
  const inbox = /add info@elitetravelng.com to your contacts\. If you found this in Spam, mark it 'Not spam'\./;
  ok('first confirmations ask to add the company email to contacts (the code email stays minimal)', [4, 5].every((i) => inbox.test(samples[i].body)) && !inbox.test(samples[7].body) && !inbox.test(samples[0].body));
  ok('templates are mostly text (visible text ≥ 12% of the inline-styled HTML of customer emails)', customer.every((m) => visible(m.htmlBody).replace(/\s+/g, ' ').length / m.htmlBody.length > 0.12),
    customer.map((m) => (visible(m.htmlBody).replace(/\s+/g, ' ').length / m.htmlBody.length).toFixed(2)).join(','));

  // --- privacy of logs ---------------------------------------------------------------------------
  const emailLogs = logs.filter((l) => /^(email |sendEmailCode|verifyEmailCode|runEmailJobs|sendDailySummary)/.test(l));
  ok('logs never contain an email address, a name or a code', emailLogs.length > 20 && emailLogs.every((l) => !/@|TEST|Ola|\b\d{6}\b/.test(l)), emailLogs.filter((l) => /@|TEST|Ola|\b\d{6}\b/.test(l)).slice(0, 3).join(' | '));
  ok('Email Log rows hold no addresses', !JSON.stringify(logRows()).includes('@'));
};
