/**
 * Deliverability diagnostic (Run button, no arguments). Sends three variants to the address in the Script
 * Property DIAG_TO (set it by hand for the test, delete it afterwards — it is never logged, emailed elsewhere
 * or committed):
 *   A — minimal plain text, no HTML
 *   B — the NEW code email (renderCodeEmail_: no code in the subject, no images, no links)
 *   C — the OLD code email (logo image, links, footer, code in the subject)
 * The codes in B and C are random and not stored: they confirm nothing. Then check which arrived (Inbox / Spam /
 * nothing) and, in the Admin console → Reporting → Email Log Search, which were "Bounced".
 * Sends with MailApp directly (not the Email Log), sender name and Reply-To as every customer email.
 */
function diagExternalEmail() {
  const to = String(PropertiesService.getScriptProperties().getProperty('DIAG_TO') || '').trim();
  if (!/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(to)) {
    throw new Error('Set the Script Property DIAG_TO to ONE test address first (' + SETTINGS_HOWTO + '), then run diagExternalEmail again.');
  }
  const C = CONFIG.COMPANY_INFO;
  const stamp = Utilities.formatDate(new Date(), 'Africa/Lagos', 'd MMM yyyy HH:mm');
  const b = renderCodeEmail_(newCode_());
  const c = renderCodeEmailOld_(newCode_());
  const variants = [
    ['A', { subject: 'Elite Global test message', body: 'Hello,\n\nThis is a short test message from Elite Global World Travel & Tours Ltd.\n\n(Variant A, ' + stamp + ')' }],
    ['B', { subject: b.subject, htmlBody: b.html.replace('</body>', '<p style="color:#8a93a6;font-size:12px">(Variant B, ' + escHtml_(stamp) + ')</p></body>'),
      body: b.text + '\n\n(Variant B, ' + stamp + ')' }],
    ['C', { subject: c.subject, htmlBody: c.html.replace('</body>', '<p style="color:#8a93a6;font-size:12px">(Variant C, ' + escHtml_(stamp) + ')</p></body>'),
      body: c.text + '\n\n(Variant C, ' + stamp + ')' }],
  ];
  const out = [];
  variants.forEach(function (v) {
    const o = Object.assign({ to: to, name: CONFIG.EMAIL.SENDER_NAME, replyTo: C.email }, v[1]);
    try { MailApp.sendEmail(o); out.push(v[0] + ' handed to Gmail'); } catch (e) { out.push(v[0] + ' not sent: ' + noEmails_(e.message)); }
  });
  Logger.log('diagExternalEmail (' + stamp + '): ' + out.join(' · ') + '.\nSubjects: A "' + variants[0][1].subject + '" · B "' + b.subject +
    '" · C "Elite Global — Your email confirmation code: …".\nNow check the test mailbox (Inbox / Spam) and Admin console → Reporting → ' +
    'Email Log Search (Bounced?). Delete DIAG_TO afterwards.');
  return out;
}
