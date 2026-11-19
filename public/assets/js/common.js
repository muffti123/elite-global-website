/* Elite Global — shared page behaviour: year, company details (hidden when empty). */
window.EG = window.EG || {};
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  var co = C.company || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---- Basics ---------------------------------------------------------
  $('#year').textContent = new Date().getFullYear();

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

  // helpers for page scripts
  window.EG.$ = $; window.EG.$$ = $$; window.EG.waLink = waLink;
})();
