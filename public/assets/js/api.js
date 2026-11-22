/*
 * Elite Global — talks to the Apps Script web app (SITE_CONFIG.webAppUrl).
 * Requests are POSTed as text/plain JSON so the browser sends no CORS preflight.
 * The web app always answers JSON: {ok:true, leadId, ...} or {ok:false, error, field?}.
 *
 * Busy (round 2.5): {busy:true} from the web app, Google's own "too many requests" HTML page (not JSON), or
 * HTTP 429/5xx mean nothing was done — they are retried automatically after 2, 5, 10 and 20 s (±30 % jitter)
 * while a notice says "We're busy — still sending, please keep this page open". Submits carry a submission
 * key (sid), the same for every retry of the same answers, so a retry never creates a second lead.
 */
window.EG = window.EG || {};
(function () {
  'use strict';
  var EXEC_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  var BUSY_WAITS = [2000, 5000, 10000, 20000];
  var SID_ACTIONS = { submitContact: 1, submitCustomRequest: 1, createVisaApplication: 1, submitCorrection: 1 };
  // Safe to send again after a network error: submits with a submission key, read-only lookups, and uploads /
  // finalize (a repeat replaces what the first one wrote). Google's overload page has no CORS header, so the
  // browser reports it as a network error — for these actions it is handled like busy. Email-code actions are
  // not in this list (a repeat could send a second code).
  var SAFE_ACTIONS = { submitContact: 1, submitCustomRequest: 1, createVisaApplication: 1, submitCorrection: 1, trackApplication: 1,
    endTrackSession: 1, loadCorrection: 1, listVisaFiles: 1, downloadVisaFile: 1, uploadPassenger: 1, uploadDocument: 1,
    finalizeVisaApplication: 1, uploadCorrectionFile: 1 };
  var BUSY_TEXT = 'We\'re busy — still sending, please keep this page open.';

  function url() { return String((window.SITE_CONFIG || {}).webAppUrl || '').trim(); }

  /** True when webAppUrl is a real /exec URL. */
  window.EG.apiReady = function () { return EXEC_RE.test(url()); };

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function jitter(ms) { return Math.round(ms * (0.7 + Math.random() * 0.6)); }
  if (window.EG_TEST && window.EG_TEST.busyWaits) BUSY_WAITS = window.EG_TEST.busyWaits; // QA only: short waits

  function networkError(message) {
    var e = new Error(message);
    e.network = true;
    return e;
  }
  function busyError(message) {
    var e = new Error(message);
    e.busy = true;
    return e;
  }

  // ---- submission key: random, kept per answers (sessionStorage) so a re-click after a lost reply reuses it ----
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function newSid() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return 'sid-' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function sidFor(action, payload) {
    var key = 'eg-sid-' + action + '-' + hash(JSON.stringify(payload));
    try {
      var s = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (s && s.x > Date.now()) return s.v;
      var v = newSid();
      sessionStorage.setItem(key, JSON.stringify({ v: v, x: Date.now() + 6 * 3600000 }));
      return v;
    } catch (e) { return newSid(); } // private mode: still the same key for every retry of this call
  }

  // ---- the busy notice (one per page, aria-live) ----
  var notice = null, busyCount = 0;
  function showBusy(on) {
    busyCount += on ? 1 : -1;
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'busy-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.hidden = true;
      document.body.appendChild(notice);
    }
    var show = busyCount > 0;
    notice.textContent = show ? BUSY_TEXT : '';
    notice.hidden = !show;
  }

  /**
   * POST {action, ...payload}. Resolves with the server's JSON (check .ok).
   * Busy replies are retried 4 times (2, 5, 10, 20 s + jitter); if still busy it resolves {ok:false, busy:true, error}.
   * Network failure / timeout: `retries` extra attempts, then it rejects (err.network = true).
   * opts: {timeout: ms (default 30000), retries: n (default 2), busyRetries: n (default 4),
   *        networkBusy: false = a network error is never waited out like busy (uploads: their own retry loop + Retry button)}
   */
  window.EG.postAction = function (action, payload, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 30000;
    var retries = opts.retries === undefined ? 2 : opts.retries;
    var busyRetries = opts.busyRetries === undefined ? BUSY_WAITS.length : opts.busyRetries;
    var data = Object.assign({ action: action }, payload || {});
    if (SID_ACTIONS[action] && !data.sid) data.sid = sidFor(action, payload || {});
    // With a submission key a lost reply is safe to send again (the server answers the first reply)
    if (data.sid) retries = Math.max(retries, 2);
    var body = JSON.stringify(data);
    var shown = false;

    function attempt(n, b) {
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout);
      return fetch(url(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body,
        redirect: 'follow',
        signal: ctrl ? ctrl.signal : undefined,
      })
        .then(function (res) {
          if (res.status === 429 || res.status >= 500) throw busyError('HTTP ' + res.status);
          if (!res.ok) throw networkError('HTTP ' + res.status);
          // Google's "too many simultaneous requests" page is HTML: busy, nothing was done
          return res.json().catch(function () { throw busyError('Not JSON'); });
        }, function (err) {
          throw networkError(err && err.name === 'AbortError' ? 'Timed out' : 'Network error');
        })
        .then(function (json) {
          clearTimeout(timer);
          if (json && json.busy === true) throw busyError(json.error || 'busy');
          return json;
        })
        .then(function (json) { if (shown) showBusy(false); shown = false; return json; }, function (err) {
          clearTimeout(timer);
          // after the normal retries: wait like busy (not when the caller has its own retry loop — networkBusy:false)
          if (err.network && SAFE_ACTIONS[action] && opts.networkBusy !== false && n >= retries) err.busy = true;
          if (err.busy && b < busyRetries) {
            if (!shown) { shown = true; showBusy(true); }
            return wait(jitter(BUSY_WAITS[Math.min(b, BUSY_WAITS.length - 1)])).then(function () { return attempt(n, b + 1); });
          }
          if (shown) { showBusy(false); shown = false; }
          if (err.busy && !err.network) return { ok: false, busy: true, error: 'We\'re very busy right now. Please try again in a few minutes.' };
          if (err.network && n < retries) return wait(1500 * Math.pow(2, n)).then(function () { return attempt(n + 1, b); });
          throw err;
        });
    }
    return attempt(0, 0);
  };
})();
