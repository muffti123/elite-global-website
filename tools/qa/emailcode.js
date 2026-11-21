// Email confirmation code (Step 1) for the QA scripts.
//  - mock(page): answers sendEmailCode / verifyEmailCode in the browser (static runs: nothing is sent).
//    Other requests to the web app go through unless `others` is given (a function returning a reply).
//  - confirm(page): presses "Send code", types the code and "Confirm" through the real UI.
//    Live runs (staging) need Script Property TEST_OTP_BYPASS=on, a TEST name and an @example.com email.
const CODE = '246810'; // CONFIG.OTP.TEST_CODE
const json = (o) => ({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });

async function mock(p, others) {
  p.verifyCalls = [];
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (r.isInterceptResolutionHandled && r.isInterceptResolutionHandled()) return;
    if (!r.url().includes('script.google.com')) return r.continue();
    if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    let d = {}; try { d = JSON.parse(r.postData() || '{}'); } catch (e) { d = {}; }
    if (d.action === 'sendEmailCode') { p.verifyCalls.push(d); return r.respond(json({ ok: true, resendIn: 60 })); }
    if (d.action === 'verifyEmailCode') {
      p.verifyCalls.push(d);
      return r.respond(json(d.code === CODE
        ? { ok: true, token: (Date.now() + 864e5) + '.' + 'ab'.repeat(32) + '.mocksig' }
        : { ok: false, field: 'code', error: 'That code is not correct. Please check the latest email from us and try again. (4 attempts left)' }));
    }
    if (others) { const reply = others(d); if (reply) return r.respond(json(reply)); }
    return r.continue();
  });
}

async function confirm(p, timeout = 60000) {
  if (await p.$eval('[data-verify-ok]', (e) => !e.hidden)) return true;
  await p.$eval('[data-verify-send]', (e) => e.click());
  await p.waitForFunction(() => !document.querySelector('[data-verify-code]').hidden || /err/.test(document.querySelector('[data-verify-status]').className), { timeout });
  if (await p.$eval('[data-verify-code]', (e) => e.hidden)) return false;
  await p.$eval('[data-verify-input]', (e) => { e.value = ''; });
  await p.type('[data-verify-input]', CODE);
  await p.$eval('[data-verify-check]', (e) => e.click());
  await p.waitForFunction(() => !document.querySelector('[data-verify-ok]').hidden || /err/.test(document.querySelector('[data-verify-status]').className), { timeout });
  return p.$eval('[data-verify-ok]', (e) => !e.hidden);
}

module.exports = { CODE, mock, confirm };
