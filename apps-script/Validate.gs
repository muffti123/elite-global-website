/**
 * Server-side validation for the web app. Every rule the website checks is checked again here,
 * because anyone can POST to the web app directly.
 * Never log request bodies, answers or file contents from this file.
 */

const PHONE_RE = /^\+?[0-9][0-9 ()\-]{6,19}$/; // same as the website
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Throws an error whose message is safe to show to the customer. */
function fail_(message, field, extra) {
  const err = new Error(message);
  err.userFacing = true;
  if (field) err.field = field;
  if (extra) Object.keys(extra).forEach(function (k) { err[k] = extra[k]; });
  throw err;
}

/** Trim, strip control characters (keeping newlines when multiline) and cap the length. */
function str_(value, max, multiline) {
  if (value === undefined || value === null) return '';
  let s = String(value);
  s = multiline
    ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    : s.replace(/[\u0000-\u001F\u007F]+/g, ' ');
  s = s.trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** Stops customer text being treated as a spreadsheet formula. Phone numbers stay as they are. */
function safeCell_(value) {
  if (typeof value !== 'string' || value === '') return value;
  if (/^[=@]/.test(value)) return "'" + value;
  if (/^[+\-]/.test(value) && !/^\+?[0-9][0-9 ()\-]*$/.test(value)) return "'" + value;
  return value;
}

function vName_(value, field, label) {
  const s = str_(value, CONFIG.LIMITS.NAME_MAX);
  if (s.length < 2) fail_('Please enter ' + (label || 'your full name') + '.', field);
  return s;
}

function vPhone_(value, field) {
  const s = str_(value, 30);
  if (!PHONE_RE.test(s)) fail_('Please enter a valid phone / WhatsApp number, e.g. +234 803 000 0000.', field);
  return s;
}

function vEmail_(value, field) {
  const s = str_(value, 254).toLowerCase();
  if (!EMAIL_RE.test(s)) fail_('Please enter a valid email address, e.g. name@example.com.', field);
  return s;
}

function vText_(value, required, field, label, max) {
  const s = str_(value, max || CONFIG.LIMITS.NAME_MAX);
  if (required && !s) fail_('Please enter ' + label + '.', field);
  return s;
}

/**
 * Departure airport: an IATA code from the list for the chosen country (Nigeria: LISTS.AIRPORTS_NG,
 * others: AIRPORTS in Airports.gs), or "OTHER" with the airport typed in. Returns a readable label,
 * e.g. "Lagos – Murtala Muhammed International Airport (LOS)" or "Other: Kumasi".
 */
function vAirport_(code, other, country) {
  const c = str_(code, 10);
  if (!c) fail_('Please choose your departure airport.', 'departureAirport');
  if (c === 'OTHER') {
    const t = str_(other, CONFIG.LIMITS.NAME_MAX);
    if (t.length < 2) fail_('Please type your departure airport or city.', 'departureAirportOther');
    return 'Other: ' + t;
  }
  const list = country === 'Nigeria' ? LISTS.AIRPORTS_NG : (AIRPORTS[country] || []);
  const a = list.filter(function (x) { return x[0] === c; })[0];
  if (!a) fail_('Please choose a departure airport from the list, or "Other (type it)".', 'departureAirport');
  return (a[2] ? a[2] + ' – ' : '') + a[1] + ' (' + a[0] + ')';
}

function vLong_(value) {
  return str_(value, CONFIG.LIMITS.TEXT_MAX, true);
}

function vOneOf_(value, list, required, field, label) {
  const s = str_(value, 200);
  if (!s) {
    if (required) fail_('Please choose ' + label + '.', field);
    return '';
  }
  if (list.indexOf(s) === -1) fail_('Please choose a valid option for ' + label + '.', field);
  return s;
}

function vManyOf_(value, list, field, label) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) fail_('Please choose valid options for ' + label + '.', field);
  const seen = {};
  return value.map(function (v) { return str_(v, 200); }).filter(function (v) {
    if (list.indexOf(v) === -1) fail_('Please choose valid options for ' + label + '.', field);
    if (seen[v]) return false;
    seen[v] = true;
    return true;
  });
}

