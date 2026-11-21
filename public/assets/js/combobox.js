/*
 * Elite Global — searchable combobox (WAI-ARIA APG "select-only"/"list autocomplete" pattern).
 * Enhances <select data-combobox>. The <select> stays in the form (hidden) and remains the source
 * of truth: its value is what is validated and sent, and its options can change at any time
 * (e.g. the airport list when the country changes). Typing filters the options (accents and case
 * ignored: "cote" finds "Côte d'Ivoire"); ↑/↓ move, Enter chooses, Esc closes / restores.
 * <select data-combobox="select"> is pick-only (short lists): no typing or phone keyboard, a letter
 * jumps to the first option starting with it.
 * Choosing an option (click, tap or Enter) closes the list, shows the value and moves focus to the
 * next field. Esc, Tab and a click outside also close it.
 */
window.EG = window.EG || {};
(function () {
  'use strict';
  var seq = 0;
  var norm = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  };

  function Combobox(select) {
    if (select._cb) return select._cb;
    var self = this;
    var id = 'cb' + (++seq);
    var wrap = document.createElement('div');
    wrap.className = 'cb';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'cb-input';
    input.id = id + '-input';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', id + '-list');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
    var pickOnly = select.getAttribute('data-combobox') === 'select';
    if (pickOnly) {
      input.readOnly = true;
      input.setAttribute('inputmode', 'none');
      input.setAttribute('aria-autocomplete', 'none');
      wrap.className += ' cb-select';
    }
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'cb-toggle';
    toggle.tabIndex = -1;
    toggle.setAttribute('aria-hidden', 'true');
    var list = document.createElement('ul');
    list.className = 'cb-list';
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    var empty = document.createElement('li');
    empty.className = 'cb-empty';
    empty.textContent = 'No matches';

    // The combobox goes first so the surrounding <label> names it (first labelable element).
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(input);
    wrap.appendChild(toggle);
    wrap.appendChild(list);
    select.classList.add('cb-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    var labelEl = select.closest('label');
    var labelText = labelEl ? Array.prototype.filter.call(labelEl.childNodes, function (n) { return n.nodeType === 3; })
      .map(function (n) { return n.textContent; }).join(' ').trim() : '';
    if (labelText) input.setAttribute('aria-label', labelText);

    var items = [], shown = [], active = -1;

    function options() {
      return Array.prototype.filter.call(select.options, function (o) { return o.value !== '' && !o.disabled; });
    }
    function selectedText() {
      var o = select.options[select.selectedIndex];
      return o && o.value !== '' ? o.textContent : '';
    }
    self.sync = function () {
      input.value = selectedText();
      var ph = select.getAttribute('data-placeholder') || (select.options[0] && select.options[0].value === '' ? select.options[0].textContent : '');
      input.placeholder = ph || 'Type to search';
      input.disabled = select.disabled;
    };
    function build() {
      list.innerHTML = '';
      items = options().map(function (o, i) {
        var li = document.createElement('li');
        li.id = id + '-o' + i;
        li.setAttribute('role', 'option');
        li.className = 'cb-option' + (o.getAttribute('data-group-start') ? ' cb-group-start' : '');
        li.textContent = o.textContent;
        if (o.getAttribute('data-hint')) {
          var hint = document.createElement('small');
          hint.textContent = o.getAttribute('data-hint');
          li.appendChild(hint);
        }
        li._opt = o;
        li._key = norm(o.textContent + ' ' + (o.getAttribute('data-keywords') || ''));
        li.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus in the input
        li.addEventListener('click', function (e) {
          // The combobox sits inside a <label>: without this the click is passed on to the input and reopens the list
          e.preventDefault(); e.stopPropagation();
          choose(li, true);
        });
        list.appendChild(li);
        return li;
      });
      list.appendChild(empty);
    }
    function filter(q) {
      var n = norm(q);
      var starts = [], contains = [];
      items.forEach(function (li) {
        var always = li._opt.hasAttribute('data-always');
        var word = li._key.indexOf(n) === 0 || li._key.indexOf(' ' + n) !== -1;
        // 1–2 letters: word starts only ("ni" → Nigeria, Niger; not Afghanistan)
        var hit = !n || always || word || (n.length > 2 && li._key.indexOf(n) !== -1);
        li.hidden = !hit;
        if (!hit) return;
        if (!n || always || li._key.indexOf(n) === 0 || li._key.indexOf(' ' + n) !== -1) starts.push(li); else contains.push(li);
      });
      // Best matches (word starts) first; keep original order otherwise
      if (n) starts.concat(contains).forEach(function (li) { list.insertBefore(li, empty); });
      else items.forEach(function (li) { list.insertBefore(li, empty); });
      shown = n ? starts.concat(contains) : items.slice();
      empty.hidden = shown.length > 0;
      setActive(shown.length ? 0 : -1);
    }
    function setActive(i) {
      items.forEach(function (li) { li.removeAttribute('aria-selected'); li.classList.remove('active'); });
      active = i;
      if (i < 0 || !shown[i]) { input.removeAttribute('aria-activedescendant'); return; }
      var li = shown[i];
      li.classList.add('active');
      li.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', li.id);
      var top = li.offsetTop, bottom = top + li.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
    function open(q) {
      if (input.disabled) return;
      if (!items.length) build();
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      wrap.classList.add('open');
      filter(q === undefined ? '' : q);
      if (q === undefined) {
        var cur = shown.findIndex(function (li) { return li._opt.selected; });
        if (cur >= 0) setActive(cur);
      }
    }
    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('open');
      input.removeAttribute('aria-activedescendant');
    }
    function choose(li, advance) {
      var changed = select.value !== li._opt.value;
      select.value = li._opt.value;
      self.sync();
      close();
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (advance) focusNext();
    }
    /** Moves focus to the next visible field after this one (choosing an option "moves on"). */
    function focusNext() {
      var scope = input.form || document;
      var all = Array.prototype.filter.call(scope.querySelectorAll('input,select,textarea,button,a[href],[tabindex]'), function (el) {
        return el === input || (el.tabIndex >= 0 && !el.disabled && el.type !== 'hidden' && el.getClientRects().length > 0);
      });
      var next = all[all.indexOf(input) + 1];
      if (next) next.focus(); else input.blur();
    }
    /** On leaving: an exact (normalised) match is chosen; anything else reverts to the current value. */
    function commit() {
      var n = norm(input.value);
      if (!n) {
        if (select.value !== '') {
          select.value = '';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        var hit = items.filter(function (li) { return norm(li._opt.textContent) === n; })[0];
        if (hit && hit._opt.value !== select.value) { choose(hit); return; }
      }
      self.sync();
      close();
    }

    input.addEventListener('input', function () { if (!pickOnly) open(input.value); });
    input.addEventListener('focus', function () { if (!pickOnly) input.select(); });
    input.addEventListener('click', function () { if (list.hidden) open(); else if (pickOnly) close(); });
    // A click or tap anywhere outside closes the list
    document.addEventListener('pointerdown', function (e) {
      if (!list.hidden && !wrap.contains(e.target)) { self.sync(); close(); }
    });
    input.addEventListener('keydown', function (e) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (list.hidden) open(); else setActive(Math.min(active + 1, shown.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (list.hidden) open(); else setActive(Math.max(active - 1, 0));
          break;
        case 'Home': case 'End':
          if (!list.hidden && shown.length) { e.preventDefault(); setActive(e.key === 'Home' ? 0 : shown.length - 1); }
          break;
        case 'Enter':
          if (!list.hidden && shown[active]) { e.preventDefault(); e.stopPropagation(); choose(shown[active], true); }
          break;
        case ' ':
          if (pickOnly) { e.preventDefault(); if (list.hidden) open(); else if (shown[active]) choose(shown[active], true); }
          break;
        case 'Escape':
          if (!list.hidden) { e.preventDefault(); e.stopPropagation(); self.sync(); close(); }
          else if (input.value) { e.preventDefault(); self.sync(); }
          break;
        case 'Tab':
          if (!pickOnly && !list.hidden && shown[active] && norm(input.value) && norm(input.value) !== norm(selectedText())) choose(shown[active]);
          close();
          break;
        default:
          // pick-only: a letter jumps to the first option starting with it
          if (pickOnly && e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (list.hidden) open();
            var k = norm(e.key);
            var at = shown.findIndex(function (li, i) { return i > active && li._key.indexOf(k) === 0; });
            if (at < 0) at = shown.findIndex(function (li) { return li._key.indexOf(k) === 0; });
            if (at >= 0) setActive(at);
          }
      }
    });
    input.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== input) commit(); }, 0); });
    toggle.addEventListener('mousedown', function (e) { e.preventDefault(); });
    toggle.addEventListener('click', function () { if (list.hidden) { input.focus(); open(); } else close(); });

    // Keep in step with the <select>: value changes from code/tests, new options, errors, focus.
    select.addEventListener('change', self.sync);
    new MutationObserver(function () { items = []; if (!list.hidden) build(), filter(input.value); self.sync(); })
      .observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    new MutationObserver(function () {
      ['aria-invalid', 'aria-describedby'].forEach(function (a) {
        if (select.hasAttribute(a)) input.setAttribute(a, select.getAttribute(a)); else input.removeAttribute(a);
      });
    }).observe(select, { attributes: true, attributeFilter: ['aria-invalid', 'aria-describedby'] });
    select.focus = function (o) { input.focus(o); };
    if (select.form) select.form.addEventListener('reset', function () { setTimeout(self.sync, 0); });

    self.input = input;
    self.open = open;
    self.close = close;
    self.sync();
    select._cb = self;
  }

  window.EG.combobox = function (select) { return new Combobox(select); };
  window.EG.enhanceComboboxes = function (root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('select[data-combobox]'), function (s) { new Combobox(s); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.EG.enhanceComboboxes(); });
  else window.EG.enhanceComboboxes();
})();
