/*
 * Elite Global — branded date picker (navy/gold), replaces every <input type="date">.
 * The original input stays in the form as a hidden value holder with the same name, so
 * form.elements.travelDate.value, validation and payloads are unchanged (value: YYYY-MM-DD).
 * A button shows the chosen date and opens a dialog with a month grid (WAI-ARIA APG date picker):
 *   ←/→ day · ↑/↓ week · Home/End week start/end · PgUp/PgDn month (+Shift: year)
 *   Enter/Space choose · Esc close. Days before `min` (default: today) cannot be chosen.
 */
window.EG = window.EG || {};
(function () {
  'use strict';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = [['Mo', 'Monday'], ['Tu', 'Tuesday'], ['We', 'Wednesday'], ['Th', 'Thursday'], ['Fr', 'Friday'], ['Sa', 'Saturday'], ['Su', 'Sunday']];
  var valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var seq = 0;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
  }
  function today() {
    var t = window.EG.todayISO ? window.EG.todayISO() : iso(new Date());
    return parse(t);
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function addMonths(d, n) {
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
  }
  function long(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  var ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var ARROW = function (d) { return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; };

  function enhance(input) {
    if (input._dp) return;
    var id = 'dp' + (++seq);
    var wrap = el('div', 'dp');
    var placeholder = input.getAttribute('placeholder') || 'Select a date';
    var labelEl = input.closest('label');
    var labelText = labelEl ? Array.prototype.filter.call(labelEl.childNodes, function (n) { return n.nodeType === 3; })
      .map(function (n) { return n.textContent; }).join(' ').trim() : 'Date';

    var btn = el('button', 'dp-button', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': id });
    btn.innerHTML = '<span class="dp-text"></span>' + ICON;
    var text = btn.firstChild;

    var dialog = el('div', 'dp-dialog', { id: id, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': id + '-title' });
    dialog.hidden = true;
    dialog.innerHTML =
      '<div class="dp-head">' +
      '<button type="button" class="dp-nav" data-nav="-1" aria-label="Previous month">' + ARROW('m14.5 5-7 7 7 7') + '</button>' +
      '<div class="dp-title" id="' + id + '-title" aria-live="polite"></div>' +
      '<button type="button" class="dp-nav" data-nav="1" aria-label="Next month">' + ARROW('m9.5 5 7 7-7 7') + '</button>' +
      '</div>' +
      '<table class="dp-grid" role="grid" aria-labelledby="' + id + '-title"><thead><tr>' +
      DAYS.map(function (d) { return '<th scope="col" abbr="' + d[1] + '">' + d[0] + '</th>'; }).join('') +
      '</tr></thead><tbody></tbody></table>' +
      '<div class="dp-foot"><button type="button" class="dp-link" data-act="today">Today</button>' +
      (input.required ? '' : '<button type="button" class="dp-link" data-act="clear">Clear</button>') +
      '<button type="button" class="dp-link" data-act="close">Close</button></div>';
    var title = dialog.querySelector('.dp-title'), body = dialog.querySelector('tbody');

    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(btn);
    wrap.appendChild(dialog);
    wrap.appendChild(input);
    input.type = 'hidden';

    var focusDate = null;
    function minDate() { return parse(input.getAttribute('min')) || today(); }
    function selected() { return parse(valueDesc.get.call(input)); }
    function disabled(d) { var m = minDate(); return m && d < m; }

    function refresh() {
      var d = selected();
      text.textContent = d ? long(d) : placeholder;
      btn.classList.toggle('dp-empty', !d);
      btn.setAttribute('aria-label', labelText + (d ? ', ' + long(d) : ', not chosen') + '. Open calendar');
    }
    // Writing .value from code (e.g. a test or form reset) also updates the button.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return valueDesc.get.call(input); },
      set: function (v) { valueDesc.set.call(input, v); refresh(); },
    });
    if (input.form) input.form.addEventListener('reset', function () { setTimeout(refresh, 0); });
    // Errors and focus land on the visible button
    input.focus = function (o) { btn.focus(o); };
    new MutationObserver(function () {
      ['aria-invalid', 'aria-describedby'].forEach(function (a) {
        if (input.hasAttribute(a)) btn.setAttribute(a, input.getAttribute(a)); else btn.removeAttribute(a);
      });
    }).observe(input, { attributes: true, attributeFilter: ['aria-invalid', 'aria-describedby'] });

    function render() {
      var first = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
      var start = addDays(first, -((first.getDay() + 6) % 7)); // Monday
      var sel = selected(), now = today();
      title.textContent = MONTHS[focusDate.getMonth()] + ' ' + focusDate.getFullYear();
      var prevMonthEnd = addDays(first, -1);
      dialog.querySelector('[data-nav="-1"]').disabled = disabled(prevMonthEnd) && minDate().getMonth() === focusDate.getMonth() && minDate().getFullYear() === focusDate.getFullYear();
      body.innerHTML = '';
      for (var w = 0; w < 6; w++) {
        var tr = document.createElement('tr');
        for (var k = 0; k < 7; k++) {
          var d = addDays(start, w * 7 + k);
          var td = document.createElement('td');
          var b = el('button', 'dp-day', { type: 'button', 'data-date': iso(d), tabindex: '-1', 'aria-label': long(d) });
          b.textContent = d.getDate();
          if (d.getMonth() !== focusDate.getMonth()) b.classList.add('dp-out');
          if (disabled(d)) { b.setAttribute('aria-disabled', 'true'); b.classList.add('dp-off'); }
          if (sel && iso(d) === iso(sel)) { b.setAttribute('aria-selected', 'true'); b.classList.add('dp-sel'); }
          if (now && iso(d) === iso(now)) { b.setAttribute('aria-current', 'date'); b.classList.add('dp-today'); }
          if (iso(d) === iso(focusDate)) b.setAttribute('tabindex', '0');
          td.appendChild(b); tr.appendChild(td);
        }
        body.appendChild(tr);
      }
    }
    function focusDay() {
      var b = body.querySelector('[data-date="' + iso(focusDate) + '"]');
      if (b) b.focus();
    }
    function moveTo(d) {
      var month = focusDate.getMonth() !== d.getMonth() || focusDate.getFullYear() !== d.getFullYear();
      focusDate = d;
      if (month) render();
      else {
        Array.prototype.forEach.call(body.querySelectorAll('.dp-day'), function (b) { b.setAttribute('tabindex', b.getAttribute('data-date') === iso(d) ? '0' : '-1'); });
      }
      focusDay();
    }
    function open() {
      var m = minDate(), s = selected();
      focusDate = s || (m && today() < m ? m : today());
      render();
      dialog.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      wrap.classList.add('open');
      dialog.classList.remove('dp-right');
      var r = dialog.getBoundingClientRect();
      if (r.right > document.documentElement.clientWidth - 8) dialog.classList.add('dp-right');
      focusDay();
    }
    function close(refocus) {
      if (dialog.hidden) return;
      dialog.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('open');
      if (refocus) btn.focus();
    }
    function choose(d) {
      if (d && disabled(d)) return;
      input.value = d ? iso(d) : '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close(true);
    }

    btn.addEventListener('click', function () { if (dialog.hidden) open(); else close(false); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' && dialog.hidden) { e.preventDefault(); open(); } });
    // Clicks inside the dialog must not "activate" the surrounding <label> (that would re-click the button)
    dialog.addEventListener('click', function (e) {
      e.preventDefault();
      var day = e.target.closest('.dp-day'), nav = e.target.closest('.dp-nav'), act = e.target.closest('[data-act]');
      if (day) { var d = parse(day.getAttribute('data-date')); if (!disabled(d)) choose(d); }
      if (nav && !nav.disabled) { focusDate = addMonths(focusDate, Number(nav.getAttribute('data-nav'))); render(); }
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'today') { var t = today(); if (disabled(t)) moveTo(minDate()); else choose(t); }
        if (a === 'clear') choose(null);
        if (a === 'close') close(true);
      }
    });
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (!e.target.classList.contains('dp-day')) return;
      var d = focusDate, dow = (d.getDay() + 6) % 7, nd = null;
      switch (e.key) {
        case 'ArrowLeft': nd = addDays(d, -1); break;
        case 'ArrowRight': nd = addDays(d, 1); break;
        case 'ArrowUp': nd = addDays(d, -7); break;
        case 'ArrowDown': nd = addDays(d, 7); break;
        case 'Home': nd = addDays(d, -dow); break;
        case 'End': nd = addDays(d, 6 - dow); break;
        case 'PageUp': nd = addMonths(d, e.shiftKey ? -12 : -1); break;
        case 'PageDown': nd = addMonths(d, e.shiftKey ? 12 : 1); break;
        case 'Enter': case ' ': e.preventDefault(); choose(d); return;
        default: return;
      }
      e.preventDefault();
      moveTo(nd);
    });
    wrap.addEventListener('focusout', function (e) { if (!dialog.hidden && e.relatedTarget && !wrap.contains(e.relatedTarget)) close(false); });
    document.addEventListener('mousedown', function (e) { if (!dialog.hidden && !wrap.contains(e.target)) close(false); });

    input._dp = { open: open, close: close, button: btn };
    refresh();
  }

  window.EG.enhanceDates = function (root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('input[type="date"]'), enhance);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.EG.enhanceDates(); });
  else window.EG.enhanceDates();
})();
