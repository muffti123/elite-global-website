/*
 * Track my application (track.html) → web app trackApplication {leadId, contact}.
 * The email/phone is only ever sent in the POST body: it is never put in the URL, stored or logged.
 * ?id=EG-VO-00012 prefills the reference number. Everything shown comes back as plain text and is
 * written with textContent.
 */
(function () {
  'use strict';
  var EG = window.EG, $ = EG.$;
  var form = $('#trackForm'), F = form.elements;
  var formPanel = $('#trackFormPanel'), result = $('#trackResult');
  var status = $('#trackStatus'), btn = $('#trackBtn');
  var ID_RE = /^EG-(VO|CE|GE)-\d{5}$/;
  var GENERIC = 'We couldn\'t find an application with those details. Please check your reference number and the email or phone number you used.';

  function normId(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }
  function contactOk(v) {
    v = String(v || '').trim();
    return v.indexOf('@') !== -1 ? EG.EMAIL_RE.test(v) : EG.PHONE_RE.test(v);
  }

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

  function render(r) {
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
    formPanel.hidden = true;
    result.hidden = false;
    status.className = 'status';
    status.textContent = '';
    $('#trackLive').textContent = 'Application ' + r.leadId + ': ' + r.stage + '.';
    $('#resultTitle').focus();
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
        if (res && res.ok) { render(res); return; }
        showStatus('err', EG.escapeHtml((res && res.error) || GENERIC) + EG.contactFallback());
      }, function () {
        showStatus('err', 'Sorry, we could not check your application. Please check your connection and try again.' + EG.contactFallback());
      })
      .then(function () { btn.disabled = false; btn.innerHTML = label; });
  });

  $('#trackAgain').addEventListener('click', function () {
    result.hidden = true;
    formPanel.hidden = false;
    F.contact.value = '';
    $('#trackLive').textContent = '';
    F.leadId.focus();
    F.leadId.select();
  });
})();
