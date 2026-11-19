/* Elite Global — shared page behaviour (every page): year, company details, form helpers. */
window.EG = window.EG || {};
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  var co = C.company || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---- Basics ---------------------------------------------------------
  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  // ---- Company details: fill, or hide when empty -----------------------
  var waLink = co.whatsapp ? 'https://wa.me/' + String(co.whatsapp).replace(/\D/g, '') : '';
  ['address', 'phone', 'whatsapp', 'email'].forEach(function (key) {
    var has = !!(co[key] && String(co[key]).trim());
    $$('[data-show="' + key + '"]').forEach(function (el) { el.hidden = !has; });
  });
  $$('[data-fill]').forEach(function (el) { el.textContent = co[el.dataset.fill] || ''; });
  $$('[data-href]').forEach(function (el) {
    var t = el.dataset.href;
    if (t === 'tel' && co.phone) el.href = 'tel:' + co.phone.replace(/[^\d+]/g, '');
    if (t === 'mailto' && co.email) el.href = 'mailto:' + co.email;
    if (t === 'whatsapp' && waLink) el.href = waLink;
  });

  // ---- Form helpers (same rules as apps-script/Validate.gs) -------------
  var PHONE_RE = /^\+?[0-9][0-9 ()\-]{6,19}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function todayISO() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  /** Marks a field (inside a .field wrapper) valid/invalid. Returns true when valid. */
  function setInvalid(field, bad, message) {
    var wrap = field.closest('.field') || field.parentNode;
    wrap.classList.toggle('invalid', !!bad);
    field.setAttribute('aria-invalid', bad ? 'true' : 'false');
    var msg = wrap.querySelector('.err-msg');
    if (msg) {
      if (bad && message) msg.textContent = message;
      if (bad && msg.id) field.setAttribute('aria-describedby', msg.id); else field.removeAttribute('aria-describedby');
    }
    return !bad;
  }

  /** Clears a field's error as soon as the user edits it. */
  function clearOnInput(root) {
    $$('input,select,textarea', root).forEach(function (f) {
      var clear = function () {
        var w = f.closest('.field');
        if (w && w.classList.contains('invalid')) setInvalid(f, false);
      };
      f.addEventListener('input', clear);
      f.addEventListener('change', clear);
    });
  }

  /** " You can also message us on WhatsApp, or call …" — only for details that are filled in. */
  function contactFallback() {
    var bits = [];
    if (waLink) bits.push('<a href="' + waLink + '" target="_blank" rel="noopener">message us on WhatsApp</a>');
    if (co.phone) bits.push('call <a href="tel:' + co.phone.replace(/[^\d+]/g, '') + '">' + escapeHtml(co.phone) + '</a>');
    if (co.email) bits.push('email <a href="mailto:' + co.email + '">' + escapeHtml(co.email) + '</a>');
    return bits.length ? ' You can also ' + bits.join(', or ') + '.' : '';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Fills a <select> from a list; first option is the placeholder. */
  function fillSelect(select, list, placeholder) {
    select.innerHTML = '';
    if (placeholder !== undefined) {
      var o = document.createElement('option'); o.value = ''; o.textContent = placeholder; select.appendChild(o);
    }
    list.forEach(function (v) {
      var opt = document.createElement('option'); opt.textContent = v; select.appendChild(opt);
    });
  }

  Object.assign(window.EG, {
    $: $, $$: $$, waLink: waLink, PHONE_RE: PHONE_RE, EMAIL_RE: EMAIL_RE,
    todayISO: todayISO, setInvalid: setInvalid, clearOnInput: clearOnInput,
    contactFallback: contactFallback, escapeHtml: escapeHtml, fillSelect: fillSelect,
  });
})();
