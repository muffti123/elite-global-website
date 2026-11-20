/*
 * Elite Global — tasteful motion (every page):
 *   1. Scroll reveal: elements fade and slide up once as they enter the viewport (IntersectionObserver).
 *   2. "Why Choose Elite Global" carousel: centre card in focus, neighbours scaled/blurred/dimmed;
 *      arrows, dots, ←/→ keys, swipe, autoplay (paused on hover/focus, hidden tab, or by the user).
 * prefers-reduced-motion: nothing is hidden or animated and the carousel never autoplays.
 * Without JavaScript everything is visible and the carousel cards show as a plain grid.
 */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var root = document.documentElement;

  // ---- 1. Scroll reveal ----------------------------------------------------
  var REVEAL = '[data-reveal], .section-title, .about-copy, .value, .service, .faq details, .cta-band .wrap, .enquiry-intro, .formbox, .carousel, .footer-grid > div';
  function setupReveal() {
    if (reduce.matches || !('IntersectionObserver' in window)) return;
    var els = Array.prototype.slice.call(document.querySelectorAll(REVEAL))
      .filter(function (el) { return !el.closest('.hero, .wizard'); });
    if (!els.length) return;
    // Stagger siblings in the same grid/list (max 5 steps)
    els.forEach(function (el) {
      var sibs = Array.prototype.filter.call(el.parentNode.children, function (c) { return els.indexOf(c) !== -1; });
      var i = sibs.indexOf(el);
      if (sibs.length > 1 && i > 0) el.style.setProperty('--reveal-delay', Math.min(i, 5) * 80 + 'ms');
      el.classList.add('reveal');
    });
    root.classList.add('reveal-on');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  // ---- 2. Carousel -----------------------------------------------------------
  function Carousel(el) {
    var self = this;
    var track = el.querySelector('.why-track');
    var cards = Array.prototype.slice.call(track.children);
    var n = cards.length;
    if (n < 2) return;
    var controls = el.querySelector('.carousel-controls');
    var dotsBox = el.querySelector('.carousel-dots');
    var prev = el.querySelector('.carousel-prev'), next = el.querySelector('.carousel-next');
    var pauseBtn = el.querySelector('.carousel-pause');
    var viewport = el.querySelector('.carousel-viewport');
    var live = el.querySelector('.carousel-live');
    var active = 0, swiped = false, timer = null, hover = false, focus = false, userPaused = false;
    var DELAY = 5000;

    el.classList.add('is-ready');
    controls.hidden = false;
    cards.forEach(function (c, i) {
      c.setAttribute('role', 'group');
      c.setAttribute('aria-roledescription', 'slide');
      c.setAttribute('aria-label', (i + 1) + ' of ' + n + ': ' + (c.querySelector('b') || c).textContent.trim());
      c.addEventListener('click', function () { if (swiped) { swiped = false; return; } if (i !== active) { self.go(i, true); } });
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', 'Show card ' + (i + 1) + ': ' + (c.querySelector('b') || c).textContent.trim());
      dot.addEventListener('click', function () { self.go(i, true); });
      dotsBox.appendChild(dot);
    });
    var dots = Array.prototype.slice.call(dotsBox.children);

    // Circular offset of card i from the active card: …, -2, -1, 0, 1, 2, …
    function offset(i) {
      var d = (i - active) % n;
      if (d < 0) d += n;
      if (d > n / 2) d -= n;
      return d;
    }

    function render(announce) {
      cards.forEach(function (c, i) {
        var d = offset(i);
        c.setAttribute('data-pos', Math.abs(d) > 2 ? 'far' : String(d));
        c.classList.toggle('is-active', d === 0);
        if (d === 0) { c.removeAttribute('aria-hidden'); c.inert = false; }
        else { c.setAttribute('aria-hidden', 'true'); c.inert = true; }
      });
      dots.forEach(function (dot, i) {
        if (i === active) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current');
      });
      if (announce && live) live.textContent = cards[active].getAttribute('aria-label');
    }

    self.go = function (i, byUser) {
      active = ((i % n) + n) % n;
      render(byUser);
      if (byUser) restart();
    };
    self.index = function () { return active; };

    function playing() { return !reduce.matches && !userPaused && !hover && !focus && !document.hidden; }
    function restart() {
      clearInterval(timer); timer = null;
      if (playing()) timer = setInterval(function () { self.go(active + 1, false); }, DELAY);
      // APG: no announcements while rotating automatically
      if (live) live.setAttribute('aria-live', timer ? 'off' : 'polite');
    }

    prev.addEventListener('click', function () { self.go(active - 1, true); });
    next.addEventListener('click', function () { self.go(active + 1, true); });
    if (pauseBtn) {
      if (reduce.matches) pauseBtn.hidden = true;
      pauseBtn.addEventListener('click', function () {
        userPaused = !userPaused;
        pauseBtn.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
        pauseBtn.setAttribute('aria-label', userPaused ? 'Play automatic rotation' : 'Pause automatic rotation');
        restart();
      });
    }
    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); self.go(active - 1, true); }
      if (e.key === 'ArrowRight') { e.preventDefault(); self.go(active + 1, true); }
    });
    el.addEventListener('mouseenter', function () { hover = true; restart(); });
    el.addEventListener('mouseleave', function () { hover = false; restart(); });
    el.addEventListener('focusin', function () { focus = true; restart(); });
    el.addEventListener('focusout', function (e) { if (!el.contains(e.relatedTarget)) { focus = false; restart(); } });
    document.addEventListener('visibilitychange', restart);
    var onReduce = function () { if (pauseBtn) pauseBtn.hidden = reduce.matches; restart(); };
    if (reduce.addEventListener) reduce.addEventListener('change', onReduce); else reduce.addListener(onReduce);

    // Swipe (touch, pen or mouse drag); vertical scrolling keeps working (touch-action: pan-y)
    var x0 = null, y0 = 0;
    viewport.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; swiped = false; });
    viewport.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { swiped = true; self.go(active + (dx < 0 ? 1 : -1), true); }
    });
    viewport.addEventListener('pointercancel', function () { x0 = null; });

    render(false);
    restart();
    el._carousel = self;
  }

  function init() {
    setupReveal();
    Array.prototype.forEach.call(document.querySelectorAll('[data-carousel]'), function (el) { new Carousel(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
