/* Home page: management team, CTA buttons, enquiry form. */
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  var co = C.company || {};
  var forms = C.forms || {};
  var $ = window.EG.$, $$ = window.EG.$$, waLink = window.EG.waLink;

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

  // ---- CTA buttons → Google Forms in a new tab -------------------------
  $$('[data-form]').forEach(function (btn) {
    var url = forms[btn.dataset.form];
    if (url && /^https:\/\/docs\.google\.com\/forms\//.test(url) && !/\/edit/.test(url)) {
      btn.href = url;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.setAttribute('aria-label', btn.textContent.replace(/\s*→\s*$/, '').trim() + ' (opens in a new tab)');
    } else {
      // Fallback until the form URL is set: jump to the enquiry form, pre-selected
      btn.addEventListener('click', function () { $('#requestType').value = btn.dataset.request; });
    }
  });

  // ---- Enquiry form → Google Form 3 ------------------------------------
  var form = $('#enquiryForm');
  var F = form.elements;
  var status = $('#formStatus');
  var submitBtn = $('#submitBtn');
  var cf = C.contactForm || {};
  var E = cf.entries || {};
  var PHONE_RE = /^\+?[0-9][0-9 ()\-]{6,19}$/;

  function todayISO() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  F.date.min = todayISO();

  function setInvalid(field, bad) {
    var wrap = field.closest('.field');
    wrap.classList.toggle('invalid', bad);
    field.setAttribute('aria-invalid', bad ? 'true' : 'false');
    var msg = wrap.querySelector('.err-msg');
    if (msg) { if (bad) field.setAttribute('aria-describedby', msg.id); else field.removeAttribute('aria-describedby'); }
    return !bad;
  }

  function validate() {
    var ok = true, first = null;
    var check = function (field, bad) { if (!setInvalid(field, bad)) { ok = false; first = first || field; } };
    check(F.name, F.name.value.trim().length < 2);
    check(F.phone, !PHONE_RE.test(F.phone.value.trim()));
    check(F.request, !F.request.value);
    check(F.date, !!F.date.value && F.date.value < todayISO());
    var t = F.travellers.value.trim();
    check(F.travellers, t !== '' && !/^[1-9][0-9]{0,2}$/.test(t));
    if (first) first.focus();
    return ok;
  }

  // Clear an error as soon as the user fixes it
  $$('input,select,textarea', form).forEach(function (f) {
    f.addEventListener('input', function () { if (f.closest('.field') && f.closest('.field').classList.contains('invalid')) setInvalid(f, false); });
  });

  function showStatus(type, html) { status.className = 'status ' + type; status.innerHTML = html; }
  function contactFallback() {
    var bits = [];
    if (waLink) bits.push('<a href="' + waLink + '" target="_blank" rel="noopener">message us on WhatsApp</a>');
    if (co.phone) bits.push('call <a href="tel:' + co.phone.replace(/[^\d+]/g, '') + '">' + co.phone + '</a>');
    if (co.email) bits.push('email <a href="mailto:' + co.email + '">' + co.email + '</a>');
    return bits.length ? ' You can also ' + bits.join(', or ') + '.' : '';
  }

  var configured = !!(cf.endpoint && /\/formResponse$/.test(cf.endpoint) && E.name && E.phone && E.request);
  if (!configured && window.console) console.warn('[Elite Global] Contact form not connected yet: fill SITE_CONFIG.contactForm (see README).');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.className = 'status';
    if (F.company_website.value) { showStatus('ok', 'Thank you. Your enquiry has been received.'); form.reset(); return; } // bot
    if (!validate()) { showStatus('err', 'Please correct the highlighted fields and try again.'); return; }
    if (!configured) { showStatus('err', 'Sorry, online enquiries are temporarily unavailable.' + contactFallback()); return; }
    if (!navigator.onLine) { showStatus('err', 'You appear to be offline. Please check your connection and try again.' + contactFallback()); return; }

    var data = new URLSearchParams();
    data.append(E.name, F.name.value.trim());
    data.append(E.phone, F.phone.value.trim());
    data.append(E.request, F.request.value);
    if (F.date.value && E.date) {
      var p = F.date.value.split('-');
      data.append(E.date + '_year', p[0]);
      data.append(E.date + '_month', String(Number(p[1])));
      data.append(E.date + '_day', String(Number(p[2])));
    }
    if (F.travellers.value.trim() && E.travellers) data.append(E.travellers, F.travellers.value.trim());
    if (F.details.value.trim() && E.details) data.append(E.details, F.details.value.trim());

    submitBtn.disabled = true;
    var label = submitBtn.innerHTML;
    submitBtn.textContent = 'Sending…';

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);

    fetch(cf.endpoint, { method: 'POST', mode: 'no-cors', body: data, signal: ctrl ? ctrl.signal : undefined })
      .then(function () {
        // Google returns an opaque response; reaching here means the request was delivered.
        form.reset();
        showStatus('ok', '<b>Thank you for contacting Elite Global World Travel &amp; Tours Ltd.</b><br>Your enquiry has been received. A member of our team will contact you shortly.');
        status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      })
      .catch(function () {
        showStatus('err', 'Sorry, we could not send your enquiry. Please check your connection and try again.' + contactFallback());
      })
      .then(function () { clearTimeout(timer); submitBtn.disabled = false; submitBtn.innerHTML = label; });
  });
})();
