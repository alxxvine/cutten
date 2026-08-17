/* Saving the pet. The dragon lives in localStorage and remembers the last visit. */
window.Save = (function () {
  'use strict';

  var KEY = 'dragon.save.v1';
  var VERSION = 1;

  // How much time away counts at all. A day without you should read as "missed you",
  // not as a disaster, so the ceiling is deliberately low.
  var MAX_AWAY_HOURS = 8;

  function now() { return Date.now(); }

  function defaults() {
    return {
      v: VERSION,
      name: '',
      born: now(),
      lastSeen: now(),
      bond: 0,
      visits: 0,
      needs: { food: 0.8, energy: 0.9, fun: 0.7 }
    };
  }

  return {
    MAX_AWAY_HOURS: MAX_AWAY_HOURS,

    load: function () {
      var data = null;
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) data = JSON.parse(raw);
      } catch (e) { /* private mode — play without saving */ }

      if (!data || data.v !== VERSION || !data.name) return null;

      var base = defaults();
      data.needs = Object.assign(base.needs, data.needs || {});
      data.bond = Math.max(0, Math.min(1, data.bond || 0));

      // Play out the time the player was away.
      var awayHours = Math.min((now() - (data.lastSeen || now())) / 3600000, MAX_AWAY_HOURS);
      if (awayHours > 0) {
        data.needs.food = Math.max(0.15, data.needs.food - awayHours * 0.055);
        data.needs.fun = Math.max(0.1, data.needs.fun - awayHours * 0.075);
        // With nobody around the dragon catches up on sleep, so energy goes back up instead.
        data.needs.energy = Math.min(1, data.needs.energy + awayHours * 0.1);
      }
      data.awayHours = awayHours;
      return data;
    },

    save: function (state) {
      try {
        state.v = VERSION;
        state.lastSeen = now();
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) { /* ignore */ }
    },

    fresh: function (name) {
      var data = defaults();
      data.name = name;
      data.visits = 1;
      return data;
    },

    wipe: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    }
  };
})();
