/*
 * Track my application (track.html) → web app trackApplication {leadId, contact} or {session}.
 * The email/phone is only ever sent in the POST body: it is never put in the URL, stored or logged.
 * ?id=EG-VO-00012 prefills the reference number. Everything shown comes back as plain text and is
 * written with textContent.
 *
 * Session: a successful lookup returns a session token (no email or phone inside). It is kept in
 * sessionStorage (this tab only), so a refresh or reopening in the same tab shows the status again.
 * It ends on Log out, when the tab is closed, after 60 minutes without activity, or after 8 hours.
 *
 * Correction Needed (visa): "Make the correction" sends a code to the email on the application
 * (shown masked), and a correct code opens correct-visa.html with a correction token (sessionStorage).
 *
 * Visa Approved (visa, at least one file): "Download your visa" — the same email code, then a download
 * token (30 minutes, kept in memory only) and the list of files; each file comes back as base64 through the
 * web app and is saved from the browser. No Drive link is ever used.
 *
 * Live updates: while the status is shown and the tab is visible, the status is checked every 2 minutes
 * ({session, poll: true}: no new token, so it is not activity). Paused while the tab is hidden, checked
 * once when it is visible again. Changes are shown and announced; 3 failed checks in a row show a note.
 */
(function () {
  'use strict';
  var EG = window.EG, $ = EG.$;
  var form = $('#trackForm'), F = form.elements;
  var formPanel = $('#trackFormPanel'), result = $('#trackResult');
  var status = $('#trackStatus'), btn = $('#trackBtn'), restoring = $('#trackRestoring');
  var ID_RE = /^EG-(VO|CE|GE)-\d{5}$/;
  var GENERIC = 'We couldn\'t find an application with those details. Please check your reference number and the email or phone number you used.';
  var ENDED = 'Please look up your application again.';
  var KEY = 'eg-track', CORR_KEY = 'eg-corr';
  var IDLE_MS = 60 * 60000, REFRESH_BEFORE_MS = 30 * 60000;
  // Live updates. window.EG_TEST (QA only) can shorten the timers.
  var T = window.EG_TEST || {};
  var POLL_MS = T.pollMs || 2 * 60000, VISIBLE_GAP_MS = T.visibleGapMs || 30000, POLL_FAILS_NOTE = 3;

  function normId(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }
  function contactOk(v) {
    v = String(v || '').trim();
    return v.indexOf('@') !== -1 ? EG.EMAIL_RE.test(v) : EG.PHONE_RE.test(v);
  }

  // ---- session storage (token + last activity; never the email or phone) ----
  function load() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: no restore */ } }
  function clear() { try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(CORR_KEY); } catch (e) { /* ignore */ } }
  var current = null; // {t: token, a: last activity ms, id: Lead ID}
  function setSession(token, id) { current = { t: token, a: Date.now(), id: id }; save(current); }

  // ?id= prefill (reference number only — never an email or phone)
  var q = '';
  try { q = new URLSearchParams(window.location.search).get('id') || ''; } catch (e) { q = ''; }
  if (ID_RE.test(normId(q))) F.leadId.value = normId(q);

  EG.clearOnInput(form);
  F.leadId.addEventListener('blur', function () { if (F.leadId.value) F.leadId.value = normId(F.leadId.value); });

  function validate() {
    var okId = EG.setInvalid(F.leadId, !ID_RE.test(normId(F.leadId.value)));
    var okC = EG.setInvalid(F.contact, !contactOk(F.contact.value));
    if (!okId) F.leadId.focus(); else if (!okC) F.contact.focus();
    return okId && okC;
  }

  function showStatus(type, html) { status.className = 'status ' + type; status.innerHTML = html; }

  // Deliverability note (WhatsApp link from SITE_CONFIG)
  var inbox = $('[data-inbox-note]');
  if (inbox) inbox.innerHTML = EG.inboxNote('We email you about every update.');

  var STAGE_TONE = {
    'Confirmed': 'ok', 'Closed': 'closed', 'Upload not finished': 'warn', 'Waiting for your reply': 'warn', 'Awaiting payment': 'warn',
    // visa review stages
    'Action needed': 'action', 'Documents verified': 'ok', 'Visa approved': 'ok',
  };

  function set(name, value) {
    var el = result.querySelector('[data-r="' + name + '"]');
    el.textContent = value || '';
    return el;
  }

  function render(r, quiet) {
    set('leadId', r.leadId);
    set('stage', r.stage).setAttribute('data-tone', STAGE_TONE[r.stage] || 'info');
    set('service', r.service);
    set('received', r.received);
    set('description', r.description);
    set('nextStep', r.nextStep);
    set('upload', r.upload);
    result.querySelector('[data-r-upload]').hidden = !r.upload;
    set('message', r.message);
    var box = result.querySelector('[data-r-msgbox]'), nextBox = result.querySelector('.next-step');
    var action = r.stage === 'Action needed';
    box.hidden = !r.message;
    box.classList.toggle('action', action);
    box.querySelector('b').textContent = action ? 'What we need from you' : 'Message from our team';
    // Action needed: the staff message comes first, before the next step
    if (action) nextBox.parentNode.insertBefore(box, nextBox); else nextBox.parentNode.insertBefore(box, nextBox.nextSibling);
    // "Make the correction": only when the server says this visa application can be corrected now
    var corr = $('#correctBox');
    var was = !corr.hidden;
    corr.hidden = !r.canCorrect;
    if (!r.canCorrect || !was) resetCorrection();
    // "Download your visa": only when the server says the approved visa can be downloaded now
    var vbox = $('#visaBox');
    var vwas = !vbox.hidden;
    vbox.hidden = !r.canDownload;
    if (!r.canDownload || !vwas) resetVisa();
    formPanel.hidden = true;
    restoring.hidden = true;
    result.hidden = false;
    status.className = 'status';
    status.textContent = '';
    if (r.session) setSession(r.session, r.leadId);
    lastView = viewKey(r);
    checked();
    schedulePoll();
    if (quiet) return;
    $('#trackLive').textContent = 'Application ' + r.leadId + ': ' + r.stage + '.';
    $('#resultTitle').focus();
  }

  /** Back to the lookup form (Log out, Track another, expired session). */
  function backToForm(message) {
    var had = current;
    if (had && had.t) EG.postAction('endTrackSession', { session: had.t }, { retries: 0, timeout: 15000 }).then(null, function () {});
    current = null;
    clear();
    stopPolling();
    resetCorrection();
    resetVisa();
    result.hidden = true;
    restoring.hidden = true;
    formPanel.hidden = false;
    F.contact.value = '';
    $('#trackLive').textContent = '';
    if (message) showStatus('err', EG.escapeHtml(message));
    else { status.className = 'status'; status.textContent = ''; }
    if (had && had.id && !F.leadId.value) F.leadId.value = had.id;
    F.leadId.focus();
    F.leadId.select();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.className = 'status';
    if (F.company_website.value) { showStatus('err', EG.escapeHtml(GENERIC)); return; } // bot
    if (!validate()) { showStatus('err', 'Please correct the highlighted fields and try again.'); return; }
    if (!EG.apiReady()) { showStatus('err', 'Sorry, tracking is temporarily unavailable.' + EG.contactFallback()); return; }
    if (!navigator.onLine) { showStatus('err', 'You appear to be offline. Please check your connection and try again.' + EG.contactFallback()); return; }

    btn.disabled = true;
    var label = btn.innerHTML;
    btn.innerHTML = '<span class="sending" aria-hidden="true"></span>Checking…';
    var id = normId(F.leadId.value);
    F.leadId.value = id;
    EG.postAction('trackApplication', { hp: F.company_website.value, leadId: id, contact: F.contact.value.trim() }, { retries: 0, timeout: 30000 })
      .then(function (res) {
        if (res && res.ok) { F.contact.value = ''; render(res); return; }
        showStatus('err', EG.escapeHtml((res && res.error) || GENERIC) + EG.contactFallback());
      }, function () {
        showStatus('err', 'Sorry, we could not check your application. Please check your connection and try again.' + EG.contactFallback());
      })
      .then(function () { btn.disabled = false; btn.innerHTML = label; });
  });

  $('#trackAgain').addEventListener('click', function () { backToForm(''); });
  $('#trackLogout').addEventListener('click', function () { backToForm(''); showStatus('ok', 'You have logged out.'); });

  // ---- live updates: every 2 minutes while visible; polling is not activity ------------------------
  var pollTimer = 0, lastPoll = 0, pollFails = 0, lastView = '', updatedTimer = 0;
  var checkedAt = $('#trackCheckedAt'), updatedEl = $('#trackUpdated'), offlineEl = $('#trackOffline');
  function viewKey(r) {
    return JSON.stringify([r.stage, r.description, r.nextStep, r.message || '', r.upload || '', !!r.canCorrect, !!r.canDownload]);
  }
  function hhmm(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function checked() { lastPoll = Date.now(); checkedAt.textContent = 'Last checked ' + hhmm(new Date()); }
  function stopPolling() {
    clearTimeout(pollTimer);
    pollTimer = 0;
    pollFails = 0;
    offlineEl.hidden = true;
    updatedEl.hidden = true;
    result.classList.remove('track-flash');
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = 0;
    if (!current || result.hidden || document.hidden) return;
    pollTimer = setTimeout(poll, POLL_MS);
  }
  function pollFailed() {
    pollFails++;
    if (pollFails >= POLL_FAILS_NOTE) offlineEl.hidden = false; // quiet until then: try again next time
    schedulePoll();
  }
  function poll() {
    pollTimer = 0;
    if (!current || result.hidden || document.hidden) return;
    if (Date.now() - current.a > IDLE_MS) { backToForm(ENDED); return; }
    lastPoll = Date.now();
    var token = current.t;
    EG.postAction('trackApplication', { session: token, poll: true }, { retries: 0, busyRetries: 0, timeout: 30000 } /* the next poll is the retry */).then(function (res) {
      if (!current) return; // logged out meanwhile
      if (res && res.ok) {
        pollFails = 0;
        offlineEl.hidden = true;
        var changed = viewKey(res) !== lastView;
        if (changed) {
          render(res, true);
          $('#trackLive').textContent = 'Your application was updated: ' + res.stage + '. ' + (res.nextStep || '');
          updatedEl.hidden = false;
          result.classList.remove('track-flash');
          void result.offsetWidth; // restart the highlight
          result.classList.add('track-flash');
          clearTimeout(updatedTimer);
          updatedTimer = setTimeout(function () { result.classList.remove('track-flash'); }, 2500);
        } else {
          updatedEl.hidden = true;
          checked();
          schedulePoll();
        }
        return;
      }
      if (res && res.error === GENERIC) { backToForm(ENDED); return; } // the session ended on the server
      pollFailed();
    }, pollFailed);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(pollTimer); pollTimer = 0; return; }
    if (!current || result.hidden) return;
    if (Date.now() - lastPoll >= VISIBLE_GAP_MS) poll(); // back on the tab: one check now …
    else schedulePoll();                                 // … unless the last one was just now
  });

  // ---- restore after a refresh / reopen in the same tab ------------------------------------------
  function lookupWithSession(quiet) {
    if (!current) return Promise.resolve(false);
    return EG.postAction('trackApplication', { session: current.t }, { retries: 1, timeout: 30000 }).then(function (res) {
      if (res && res.ok) { render(res, quiet); return true; }
      backToForm(ENDED);
      return false;
    }, function () {
      if (!quiet) { restoring.hidden = true; if (result.hidden) formPanel.hidden = false; }
      if (!quiet) showStatus('err', 'Sorry, we could not check your application. Please check your connection and try again.' + EG.contactFallback());
      return false;
    });
  }

  var stored = load();
  var qid = ID_RE.test(normId(q)) ? normId(q) : '';
  if (stored && stored.t && EG.apiReady()) {
    var tokenIdle = Number(String(stored.t).split('.')[0]) || 0;
    if (Date.now() - (stored.a || 0) > IDLE_MS || tokenIdle < Date.now()) { current = stored; backToForm(ENDED); }
    else if (qid && stored.id && qid !== stored.id) { clear(); } // a link for another application: look it up
    else {
      current = stored;
      formPanel.hidden = true;
      restoring.hidden = false;
      lookupWithSession(false);
    }
  }

  // ---- activity: 60 minutes without activity ends the session; activity keeps the token fresh ----
  var lastSave = 0;
  function activity() {
    if (!current || result.hidden) return;
    var now = Date.now();
    if (now - current.a > IDLE_MS) { backToForm(ENDED); return; }
    current.a = now;
    if (now - lastSave > 15000) { save(current); lastSave = now; }
    var idleAt = Number(String(current.t).split('.')[0]) || 0;
    if (idleAt - now < REFRESH_BEFORE_MS && !activity.busy) {
      activity.busy = true;
      lookupWithSession(true).then(function () { activity.busy = false; });
    }
  }
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (t) {
    window.addEventListener(t, activity, { passive: true });
  });
  setInterval(function () {
    if (current && !result.hidden && Date.now() - current.a > IDLE_MS) backToForm(ENDED);
  }, 30000);

  // ---- "Make the correction": email code to the address on the application -----------------------
  var cBtn = $('#correctBtn'), cCode = $('#correctCode'), cInput = $('#corrCode'), cConfirm = $('#corrConfirm');
  var cResend = $('#corrResend'), cStatus = $('#corrStatus'), cMasked = $('#corrMasked'), cNote = $('#corrInbox');
  var timer = 0;

  function cShow(type, html) { cStatus.className = 'verify-status ' + (type || ''); cStatus.innerHTML = html; }
  function resetCorrection() {
    if (!cCode) return; // called before the correction box is set up (restore at load)
    clearInterval(timer);
    cCode.hidden = true;
    cBtn.hidden = false;
    cBtn.disabled = false;
    cInput.value = '';
    EG.setInvalid(cInput, false);
    cShow('', '');
  }
  function countdown(s) {
    clearInterval(timer);
    var left = s || 60;
    cResend.disabled = true;
    cResend.textContent = 'Resend code (' + left + ' s)';
    timer = setInterval(function () {
      left--;
      if (left <= 0) { clearInterval(timer); cResend.disabled = false; cResend.textContent = 'Resend code'; return; }
      cResend.textContent = 'Resend code (' + left + ' s)';
    }, 1000);
  }
  function failed(res) {
    if (res && res.relogin) { backToForm((res && res.error) || ENDED); return true; }
    return false;
  }
  function sendCode(isResend) {
    if (!current) { backToForm(ENDED); return; }
    var b = isResend ? cResend : cBtn;
    b.disabled = true;
    cShow('', isResend ? 'Sending a new code…' : 'Sending a code to the email address on your application…');
    EG.postAction('sendCorrectionCode', { hp: '', session: current.t }, { retries: 0, timeout: 30000 }).then(function (res) {
      if (res && res.ok) {
        cBtn.hidden = true;
        cCode.hidden = false;
        cMasked.textContent = res.masked || 'the email address on your application';
        cNote.innerHTML = EG.codeNote('We\'ve emailed you a 6-digit code.');
        cShow('ok', 'Code sent. Enter it below.');
        countdown(res.resendIn);
        cInput.focus();
        return;
      }
      if (failed(res)) return;
      b.disabled = false;
      cShow('err', EG.escapeHtml((res && res.error) || 'We could not send the code. Please try again.') + EG.contactFallback());
    }, function () {
      b.disabled = false;
      cShow('err', 'We could not send the code. Please check your connection and try again.' + EG.contactFallback());
    });
  }
  cBtn.addEventListener('click', function () { sendCode(false); });
  cResend.addEventListener('click', function () { sendCode(true); });
  cInput.addEventListener('input', function () { cInput.value = cInput.value.replace(/\D/g, '').slice(0, 6); EG.setInvalid(cInput, false); });
  cInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); cConfirm.click(); } });
  cConfirm.addEventListener('click', function () {
    if (!/^\d{6}$/.test(cInput.value)) { EG.setInvalid(cInput, true); cShow('err', 'Please enter the 6-digit code from the email.'); cInput.focus(); return; }
    if (!current) { backToForm(ENDED); return; }
    cConfirm.disabled = true;
    cShow('', 'Checking the code…');
    EG.postAction('verifyCorrectionCode', { hp: '', session: current.t, code: cInput.value }, { retries: 0, timeout: 30000 }).then(function (res) {
      cConfirm.disabled = false;
      if (res && res.ok && res.ctoken) {
        try {
          sessionStorage.setItem(CORR_KEY, JSON.stringify({ t: res.ctoken, id: current.id, x: Date.now() + (res.minutes || 60) * 60000 }));
        } catch (e) {
          cShow('err', 'Your browser is blocking this page from saving your progress. Please allow site data, or contact us on WhatsApp.');
          return;
        }
        cShow('ok', 'Email confirmed ✓ Opening the correction page…');
        window.location.href = 'correct-visa.html';
        return;
      }
      if (failed(res)) return;
      EG.setInvalid(cInput, true);
      cShow('err', EG.escapeHtml((res && res.error) || 'That code is not correct.'));
      cInput.focus();
    }, function () {
      cConfirm.disabled = false;
      cShow('err', 'We could not check the code. Please check your connection and try again.' + EG.contactFallback());
    });
  });

  // ---- "Download your visa": email code → download token (memory only) → files ---------------------
  var vBtn = $('#visaBtn'), vCode = $('#visaCode'), vInput = $('#visaCodeIn'), vConfirm = $('#visaConfirm');
  var vResend = $('#visaResend'), vStatus = $('#visaStatus'), vMasked = $('#visaMasked'), vNote = $('#visaInbox'), vList = $('#visaFiles');
  var VISA_ENDED = 'Your download session has ended. Please confirm your email again to download your visa.';
  var vTimer = 0, dtoken = '', dUntil = 0;

  function vShow(type, html) { vStatus.className = 'verify-status ' + (type || ''); vStatus.innerHTML = html; }
  function resetVisa() {
    if (!vCode) return; // called before the download box is set up (restore at load)
    clearInterval(vTimer);
    dtoken = '';
    dUntil = 0;
    vCode.hidden = true;
    vBtn.hidden = false;
    vBtn.disabled = false;
    vInput.value = '';
    EG.setInvalid(vInput, false);
    vList.hidden = true;
    vList.textContent = '';
    vShow('', '');
  }
  function vCountdown(s) {
    clearInterval(vTimer);
    var left = s || 60;
    vResend.disabled = true;
    vResend.textContent = 'Resend code (' + left + ' s)';
    vTimer = setInterval(function () {
      left--;
      if (left <= 0) { clearInterval(vTimer); vResend.disabled = false; vResend.textContent = 'Resend code'; return; }
      vResend.textContent = 'Resend code (' + left + ' s)';
    }, 1000);
  }
  /** relogin → lookup form; restart (token ended / no longer available) → start the download again. */
  function vFailed(res) {
    if (res && res.relogin) { backToForm((res && res.error) || ENDED); return true; }
    if (res && res.restart) { resetVisa(); vShow('err', EG.escapeHtml(res.error || VISA_ENDED)); return true; }
    return false;
  }
  function vSendCode(isResend) {
    if (!current) { backToForm(ENDED); return; }
    var b = isResend ? vResend : vBtn;
    b.disabled = true;
    vShow('', isResend ? 'Sending a new code…' : 'Sending a code to the email address on your application…');
    EG.postAction('sendVisaCode', { hp: '', session: current.t }, { retries: 0, timeout: 30000 }).then(function (res) {
      if (res && res.ok) {
        vBtn.hidden = true;
        vCode.hidden = false;
        vMasked.textContent = res.masked || 'the email address on your application';
        vNote.innerHTML = EG.codeNote('We\'ve emailed you a 6-digit code.');
        vShow('ok', 'Code sent. Enter it below.');
        vCountdown(res.resendIn);
        vInput.focus();
        return;
      }
      if (vFailed(res)) return;
      b.disabled = false;
      vShow('err', EG.escapeHtml((res && res.error) || 'We could not send the code. Please try again.') + EG.contactFallback());
    }, function () {
      b.disabled = false;
      vShow('err', 'We could not send the code. Please check your connection and try again.' + EG.contactFallback());
    });
  }
  function showFiles(files) {
    vList.textContent = '';
    (files || []).forEach(function (f) {
      var li = document.createElement('li');
      var label = document.createElement('span');
      label.className = 'visa-file-label';
      label.textContent = f.label + ' (' + f.type + ', ' + Number(f.kb).toLocaleString('en-GB') + ' KB)';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-gold visa-dl';
      b.textContent = 'Download';
      b.setAttribute('aria-label', 'Download ' + f.label);
      b.setAttribute('data-ref', f.ref);
      b.addEventListener('click', function () { download(f, b); });
      li.appendChild(label);
      li.appendChild(b);
      vList.appendChild(li);
    });
    vList.hidden = !(files && files.length);
    if (!files || !files.length) vShow('err', 'Your visa file is not available yet. Please try again later, or contact us on WhatsApp.' + EG.contactFallback());
  }
  function relist() {
    EG.postAction('listVisaFiles', { hp: '', dtoken: dtoken }, { retries: 1, timeout: 60000 }).then(function (res) {
      if (res && res.ok) { showFiles(res.files); vShow('', 'The list was updated. Please choose the file again.'); return; }
      if (!vFailed(res)) vShow('err', EG.escapeHtml((res && res.error) || 'Please try again.'));
    }, function () { vShow('err', 'We could not load the list. Please check your connection and try again.'); });
  }
  function saveFile(res) {
    var bin = atob(res.b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: res.mime || 'application/octet-stream' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = res.name || 'visa';
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 30000);
  }
  function download(f, b) {
    if (!current) { backToForm(ENDED); return; }
    if (!dtoken || Date.now() > dUntil) { resetVisa(); vShow('err', EG.escapeHtml(VISA_ENDED)); return; }
    b.disabled = true;
    var label = b.textContent;
    b.textContent = 'Downloading…';
    vShow('', 'Downloading ' + EG.escapeHtml(f.label) + '…');
    EG.postAction('downloadVisaFile', { hp: '', dtoken: dtoken, ref: f.ref }, { retries: 0, timeout: 120000 }).then(function (res) {
      b.disabled = false;
      b.textContent = label;
      if (res && res.ok && res.b64) {
        try { saveFile(res); } catch (e) { vShow('err', 'Your browser could not save the file. Please try again, or contact us on WhatsApp.' + EG.contactFallback()); return; }
        vShow('ok', 'Downloaded ✓ ' + EG.escapeHtml(res.name) + ' — check your Downloads folder.');
        return;
      }
      if (vFailed(res)) return;
      if (res && res.relist) { relist(); return; }
      vShow('err', EG.escapeHtml((res && res.error) || 'We could not download the file. Please try again.') + EG.contactFallback());
    }, function () {
      b.disabled = false;
      b.textContent = label;
      vShow('err', 'We could not download the file. Please check your connection and try again.' + EG.contactFallback());
    });
  }
  vBtn.addEventListener('click', function () { vSendCode(false); });
  vResend.addEventListener('click', function () { vSendCode(true); });
  vInput.addEventListener('input', function () { vInput.value = vInput.value.replace(/\D/g, '').slice(0, 6); EG.setInvalid(vInput, false); });
  vInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); vConfirm.click(); } });
  vConfirm.addEventListener('click', function () {
    if (!/^\d{6}$/.test(vInput.value)) { EG.setInvalid(vInput, true); vShow('err', 'Please enter the 6-digit code from the email.'); vInput.focus(); return; }
    if (!current) { backToForm(ENDED); return; }
    vConfirm.disabled = true;
    vShow('', 'Checking the code…');
    EG.postAction('verifyVisaCode', { hp: '', session: current.t, code: vInput.value }, { retries: 0, timeout: 60000 }).then(function (res) {
      vConfirm.disabled = false;
      if (res && res.ok && res.dtoken) {
        dtoken = res.dtoken;
        dUntil = Date.now() + (res.minutes || 30) * 60000;
        clearInterval(vTimer);
        vCode.hidden = true;
        showFiles(res.files);
        if (res.files && res.files.length) vShow('ok', 'Email confirmed ✓ Choose a file to download. You can download for the next ' + (res.minutes || 30) + ' minutes.');
        var first = vList.querySelector('button');
        if (first) first.focus();
        return;
      }
      if (vFailed(res)) return;
      EG.setInvalid(vInput, true);
      vShow('err', EG.escapeHtml((res && res.error) || 'That code is not correct.'));
      vInput.focus();
    }, function () {
      vConfirm.disabled = false;
      vShow('err', 'We could not check the code. Please check your connection and try again.' + EG.contactFallback());
    });
  });
})();
