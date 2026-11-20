/*
 * Request Umrah Visa Only — lead details, passenger cards with passport + photo, review, upload.
 * Flow: createVisaApplication → Lead ID + token → uploadDocument (shared files, once) →
 *       per passenger: uploadPassenger + uploadDocument (own files) — one request each, retry-safe →
 *       finalizeVisaApplication → success screen.
 * Optional documents (flight ticket, hotel booking) belong to a passenger, or — with "Use this file
 * for all passengers" — to the application (state.shared), and are then stored only once.
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

  var state = { pax: [], seq: 0, leadId: '', token: '', phase: 'edit', running: false, // phase: edit | uploading | done
    shared: { ticket: null, hotel: null }, sharedItem: null };
  var DOCS = ['ticket', 'hotel'];
  var DOC_NAME = { ticket: 'Flight ticket', hotel: 'Hotel booking' };
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
  var airport = EG.airportField({
    country: F.country, airport: F.departureAirport, other: F.departureAirportOther,
    otherField: $('[data-airport-other]', form), note: $('[data-airport-note]', form),
  });
  EG.clearOnInput(form);
  form.addEventListener('input', function () { dirty = true; });
  form.addEventListener('change', function () { dirty = true; });
  EG.guardUnload(function () { return state.phase === 'uploading' || (dirty && state.phase !== 'done'); });

  // ---- Passenger cards ---------------------------------------------------
  function q(p, sel) { return p.el.querySelector(sel); }

  function addPassenger(passportFile) {
    if (state.pax.length >= MAX) return null;
    var p = { id: ++state.seq, name: '', category: '', passport: null, passportType: '', passportThumb: '',
      photo: null, photoThumb: '', busy: 0, gen: { passport: 0, photo: 0, ticket: 0, hotel: 0 }, status: 'pending', error: '',
      docs: { ticket: null, hotel: null }, sent: {} };
    state.pax.push(p);
    renderCard(p);
    if (passportFile) setPassport(p, passportFile);
    renumber();
    renderAllDocs(); // "use for all" needs two or more passengers
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
    // Camera (phones): passport with the back camera, photo with the front camera
    var pCam = node.querySelector('[data-passport-cam-input]'), phCam = node.querySelector('[data-photo-cam-input]');
    node.querySelector('[data-passport-cam]').addEventListener('click', function () { pCam.click(); });
    node.querySelector('[data-photo-cam]').addEventListener('click', function () { phCam.click(); });
    pCam.addEventListener('change', function () { if (pCam.files[0]) setPassport(p, pCam.files[0]); pCam.value = ''; });
    phCam.addEventListener('change', function () { if (phCam.files[0]) setPhoto(p, phCam.files[0]); phCam.value = ''; });
    DOCS.forEach(function (kind) { setupDoc(p, kind); });
    node.querySelector('[data-remove]').addEventListener('click', function () { removePassenger(p); });
    paxList.appendChild(node);
  }

  function removePassenger(p) {
    revoke(p.passportThumb); revoke(p.photoThumb);
    p.passportThumb = p.photoThumb = '';
    p.gen.passport++; p.gen.photo++; p.gen.ticket++; p.gen.hotel++; // ignore work still running for this card
    DOCS.forEach(function (kind) {
      if (p.docs[kind]) revoke(p.docs[kind].thumb);
      var sh = state.shared[kind];
      if (sh && sh.owner === p) { revoke(sh.thumb); state.shared[kind] = null; }
    });
    p.el.remove();
    state.pax.splice(state.pax.indexOf(p), 1);
    renumber();
    renderAllDocs();
    dirty = true;
  }

  function renumber() {
    var n = state.pax.length;
    state.pax.forEach(function (p, i) {
      q(p, '[data-no]').textContent = i + 1;
      q(p, '[data-remove]').setAttribute('aria-label', 'Remove passenger ' + (i + 1));
      q(p, '[data-photo-btn]').setAttribute('aria-label', 'Choose photo file for passenger ' + (i + 1));
      q(p, '[data-passport-btn]').setAttribute('aria-label', 'Choose passport file for passenger ' + (i + 1));
      q(p, '[data-passport-cam]').setAttribute('aria-label', 'Take a photo of the passport of passenger ' + (i + 1));
      q(p, '[data-photo-cam]').setAttribute('aria-label', 'Take the passport photograph of passenger ' + (i + 1));
      DOCS.forEach(function (kind) {
        var box = q(p, '[data-doc="' + kind + '"]'), what = DOC_NAME[kind].toLowerCase() + ' for passenger ' + (i + 1);
        box.querySelector('[data-doc-btn]').setAttribute('aria-label', 'Choose ' + what);
        box.querySelector('[data-doc-cam]').setAttribute('aria-label', 'Take a photo of the ' + what);
        box.querySelector('[data-doc-remove]').setAttribute('aria-label', 'Remove ' + what);
      });
    });
    $('#paxTools').hidden = n === 0;
    $('#paxCount').textContent = n + (n === 1 ? ' passenger' : ' passengers') + ' · up to ' + MAX;
    ['#addPaxBtn', '#addPaxBtn2', '#pickAllBtn', '#camPaxBtn'].forEach(function (s) { $(s).disabled = n >= MAX; });
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
      btn.textContent = 'Change file';
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
      btn.textContent = 'Choose file';
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
      btn.textContent = 'Change file';
      EG.setInvalid(btn, false);
    }, function (err) {
      if (gen !== p.gen.photo) return;
      revoke(p.photoThumb); p.photoThumb = ''; p.photo = null;
      setThumb(q(p, '[data-photo-thumb]'), '', '✕');
      q(p, '[data-photo-title]').textContent = 'Photo not accepted';
      q(p, '[data-photo-name]').textContent = file.name + ' · ' + EG.fmtSize(file.size);
      EG.setInvalid(btn, true, err.userFacing ? err.message : 'This photo could not be read. Please choose another one.');
      btn.textContent = 'Choose file';
    }).then(function () { p.busy--; });
  }

  // ---- Optional documents: flight ticket, hotel booking ---------------------------------
  function docBox(p, kind) { return q(p, '[data-doc="' + kind + '"]'); }

  function setupDoc(p, kind) {
    var box = docBox(p, kind);
    var input = box.querySelector('[data-doc-input]'), cam = box.querySelector('[data-doc-cam-input]');
    box.querySelector('[data-doc-btn]').addEventListener('click', function () { input.click(); });
    box.querySelector('[data-doc-cam]').addEventListener('click', function () { cam.click(); });
    [input, cam].forEach(function (inp) {
      inp.addEventListener('change', function () { if (inp.files[0]) setDoc(p, kind, inp.files[0]); inp.value = ''; });
    });
    box.querySelector('[data-doc-remove]').addEventListener('click', function () { clearDoc(p, kind); });
    box.querySelector('[data-doc-share]').addEventListener('change', function (e) { shareDoc(p, kind, e.target.checked); });
    renderDoc(p, kind);
  }

  /** The file this card shows for kind: its own, or the shared one when it owns it. */
  function docOf(p, kind) {
    var sh = state.shared[kind];
    return sh && sh.owner === p ? sh : p.docs[kind];
  }

  function setDoc(p, kind, file) {
    var gen = ++p.gen[kind];
    var box = docBox(p, kind);
    box.querySelector('[data-doc-title]').textContent = 'Checking…';
    p.busy++;
    return EG.checkDocument(file).then(function (r) {
      if (gen !== p.gen[kind] || !p.el.isConnected) return;
      var d = { file: file, type: r.type, large: r.large, thumb: '' };
      var sh = state.shared[kind];
      var old = docOf(p, kind);
      if (old) revoke(old.thumb);
      if (sh && sh.owner === p) { d.owner = p; state.shared[kind] = d; } else p.docs[kind] = d;
      EG.setInvalid(box.querySelector('[data-doc-btn]'), false);
      renderAllDocs();
      if (r.type === 'pdf') return;
      return EG.makeThumb(file).then(function (blob) {
        if (gen !== p.gen[kind] || !p.el.isConnected || docOf(p, kind) !== d) return;
        d.thumb = track(URL.createObjectURL(blob));
        renderAllDocs();
      }, function () {});
    }, function (err) {
      if (gen !== p.gen[kind]) return;
      renderDoc(p, kind);
      box.querySelector('[data-doc-title]').textContent = 'File not accepted';
      box.querySelector('[data-doc-name]').textContent = file.name;
      EG.setInvalid(box.querySelector('[data-doc-btn]'), true, err.userFacing ? err.message : 'This file could not be read. Please choose it again.');
    }).then(function () { p.busy--; });
  }

  function clearDoc(p, kind) {
    p.gen[kind]++;
    var sh = state.shared[kind];
    if (sh && sh.owner === p) { revoke(sh.thumb); state.shared[kind] = null; }
    else if (p.docs[kind]) { revoke(p.docs[kind].thumb); p.docs[kind] = null; }
    renderAllDocs();
    dirty = true;
  }

  /** "Use this file for all passengers": the file moves to the application and is sent once. */
  function shareDoc(p, kind, on) {
    if (on) {
      var d = p.docs[kind];
      if (!d) return;
      d.owner = p;
      state.shared[kind] = d;
      p.docs[kind] = null;
      state.pax.forEach(function (o) { if (o !== p && o.docs[kind]) { revoke(o.docs[kind].thumb); o.docs[kind] = null; o.gen[kind]++; } });
    } else if (state.shared[kind] && state.shared[kind].owner === p) {
      var s = state.shared[kind];
      delete s.owner;
      p.docs[kind] = s;
      state.shared[kind] = null;
    }
    renderAllDocs();
    dirty = true;
  }

  function renderDoc(p, kind) {
    var box = docBox(p, kind);
    var sh = state.shared[kind];
    var mine = docOf(p, kind);
    var other = sh && sh.owner !== p;
    var title = box.querySelector('[data-doc-title]'), name = box.querySelector('[data-doc-name]'), note = box.querySelector('[data-doc-note]');
    var share = box.querySelector('[data-doc-share]'), remove = box.querySelector('[data-doc-remove]');
    var choose = box.querySelector('[data-doc-btn]'), cam = box.querySelector('[data-doc-cam]');
    choose.disabled = cam.disabled = !!other;
    note.className = 'note';
    note.textContent = '';
    if (other) {
      setThumb(box.querySelector('[data-doc-thumb]'), sh.thumb, sh.type === 'pdf' ? 'PDF' : sh.type.toUpperCase());
      title.textContent = 'Shared file';
      name.textContent = 'Using the file from passenger ' + (state.pax.indexOf(sh.owner) + 1) + ' for all passengers';
      share.checked = false; share.disabled = true; remove.hidden = true;
      choose.textContent = 'Choose file';
    } else if (mine) {
      setThumb(box.querySelector('[data-doc-thumb]'), mine.thumb, mine.type === 'pdf' ? 'PDF' : mine.type.toUpperCase());
      title.textContent = DOC_NAME[kind] + ' (' + mine.type.toUpperCase() + ')';
      name.textContent = mine.file.name + ' · ' + EG.fmtSize(mine.file.size);
      if (mine.large && mine.type !== 'pdf') { note.className = 'note ok'; note.textContent = '✓ Ready — will be compressed when sent'; }
      else if (mine.large) { note.className = 'note warn'; note.textContent = 'Larger than the recommended 2 MB — sending may take longer'; }
      else { note.className = 'note ok'; note.textContent = sh && sh.owner === p ? '✓ Ready — used for all passengers' : '✓ Ready'; }
      share.disabled = state.pax.length < 2; share.checked = !!(sh && sh.owner === p); remove.hidden = false;
      choose.textContent = 'Change file';
    } else {
      setThumb(box.querySelector('[data-doc-thumb]'), '', 'PDF');
      title.textContent = 'No file';
      name.textContent = 'PDF, JPG or PNG · recommended ≤ 2 MB';
      share.checked = false; share.disabled = true; remove.hidden = true;
      choose.textContent = 'Choose file';
    }
    var count = DOCS.filter(function (k) { return docOf(p, k) || state.shared[k]; }).length;
    q(p, '[data-docs-count]').textContent = count ? ' · ' + count + ' added' : '';
  }

  function renderAllDocs() {
    state.pax.forEach(function (p) { DOCS.forEach(function (kind) { renderDoc(p, kind); }); });
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
  var camPax = $('#camPax');
  $('#camPaxBtn').addEventListener('click', function () { camPax.click(); });
  camPax.addEventListener('change', function () { addPassportFiles(camPax.files); camPax.value = ''; });
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
      function () { return airport.validate(); },
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
        ['Country of Residence', F.country.value], ['Travel Date', fmtDate(F.travelDate.value)], ['Departure Airport', airport.text()],
        ['Confirmed flight ticket', EG.radioValue(form, 'flightTicket')], ['Travelled to Saudi Arabia before', EG.radioValue(form, 'priorKsa')],
        ['UK, US or Schengen visa', EG.radioValue(form, 'westernVisa')], ['Additional information', F.extraInfo.value.trim()],
        ['How you heard about us', F.heard.value]]],
      [1, 'Passengers — ' + plural(state.pax.length, 'passenger', 'passengers') + ' (' + plural(c[0], 'adult', 'adults') + ', ' +
        plural(c[1], 'child', 'children') + ', ' + plural(c[2], 'infant', 'infants') + ')',
        state.pax.map(function (p, i) {
          var docs = DOCS.filter(function (k) { return p.docs[k]; }).map(function (k) { return DOC_NAME[k].toLowerCase(); });
          return [(i + 1) + '. ' + p.name.trim(), p.category + ' · passport ' + p.passportType.toUpperCase() + ' · photo ' + p.photo.kb.toFixed(1) + ' KB' +
            (docs.length ? ' · ' + docs.join(', ') : '')];
        }).concat(DOCS.filter(function (k) { return state.shared[k]; }).map(function (k) {
          return [DOC_NAME[k] + ' (all passengers)', state.shared[k].file.name];
        }))],
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
      travelDate: F.travelDate.value, departureAirport: airport.payload().departureAirport,
      departureAirportOther: airport.payload().departureAirportOther,
      flightTicket: EG.radioValue(form, 'flightTicket'), priorKsa: EG.radioValue(form, 'priorKsa'),
      westernVisa: EG.radioValue(form, 'westernVisa'), extraInfo: F.extraInfo.value.trim(), heard: F.heard.value,
      consent: F.consent.checked,
      passengers: state.pax.map(function (p) { return { name: p.name.trim(), category: p.category }; }),
      docs: {
        shared: { ticket: !!state.shared.ticket, hotel: !!state.shared.hotel },
        passengers: state.pax.map(function (p) { return { ticket: !!p.docs.ticket, hotel: !!p.docs.hotel }; }),
      },
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

  /** Upload items: the shared documents (if any) first, then every passenger. */
  function items() { return (state.sharedItem ? [state.sharedItem] : []).concat(state.pax); }

  function startUploads() {
    $('#upLeadId').textContent = state.leadId;
    upList.innerHTML = '';
    state.sharedItem = DOCS.some(function (k) { return state.shared[k]; }) ? { shared: true, sent: {}, status: 'pending' } : null;
    items().forEach(function (p) {
      p.status = 'pending'; p.sent = p.sent || {};
      var li = document.createElement('li');
      var name = document.createElement('span');
      if (p.shared) name.textContent = 'Shared ' + DOCS.filter(function (k) { return state.shared[k]; }).map(function (k) { return DOC_NAME[k].toLowerCase(); }).join(' and ') + ' (all passengers)';
      else {
        var docs = DOCS.filter(function (k) { return p.docs[k]; }).length;
        name.textContent = (state.pax.indexOf(p) + 1) + '. ' + p.name.trim() + (docs ? ' + ' + docs + (docs === 1 ? ' document' : ' documents') : '');
      }
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
      b.setAttribute('aria-label', p.shared ? 'Retry shared documents' : 'Retry passenger ' + (state.pax.indexOf(p) + 1));
      b.addEventListener('click', function () { uploadAll([p]); });
      p.li.appendChild(b);
    }
  }

  function updateProgress() {
    var all = items(), done = all.filter(function (p) { return p.status === 'ok'; }).length;
    var n = state.pax.length, ok = state.pax.filter(function (p) { return p.status === 'ok'; }).length;
    var pct = all.length ? Math.round(done / all.length * 100) : 0;
    $('#progressBar').style.width = pct + '%';
    $('#progress').setAttribute('aria-valuenow', String(pct));
    $('#progressText').textContent = ok + ' of ' + n + ' passengers uploaded';
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** POSTs one upload; retries up to 3 times on network errors or "busy" replies. */
  function postRetry(item, action, payload, label) {
    var attempt = 0;
    function go() {
      setLi(item, 'wait', (attempt ? 'Retrying (' + attempt + ')… ' : '') + label);
      return EG.postAction(action, payload, { retries: 0, timeout: 120000 }).then(function (res) {
        if (res && res.ok) return res;
        if (res && /busy/i.test(res.error || '') && attempt < 3) { attempt++; return wait(2000 * attempt).then(go); }
        var err = new Error((res && res.error) || 'Upload failed.'); err.userFacing = true; err.expired = /expired/i.test(err.message);
        throw err;
      }, function (err) {
        if (attempt < 3) { attempt++; return wait(1500 * Math.pow(2, attempt)).then(go); }
        throw err;
      });
    }
    return go();
  }

  /** One optional document (scope 'all' or a passenger number). */
  function sendDoc(item, scope, kind, d, name) {
    return EG.prepareDocument(d.file, d.type).then(function (prepared) {
      return EG.toBase64(prepared.blob).then(function (b64) {
        return postRetry(item, 'uploadDocument', {
          leadId: state.leadId, token: state.token, scope: scope, kind: kind, name: name,
          file: { name: kind + '.' + prepared.type, mime: EG.MIME[prepared.type], b64: b64 },
        }, DOC_NAME[kind] + '…');
      });
    }).then(function () { item.sent[kind] = true; });
  }

  /** One upload item: the shared documents, or a passenger (passport + photo, then own documents). */
  function uploadOne(p) {
    p.status = 'sending'; setLi(p, 'wait', 'Preparing…');
    var chain = Promise.resolve();
    if (p.shared) {
      DOCS.forEach(function (kind) {
        if (state.shared[kind]) chain = chain.then(function () { if (!p.sent[kind]) return sendDoc(p, 'all', kind, state.shared[kind], ''); });
      });
    } else {
      var index = state.pax.indexOf(p) + 1;
      chain = chain.then(function () {
        if (p.sent.main) return;
        return EG.preparePassport(p.passport, p.passportType).then(function (prepared) {
          return Promise.all([EG.toBase64(prepared.blob), EG.toBase64(p.photo.blob)]).then(function (b64) {
            return postRetry(p, 'uploadPassenger', {
              leadId: state.leadId, token: state.token, index: index, name: p.name.trim(), category: p.category,
              passport: { name: 'passport.' + prepared.type, mime: EG.MIME[prepared.type], b64: b64[0] },
              photo: { mime: EG.MIME[p.photo.type], b64: b64[1] },
            }, 'Uploading…');
          });
        }).then(function () { p.sent.main = true; });
      });
      DOCS.forEach(function (kind) {
        if (p.docs[kind]) chain = chain.then(function () { if (!p.sent[kind]) return sendDoc(p, index, kind, p.docs[kind], p.name.trim()); });
      });
    }
    return chain.then(function () {
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
    var todo = (only || items()).filter(function (p) { return p.status !== 'ok'; });
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
      var failed = items().filter(function (p) { return p.status !== 'ok'; });
      if (failed.length) {
        $('#upTitle').textContent = 'Some uploads did not finish';
        retryAllBtn.hidden = false;
        showStatus(upStatus, 'err', plural(failed.length, 'upload', 'uploads') + ' could not be completed. Check your connection and tap “Retry”. ' +
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
          res.missing.forEach(function (i) {
            var p = i === 0 ? state.sharedItem : state.pax[i - 1];
            if (p) { p.status = 'err'; p.sent = {}; setLi(p, 'err', 'Not received', true); }
          });
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
