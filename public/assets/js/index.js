/* Home page: management team and enquiry form. CTA buttons are plain links to the application pages. */
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  var $ = window.EG.$, $$ = window.EG.$$;

  // ---- Management team -------------------------------------------------
  // Portrait cards: name + role over the photo. From 768 px the bio is an overlay shown on hover,
  // keyboard focus or tap (the name button toggles it); on phones the bio sits under the photo.
  var team = (C.team || []).filter(function (m) { return m && m.name; });
  if (team.length) {
    var grid = $('#teamGrid');
    var el = function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text) n.textContent = text;
      return n;
    };
    var cards = team.map(function (m, i) {
      var card = el('article', 'team-card');
      card.setAttribute('data-reveal', '');
      var photo = el('div', 'team-photo');
      if (m.photo) {
        var img = el('img');
        img.src = m.photo; img.alt = ''; img.loading = 'lazy'; img.width = 800; img.height = 1000;
        photo.appendChild(img);
      } else {
        photo.appendChild(el('span', 'team-initials', m.name.trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase()));
      }
      var head = el('button', 'team-head');
      head.type = 'button';
      head.appendChild(el('span', 'team-accent'));
      head.appendChild(el('span', 'team-name', m.name));
      if (m.role) head.appendChild(el('span', 'team-role', m.role));
      photo.appendChild(head);
      card.appendChild(photo);
      if (m.bio) {
        var bio = el('div', 'team-bio');
        bio.id = 'team-bio-' + (i + 1);
        var dup = el('div', 'team-bio-head');
        dup.setAttribute('aria-hidden', 'true');
        dup.appendChild(el('span', 'team-accent'));
        dup.appendChild(el('span', 'team-name', m.name));
        if (m.role) dup.appendChild(el('span', 'team-role', m.role));
        bio.appendChild(dup);
        bio.appendChild(el('p', '', m.bio));
        card.appendChild(bio);
        head.setAttribute('aria-controls', bio.id);
      } else {
        head.disabled = true;
      }
      grid.appendChild(card);
      return { card: card, head: head, bio: m.bio };
    });

    var overlay = window.matchMedia('(min-width: 768px)');
    var setOpen = function (c, open) {
      c.card.classList.toggle('open', open);
      if (overlay.matches && c.bio) c.head.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    var applyMode = function () {
      cards.forEach(function (c) {
        c.card.classList.remove('open');
        if (overlay.matches && c.bio) c.head.setAttribute('aria-expanded', 'false');
        else c.head.removeAttribute('aria-expanded');
      });
    };
    cards.forEach(function (c) {
      c.head.addEventListener('click', function () {
        if (!overlay.matches || !c.bio) return;
        var open = !c.card.classList.contains('open');
        cards.forEach(function (o) { if (o !== c) setOpen(o, false); });
        setOpen(c, open);
      });
      c.card.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && c.card.classList.contains('open')) { setOpen(c, false); c.head.focus(); }
      });
      c.card.addEventListener('focusout', function (e) {
        if (!c.card.contains(e.relatedTarget)) setOpen(c, false);
      });
    });
    applyMode();
    if (overlay.addEventListener) overlay.addEventListener('change', applyMode); else overlay.addListener(applyMode);
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
            'A member of our team will contact you shortly.' +
            '<br><a class="track-link" href="track.html?id=' + encodeURIComponent(res.leadId) + '">Track this application</a>');
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
