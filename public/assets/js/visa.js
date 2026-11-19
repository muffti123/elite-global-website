/*
 * Request Umrah Visa Only — lead details, passenger cards with passport + photo, review, upload.
 * Flow: createVisaApplication → Lead ID + token → uploadPassenger (one request each, retry-safe)
 *       → finalizeVisaApplication → success screen.
 * All answers and files live in `state` / the page, so Back/Next never loses anything.
 */
(function () {
  'use strict';
  var EG = window.EG, LISTS = window.EG_LISTS, $ = EG.$, $$ = EG.$$, check = EG.check;
  var MAX = 50;
  var form = $('#visaForm');
  var F = form.elements;
  var paxList = $('#paxList'), tpl = $('#paxTpl');
  var status = $('#formStatus');
  var nav = $('#wizardNav'), nextBtn = $('#nextBtn'), backBtn = $('#backBtn'), submitBtn = $('#submitBtn');

  var state = { pax: [], seq: 0, leadId: '', token: '', phase: 'edit', running: false }; // phase: edit | uploading | done
  var dirty = false;

  // Object URLs for previews: tracked so they can be revoked (memory on phones with 50 files).
  var urls = new Set();
  function track(u) { urls.add(u); return u; }
  function revoke(u) { if (u && urls.has(u)) { URL.revokeObjectURL(u); urls.delete(u); } }
  EG._visaPreviewUrls = urls; // read by the QA script

  // ---- Static fields -----------------------------------------------------
  $$('select[data-list]', form).forEach(function (s) { EG.fillSelect(s, LISTS[s.dataset.list], s.dataset.placeholder); });
  $$('[data-choices]', form).forEach(function (c) { EG.fillChoices(c, c.dataset.choices, LISTS[c.dataset.list]); });
  F.travelDate.min = EG.todayISO();
  EG.clearOnInput(form);
  form.addEventListener('input', function () { dirty = true; });
  form.addEventListener('change', function () { dirty = true; });
  EG.guardUnload(function () { return state.phase === 'uploading' || (dirty && state.phase !== 'done'); });

  // ---- Passenger cards ---------------------------------------------------
  function q(p, sel) { return p.el.querySelector(sel); }

  function addPassenger(passportFile) {
    if (state.pax.length >= MAX) return null;
    var p = { id: ++state.seq, name: '', category: '', passport: null, passportType: '', passportThumb: '',
      photo: null, photoThumb: '', busy: 0, gen: { passport: 0, photo: 0 }, status: 'pending', error: '' };
    state.pax.push(p);
    renderCard(p);
    if (passportFile) setPassport(p, passportFile);
    renumber();
    dirty = true;
    EG.setInvalid($('#paxField').firstElementChild, false);
    return p;
  }

  function renderCard(p) {
    var node = tpl.content.firstElementChild.cloneNode(true);
    p.el = node;
    var nameIn = node.querySelector('[data-name]'), cat = node.querySelector('[data-category]');
    EG.fillSelect(cat, LISTS.PASSENGER_CATEGORIES, 'Select category');
    $$('.err-msg', node).forEach(function (m, i) { m.id = 'pax' + p.id + '-err' + i; });
    nameIn.addEventListener('input', function () { p.name = nameIn.value; if (nameIn.value.trim().length >= 2) EG.setInvalid(nameIn, false); });
    cat.addEventListener('change', function () { p.category = cat.value; if (cat.value) EG.setInvalid(cat, false); });

    var pIn = node.querySelector('[data-passport-input]'), phIn = node.querySelector('[data-photo-input]');
    node.querySelector('[data-passport-btn]').addEventListener('click', function () { pIn.click(); });
    node.querySelector('[data-photo-btn]').addEventListener('click', function () { phIn.click(); });
    pIn.addEventListener('change', function () { if (pIn.files[0]) setPassport(p, pIn.files[0]); pIn.value = ''; });
    phIn.addEventListener('change', function () { if (phIn.files[0]) setPhoto(p, phIn.files[0]); phIn.value = ''; });
    node.querySelector('[data-remove]').addEventListener('click', function () { removePassenger(p); });
    paxList.appendChild(node);
  }

  function removePassenger(p) {
    revoke(p.passportThumb); revoke(p.photoThumb);
    p.passportThumb = p.photoThumb = '';
    p.gen.passport++; p.gen.photo++; // ignore work still running for this card
    p.el.remove();
    state.pax.splice(state.pax.indexOf(p), 1);
    renumber();
    dirty = true;
  }

  function renumber() {
    var n = state.pax.length;
    state.pax.forEach(function (p, i) {
      q(p, '[data-no]').textContent = i + 1;
      q(p, '[data-remove]').setAttribute('aria-label', 'Remove passenger ' + (i + 1));
      q(p, '[data-passport-btn]').setAttribute('aria-label', 'Choose passport for passenger ' + (i + 1));
      q(p, '[data-photo-btn]').setAttribute('aria-label', 'Choose photo for passenger ' + (i + 1));
    });
    $('#paxTools').hidden = n === 0;
    $('#paxCount').textContent = n + (n === 1 ? ' passenger' : ' passengers') + ' · up to ' + MAX;
    ['#addPaxBtn', '#addPaxBtn2', '#pickAllBtn'].forEach(function (s) { $(s).disabled = n >= MAX; });
  }

  function setThumb(box, url, text) {
    box.innerHTML = '';
    if (url) { var img = document.createElement('img'); img.alt = ''; img.src = url; box.appendChild(img); }
    else box.textContent = text;
  }

  function setPassport(p, file) {
    var gen = ++p.gen.passport;
    var btn = q(p, '[data-passport-btn]');
    q(p, '[data-passport-title]').textContent = 'Checking…';
    q(p, '[data-passport-note]').textContent = '';
    p.busy++;
    return EG.checkPassport(file).then(function (r) {
      if (gen !== p.gen.passport) return;
      revoke(p.passportThumb); p.passportThumb = '';
      p.passport = file; p.passportType = r.type;
      q(p, '[data-passport-title]').textContent = r.type === 'pdf' ? 'Passport (PDF)' : 'Passport (' + r.type.toUpperCase() + ')';
      q(p, '[data-passport-name]').textContent = file.name + ' · ' + EG.fmtSize(file.size);
      var note = q(p, '[data-passport-note]');
      note.className = 'note ok';
      note.textContent = r.type !== 'pdf' && file.size > EG.FILE_LIMITS.PASSPORT_IMG_KEEP ? '✓ Ready — will be resized to about 1 MB when sent' : '✓ Ready';
      btn.textContent = 'Change';
      EG.setInvalid(btn, false);
      if (r.type === 'pdf') { setThumb(q(p, '[data-passport-thumb]'), '', 'PDF'); return; }
      return EG.makeThumb(file).then(function (blob) {
        if (gen !== p.gen.passport || !p.el.isConnected) return;
        p.passportThumb = track(URL.createObjectURL(blob));
        setThumb(q(p, '[data-passport-thumb]'), p.passportThumb);
      }, function () { setThumb(q(p, '[data-passport-thumb]'), '', r.type.toUpperCase()); });
    }, function (err) {
      if (gen !== p.gen.passport) return;
      revoke(p.passportThumb); p.passportThumb = ''; p.passport = null; p.passportType = '';
      setThumb(q(p, '[data-passport-thumb]'), '', '✕');
      q(p, '[data-passport-title]').textContent = 'File not accepted';
      q(p, '[data-passport-name]').textContent = file.name;
      EG.setInvalid(btn, true, err.userFacing ? err.message : 'This file could not be read. Please choose it again.');
      btn.textContent = 'Choose passport';
    }).then(function () { p.busy--; });
  }

  function setPhoto(p, file) {
    var gen = ++p.gen.photo;
    var btn = q(p, '[data-photo-btn]');
    q(p, '[data-photo-title]').textContent = file.size > EG.FILE_LIMITS.PHOTO_MAX ? 'Resizing…' : 'Checking…';
    q(p, '[data-photo-note]').textContent = '';
    p.busy++;
    return EG.processPhoto(file).then(function (r) {
      if (gen !== p.gen.photo || !p.el.isConnected) return;
      revoke(p.photoThumb);
      p.photo = r;
      p.photoThumb = track(URL.createObjectURL(r.blob));
      setThumb(q(p, '[data-photo-thumb]'), p.photoThumb);
      q(p, '[data-photo-title]').textContent = 'Photo · ' + r.kb.toFixed(1) + ' KB';
      q(p, '[data-photo-name]').textContent = file.name;
      var note = q(p, '[data-photo-note]');
      note.className = 'note ok';
      note.textContent = r.compressed
        ? '✓ Resized from ' + EG.fmtSize(file.size) + ' to ' + r.kb.toFixed(1) + ' KB'
        : '✓ Size ' + r.kb.toFixed(1) + ' KB — within 25–50 KB';
      btn.textContent = 'Change';
      EG.setInvalid(btn, false);
    }, function (err) {
      if (gen !== p.gen.photo) return;
      revoke(p.photoThumb); p.photoThumb = ''; p.photo = null;
      setThumb(q(p, '[data-photo-thumb]'), '', '✕');
      q(p, '[data-photo-title]').textContent = 'Photo not accepted';
      q(p, '[data-photo-name]').textContent = file.name + ' · ' + EG.fmtSize(file.size);
      EG.setInvalid(btn, true, err.userFacing ? err.message : 'This photo could not be read. Please choose another one.');
      btn.textContent = 'Choose photo';
    }).then(function () { p.busy--; });
  }

  /** "Select all passports" / drag & drop: fill cards without a passport first, then add cards. */
  function addPassportFiles(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return;
    var empty = state.pax.filter(function (p) { return !p.passport && !p.busy; });
    var added = 0, skipped = 0;
    files.forEach(function (f) {
      var p = empty.shift();
      if (p) { setPassport(p, f); added++; }
      else if (state.pax.length < MAX) { addPassenger(f); added++; }
      else skipped++;
    });
    var msg = $('#e-passengers');
    if (skipped) {
      EG.setInvalid($('#paxField').firstElementChild, true,
        'Only the first ' + added + ' file' + (added === 1 ? ' was' : 's were') + ' added — the limit is ' + MAX + ' passengers per application.');
    } else {
      msg.textContent = 'Please add at least one passenger.';
    }
    dirty = true;
  }

  var pickAll = $('#pickAll');
  $('#pickAllBtn').addEventListener('click', function () { pickAll.click(); });
  pickAll.addEventListener('change', function () { addPassportFiles(pickAll.files); pickAll.value = ''; });
  $('#addPaxBtn').addEventListener('click', function () { var p = addPassenger(); if (p) q(p, '[data-name]').focus(); });
  $('#addPaxBtn2').addEventListener('click', function () { var p = addPassenger(); if (p) q(p, '[data-name]').focus(); });
  var dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach(function (t) { dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (t) { dz.addEventListener(t, function () { dz.classList.remove('drag'); }); });
  dz.addEventListener('drop', function (e) { e.preventDefault(); addPassportFiles(e.dataTransfer.files); });

  // ---- Validation per step ----------------------------------------------
  var panels = $$('.step', form);

  function validateLead() {
    return EG.checkAll([
      function () { return check.text(F.name, 2); },
      function () { return check.phone(F.phone); },
      function () { return check.email(F.email); },
      function () { return check.select(F.country); },
      function () { return check.date(F.travelDate, true); },
      function () { return check.text(F.departureCity, 1); },
      function () { return check.radio(form, 'flightTicket'); },
      function () { return check.radio(form, 'priorKsa'); },
    ], panels[0]);
  }

  function validatePassengers() {
    var holder = $('#paxField').firstElementChild;
    if (!state.pax.length) {
      EG.setInvalid(holder, true, 'Please add at least one passenger.');
      $('#addPaxBtn').focus();
      return false;
    }
    if (state.pax.some(function (p) { return p.busy; })) {
      EG.setInvalid(holder, true, 'Please wait a moment — some files are still being checked.');
      return false;
    }
    EG.setInvalid(holder, false);
    var firstBad = null;
    state.pax.forEach(function (p) {
      var ok = [
        EG.setInvalid(q(p, '[data-name]'), (p.name || '').trim().length < 2),
        EG.setInvalid(q(p, '[data-category]'), !p.category),
        p.passport ? EG.setInvalid(q(p, '[data-passport-btn]'), false) : EG.setInvalid(q(p, '[data-passport-btn]'), true, 'Please add this passenger\'s passport.'),
        p.photo ? EG.setInvalid(q(p, '[data-photo-btn]'), false) : EG.setInvalid(q(p, '[data-photo-btn]'), true, 'Please add this passenger\'s photo.'),
      ].every(Boolean);
      if (!ok && !firstBad) firstBad = p;
    });
    if (firstBad) {
      var el = firstBad.el.querySelector('.field.invalid input, .field.invalid select, .field.invalid button');
      firstBad.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (el) el.focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  // ---- Review --------------------------------------------------------------
  function counts() {
    var c = [0, 0, 0];
    state.pax.forEach(function (p) { c[LISTS.PASSENGER_CATEGORIES.indexOf(p.category)]++; });
    return c;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function renderReview() {
    var c = counts();
    var groups = [
      [0, 'Your details', [['Full Name', F.name.value.trim()], ['Phone / WhatsApp', F.phone.value.trim()], ['Email', F.email.value.trim()],
        ['Country of Residence', F.country.value], ['Travel Date', fmtDate(F.travelDate.value)], ['Departure City', F.departureCity.value.trim()],
        ['Confirmed flight ticket', EG.radioValue(form, 'flightTicket')], ['Travelled to Saudi Arabia before', EG.radioValue(form, 'priorKsa')],
        ['UK, US or Schengen visa', EG.radioValue(form, 'westernVisa')], ['Additional information', F.extraInfo.value.trim()],
        ['How you heard about us', F.heard.value]]],
      [1, 'Passengers — ' + plural(state.pax.length, 'passenger', 'passengers') + ' (' + plural(c[0], 'adult', 'adults') + ', ' +
        plural(c[1], 'child', 'children') + ', ' + plural(c[2], 'infant', 'infants') + ')',
        state.pax.map(function (p, i) {
          return [(i + 1) + '. ' + p.name.trim(), p.category + ' · passport ' + p.passportType.toUpperCase() + ' · photo ' + p.photo.kb.toFixed(1) + ' KB'];
        })],
    ];
    var body = $('#reviewBody');
    body.innerHTML = '';
    groups.forEach(function (g) {
      var sec = document.createElement('div'); sec.className = 'review-group';
      var head = document.createElement('div'); head.className = 'review-head';
      var h = document.createElement('h3'); h.textContent = g[1];
      var edit = document.createElement('button'); edit.type = 'button'; edit.className = 'link-btn'; edit.textContent = 'Edit';
      edit.setAttribute('aria-label', 'Edit ' + (g[0] ? 'passengers' : 'your details'));
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

  // ---- Wizard ------------------------------------------------------------
  var wizard = new EG.Wizard({
    stepper: $('#stepper'),
    label: $('#stepLabel'),
    steps: [
      { el: panels[0], title: panels[0].dataset.title, validate: validateLead },
      { el: panels[1], title: panels[1].dataset.title, validate: validatePassengers },
      { el: panels[2], title: panels[2].dataset.title, onEnter: renderReview },
      { el: panels[3], title: panels[3].dataset.title },
    ],
    onChange: function (i) {
      backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
      nextBtn.hidden = i >= 2;
      submitBtn.hidden = i !== 2;
      nav.hidden = i === 3;
      status.className = 'status';
    },
  });
  wizard.onChange(0);
  nextBtn.addEventListener('click', function () { wizard.next(); });
  backBtn.addEventListener('click', function () { wizard.back(); });
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && wizard.index < 2) {
      e.preventDefault();
      wizard.next();
    }
  });

  // ---- Submit: create → upload each passenger → finalize ------------------
  function showStatus(el, type, html) { el.className = 'status ' + type; el.innerHTML = html; }

  function leadPayload() {
    return {
      hp: F.company_website.value,
      name: F.name.value.trim(), phone: F.phone.value.trim(), email: F.email.value.trim(), country: F.country.value,
      travelDate: F.travelDate.value, departureCity: F.departureCity.value.trim(),
      flightTicket: EG.radioValue(form, 'flightTicket'), priorKsa: EG.radioValue(form, 'priorKsa'),
      westernVisa: EG.radioValue(form, 'westernVisa'), extraInfo: F.extraInfo.value.trim(), heard: F.heard.value,
      consent: F.consent.checked,
      passengers: state.pax.map(function (p) { return { name: p.name.trim(), category: p.category }; }),
    };
  }

  if (!EG.apiReady() && window.console) console.warn('[Elite Global] Form not connected yet: set SITE_CONFIG.webAppUrl in assets/js/config.js.');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (wizard.index < 2) { wizard.next(); return; }
    if (wizard.index !== 2 || state.phase !== 'edit') return;
    if (!validateLead()) { wizard.go(0, { force: true }); validateLead(); return; }
    if (!validatePassengers()) { wizard.go(1, { force: true }); validatePassengers(); return; }
    var consentErr = $('#e-consent');
    if (!F.consent.checked) {
      $('#consentField').classList.add('invalid'); consentErr.style.display = 'block'; F.consent.focus();
      return;
    }
    $('#consentField').classList.remove('invalid'); consentErr.style.display = 'none';
    if (F.company_website.value) { finish('EG-VO-' + String(Math.floor(Math.random() * 99999)).padStart(5, '0')); return; } // bot
    if (!EG.apiReady()) { showStatus(status, 'err', 'Sorry, online applications are temporarily unavailable.' + EG.contactFallback()); return; }
    if (!navigator.onLine) { showStatus(status, 'err', 'You appear to be offline. Please check your connection and try again.' + EG.contactFallback()); return; }

    submitBtn.disabled = true; backBtn.disabled = true;
    var label = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="sending" aria-hidden="true"></span>Submitting…';
    status.className = 'status';

    // Not retried automatically: a lost reply would otherwise create a second application.
    EG.postAction('createVisaApplication', leadPayload(), { retries: 0, timeout: 45000 })
      .then(function (res) {
        if (res && res.ok) {
          state.leadId = res.leadId; state.token = res.token; state.phase = 'uploading';
          startUploads();
          return;
        }
        var step = res && res.field === 'passengers' ? 1 : res && res.field && F[res.field] ? 0 : -1;
        if (step >= 0) wizard.go(step, { force: true });
        if (step === 0) { var f = F[res.field]; if (f.length && !f.tagName) f = f[0]; EG.setInvalid(f, true, res.error); f.focus(); }
        if (step === 1) EG.setInvalid($('#paxField').firstElementChild, true, res.error);
        if (step < 0) showStatus(status, 'err', EG.escapeHtml((res && res.error) || 'Sorry, we could not submit your application.') + EG.contactFallback());
      }, function () {
        showStatus(status, 'err', 'Sorry, we could not submit your application. Please check your connection and try again.' + EG.contactFallback());
      })
      .then(function () { submitBtn.disabled = false; backBtn.disabled = false; submitBtn.innerHTML = label; });
  });

  // ---- Upload step ---------------------------------------------------------
  var upList = $('#upList'), upStatus = $('#upStatus'), retryAllBtn = $('#retryAllBtn');

  function startUploads() {
    $('#upLeadId').textContent = state.leadId;
    upList.innerHTML = '';
    state.pax.forEach(function (p, i) {
      p.status = 'pending';
      var li = document.createElement('li');
      var name = document.createElement('span'); name.textContent = (i + 1) + '. ' + p.name.trim();
      var st = document.createElement('span'); st.className = 'st wait'; st.textContent = 'Waiting';
      li.appendChild(name); li.appendChild(st);
      p.li = li; p.liStatus = st;
      upList.appendChild(li);
    });
    wizard.go(3, { force: true });
    uploadAll();
  }

  function setLi(p, cls, text, retry) {
    p.liStatus.className = 'st ' + cls;
    p.liStatus.textContent = text;
    var old = p.li.querySelector('button');
    if (old) old.remove();
    if (retry) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-outline'; b.textContent = 'Retry';
      b.setAttribute('aria-label', 'Retry passenger ' + (state.pax.indexOf(p) + 1));
      b.addEventListener('click', function () { uploadAll([p]); });
      p.li.appendChild(b);
    }
  }

  function updateProgress() {
    var n = state.pax.length, ok = state.pax.filter(function (p) { return p.status === 'ok'; }).length;
    var pct = n ? Math.round(ok / n * 100) : 0;
    $('#progressBar').style.width = pct + '%';
    $('#progress').setAttribute('aria-valuenow', String(pct));
    $('#progressText').textContent = ok + ' of ' + n + ' passengers uploaded';
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** One passenger: prepare files, send, retry up to 3 times on network errors or "busy". */
  function uploadOne(p) {
    var index = state.pax.indexOf(p) + 1;
    p.status = 'sending'; setLi(p, 'wait', 'Preparing…');
    var attempt = 0;
    function send(prepared) {
      setLi(p, 'wait', attempt ? 'Retrying (' + attempt + ')…' : 'Uploading…');
      return Promise.all([EG.toBase64(prepared.blob), EG.toBase64(p.photo.blob)]).then(function (b64) {
        return EG.postAction('uploadPassenger', {
          leadId: state.leadId, token: state.token, index: index, name: p.name.trim(), category: p.category,
          passport: { name: 'passport.' + prepared.type, mime: EG.MIME[prepared.type], b64: b64[0] },
          photo: { mime: EG.MIME[p.photo.type], b64: b64[1] },
        }, { retries: 0, timeout: 120000 });
      }).then(function (res) {
        if (res && res.ok) return res;
        if (res && /busy/i.test(res.error || '') && attempt < 3) { attempt++; return wait(2000 * attempt).then(function () { return send(prepared); }); }
        var err = new Error((res && res.error) || 'Upload failed.'); err.userFacing = true; err.expired = /expired/i.test(err.message);
        throw err;
      }, function (err) {
        if (attempt < 3) { attempt++; return wait(1500 * Math.pow(2, attempt)).then(function () { return send(prepared); }); }
        throw err;
      });
    }
    return EG.preparePassport(p.passport, p.passportType).then(send).then(function () {
      p.status = 'ok'; p.error = '';
      setLi(p, 'ok', 'Uploaded ✓');
    }, function (err) {
      p.status = 'err';
      p.error = err.userFacing ? err.message : 'Connection problem.';
      setLi(p, 'err', p.error, !err.expired);
      if (err.expired) state.expired = true;
    }).then(updateProgress);
  }

  function uploadAll(only) {
    if (state.running) return;
    state.running = true;
    retryAllBtn.hidden = true;
    upStatus.className = 'status';
    $('#upTitle').textContent = 'Sending your application…';
    var todo = (only || state.pax).filter(function (p) { return p.status !== 'ok'; });
    var chain = Promise.resolve();
    todo.forEach(function (p) { chain = chain.then(function () { if (!state.expired) return uploadOne(p); }); });
    chain.then(function () {
      state.running = false;
      if (state.expired) {
        $('#upTitle').textContent = 'This application has expired';
        showStatus(upStatus, 'err', 'Please <a href="apply-visa.html">start a new application</a>. Your reference was ' + EG.escapeHtml(state.leadId) + '.' + EG.contactFallback());
        state.phase = 'edit'; dirty = false;
        return;
      }
      var failed = state.pax.filter(function (p) { return p.status !== 'ok'; });
      if (failed.length) {
        $('#upTitle').textContent = 'Some uploads did not finish';
        retryAllBtn.hidden = false;
        showStatus(upStatus, 'err', plural(failed.length, 'passenger', 'passengers') + ' could not be uploaded. Check your connection and tap “Retry”. ' +
          'Your application ' + EG.escapeHtml(state.leadId) + ' is saved, so nothing else needs to be re-entered.' + EG.contactFallback());
        return;
      }
      return finalize();
    });
  }

  function finalize() {
    state.running = true;
    $('#upTitle').textContent = 'Finishing…';
    return EG.postAction('finalizeVisaApplication', { leadId: state.leadId, token: state.token }, { retries: 2, timeout: 45000 })
      .then(function (res) {
        state.running = false;
        if (res && res.ok) { finish(res.leadId); return; }
        if (res && res.missing) {
          res.missing.forEach(function (i) { var p = state.pax[i - 1]; if (p) { p.status = 'err'; setLi(p, 'err', 'Not received', true); } });
          updateProgress();
        }
        $('#upTitle').textContent = 'Almost done';
        retryAllBtn.hidden = false;
        showStatus(upStatus, 'err', EG.escapeHtml((res && res.error) || 'We could not finish your application.') + EG.contactFallback());
      }, function () {
        state.running = false;
        $('#upTitle').textContent = 'Almost done';
        retryAllBtn.hidden = false;
        showStatus(upStatus, 'err', 'We could not reach our server to finish. Please check your connection and tap “Retry”.' + EG.contactFallback());
      });
  }
  retryAllBtn.addEventListener('click', function () { uploadAll(); });

  function finish(leadId) {
    state.phase = 'done';
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls.clear();
    var n = state.pax.length;
    form.hidden = true; $('#stepper').hidden = true; $('#stepLabel').hidden = true;
    $('#leadId').textContent = leadId;
    $('#successCount').textContent = plural(n, 'passenger', 'passengers');
    var s = $('#successPanel'); s.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    s.focus({ preventScroll: true });
  }
})();
