/**
 * Email verification (customize-umrah.html and apply-visa.html, Step 1):
 *   sendEmailCode {email, name}  → a 6-digit code by email, valid 30 minutes
 *   verifyEmailCode {email, code} → {ok, token}: a verified-email token valid 24 hours
 * createVisaApplication and submitCustomRequest require a token that matches the submitted email.
 *
 *  - Only a salted hash of the code is stored (CacheService, under a hashed email key).
 *  - Resend after 60 s, 5 codes per hour per email, a global hourly cap, 5 wrong attempts per code.
 *  - The token is "<expiry>.<sha256(email)>.<HMAC>" (secret OTP_SECRET in Script Properties):
 *    stateless and never containing the email itself.
 *  - The code email contains no text typed by the visitor (it cannot be used to send spam).
 *  - Staging only (enableTestOtpBypass / disableTestOtpBypass): TEST_OTP_BYPASS=on lets TEST names with @example.com emails use
 *    CONFIG.OTP.TEST_CODE without an email being sent.
 *  - Never log the email, the code or the token.
 */

const OTP_WRONG = 'That code is not correct. Please check the latest email from us and try again.';
const OTP_EXPIRED = 'This code has expired or was replaced. Please request a new code.';
const OTP_VERIFY_FIRST = 'Please confirm your email address with the code we sent you.';

function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function otpSecret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('OTP_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('OTP_SECRET', s); }
  return s;
}

function otpKey_(email) { return 'OTP_' + sha256Hex_('otp|' + email).slice(0, 40); }
function codeHash_(code, email) { return sha256Hex_(code + '|' + email + '|' + otpSecret_()); }

/** 6 random digits from two UUIDs (random v4 hex). */
function newCode_() {
  const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/[^0-9a-f]/gi, '');
  return String(parseInt(hex.slice(0, 12), 16) % 1000000).padStart(6, '0');
}

function testBypassOn_() {
  return PropertiesService.getScriptProperties().getProperty('TEST_OTP_BYPASS') === 'on';
}

/** Editor (staging only): setTestOtpBypass(true) / setTestOtpBypass(false). */
function setTestOtpBypass(on) {
  const p = PropertiesService.getScriptProperties();
  if (on) {
    const site = settings_().siteUrl;
    if (!/staging/i.test(site)) throw new Error('TEST_OTP_BYPASS is for staging only (SITE_URL is ' + site + ').');
    p.setProperty('TEST_OTP_BYPASS', 'on');
    Logger.log('TEST_OTP_BYPASS on: TEST names with @example.com emails can use code ' + CONFIG.OTP.TEST_CODE + '. Turn it off after testing.');
  } else {
    p.deleteProperty('TEST_OTP_BYPASS');
    Logger.log('TEST_OTP_BYPASS off.');
  }
}

/** Run button (staging only): turn the test code on for TEST names with @example.com emails. */
function enableTestOtpBypass() { setTestOtpBypass(true); }
/** Run button: turn the test code off (do this after testing). */
function disableTestOtpBypass() { setTestOtpBypass(false); }

function renderCodeEmail_(code) {
  return renderEmail_({
    subject: 'Elite Global — Your email confirmation code: ' + code,
    preheader: 'Your code is ' + code + '. It is valid for 30 minutes.',
    heading: 'Confirm your email address',
    paragraphs: ['Use this code on the Elite Global website to confirm your email address:'],
    box: { title: 'Your code', text: code },
    small: ['The code is valid for 30 minutes. If you did not ask for it, you can ignore this email.'].concat(inboxSmall_()),
  });
}

