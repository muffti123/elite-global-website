// LIVE load test (STAGING ONLY): N customers submit at the same moment — contact, customise and visa (with a
// SPECIMEN passport + photo upload and finalize), a third each. Same retry rules as the website (api.js): busy
// JSON, a non-JSON reply (Google's overload page), HTTP 429/5xx or a network error → wait 2, 5, 10, 20 s (±30 %)
// and send again with the same submission key. Reports the success rate, busy retries, p50/p95 time and
// duplicates (must be 0, counted by the staging-only action loadTestReport). TEST names + @example.com only,
// TEST_OTP_BYPASS must be on (no code emails; no staff alerts for "TEST Load" names). Run cleanupTestData after.
//   node load-live.js <fixturesDir> [N=25, max 50]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [FX, nArg] = process.argv.slice(2);
const N = Math.min(Math.max(parseInt(nArg || '25', 10) || 25, 3), 50);
const STAGING_ID = 'AKfycbzSBOiav81YF7eKJvqLaXJM1p2S6oRXeKVVhsGKgCtMfkdKZUrXr7cC0UQ-bRZ6kjtqXQ';
const cfg = fs.readFileSync(path.join(__dirname, '../../public/assets/js/config.js'), 'utf8');
const URL = (/webAppUrl:\s*'([^']+)'/.exec(cfg) || [])[1] || '';
if (URL.indexOf('/s/' + STAGING_ID + '/exec') === -1) { console.error('Refused: config.js webAppUrl is not the staging web app.'); process.exit(2); }
const TAG = crypto.randomBytes(3).toString('hex').toUpperCase(); // run tag, e.g. 4F2A9C
const WAITS = [2000, 5000, 10000, 20000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => Math.round(ms * (0.7 + Math.random() * 0.6));
const b64 = (f) => fs.readFileSync(path.join(FX, f)).toString('base64');
const PASSPORT = b64('passport.jpg'), PHOTO = b64('photo-40kb.jpg');
const SID_ACTIONS = { submitContact: 1, submitCustomRequest: 1, createVisaApplication: 1 };
let busyRetries = 0, networkRetries = 0;

/** POST like api.js: busy / non-JSON / 429 / 5xx / network → retry with backoff; same body (sid) every time. */
async function call(action, payload) {
  const data = Object.assign({ action }, payload);
  if (SID_ACTIONS[action]) data.sid = 'sid-' + crypto.randomBytes(16).toString('hex');
  const body = JSON.stringify(data);
  for (let b = 0; ; b++) {
    let busy = false, out = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow', signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) busy = true;
      else {
        const text = await res.text();
        try { out = JSON.parse(text); } catch (e) { busy = true; }
        if (out && out.busy) busy = true;
      }
    } catch (e) { busy = true; networkRetries++; }
    if (!busy) return out;
    if (b >= WAITS.length) return { ok: false, busy: true, error: 'still busy after ' + WAITS.length + ' retries' };
    busyRetries++;
    await sleep(jitter(WAITS[b]));
  }
}

