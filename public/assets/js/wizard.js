/*
 * Elite Global — multi-step form helper shared by customize-umrah.html and apply-visa.html.
 * Every step stays in the page and is only shown/hidden, so moving Back/Next never loses input.
 */
window.EG = window.EG || {};
(function () {
  'use strict';
  var EG = window.EG;

  /**
   * opts: {
   *   steps: [{el, title, validate?: () => bool, onEnter?: () => void}],
   *   stepper: <ol> element, label: element for "Step 2 of 5 — Title",
   *   onChange?: (index) => void
   * }
   */
  EG.Wizard = function (opts) {
    var self = this;
    self.steps = opts.steps;
    self.index = 0;
    self.stepper = opts.stepper;
    self.label = opts.label;
    self.onChange = opts.onChange || function () {};

    self.stepper.innerHTML = '';
    self.steps.forEach(function (s, i) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = s.title;
      li.appendChild(span);
      self.stepper.appendChild(li);
      s.el.hidden = i !== 0;
      s.el.setAttribute('tabindex', '-1');
    });
    self.render();
  };

  EG.Wizard.prototype.render = function () {
    var i = this.index, n = this.steps.length;
    Array.prototype.forEach.call(this.stepper.children, function (li, k) {
      li.className = k < i ? 'done' : k === i ? 'current' : '';
      if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (this.label) this.label.textContent = 'Step ' + (i + 1) + ' of ' + n + ' — ' + this.steps[i].title;
  };

  /** Shows step i. Validates the current step first when moving forward. */
  EG.Wizard.prototype.go = function (i, opts) {
    opts = opts || {};
    if (i < 0 || i >= this.steps.length || i === this.index) return false;
    if (i > this.index && !opts.force) {
      for (var k = this.index; k < i; k++) {
        var v = this.steps[k].validate;
        if (v && !v()) { if (k !== this.index) this.go(k, { force: true }); return false; }
      }
    }
    this.steps[this.index].el.hidden = true;
    this.index = i;
    var s = this.steps[i];
    s.el.hidden = false;
    if (s.onEnter) s.onEnter();
    this.render();
    this.onChange(i);
    var top = this.stepper.getBoundingClientRect().top + window.pageYOffset - 110;
    window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
    s.el.focus({ preventScroll: true });
    return true;
  };

  EG.Wizard.prototype.next = function () { return this.go(this.index + 1); };
  EG.Wizard.prototype.back = function () { return this.go(this.index - 1); };

  /** Returns the step index whose element contains node, or -1. */
  EG.Wizard.prototype.stepOf = function (node) {
    for (var i = 0; i < this.steps.length; i++) if (this.steps[i].el.contains(node)) return i;
    return -1;
  };

  // ---- Leave-page warning ------------------------------------------------
  /** Warns before leaving while isDirty() returns true. */
  EG.guardUnload = function (isDirty) {
    window.addEventListener('beforeunload', function (e) {
      if (!isDirty()) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
  };

  // ---- Field checks (return true when valid; mark the field otherwise) ---
  EG.check = {
    text: function (f, min, msg) { return EG.setInvalid(f, f.value.trim().length < (min || 1), msg); },
    phone: function (f) { return EG.setInvalid(f, !EG.PHONE_RE.test(f.value.trim())); },
    email: function (f) { return EG.setInvalid(f, !EG.EMAIL_RE.test(f.value.trim())); },
    select: function (f) { return EG.setInvalid(f, !f.value); },
    date: function (f, required) {
      var v = f.value;
      return EG.setInvalid(f, (required && !v) || (!!v && v < EG.todayISO()));
    },
    int: function (f, min, max, required) {
      var v = f.value.trim();
      var bad = v === '' ? !!required : !/^[0-9]{1,3}$/.test(v) || Number(v) < min || Number(v) > max;
      return EG.setInvalid(f, bad);
    },
    radio: function (form, name) {
      var group = form.querySelectorAll('input[name="' + name + '"]');
      var picked = Array.prototype.some.call(group, function (r) { return r.checked; });
      return EG.setInvalid(group[0], !picked);
    },
  };

  /** Runs checks; focuses the first invalid field. checks = [() => bool, …] */
  EG.checkAll = function (checks, root) {
    var ok = checks.map(function (c) { return c(); }).every(Boolean);
    if (!ok) {
      var first = root.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea');
      if (first) first.focus();
    }
    return ok;
  };

  /** Value of a radio group ('' when none). */
  EG.radioValue = function (form, name) {
    var r = form.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : '';
  };

  /** Builds radio "choice" pills inside container for a list of values. */
  EG.fillChoices = function (container, name, list, type) {
    container.innerHTML = '';
    list.forEach(function (v, i) {
      var lab = document.createElement('label');
      lab.className = 'choice';
      var inp = document.createElement('input');
      inp.type = type || 'radio';
      inp.name = name;
      inp.value = v;
      inp.id = name + '-' + i;
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(' ' + v));
      container.appendChild(lab);
    });
  };
})();