// ---------------------------------------------------------------------
// ACTION: sendEmailCode
// ---------------------------------------------------------------------
function sendEmailCode_(d) {
  const O = CONFIG.OTP;
  const email = vEmail_(d.email, 'email');
  const name = str_(d.name, CONFIG.LIMITS.NAME_MAX);
  const cache = CacheService.getScriptCache();
  const key = otpKey_(email);
  if (cache.get(key + '_W')) fail_('Please wait a minute before asking for another code.', 'email');
  rateLimit_('otp:' + email, O.HOURLY_MAX, 3600,
    'You have asked for ' + O.HOURLY_MAX + ' codes in the last hour. Please wait a while, or contact us on WhatsApp.');
  rateLimit_('otp:all', O.GLOBAL_HOURLY, 3600,
    'We cannot send codes right now. Please try again later, or contact us on WhatsApp.');

  const bypass = testBypassOn_() && isTestLead_(name, email);
  const code = bypass ? O.TEST_CODE : newCode_();
  if (!bypass) {
    const m = renderCodeEmail_(code);
    const r = sendEmail_({ to: email, kind: 'code', urgent: true, subject: m.subject, html: m.html, text: m.text });
    if (r !== 'ok') fail_('We could not send the code right now. Please try again in a few minutes, or contact us on WhatsApp.', 'email');
  }
  cache.put(key, JSON.stringify({ h: codeHash_(code, email), x: Date.now() + O.TTL_S * 1000, n: 0 }), O.TTL_S);
  cache.put(key + '_W', '1', O.RESEND_S);
  console.log('sendEmailCode ' + (bypass ? 'test' : 'sent'));
  return { ok: true, resendIn: O.RESEND_S };
}

// ---------------------------------------------------------------------
// ACTION: verifyEmailCode
// ---------------------------------------------------------------------
function verifyEmailCode_(d) {
  const O = CONFIG.OTP;
  const email = vEmail_(d.email, 'email');
  const code = String(d.code === undefined || d.code === null ? '' : d.code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) fail_('Please enter the 6-digit code from the email.', 'code');
  const cache = CacheService.getScriptCache();
  const key = otpKey_(email);
  let entry = null;
  try { entry = JSON.parse(cache.get(key) || 'null'); } catch (e) { entry = null; }
  if (!entry || Date.now() > entry.x) { cache.remove(key); fail_(OTP_EXPIRED, 'code'); }
  if (entry.h !== codeHash_(code, email)) {
    entry.n += 1;
    if (entry.n >= O.ATTEMPTS) {
      cache.remove(key);
      console.log('verifyEmailCode locked');
      fail_('Too many wrong attempts. Please request a new code.', 'code');
    }
    cache.put(key, JSON.stringify(entry), Math.max(1, Math.ceil((entry.x - Date.now()) / 1000)));
    console.log('verifyEmailCode wrong');
    const left = O.ATTEMPTS - entry.n;
    fail_(OTP_WRONG + ' (' + left + (left === 1 ? ' attempt' : ' attempts') + ' left)', 'code');
  }
  cache.remove(key);
  console.log('verifyEmailCode ok');
  return { ok: true, token: makeEmailToken_(email) };
}

// ---------------------------------------------------------------------
// VERIFIED-EMAIL TOKEN
// ---------------------------------------------------------------------
function tokenSig_(body) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, otpSecret_())).replace(/=+$/, '');
}

function makeEmailToken_(email, nowMs) {
  const x = (nowMs || Date.now()) + CONFIG.OTP.TOKEN_H * 3600 * 1000;
  const body = x + '.' + sha256Hex_(String(email).trim().toLowerCase());
  return body + '.' + tokenSig_(body);
}

function emailTokenValid_(token, email) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0])) return false;
  const body = parts[0] + '.' + parts[1];
  if (tokenSig_(body) !== parts[2]) return false;
  if (Number(parts[0]) < Date.now()) return false;
  return parts[1] === sha256Hex_(String(email).trim().toLowerCase());
}

/** createVisaApplication / submitCustomRequest: the email must have been confirmed with a code. */
function requireEmailToken_(token, email) {
  if (!emailTokenValid_(token, email)) fail_(OTP_VERIFY_FIRST, 'email', { reverify: true });
}
