/*
 * Elite Global — talks to the Apps Script web app (SITE_CONFIG.webAppUrl).
 * Requests are POSTed as text/plain JSON so the browser sends no CORS preflight.
 * The web app always answers JSON: {ok:true, leadId, ...} or {ok:false, error, field?}.
 */
window.EG = window.EG || {};
(function () {
  'use strict';
  var EXEC_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

  function url() { return String((window.SITE_CONFIG || {}).webAppUrl || '').trim(); }

  /** True when webAppUrl is a real /exec URL. */
  window.EG.apiReady = function () { return EXEC_RE.test(url()); };

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function networkError(message) {
    var e = new Error(message);
    e.network = true;
    return e;
  }

  /**
   * POST {action, ...payload}. Resolves with the server's JSON (check .ok).
   * Rejects only on network failure / timeout (err.network = true) after `retries` extra attempts.
   * opts: {timeout: ms (default 30000), retries: n (default 2)}
   */
  window.EG.postAction = function (action, payload, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 30000;
    var retries = opts.retries === undefined ? 2 : opts.retries;
    var body = JSON.stringify(Object.assign({ action: action }, payload || {}));

    function attempt(n) {
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
          if (!res.ok) throw networkError('HTTP ' + res.status);
          return res.json().catch(function () { throw networkError('Unexpected response'); });
        }, function (err) {
          throw networkError(err && err.name === 'AbortError' ? 'Timed out' : 'Network error');
        })
        .then(function (json) { clearTimeout(timer); return json; }, function (err) {
          clearTimeout(timer);
          if (err.network && n < retries) return wait(1500 * Math.pow(2, n)).then(function () { return attempt(n + 1); });
          throw err;
        });
    }
    return attempt(0);
  };
})();
