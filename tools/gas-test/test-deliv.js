// Deliverability on a new domain: the "customer emails may be failing" warning and diagExternalEmail. Own mock.
module.exports = function (dir, ok) {
  const g = require('./gasmock')(dir);
  const { ctx, props, mail, logs } = g;
  const C = ctx.__exports.CONFIG;

  // health: codes sent vs confirmed
  ok('Email codes: normal day → counts, no warning', ctx.codeHealthText_({ code: 10, codeOk: 8 }, { code: 2, codeOk: 1 }) === 'yesterday 10 sent · 8 confirmed — today 2 sent · 1 confirmed');
  ok('… most codes never confirmed → "⚠️ customer emails may be failing" + where to look', /^⚠️ customer emails may be failing \(.*today 6 sent · 1 confirmed\)\. Check Admin console → Reporting → Email Log Search/.test(ctx.codeHealthText_({}, { code: 6, codeOk: 1 })));
  ok('… a failed send warns too; very few codes do not', /^⚠️/.test(ctx.codeHealthText_({ code: 1, codeOk: 1, mailFail: 1 }, {})) && !/⚠️/.test(ctx.codeHealthText_({ code: 3, codeOk: 0 }, {})));
  Object.assign(props, { OWNER_EMAIL: 'test@example.com', STAFF_EMAIL: 'test@example.com' });
  ctx.setupEliteGlobal();
  const sent0 = mail.outbox.length;
  ctx.sendEmailCode_({ email: 'cust@e.co', name: 'Ola' });
  const code = /\n(\d{6})\n/.exec(mail.outbox[sent0].body)[1];
  ctx.verifyEmailCode_({ email: 'cust@e.co', code: code });
  const today = ctx.healthGet_(ctx.healthKey_());
  ok('a sent code and a confirmed code are counted (health record of today)', today.code === 1 && today.codeOk === 1, JSON.stringify(today));
  ok('System health / daily summary has the "Email codes" row', ctx.healthRows_().some((r) => r[0] === 'Email codes' && /today 1 sent · 1 confirmed/.test(r[1])));

  // diagExternalEmail
  let e1 = '';
  try { ctx.diagExternalEmail(); } catch (e) { e1 = e.message; }
  ok('diagExternalEmail without DIAG_TO: refuses, sends nothing', /DIAG_TO/.test(e1) && mail.outbox.length === sent0 + 1);
  props.DIAG_TO = 'probe@example.net';
  const from = logs.length, before = mail.outbox.length;
  ctx.diagExternalEmail();
  const d = mail.outbox.slice(before);
  ok('diagExternalEmail: 3 variants to DIAG_TO only, sender name + Reply-To info@', d.length === 3 && d.every((m) => m.to === 'probe@example.net' && m.name === C.EMAIL.SENDER_NAME && m.replyTo === 'info@elitetravelng.com'));
  ok('… A plain text only; B the new code email (no code in the subject, no link/image); C the old one (code in the subject, logo, links)',
    !d[0].htmlBody && /Variant A/.test(d[0].body) &&
    d[1].subject === 'Your Elite Global confirmation code' && !/<a |<img /.test(d[1].htmlBody) && /Variant B/.test(d[1].body) &&
    /^Elite Global — Your email confirmation code: \d{6}$/.test(d[2].subject) && /<img /.test(d[2].htmlBody) && /<a /.test(d[2].htmlBody) && /Variant C/.test(d[2].body));
  const out = logs.slice(from).join('\n');
  ok('… the log names no address and no code', /diagExternalEmail/.test(out) && !/@/.test(out) && !/\b\d{6}\b/.test(out), out.slice(0, 200));
  ok('… nothing written to the Email Log (a diagnostic, not a customer email)', !ctx.emailLogSheet_().getRange(1, 1, Math.max(ctx.emailLogSheet_().getLastRow(), 1), 7).getValues().some((r) => /diag/.test(String(r[2]))));
};
