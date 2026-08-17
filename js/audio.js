/* Dragon sounds. No audio files — everything is synthesised on the fly with WebAudio. */
window.Audio3D = (function () {
  'use strict';

  var ac = null;
  var master = null;
  var purrGain = null;
  var enabled = true;

  try {
    var stored = localStorage.getItem('dragon.sound');
    if (stored !== null) enabled = JSON.parse(stored);
  } catch (e) { /* private mode */ }

  function unlock() {
    if (!enabled) return;
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { enabled = false; return; }
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function ready() { return enabled && ac; }

  /** A short note with an envelope. */
  function tone(opts) {
    if (!ready()) return;
    var now = ac.currentTime + (opts.delay || 0);
    var osc = ac.createOscillator();
    osc.type = opts.type || 'triangle';
    osc.frequency.setValueAtTime(opts.from, now);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, now + opts.dur * 0.8);

    var gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(opts.volume || 0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + opts.dur + 0.05);
  }

  /** A burst of noise — wings, footsteps, snoring. */
  function noise(opts) {
    if (!ready()) return;
    var now = ac.currentTime + (opts.delay || 0);
    var len = Math.floor(ac.sampleRate * opts.dur);
    var buffer = ac.createBuffer(1, len, ac.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) {
      var fade = opts.swell ? Math.sin((i / len) * Math.PI) : (1 - i / len);
      data[i] = (Math.random() * 2 - 1) * fade;
    }
    var src = ac.createBufferSource();
    src.buffer = buffer;

    var filter = ac.createBiquadFilter();
    filter.type = opts.filter || 'bandpass';
    filter.frequency.value = opts.freq || 900;
    filter.Q.value = opts.q || 1;

    var gain = ac.createGain();
    gain.gain.value = opts.volume || 0.08;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(now);
  }

  return {
    unlock: unlock,
    get enabled() { return enabled; },

    setEnabled: function (on) {
      enabled = on;
      try { localStorage.setItem('dragon.sound', JSON.stringify(on)); } catch (e) { /* ignore */ }
      if (!on) {
        this.purr(false);
        if (master) master.gain.value = 0;
      } else {
        unlock();
        if (master) master.gain.value = 0.5;
      }
    },

    /** A greeting trill. */
    chirp: function (pitch) {
      pitch = pitch || 1;
      tone({ from: 440 * pitch, to: 880 * pitch, dur: 0.16, volume: 0.09, type: 'triangle' });
      tone({ from: 660 * pitch, to: 1180 * pitch, dur: 0.14, volume: 0.05, type: 'sine', delay: 0.1 });
    },

    /** A pleased "mrr-ow". */
    happy: function (pitch) {
      pitch = pitch || 1;
      [0, 0.09, 0.19].forEach(function (d, i) {
        tone({ from: 520 * pitch * (1 + i * 0.22), to: 760 * pitch * (1 + i * 0.22), dur: 0.18, volume: 0.08, delay: d });
      });
    },

    /** A questioning "mrm?" — when they want something. */
    query: function (pitch) {
      pitch = pitch || 1;
      tone({ from: 300 * pitch, to: 520 * pitch, dur: 0.26, volume: 0.08, type: 'sawtooth' });
    },

    /** A slightly sad "oow". */
    whine: function (pitch) {
      pitch = pitch || 1;
      tone({ from: 420 * pitch, to: 250 * pitch, dur: 0.45, volume: 0.07, type: 'sine' });
    },

    flap: function () {
      noise({ dur: 0.18, freq: 420, q: 0.8, volume: 0.06, swell: true });
    },

    step: function () {
      noise({ dur: 0.08, freq: 260, q: 1.2, volume: 0.035 });
    },

    munch: function () {
      noise({ dur: 0.12, freq: 700, q: 2.5, volume: 0.06 });
      tone({ from: 180, to: 120, dur: 0.14, volume: 0.05, type: 'square' });
    },

    snore: function () {
      noise({ dur: 0.7, freq: 190, q: 0.7, volume: 0.045, swell: true });
    },

    sneeze: function () {
      noise({ dur: 0.25, freq: 1800, q: 0.6, volume: 0.09 });
      tone({ from: 720, to: 260, dur: 0.3, volume: 0.07, type: 'sawtooth' });
    },

    pop: function () {
      tone({ from: 900, to: 1500, dur: 0.1, volume: 0.07, type: 'sine' });
    },

    /** A continuous rumble while being petted. */
    purr: function (active) {
      if (!ready()) return;
      if (active && !purrGain) {
        var osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 62;

        var filter = ac.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 240;
        filter.Q.value = 3;

        var lfo = ac.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 24;
        var lfoGain = ac.createGain();
        lfoGain.gain.value = 0.6;

        var gain = ac.createGain();
        gain.gain.value = 0.0001;

        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start();
        lfo.start();
        purrGain = gain;
      }
      if (purrGain) purrGain.gain.setTargetAtTime(active ? 0.1 : 0.0001, ac.currentTime, 0.1);
    }
  };
})();
