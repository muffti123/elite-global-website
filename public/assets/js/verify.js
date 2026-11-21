/*
 * Elite Global — email confirmation code (Step 1 of customize-umrah.html and apply-visa.html).
 * "Send code" → the web app emails a 6-digit code (sendEmailCode); the visitor types it
 * (verifyEmailCode) and gets a verified-email token that the submission must carry.
 * The token is kept in sessionStorage with a SHA-256 hash of the email — never the email itself.
 * Changing the email resets the confirmation.
 *
 *   var v = EG.emailVerify({ key: 'custom', box: <[data-verify]>, email: <input>, name: <input>, hp: <input> });
 *   v.validate()  → true when confirmed (otherwise marks the box and focuses it)
 *   v.token()     → token for the payload ('' when not confirmed)
 *   v.reset(msg)  → forget the confirmation (e.g. the server asked to confirm again)
 */
window.EG = window.EG || {};
(function () {
  'use strict';
  var EG = window.EG;
  var RESEND_S = 60;

  function store(key) { return 'eg-email-ok-' + key; }
  function read(key) {
    try { return JSON.parse(window.sessionStorage.getItem(store(key)) || 'null'); } catch (e) { return null; }
  }
  function write(key, value) {
    try {
      if (value) window.sessionStorage.setItem(store(key), JSON.stringify(value));
      else window.sessionStorage.removeItem(store(key));
    } catch (e) { /* private mode: confirmation lasts for this page only */ }
  }
  /** SHA-256 hex of the normalised email (Web Crypto). Resolves '' when unavailable. */
  function hash(email) {
    var norm = String(email || '').trim().toLowerCase();
    if (!norm || !window.crypto || !window.crypto.subtle || !window.TextEncoder) return Promise.resolve('');
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }, function () { return ''; });
  }
  function tokenAlive(t) {
    var x = Number(String(t || '').split('.')[0]);
    return x > Date.now() + 60000;
  }

  EG.emailVerify = function (o) {
    var box = o.box, email = o.email;
    var sendBtn = box.querySelector('[data-verify-send]');
    var codeWrap = box.querySelector('[data-verify-code]');
    var codeIn = box.querySelector('[data-verify-input]');
    var checkBtn = box.querySelector('[data-verify-check]');
    var resendBtn = box.querySelector('[data-verify-resend]');
    var okEl = box.querySelector('[data-verify-ok]');
    var msg = box.querySelector('[data-verify-status]');
    var state = { token: '', email: '', timer: 0, sentTo: '' };

    function say(type, html) { msg.className = 'verify-status' + (type ? ' ' + type : ''); msg.innerHTML = html || ''; }
    function current() { return email.value.trim().toLowerCase(); }
    function spamHelp() {
      return ' No email after a few minutes? Check your spam or junk folder.' + EG.contactFallback();
    }

    function render() {
      var ok = !!state.token && state.email === current();
      box.classList.toggle('confirmed', ok);
      okEl.hidden = !ok;
      sendBtn.hidden = ok || !codeWrap.hidden; // while a code is pending, Resend replaces it
      if (ok) { codeWrap.hidden = true; EG.setInvalid(sendBtn, false); }
    }

    function countdown(s) {
      clearInterval(state.timer);
      var left = s;
      var tick = function () {
        resendBtn.disabled = left > 0;
        resendBtn.textContent = left > 0 ? 'Resend code (' + left + ' s)' : 'Resend code';
        if (left-- <= 0) clearInterval(state.timer);
      };
      tick();
      state.timer = setInterval(tick, 1000);
    }

    function forget() {
      state.token = ''; state.email = ''; write(o.key, null);
    }

    function send() {
      if (!EG.check.email(email)) { email.focus(); return; }
      if (!EG.apiReady()) { say('err', 'Sorry, we cannot send codes right now.' + EG.contactFallback()); return; }
      var addr = current();
      sendBtn.disabled = true; resendBtn.disabled = true;
      var label = sendBtn.textContent;
      sendBtn.textContent = 'Sending…';
      say('', 'Sending a code to ' + EG.escapeHtml(addr) + '…');
      EG.postAction('sendEmailCode', { hp: o.hp ? o.hp.value : '', email: addr, name: o.name ? o.name.value.trim() : '' }, { retries: 0, timeout: 30000 })
        .then(function (res) {
          if (res && res.ok) {
            state.sentTo = addr;
            codeWrap.hidden = false;
            sendBtn.hidden = true;
            codeIn.value = '';
            EG.setInvalid(sendBtn, false);
            say('ok', 'We\'ve sent a 6-digit code to <b>' + EG.escapeHtml(addr) + '</b>. It is valid for 30 minutes.<br>' +
              '<span class="inbox-note" data-inbox-note>' + EG.inboxNote() + '</span>');
            countdown(res.resendIn || RESEND_S);
            codeIn.focus();
            return;
          }
          if (res && res.field === 'email') EG.setInvalid(email, true, res.error);
          say('err', EG.escapeHtml((res && res.error) || 'We could not send the code.') + EG.contactFallback());
          resendBtn.disabled = false;
        }, function () {
          say('err', 'We could not send the code. Please check your connection and try again.' + EG.contactFallback());
          resendBtn.disabled = false;
        })
        .then(function () { sendBtn.disabled = false; sendBtn.textContent = label; });
    }

    function confirm() {
      var code = codeIn.value.replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) {
        EG.setInvalid(codeIn, true, 'Please enter the 6-digit code from the email.');
        codeIn.focus();
        return;
      }
      var addr = state.sentTo || current();
      checkBtn.disabled = true;
      say('', 'Checking the code…');
      EG.postAction('verifyEmailCode', { hp: o.hp ? o.hp.value : '', email: addr, code: code }, { retries: 1, timeout: 30000 })
        .then(function (res) {
          if (res && res.ok && res.token) {
            state.token = res.token; state.email = addr;
            clearInterval(state.timer);
            EG.setInvalid(codeIn, false);
            render();
            say('ok', 'Thank you — you can continue.');
            hash(addr).then(function (h) { if (h && state.email === addr) write(o.key, { t: res.token, h: h }); });
            return;
          }
          EG.setInvalid(codeIn, true, (res && res.error) || 'That code is not correct.');
          say('err', EG.escapeHtml((res && res.error) || 'That code is not correct.') + (/new code/.test(res && res.error) ? '' : spamHelp()));
          codeIn.focus();
          codeIn.select();
        }, function () {
          say('err', 'We could not check the code. Please check your connection and try again.' + EG.contactFallback());
        })
        .then(function () { checkBtn.disabled = false; });
    }

    sendBtn.addEventListener('click', send);
    resendBtn.addEventListener('click', send);
    checkBtn.addEventListener('click', confirm);
    codeIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirm(); }
    });
    codeIn.addEventListener('input', function () {
      var digits = codeIn.value.replace(/\D/g, '').slice(0, 6);
      if (digits !== codeIn.value) codeIn.value = digits;
    });
    // A different email address needs a new confirmation
    email.addEventListener('input', function () {
      if (state.token && state.email !== current()) { forget(); say('', ''); }
      if (state.sentTo && state.sentTo !== current()) { codeWrap.hidden = true; state.sentTo = ''; clearInterval(state.timer); say('', ''); }
      render();
    });

    // Restore a confirmation from this browser tab (same email only)
    var saved = read(o.key);
    function restore() {
      if (!saved || !tokenAlive(saved.t) || !current()) return;
      hash(current()).then(function (h) {
        if (h && h === saved.h && !state.token) {
          state.token = saved.t; state.email = current(); render();
          say('', '');
        }
      });
    }
    if (saved && !tokenAlive(saved.t)) { write(o.key, null); saved = null; }
    restore();
    email.addEventListener('change', restore);
    render();

    return {
      token: function () { return state.token && state.email === current() ? state.token : ''; },
      validate: function () {
        if (state.token && state.email === current()) return true;
        var waiting = !codeWrap.hidden;
        var text = waiting ? 'Please enter the code we emailed you and press Confirm.' : 'Please confirm your email address: press "Send code" and enter the code from the email.';
        EG.setInvalid(waiting ? codeIn : sendBtn, true, text);
        (waiting ? codeIn : sendBtn).focus();
        return false;
      },
      reset: function (message) {
        forget(); codeWrap.hidden = true; state.sentTo = ''; render();
        EG.setInvalid(sendBtn, true, message || 'Please confirm your email address again.');
        say('err', EG.escapeHtml(message || 'Please confirm your email address again.'));
      },
    };
  };
})();
