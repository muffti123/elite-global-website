/* Home page: management team and enquiry form. CTA buttons are plain links to the application pages. */
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  var $ = window.EG.$, $$ = window.EG.$$;

  // ---- Management team -------------------------------------------------
  var team = (C.team || []).filter(function (m) { return m && m.name; });
  if (team.length) {
    var grid = $('#teamGrid');
    team.forEach(function (m) {
      var card = document.createElement('article');
      card.className = 'team-card';
      var photo = document.createElement('div');
      photo.className = 'team-photo';
      if (m.photo) {
        var img = document.createElement('img');
        img.src = m.photo; img.alt = m.name + (m.role ? ', ' + m.role : ''); img.loading = 'lazy';
        photo.appendChild(img);
      } else {
        photo.textContent = m.name.trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
        photo.setAttribute('aria-hidden', 'true');
      }
      var info = document.createElement('div');
      info.className = 'team-info';
      var role = document.createElement('div'); role.className = 'team-role'; role.textContent = m.role || '';
      var h3 = document.createElement('h3'); h3.textContent = m.name;
      info.appendChild(role); info.appendChild(h3);
      if (m.bio) { var p = document.createElement('p'); p.textContent = m.bio; info.appendChild(p); }
      card.appendChild(photo); card.appendChild(info); grid.appendChild(card);
    });
    if (team.length < 5) grid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(200px,240px))', grid.style.justifyContent = 'center';
    $('#management').hidden = false;
  } else {
    $$('[data-team-link]').forEach(function (a) { a.hidden = true; });
  }

  // ---- Enquiry form → web app (submitContact) --------------------------
  var form = $('#enquiryForm');
  var F = form.elements;
  var status = $('#formStatus');
  var submitBtn = $('#submitBtn');
  var EG = window.EG;
  // server field name → form field
  var FIELD = { name: F.name, phone: F.phone, enquiryType: F.request, travelDate: F.date, travellers: F.travellers };

  F.date.min = EG.todayISO();
  EG.clearOnInput(form);

  function validate() {
    var ok = true, first = null;
    var check = function (field, bad) { if (!EG.setInvalid(field, bad)) { ok = false; first = first || field; } };
    check(F.name, F.name.value.trim().length < 2);
    check(F.phone, !EG.PHONE_RE.test(F.phone.value.trim()));
    check(F.request, !F.request.value);
    check(F.date, !!F.date.value && F.date.value < EG.todayISO());
    var t = F.travellers.value.trim();
    check(F.travellers, t !== '' && !/^[1-9][0-9]{0,2}$/.test(t));
    if (first) first.focus();
    return ok;
  }

  function showStatus(type, html) { status.className = 'status ' + type; status.innerHTML = html; }

  var configured = EG.apiReady();
  if (!configured && window.console) console.warn('[Elite Global] Enquiry form not connected yet: set SITE_CONFIG.webAppUrl in assets/js/config.js (see README).');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.className = 'status';
    if (F.company_website.value) { showStatus('ok', 'Thank you. Your enquiry has been received.'); form.reset(); return; } // bot
    if (!validate()) { showStatus('err', 'Please correct the highlighted fields and try again.'); return; }
    if (!configured) { showStatus('err', 'Sorry, online enquiries are temporarily unavailable.' + EG.contactFallback()); return; }
    if (!navigator.onLine) { showStatus('err', 'You appear to be offline. Please check your connection and try again.' + EG.contactFallback()); return; }

    submitBtn.disabled = true;
    var label = submitBtn.innerHTML;
    submitBtn.textContent = 'Sending…';

    // No automatic retry: a lost reply would otherwise create a duplicate lead.
    EG.postAction('submitContact', {
      hp: F.company_website.value,
      name: F.name.value.trim(),
      phone: F.phone.value.trim(),
      enquiryType: F.request.value,
      travelDate: F.date.value,
      travellers: F.travellers.value.trim(),
      details: F.details.value.trim(),
    }, { retries: 0, timeout: 30000 })
      .then(function (res) {
        if (res && res.ok) {
          form.reset();
          showStatus('ok', '<b>Thank you for contacting Elite Global World Travel &amp; Tours Ltd.</b><br>' +
            'Your enquiry has been received. Your reference number is <b data-lead-id>' + EG.escapeHtml(res.leadId) + '</b>. ' +
            'A member of our team will contact you shortly.');
          status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
        var field = res && res.field && FIELD[res.field];
        if (field) { EG.setInvalid(field, true, res.error); field.focus(); }
        showStatus('err', EG.escapeHtml((res && res.error) || 'Sorry, we could not send your enquiry.') + EG.contactFallback());
      }, function () {
        showStatus('err', 'Sorry, we could not send your enquiry. Please check your connection and try again.' + EG.contactFallback());
      })
      .then(function () { submitBtn.disabled = false; submitBtn.innerHTML = label; });
  });
})();