/** Whole number in [min, max]. Returns '' when optional and empty. */
function vInt_(value, required, field, label, min, max) {
  const s = str_(value, 10);
  if (s === '') {
    if (required) fail_('Please enter ' + label + '.', field);
    return '';
  }
  if (!/^[0-9]{1,3}$/.test(s)) fail_('Please enter a whole number for ' + label + '.', field);
  const n = Number(s);
  if (n < min || n > max) fail_(label.charAt(0).toUpperCase() + label.slice(1) + ' must be between ' + min + ' and ' + max + '.', field);
  return n;
}

/** 'YYYY-MM-DD', today (Lagos time) or later. Returns '' when optional and empty. */
function vDate_(value, required, field, label) {
  const s = str_(value, 10);
  if (!s) {
    if (required) fail_('Please choose ' + label + '.', field);
    return '';
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m && new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!d || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    fail_('Please choose a valid date for ' + label + '.', field);
  }
  const today = Utilities.formatDate(new Date(), 'Africa/Lagos', 'yyyy-MM-dd');
  if (s < today) fail_('Please choose a date from today onwards for ' + label + '.', field);
  return s;
}

// ---------------------------------------------------------------------
// Rate limit: `max` calls per `windowS` seconds, per key (defaults: RATE_MAX create/submit calls per
// RATE_WINDOW_S). The key (email, phone, Lead ID) is hashed so no personal data sits in the cache.
// ---------------------------------------------------------------------
function rateLimit_(key, max, windowS, message) {
  max = max || CONFIG.LIMITS.RATE_MAX;
  windowS = windowS || CONFIG.LIMITS.RATE_WINDOW_S;
  const cache = CacheService.getScriptCache();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(key).toLowerCase());
  const cacheKey = 'RL_' + Utilities.base64EncodeWebSafe(digest).slice(0, 43);
  const now = Date.now();
  const windowMs = windowS * 1000;

  let entry = null;
  try { entry = JSON.parse(cache.get(cacheKey) || 'null'); } catch (e) { entry = null; }
  if (!entry || now - entry.s >= windowMs) entry = { s: now, n: 0 };
  if (entry.n >= max) {
    fail_(message || 'Too many requests. Please wait a few minutes and try again.');
  }
  entry.n += 1;
  const ttl = Math.max(1, Math.ceil((entry.s + windowMs - now) / 1000));
  cache.put(cacheKey, JSON.stringify(entry), ttl);
}

// ---------------------------------------------------------------------
// Files: decode base64, check real type by magic bytes, check size.
// ---------------------------------------------------------------------
const FILE_TYPES = {
  pdf: { mime: 'application/pdf', ext: 'pdf' },
  jpg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
};

function decodeFile_(file, field, label) {
  if (!file || typeof file.b64 !== 'string' || !file.b64) fail_('Please add ' + label + '.', field);
  try {
    return Utilities.base64Decode(file.b64);
  } catch (e) {
    fail_(label.charAt(0).toUpperCase() + label.slice(1) + ' could not be read. Please choose the file again.', field);
  }
}

/** Returns FILE_TYPES.pdf / jpg / png from the first bytes, or null. Bytes are signed in Apps Script. */
function sniffType_(bytes) {
  const b = function (i) { return i < bytes.length ? bytes[i] & 0xFF : -1; };
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2D) return FILE_TYPES.pdf;
  if (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return FILE_TYPES.jpg;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47 &&
      b(4) === 0x0D && b(5) === 0x0A && b(6) === 0x1A && b(7) === 0x0A) return FILE_TYPES.png;
  return null;
}

function normMime_(mime) {
  const m = String(mime || '').toLowerCase().trim();
  return m === 'image/jpg' || m === 'image/pjpeg' ? 'image/jpeg' : m;
}

/** Checks the declared type agrees with the real type. Returns {bytes, type}. */
function checkFile_(file, allowed, field, label) {
  const bytes = decodeFile_(file, field, label);
  const type = sniffType_(bytes);
  if (!type || allowed.indexOf(type.ext) === -1) {
    fail_(label.charAt(0).toUpperCase() + label.slice(1) + ' must be a real ' +
      allowed.map(function (e) { return e.toUpperCase(); }).join(', ').replace(/, ([^,]*)$/, ' or $1') +
      ' file.', field);
  }
  if (file.mime && normMime_(file.mime) !== type.mime) {
    fail_(label.charAt(0).toUpperCase() + label.slice(1) + ' is not the type its name says. Please choose the original file.', field);
  }
  return { bytes: bytes, type: type };
}
