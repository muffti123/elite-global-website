/*
 * Elite Global — Departure Airport field (apply-visa.html, customize-umrah.html).
 * The airport list follows the Country of Residence: Nigeria (or no country yet) uses the curated
 * EG_LISTS.AIRPORTS_NG; any other country loads assets/data/airports.json once, on first need.
 * "Other (type it)" is always last and reveals a text box. The <select> value sent to the web app
 * is the IATA code or "OTHER" (+ departureAirportOther); the server checks it against the same data.
 */
window.EG = window.EG || {};
(function () {
  'use strict';
  var EG = window.EG;
  var OTHER = 'OTHER';
  var data = null; // promise of airports.json

  function load() {
    if (!data) {
      data = fetch('assets/data/airports.json', { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function (e) { data = null; throw e; }); // allow a retry on the next change
    }
    return data;
  }

  function label(a) { return (a[2] ? a[2] + ' – ' : '') + a[1] + ' (' + a[0] + ')'; }

  /**
   * opts: {country: <select>, airport: <select>, other: <input>, otherField: element to show/hide,
   *        note: element for a short status message}
   */
  EG.airportField = function (opts) {
    var country = opts.country, airport = opts.airport, other = opts.other;
    var current = '';

    function setOptions(list, failed) {
      var keep = airport.value;
      airport.innerHTML = '';
      var ph = document.createElement('option');
      ph.value = ''; ph.textContent = airport.getAttribute('data-placeholder') || 'Select an airport';
      airport.appendChild(ph);
      list.forEach(function (a) {
        var o = document.createElement('option');
        o.value = a[0];
        o.textContent = label(a);
        o.setAttribute('data-keywords', a[0] + ' ' + a[2]);
        airport.appendChild(o);
      });
      var oth = document.createElement('option');
      oth.value = OTHER; oth.textContent = 'Other (type it)';
      oth.setAttribute('data-always', '');
      oth.setAttribute('data-group-start', '');
      airport.appendChild(oth);
      var still = keep && Array.prototype.some.call(airport.options, function (o) { return o.value === keep; });
      airport.value = still ? keep : '';
      if (opts.note) {
        opts.note.textContent = failed
          ? 'We could not load the airport list. Choose "Other (type it)" and type your airport.'
          : (!list.length ? 'No international airports listed for this country. Choose "Other (type it)".' : '');
      }
      airport.dispatchEvent(new Event('eg:options'));
      toggleOther();
    }

    function toggleOther() {
      var on = airport.value === OTHER;
      opts.otherField.hidden = !on;
      if (!on && other.value) other.value = '';
    }

    function refresh() {
      var c = country.value || 'Nigeria';
      if (c === current) return;
      current = c;
      if (c === 'Nigeria') { setOptions(window.EG_LISTS.AIRPORTS_NG); return; }
      if (c === 'Other') { setOptions([]); return; }
      airport.disabled = true;
      load().then(function (all) {
        if (current !== c) return;
        airport.disabled = false;
        setOptions(all[c] || []);
      }, function () {
        if (current !== c) return;
        airport.disabled = false;
        setOptions([], true);
      });
    }

    country.addEventListener('change', refresh);
    airport.addEventListener('change', function () {
      toggleOther();
      if (airport.value === OTHER) setTimeout(function () { other.focus(); }, 0);
    });
    refresh();

    return {
      /** Text for the review screen, e.g. "Lagos – Murtala Muhammed International Airport (LOS)". */
      text: function () {
        if (airport.value === OTHER) return other.value.trim() ? 'Other: ' + other.value.trim() : '';
        var o = airport.options[airport.selectedIndex];
        return o && o.value ? o.textContent : '';
      },
      /** Marks the field(s) and returns true when valid. */
      validate: function () {
        if (!EG.check.select(airport)) return false;
        if (airport.value === OTHER) return EG.check.text(other, 2);
        return true;
      },
      payload: function () {
        return { departureAirport: airport.value, departureAirportOther: airport.value === OTHER ? other.value.trim() : '' };
      },
    };
  };
  EG.AIRPORT_OTHER = OTHER;
})();
