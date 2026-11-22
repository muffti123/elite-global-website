/* Customize My Umrah Experience — multi-step form → web app (submitCustomRequest). */
(function () {
  'use strict';
  var EG = window.EG, LISTS = window.EG_LISTS, $ = EG.$, $$ = EG.$$, check = EG.check;
  var form = $('#customForm');
  var F = form.elements;
  var status = $('#formStatus');
  var submitBtn = $('#submitBtn'), nextBtn = $('#nextBtn'), backBtn = $('#backBtn');
  var dirty = false, done = false;

  // ---- Options from lists.js (same values the web app accepts) ----------
  $$('select[data-list]', form).forEach(function (s) { EG.fillSelect(s, LISTS[s.dataset.list], s.dataset.placeholder); });
  $$('[data-choices]', form).forEach(function (c) { EG.fillChoices(c, c.dataset.choices, LISTS[c.dataset.list], c.dataset.type); });
  F.travelDate.min = EG.todayISO();
  var airport = EG.airportField({
    country: F.country, airport: F.departureAirport, other: F.departureAirportOther,
    otherField: $('[data-airport-other]', form), note: $('[data-airport-note]', form),
  });

  // "Other" service shows a text box
  F.servicesOtherOn.addEventListener('change', function () {
    F.servicesOther.hidden = !F.servicesOtherOn.checked;
    if (F.servicesOtherOn.checked) F.servicesOther.focus();
  });

  // Step 1: confirm the email address with a code (the web app requires the token)
  var verify = EG.emailVerify({ key: 'custom', box: $('[data-verify]', form), email: F.email, name: F.name, hp: F.company_website });

  EG.clearOnInput(form);
  form.addEventListener('input', function () { dirty = true; });
  form.addEventListener('change', function () { dirty = true; });
  EG.guardUnload(function () { return dirty && !done; });

  // ---- Steps -------------------------------------------------------------
  var panels = $$('.step', form);
  var validators = [
    function () {
      return EG.checkAll([
        function () { return check.text(F.name, 2); },
        function () { return check.phone(F.phone); },
        function () { return check.email(F.email); },
        function () { return check.select(F.country); },
        function () { return check.email(F.email) ? verify.validate() : true; },
      ], panels[0]);
    },
    function () {
      var ok = EG.checkAll([
        function () { return check.int(F.adults, 0, 999, true); },
        function () { return check.int(F.children, 0, 999, true); },
        function () { return check.int(F.infants, 0, 999, true); },
        function () { return airport.validate(); },
        function () { return check.date(F.travelDate, true); },
        function () { return check.radio(form, 'flightTicket'); },
        function () { return check.radio(form, 'arrivalCity'); },
      ], panels[1]);
      if (ok && Number(F.adults.value) + Number(F.children.value) + Number(F.infants.value) < 1) {
        EG.setInvalid(F.adults, true, 'Please enter at least one traveller.');
        F.adults.focus();
        return false;
      }
      return ok;
    },
    function () {
      return EG.checkAll([
        function () { return check.int(F.nightsMadinah, 0, 999, true); },
        function () { return check.int(F.nightsMakkah, 0, 999, true); },
        function () { return check.select(F.hotelCategory); },
        function () { return check.select(F.haramDistance); },
      ], panels[2]);
    },
    function () {
      var bad = F.servicesOtherOn.checked && !F.servicesOther.value.trim();
      if (!EG.setInvalid(F.servicesOther, bad)) { F.servicesOther.focus(); return false; }
      return true;
    },
    function () {
      return EG.checkAll([
        function () { return check.radio(form, 'visaAssist'); },
        function () { return check.select(F.budget); },
      ], panels[4]);
    },
    null,
    null,
  ];

  var wizard = new EG.Wizard({
    stepper: $('#stepper'),
    label: $('#stepLabel'),
    steps: panels.map(function (el, i) {
      return { el: el, title: el.dataset.title, validate: validators[i], onEnter: i === panels.length - 1 ? renderReview : null };
    }),
    onChange: function (i) {
      var last = i === panels.length - 1;
      backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
      nextBtn.hidden = last;
      submitBtn.hidden = !last;
      status.className = 'status';
    },
  });
  wizard.onChange(0);
  nextBtn.addEventListener('click', function () { wizard.next(); });
  backBtn.addEventListener('click', function () { wizard.back(); });

  // Enter in a text field moves to the next step instead of submitting early
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && wizard.index < panels.length - 1) {
      e.preventDefault();
      wizard.next();
    }
  });

  // ---- Payload + review --------------------------------------------------
  function payload() {
    return {
      hp: F.company_website.value,
      name: F.name.value.trim(),
      phone: F.phone.value.trim(),
      email: F.email.value.trim(),
      country: F.country.value,
      adults: F.adults.value.trim(),
      children: F.children.value.trim(),
      infants: F.infants.value.trim(),
      departureAirport: airport.payload().departureAirport,
      departureAirportOther: airport.payload().departureAirportOther,
      travelDate: F.travelDate.value,
      flightTicket: EG.radioValue(form, 'flightTicket'),
      arrivalCity: EG.radioValue(form, 'arrivalCity'),
      nightsMadinah: F.nightsMadinah.value.trim(),
      nightsMakkah: F.nightsMakkah.value.trim(),
      hotelCategory: F.hotelCategory.value,
      haramDistance: F.haramDistance.value,
      preferredHotel: F.preferredHotel.value.trim(),
      services: $$('input[name="services"]:checked', form).map(function (c) { return c.value; }),
      servicesOther: F.servicesOtherOn.checked ? F.servicesOther.value.trim() : '',
      visaAssist: EG.radioValue(form, 'visaAssist'),
      budget: F.budget.value,
      experience: F.experience.value,
      hotelOrAirline: F.hotelOrAirline.value.trim(),
      special: F.special.value.trim(),
      heard: F.heard.value,
      emailToken: verify.token(),
    };
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function renderReview() {
    var d = payload();
    var services = d.services.concat(d.servicesOther ? ['Other: ' + d.servicesOther] : []);
    var groups = [
      [0, 'Personal Information', [['Full Name', d.name], ['Phone / WhatsApp', d.phone], ['Email', d.email], ['Country of Residence', d.country]]],
      [1, 'Travellers & Travel', [['Adults / Children / Infants', d.adults + ' / ' + d.children + ' / ' + d.infants],
        ['Departure Airport', airport.text()], ['Travel Date', fmtDate(d.travelDate)], ['Confirmed flight ticket', d.flightTicket], ['Arrival City', d.arrivalCity]]],
      [2, 'Accommodation', [['Nights in Madinah / Makkah', d.nightsMadinah + ' / ' + d.nightsMakkah], ['Hotel Category', d.hotelCategory],
        ['Distance from Haram', d.haramDistance], ['Preferred Hotel', d.preferredHotel]]],
      [3, 'Services', [['Services required', services.join(', ')]]],
      [4, 'Visa & Budget', [['Umrah visa assistance', d.visaAssist], ['Budget per person', d.budget]]],
      [5, 'Experience & Requests', [['Travel Experience', d.experience], ['Preferred Hotel or Airline', d.hotelOrAirline],
        ['Special Requests', d.special], ['How you heard about us', d.heard]]],
    ];
    var body = $('#reviewBody');
    body.innerHTML = '';
    groups.forEach(function (g) {
      var sec = document.createElement('div'); sec.className = 'review-group';
      var head = document.createElement('div'); head.className = 'review-head';
      var h = document.createElement('h3'); h.textContent = g[1];
      var edit = document.createElement('button'); edit.type = 'button'; edit.className = 'link-btn'; edit.textContent = 'Edit';
      edit.setAttribute('aria-label', 'Edit ' + g[1]);
      edit.addEventListener('click', function () { wizard.go(g[0], { force: true }); });
      head.appendChild(h); head.appendChild(edit); sec.appendChild(head);
      var dl = document.createElement('dl');
      g[2].forEach(function (row) {
        var dt = document.createElement('dt'); dt.textContent = row[0];
        var dd = document.createElement('dd'); dd.textContent = row[1] || '—';
        dl.appendChild(dt); dl.appendChild(dd);
      });
      sec.appendChild(dl); body.appendChild(sec);
    });
  }

  // ---- Submit ------------------------------------------------------------
  function showStatus(type, html) { status.className = 'status ' + type; status.innerHTML = html; }

  function showSuccess(leadId, emailed) {
    done = true;
    var note = $('[data-emailed]');
    note.innerHTML = EG.inboxNote(); // with the WhatsApp link
    note.hidden = emailed !== true;
    form.hidden = true;
    $('#stepper').hidden = true;
    $('#stepLabel').hidden = true;
    $('#leadId').textContent = leadId;
    $('[data-track-link]').setAttribute('href', 'track.html?id=' + encodeURIComponent(leadId));
    var s = $('#successPanel');
    s.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    s.focus({ preventScroll: true });
  }

  if (!EG.apiReady() && window.console) console.warn('[Elite Global] Form not connected yet: set SITE_CONFIG.webAppUrl in assets/js/config.js.');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (wizard.index !== panels.length - 1) { wizard.next(); return; }
    // re-check every step (e.g. a date that became past while the page was open)
    for (var i = 0; i < validators.length; i++) {
      if (validators[i] && !validators[i]()) { wizard.go(i, { force: true }); validators[i](); return; }
    }
    if (F.company_website.value) { showSuccess('EG-CE-' + String(Math.floor(Math.random() * 99999)).padStart(5, '0')); return; } // bot
    if (!EG.apiReady()) { showStatus('err', 'Sorry, online requests are temporarily unavailable.' + EG.contactFallback()); return; }
    if (!navigator.onLine) { showStatus('err', 'You appear to be offline. Please check your connection and try again.' + EG.contactFallback()); return; }

    submitBtn.disabled = true; backBtn.disabled = true;
    var label = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="sending" aria-hidden="true"></span>Sending…';
    status.className = 'status';

    // Safe to retry: api.js adds a submission key, so a retry gets the first reply, never a second lead.
    EG.postAction('submitCustomRequest', payload(), { retries: 0, timeout: 45000 })
      .then(function (res) {
        if (res && res.ok) { showSuccess(res.leadId, res.emailed); return; }
        if (res && res.reverify) { verify.reset(res.error); wizard.go(0, { force: true }); return; }
        var field = res && res.field && (F[res.field] || form.querySelector('[name="' + res.field + '"]'));
        if (field && field.length && !field.tagName) field = field[0]; // radio group
        if (field) {
          wizard.go(wizard.stepOf(field), { force: true });
          EG.setInvalid(field, true, res.error);
          field.focus();
          return;
        }
        showStatus('err', EG.escapeHtml((res && res.error) || 'Sorry, we could not send your request.') + EG.contactFallback());
      }, function () {
        showStatus('err', 'Sorry, we could not send your request. Please check your connection and try again.' + EG.contactFallback());
      })
      .then(function () { submitBtn.disabled = false; backBtn.disabled = false; submitBtn.innerHTML = label; });
  });
})();
