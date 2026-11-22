/*
 * Correct a visa application (correct-visa.html), opened from track.html after the email code.
 * The correction token is in sessionStorage ("eg-corr", this tab only; never in the URL).
 * Flow: loadCorrection → answers, passengers and which files exist (file type only — the old files are
 *       never sent to the browser) → the customer changes answers / replaces files →
 *       uploadCorrectionFile (one file per request, Retry) → submitCorrection → thank-you screen.
 * Email and phone cannot be changed here (WhatsApp link). Every value is written with textContent / value.
 */
(function () {
  'use strict';
  var EG = window.EG, LISTS = window.EG_LISTS, $ = EG.$, $$ = EG.$$, check = EG.check;
  var KEY = 'eg-corr', TRACK_KEY = 'eg-track';
  var form = $('#corrForm'), F = form.elements;
  var status = $('#corrStatus'), submitBtn = $('#corrSubmit'), retryBtn = $('#corrRetry'), upList = $('#corrUpList');
  var LABEL = { passport: 'Passport biodata page', photo: 'Passport photograph', ticket: 'Flight ticket', hotel: 'Hotel booking' };
  var SHORT = { passport: 'passport', photo: 'photo', ticket: 'flight ticket', hotel: 'hotel booking' };
  var ACCEPT = { passport: 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png', photo: 'image/jpeg,image/png,.jpg,.jpeg,.png',
    ticket: 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png', hotel: 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png' };
  // Correction For (staff) → what is highlighted
  var HIGHLIGHT = {
    'Passport photo': { kinds: ['photo'] }, 'Passport data page': { kinds: ['passport'] },
    'Personal details': { sections: ['personal'], names: true }, 'Travel details': { sections: ['travel'] },
    'Flight ticket': { kinds: ['ticket'] }, 'Hotel booking': { kinds: ['hotel'] },
  };

  var ctoken = '', data = null, slots = [], pax = [], running = false, done = false, dirty = false;
  var urls = [];
  function thumbUrl(blob) { var u = URL.createObjectURL(blob); urls.push(u); return u; }

  function load() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function forget() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function touchTrack() { // activity here counts as activity for the Track session
    try { var s = JSON.parse(sessionStorage.getItem(TRACK_KEY) || 'null'); if (s) { s.a = Date.now(); sessionStorage.setItem(TRACK_KEY, JSON.stringify(s)); } } catch (e) { /* ignore */ }
  }

  function showError(message) {
    forget();
    $('#corrLoading').hidden = true;
    form.hidden = true;
    var box = $('#corrError');
    box.querySelector('[data-error]').textContent = message;
    box.hidden = false;
    dirty = false;
  }
  function showStatus(type, html) { status.className = 'status ' + type; status.innerHTML = html; }

  // ---- static fields ------------------------------------------------------------------------------
  $$('select[data-list]', form).forEach(function (s) { EG.fillSelect(s, LISTS[s.dataset.list], s.dataset.placeholder); });
  $$('[data-choices]', form).forEach(function (c) { EG.fillChoices(c, c.dataset.choices, LISTS[c.dataset.list]); });
  var airport = EG.airportField({
    country: F.country, airport: F.departureAirport, other: F.departureAirportOther,
    otherField: $('[data-airport-other]', form), note: $('[data-airport-note]', form),
  });
  EG.clearOnInput(form);
  form.addEventListener('input', function () { dirty = true; });
  form.addEventListener('change', function () { dirty = true; });
  EG.guardUnload(function () { return running || (dirty && !done); });
  ['pointerdown', 'keydown'].forEach(function (t) { window.addEventListener(t, touchTrack, { passive: true }); });

  var stored = load();
  if (!stored || !stored.t || !(stored.x > Date.now())) {
    showError('Your correction session has ended or was not started. Please go back to the Track page, look up your application and choose “Make the correction” again.');
    return;
  }
  ctoken = stored.t;
  if (!EG.apiReady()) { showError('Sorry, corrections are temporarily unavailable. Please contact us on WhatsApp.'); return; }
  EG.postAction('loadCorrection', { hp: '', ctoken: ctoken }, { retries: 2, timeout: 30000 }).then(function (res) {
    if (res && res.ok) { fill(res); return; }
    showError((res && res.error) || 'We could not open your application. Please try again from the Track page.');
  }, function () {
    $('#corrLoading').textContent = 'We could not load your application. Please check your connection and refresh this page.';
  });

  // ---- fill the page ------------------------------------------------------------------------------------
  function setRadio(name, value) {
    $$('input[name="' + name + '"]', form).forEach(function (r) { r.checked = r.value === value; });
  }
  function setSelect(sel, value) { sel.value = value; sel.dispatchEvent(new Event('change')); }

  function fill(d) {
    data = d;
    $$('[data-ref]').forEach(function (el) { el.textContent = d.leadId; });
    var msg = $('[data-msgbox]', form);
    msg.querySelector('[data-message]').textContent = d.message || '';
    msg.hidden = !d.message;
    $('[data-email]', form).textContent = d.email || '';
    var a = d.answers;
    F.name.value = a.name || '';
    setSelect(F.country, a.country || '');
    F.travelDate.value = a.travelDate || '';
    F.travelDate.min = EG.todayISO();
    F.travelDate.dispatchEvent(new Event('change'));
    setRadio('flightTicket', a.flightTicket); setRadio('priorKsa', a.priorKsa); setRadio('westernVisa', a.westernVisa);
    F.extraInfo.value = a.extraInfo || '';
    // The airport list depends on the country (other countries load asynchronously)
    var setAirport = function () {
      if (!a.departureAirport) return;
      setSelect(F.departureAirport, a.departureAirport);
      if (a.departureAirport === 'OTHER') F.departureAirportOther.value = a.departureAirportOther || '';
    };
    if (Array.prototype.some.call(F.departureAirport.options, function (o) { return o.value === a.departureAirport; })) setAirport();
    else F.departureAirport.addEventListener('eg:options', function once() { F.departureAirport.removeEventListener('eg:options', once); setAirport(); });

    var list = $('#corrPax');
    d.passengers.forEach(function (p) { list.appendChild(paxCard(p)); });
    var shared = $('#corrShared');
    ['ticket', 'hotel'].forEach(function (k) { if (d.shared && d.shared[k]) shared.appendChild(fileSlot(0, k, d.shared[k], ' (all passengers)')); });
    $('#secShared').hidden = !shared.children.length;

    if (d.minutesLeft) $('[data-time]', form).textContent = 'Please finish within about ' + d.minutesLeft + ' minutes. After that, start again from the Track page.';
    highlight(d.correctionFor);
    $('#corrLoading').hidden = true;
    form.hidden = false;
    dirty = false;
    var first = $('.corr-highlight', form);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (first) first.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }

  function highlight(what) {
    var line = $('[data-for-line]', form);
    line.hidden = !what;
    if (!what) return;
    line.querySelector('[data-for]').textContent = what;
    var h = HIGHLIGHT[what];
    if (!h) return; // "Other (see message)": the message says what to do
    (h.sections || []).forEach(function (s) { $('[data-section="' + s + '"]', form).classList.add('corr-highlight'); });
    if (h.names) $$('.pax .pax-head-fields', form).forEach(function (el) { el.classList.add('corr-highlight'); });
    (h.kinds || []).forEach(function (k) { $$('.corr-file[data-kind="' + k + '"]', form).forEach(function (el) { el.classList.add('corr-highlight'); }); });
  }

  function paxCard(p) {
    var art = document.createElement('article');
    art.className = 'pax';
    var head = document.createElement('div'); head.className = 'pax-head';
    var h3 = document.createElement('h3'); h3.textContent = 'Passenger ' + p.index; head.appendChild(h3);
    art.appendChild(head);
    var grid = document.createElement('div'); grid.className = 'grid2 pax-head-fields';
    var nameL = document.createElement('label'); nameL.className = 'field'; nameL.textContent = 'Full name as on passport';
    var nameIn = document.createElement('input'); nameIn.maxLength = 100; nameIn.autocomplete = 'off'; nameIn.value = p.name; nameIn.setAttribute('data-pax-name', '');
    var nameErr = document.createElement('span'); nameErr.className = 'err-msg'; nameErr.textContent = 'Please enter the full name exactly as on the passport.';
    nameL.appendChild(nameIn); nameL.appendChild(nameErr);
    var catL = document.createElement('label'); catL.className = 'field'; catL.textContent = 'Category';
    var cat = document.createElement('select'); cat.setAttribute('data-combobox', 'select'); cat.setAttribute('data-pax-category', '');
    EG.fillSelect(cat, LISTS.PASSENGER_CATEGORIES, 'Choose a category');
    cat.value = p.category;
    var catErr = document.createElement('span'); catErr.className = 'err-msg'; catErr.textContent = 'Please choose a category.';
    catL.appendChild(cat); catL.appendChild(catErr);
    grid.appendChild(nameL); grid.appendChild(catL);
    art.appendChild(grid);
    var files = document.createElement('div'); files.className = 'pax-files';
    ['passport', 'photo', 'ticket', 'hotel'].forEach(function (k) { files.appendChild(fileSlot(p.index, k, p.files[k], '')); });
    art.appendChild(files);
    pax.push({ index: p.index, name: nameIn, category: cat, orig: { name: p.name, category: p.category } });
    setTimeout(function () { if (EG.combobox) EG.combobox(cat); }, 0);
    return art;
  }

  // ---- one file slot: "Uploaded ✓ — Replace" ----------------------------------------------------------
  function fileSlot(slot, kind, ext, suffix) {
    var node = $('#corrFileTpl').content.firstElementChild.cloneNode(true);
    node.setAttribute('data-kind', kind);
    node.setAttribute('data-slot', String(slot));
    var s = { slot: slot, kind: kind, ext: ext, el: node, file: null, type: '', photo: null, sent: false, gen: 0, busy: 0 };
    slots.push(s);
    node.querySelector('[data-label]').textContent = LABEL[kind] + suffix + (ext || kind === 'passport' || kind === 'photo' ? '' : ' (optional)');
    var input = node.querySelector('[data-input]'), cam = node.querySelector('[data-cam-input]');
    input.accept = ACCEPT[kind];
    cam.setAttribute('capture', kind === 'photo' ? 'user' : 'environment');
    node.querySelector('[data-pick]').addEventListener('click', function () { input.click(); });
    node.querySelector('[data-cam]').addEventListener('click', function () { cam.click(); });
    [input, cam].forEach(function (inp) {
      inp.addEventListener('change', function () { if (inp.files[0]) choose(s, inp.files[0]); inp.value = ''; });
    });
    node.querySelector('[data-undo]').addEventListener('click', function () { keep(s); });
    keep(s);
    return node;
  }

  function q(s, sel) { return s.el.querySelector(sel); }
  function setThumb(s, url, text) {
    var box = q(s, '[data-thumb]');
    box.innerHTML = '';
    if (url) { var img = document.createElement('img'); img.alt = ''; img.src = url; box.appendChild(img); } else box.textContent = text;
  }

  /** Back to the uploaded file (nothing will be sent for this slot). */
  function keep(s) {
    s.gen++; s.file = null; s.photo = null; s.type = ''; s.sent = false;
    s.el.classList.remove('corr-new');
    setThumb(s, '', s.ext ? s.ext.toUpperCase() : '—');
    q(s, '[data-title]').textContent = s.ext ? 'Uploaded ✓' : 'No file';
    q(s, '[data-name]').textContent = s.ext ? 'The file we already have (' + s.ext.toUpperCase() + ')' : (s.kind === 'photo' ? 'Portrait JPG or PNG · 25–50 KB' : 'PDF, JPG or PNG');
    q(s, '[data-note]').textContent = '';
    q(s, '[data-tip]').hidden = true;
    q(s, '[data-pick]').textContent = s.ext ? 'Replace' : 'Add file';
    q(s, '[data-undo]').hidden = true;
    EG.setInvalid(q(s, '[data-pick]'), false);
  }

  function choose(s, file) {
    var gen = ++s.gen;
    var pick = q(s, '[data-pick]');
    q(s, '[data-title]').textContent = s.kind === 'photo' && file.size > EG.FILE_LIMITS.PHOTO_MAX ? 'Resizing…' : 'Checking…';
    q(s, '[data-note]').textContent = '';
    q(s, '[data-tip]').hidden = true;
    s.busy++;
    var work = s.kind === 'photo' ? EG.processPhoto(file) : s.kind === 'passport' ? EG.checkPassport(file) : EG.checkDocument(file);
    work.then(function (r) {
      if (gen !== s.gen) return;
      s.file = file; s.sent = false; dirty = true;
      s.el.classList.add('corr-new');
      var note = q(s, '[data-note]');
      note.className = 'note ok';
      if (s.kind === 'photo') {
        s.photo = r; s.type = r.type;
        setThumb(s, thumbUrl(r.blob));
        q(s, '[data-title]').textContent = 'New photo · ' + r.kb.toFixed(1) + ' KB';
        note.textContent = r.compressed ? '✓ Resized from ' + EG.fmtSize(file.size) + ' to ' + r.kb.toFixed(1) + ' KB' : '✓ Size ' + r.kb.toFixed(1) + ' KB — within 25–50 KB';
        if (r.tip) { var tip = q(s, '[data-tip]'); tip.textContent = 'Tip: a passport photo is usually 35 × 45 mm (head and shoulders, plain white background).'; tip.hidden = false; }
      } else {
        s.type = r.type;
        q(s, '[data-title]').textContent = 'New file (' + r.type.toUpperCase() + ')';
        note.textContent = '✓ Ready — sent when you submit';
        if (r.type === 'pdf') setThumb(s, '', 'PDF');
        else EG.makeThumb(file).then(function (b) { if (gen === s.gen) setThumb(s, thumbUrl(b)); }, function () { setThumb(s, '', r.type.toUpperCase()); });
      }
      q(s, '[data-name]').textContent = file.name + ' · ' + EG.fmtSize(file.size);
      q(s, '[data-pick]').textContent = 'Choose another';
      q(s, '[data-undo]').hidden = false;
      EG.setInvalid(pick, false);
    }, function (err) {
      if (gen !== s.gen) return;
      keep(s);
      EG.setInvalid(pick, true, err.userFacing ? err.message : 'This file could not be read. Please choose it again.');
    }).then(function () { s.busy--; });
  }

  // ---- submit ------------------------------------------------------------------------------------------
  function answers() {
    return {
      name: F.name.value.trim(), country: F.country.value, travelDate: F.travelDate.value,
      departureAirport: F.departureAirport.value, departureAirportOther: F.departureAirportOther.value.trim(),
      flightTicket: EG.radioValue(form, 'flightTicket'), priorKsa: EG.radioValue(form, 'priorKsa'), westernVisa: EG.radioValue(form, 'westernVisa'),
      extraInfo: F.extraInfo.value.trim(),
    };
  }
  function passengers() {
    return pax.map(function (p) { return { index: p.index, name: p.name.value.trim(), category: p.category.value }; });
  }
  function changed() {
    var a = answers(), o = data.answers;
    var diff = Object.keys(a).some(function (k) { return String(a[k] || '') !== String(o[k] || ''); });
    return diff || slots.some(function (s) { return s.file; }) ||
      pax.some(function (p) { return p.name.value.trim() !== p.orig.name || p.category.value !== p.orig.category; });
  }

  function validate() {
    var unchangedDate = F.travelDate.value && F.travelDate.value === data.answers.travelDate;
    var checks = [
      function () { return check.text(F.name, 2); },
      function () { return check.select(F.country); },
      function () { return unchangedDate ? EG.setInvalid(F.travelDate, false) : check.date(F.travelDate, true); },
      function () { return check.select(F.departureAirport); },
      function () { return F.departureAirport.value !== 'OTHER' || check.text(F.departureAirportOther, 2); },
      function () { return check.radio(form, 'flightTicket'); },
      function () { return check.radio(form, 'priorKsa'); },
    ];
    pax.forEach(function (p) {
      checks.push(function () { return check.text(p.name, 2); });
      checks.push(function () { return check.select(p.category); });
    });
    return EG.checkAll(checks, form);
  }

  function li(s) {
    if (!s.li) { s.li = document.createElement('li'); upList.appendChild(s.li); }
    return s.li;
  }
  function setLi(s, cls, text) {
    var el = li(s);
    el.className = cls;
    el.textContent = (s.slot ? 'Passenger ' + s.slot + ' ' + SHORT[s.kind] : 'Shared ' + SHORT[s.kind]) + ' — ' + text;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function prepare(s) {
    if (s.kind === 'photo') return EG.toBase64(s.photo.blob).then(function (b64) { return { name: 'photo.' + s.photo.type, mime: EG.MIME[s.photo.type], b64: b64 }; });
    var prep = s.kind === 'passport' ? EG.preparePassport(s.file, s.type) : EG.prepareDocument(s.file, s.type);
    return prep.then(function (p) {
      return EG.toBase64(p.blob).then(function (b64) { return { name: s.kind + '.' + p.type, mime: EG.MIME[p.type], b64: b64 }; });
    });
  }

  /** One file: up to 3 automatic retries on connection problems or "busy" replies. */
  function uploadOne(s) {
    var attempt = 0;
    setLi(s, 'wait', 'Preparing…');
    return prepare(s).then(function (file) {
      function go() {
        setLi(s, 'wait', attempt ? 'Retrying (' + attempt + ')…' : 'Uploading…');
        return EG.postAction('uploadCorrectionFile', { hp: '', ctoken: ctoken, slot: s.slot, kind: s.kind, file: file }, { retries: 0, timeout: 120000, networkBusy: false }).then(function (res) {
          if (res && res.ok) return res;
          if (res && /busy/i.test(res.error || '') && attempt < 3) { attempt++; return wait(2000 * attempt).then(go); }
          var e = new Error((res && res.error) || 'Upload failed.'); e.userFacing = true; e.restart = !!(res && res.restart);
          throw e;
        }, function (err) {
          if (attempt < 3) { attempt++; return wait(1500 * Math.pow(2, attempt)).then(go); }
          throw err;
        });
      }
      return go();
    }).then(function () { s.sent = true; setLi(s, 'ok', 'Uploaded ✓'); }, function (err) {
      setLi(s, 'err', err.userFacing ? err.message : 'Connection problem.');
      throw err;
    });
  }

  function lock(on) {
    running = on;
    submitBtn.disabled = on;
    $$('input,select,textarea,button', form).forEach(function (el) { if (el !== retryBtn && !el.closest('.wizard-nav')) el.disabled = on; });
  }

  function run() {
    if (running) return;
    lock(true);
    retryBtn.hidden = true;
    var todo = slots.filter(function (s) { return s.file && !s.sent; });
    upList.hidden = !todo.length && !upList.children.length;
    showStatus('', todo.length ? 'Sending your new files… Please keep this page open.' : 'Sending your correction…');
    var chain = Promise.resolve(), failed = null;
    todo.forEach(function (s) { chain = chain.then(function () { if (!failed) return uploadOne(s).then(null, function (e) { failed = e; }); }); });
    chain.then(function () {
      if (failed) {
        lock(false);
        if (failed.restart) { showError(failed.message); return; }
        retryBtn.hidden = false;
        showStatus('err', 'A file could not be sent. Check your connection and tap “Retry failed uploads”. Your other changes are kept.' + EG.contactFallback());
        return;
      }
      showStatus('', 'Sending your correction…');
      return EG.postAction('submitCorrection', { hp: F.company_website.value, ctoken: ctoken, answers: answers(), passengers: passengers() },
        { retries: 0, timeout: 120000 }).then(function (res) {
        lock(false);
        if (res && res.ok) { success(); return; }
        if (res && res.restart) { showError(res.error); return; }
        showStatus('err', EG.escapeHtml((res && res.error) || 'Your correction could not be sent.') + EG.contactFallback());
      }, function () {
        lock(false);
        retryBtn.hidden = false;
        showStatus('err', 'We could not reach our system. Check your connection and tap “Retry failed uploads” to send your correction again.' + EG.contactFallback());
      });
    });
  }

  function success() {
    done = true; dirty = false;
    forget();
    touchTrack();
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    form.hidden = true;
    var ok = $('#corrDone');
    ok.hidden = false;
    ok.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!data || running) return;
    if (slots.some(function (s) { return s.busy; })) { showStatus('err', 'Please wait until the files have been checked.'); return; }
    if (!validate()) { showStatus('err', 'Please correct the highlighted fields and try again.'); return; }
    if (!changed()) { showStatus('err', 'Nothing has been changed yet. Replace a file or change an answer, then submit.'); return; }
    run();
  });
  retryBtn.addEventListener('click', run);
})();