const future = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
const tok = async (email, name) => {
  const s1 = await call('sendEmailCode', { hp: '', email, name });
  const s2 = s1 && s1.ok ? await call('verifyEmailCode', { hp: '', email, code: '246810' }) : s1;
  if (!s2 || !s2.ok) throw new Error('email code: ' + (s2 && s2.error));
  return s2.token;
};
async function one(i, kind) {
  const t0 = Date.now();
  const nn = String(i).padStart(4, '0');
  const name = 'TEST Load ' + TAG + ' ' + nn;
  const email = 'qa-load-' + TAG.toLowerCase() + '-' + nn + '@example.com';
  const phone = '+234 800 1' + String(i).padStart(2, '0') + ' ' + String(1000 + i).slice(-4);
  try {
    if (kind === 'contact') {
      const r = await call('submitContact', { hp: '', name, phone, enquiryType: 'Other Travel Enquiry', details: 'Load test. Safe to delete.' });
      return { kind, ok: !!(r && r.ok), id: r && r.leadId, error: r && r.error, ms: Date.now() - t0 };
    }
    const emailToken = await tok(email, name);
    if (kind === 'custom') {
      const r = await call('submitCustomRequest', { hp: '', name, phone, email, country: 'Nigeria', adults: '1', children: '0', infants: '0', departureAirport: 'KAN',
        departureAirportOther: '', travelDate: future, flightTicket: 'No', arrivalCity: 'Jeddah', nightsMadinah: '3', nightsMakkah: '4', hotelCategory: '4-star',
        haramDistance: 'Walking distance', preferredHotel: '', services: [], servicesOther: '', visaAssist: 'Yes', budget: 'I need guidance on the budget',
        experience: '', hotelOrAirline: '', special: 'Load test.', heard: '', emailToken });
      return { kind, ok: !!(r && r.ok), id: r && r.leadId, error: r && r.error, ms: Date.now() - t0 };
    }
    const v = await call('createVisaApplication', { hp: '', name, phone, email, country: 'Nigeria', travelDate: future, departureAirport: 'KAN', departureAirportOther: '',
      flightTicket: 'No', priorKsa: 'No', westernVisa: '', extraInfo: 'Load test.', heard: '', consent: true, emailToken,
      passengers: [{ name: name + ' P1', category: 'Adult (18+)' }] });
    if (!v || !v.ok) return { kind, ok: false, error: 'create: ' + (v && v.error), ms: Date.now() - t0 };
    const u = await call('uploadPassenger', { leadId: v.leadId, token: v.token, index: 1, name: name + ' P1', category: 'Adult (18+)',
      passport: { name: 'passport.jpg', mime: 'image/jpeg', b64: PASSPORT }, photo: { mime: 'image/jpeg', b64: PHOTO } });
    if (!u || !u.ok) return { kind, ok: false, id: v.leadId, error: 'upload: ' + (u && u.error), ms: Date.now() - t0 };
    const f = await call('finalizeVisaApplication', { leadId: v.leadId, token: v.token });
    return { kind, ok: !!(f && f.ok), id: v.leadId, error: f && f.error && 'finalize: ' + f.error, ms: Date.now() - t0 };
  } catch (e) { return { kind, ok: false, error: e.message, ms: Date.now() - t0 }; }
}

(async () => {
  const pre = await call('loadTestReport', { hp: '', tag: TAG });
  if (!pre || !pre.ok) { console.error('Refused: loadTestReport not available — is TEST_OTP_BYPASS on and SITE_URL staging? (' + (pre && pre.error) + ')'); process.exit(2); }
  console.log('Load test ' + TAG + ': ' + N + ' customers at once (contact / customise / visa with upload) → ' + URL.slice(0, 60) + '…');
  const kinds = ['contact', 'custom', 'visa'];
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: N }, (_, i) => one(i + 1, kinds[i % 3])));
  const wall = Date.now() - t0;
  const good = results.filter((r) => r.ok);
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  const rep = await call('loadTestReport', { hp: '', tag: TAG });
  const ids = good.map((r) => r.id);
  const lines = [
    'Success: ' + good.length + ' / ' + N + ' (' + Math.round(good.length / N * 100) + ' %) — ' +
      kinds.map((k) => k + ' ' + results.filter((r) => r.kind === k && r.ok).length + '/' + results.filter((r) => r.kind === k).length).join(', '),
    'Busy retries: ' + busyRetries + ' (of which network-level ' + networkRetries + ')',
    'Time per customer: p50 ' + (q(0.5) / 1000).toFixed(1) + ' s, p95 ' + (q(0.95) / 1000).toFixed(1) + ' s, slowest ' + (ms[ms.length - 1] / 1000).toFixed(1) + ' s; all done in ' + (wall / 1000).toFixed(1) + ' s',
    'Lead IDs unique in the replies: ' + (new Set(ids).size === ids.length ? 'yes' : 'NO'),
    'Tracker rows for this run: ' + (rep && rep.ok ? rep.rows + ' rows, ' + rep.names + ' distinct names → duplicates ' + (rep.rows - rep.names) : 'report failed: ' + (rep && rep.error)),
  ];
  results.filter((r) => !r.ok).forEach((r) => lines.push('  failed ' + r.kind + (r.id ? ' ' + r.id : '') + ': ' + r.error));
  console.log(lines.join('\n'));
  const dup = rep && rep.ok ? rep.rows - rep.names : -1;
  const pass = good.length === N && dup === 0 && rep.rows === N;
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + N + ' simultaneous submissions, 0 duplicates, every lead in the tracker');
  console.log('TEST leads created for tag ' + TAG + ' — run cleanupTestData() in staging.');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
