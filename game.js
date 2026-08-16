/* Полянка котиков — уютная игра про то, как узнаёшь котиков.
   Ванильный JS, без зависимостей и внешних ассетов: всё рисуется на canvas.

   Ядро игры — не «успеть погладить», а понять, чего хочет конкретный котик:
   ласковый идёт навстречу, пугливого нельзя пугать резким движением,
   игривому не до ласки — ему нужна беготня. См. DESIGN.md. */
(function () {
  'use strict';

  /* ============================================================
     Утилиты
     ============================================================ */

  var TAU = Math.PI * 2;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function approach(v, target, speed) { return v < target ? Math.min(target, v + speed) : Math.max(target, v - speed); }

  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* приватный режим — и ладно */ }
    }
  };

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** Путь сердечка с центром в (x, y) и шириной size. */
  function heartPath(c, x, y, size) {
    var s = size / 16;
    c.beginPath();
    c.moveTo(x, y + 6 * s);
    c.bezierCurveTo(x - 10 * s, y - 2 * s, x - 8 * s, y - 12 * s, x, y - 5 * s);
    c.bezierCurveTo(x + 8 * s, y - 12 * s, x + 10 * s, y - 2 * s, x, y + 6 * s);
    c.closePath();
  }

  /** Клубочек — знак «хочу играть». */
  function yarnPath(c, x, y, size) {
    c.beginPath();
    c.arc(x, y, size / 2, 0, TAU);
    c.closePath();
  }

  /* ============================================================
     Canvas и слой фона
     ============================================================ */

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var bgCanvas = document.createElement('canvas');
  var bgCtx = bgCanvas.getContext('2d');

  var W = 0, H = 0, DPR = 1;
  var field = { left: 0, right: 0, top: 0, bottom: 0 };

  // Предметы на полянке. Пока стоят сами, в v2 их можно будет покупать и двигать.
  var props = {
    bush: { x: 0, y: 0, fx: 0.16, fy: 0.28 },
    bowl: { x: 0, y: 0, fx: 0.78, fy: 0.72 }
  };

  function placeProps() {
    ['bush', 'bowl'].forEach(function (key) {
      var p = props[key];
      p.x = field.left + (field.right - field.left) * p.fx;
      p.y = field.top + (field.bottom - field.top) * p.fy;
    });
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, window.innerWidth);
    H = Math.max(360, window.innerHeight);

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    bgCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Полянка не заезжает под HUD сверху и оставляет поля по краям.
    // +56px — чтобы пузырь над котиком тоже помещался.
    var hudHeight = (W < 620 ? 150 : 116) + 56;
    field.left = 46;
    field.right = W - 46;
    field.top = Math.min(hudHeight, H * 0.45);
    field.bottom = H - 46;

    placeProps();
    buildBackground();
    cats.forEach(function (cat) {
      cat.x = clamp(cat.x, field.left, field.right);
      cat.y = clamp(cat.y, field.top, field.bottom);
      cat.targetX = clamp(cat.targetX, field.left, field.right);
      cat.targetY = clamp(cat.targetY, field.top, field.bottom);
    });
  }

  function buildBackground() {
    var c = bgCtx;
    c.clearRect(0, 0, W, H);

    var sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#a8dc8a');
    sky.addColorStop(0.45, '#95d276');
    sky.addColorStop(1, '#7cc25f');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);

    // Мягкие солнечные пятна.
    for (var s = 0; s < 7; s++) {
      var sx = rand(0, W), sy = rand(0, H), sr = rand(90, 260);
      var glow = c.createRadialGradient(sx, sy, 0, sx, sy, sr);
      glow.addColorStop(0, 'rgba(255, 250, 190, 0.28)');
      glow.addColorStop(1, 'rgba(255, 250, 190, 0)');
      c.fillStyle = glow;
      c.beginPath();
      c.arc(sx, sy, sr, 0, TAU);
      c.fill();
    }

    // Кустики травы.
    var tufts = Math.round((W * H) / 5200);
    for (var i = 0; i < tufts; i++) {
      var x = rand(-10, W + 10), y = rand(-10, H + 10);
      c.strokeStyle = pick(['rgba(108,180,80,0.85)', 'rgba(130,198,96,0.85)', 'rgba(92,164,70,0.75)']);
      c.lineWidth = rand(1.6, 2.8);
      c.lineCap = 'round';
      var blades = randInt(2, 4);
      for (var b = 0; b < blades; b++) {
        var h = rand(7, 16);
        var bend = rand(-6, 6);
        c.beginPath();
        c.moveTo(x + b * 3 - blades, y);
        c.quadraticCurveTo(x + b * 3 - blades + bend * 0.5, y - h * 0.6, x + b * 3 - blades + bend, y - h);
        c.stroke();
      }
    }

    // Цветочки.
    var flowers = Math.round((W * H) / 26000);
    for (var f = 0; f < flowers; f++) {
      var fx = rand(10, W - 10), fy = rand(10, H - 10);
      var petals = pick(['#fff6e8', '#ffd9ea', '#fff1a8', '#e6dcff']);
      var core = pick(['#ffc94d', '#ffb0c4', '#ffd76b']);
      var r = rand(3.4, 5.4);
      c.fillStyle = petals;
      for (var p = 0; p < 5; p++) {
        var a = (p / 5) * TAU + rand(-0.2, 0.2);
        c.beginPath();
        c.ellipse(fx + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.72, r * 0.62, a, 0, TAU);
        c.fill();
      }
      c.fillStyle = core;
      c.beginPath();
      c.arc(fx, fy, r * 0.6, 0, TAU);
      c.fill();
    }

    // Камушки.
    for (var k = 0; k < Math.round(W / 220); k++) {
      c.fillStyle = 'rgba(190, 186, 170, 0.55)';
      c.beginPath();
      c.ellipse(rand(20, W - 20), rand(20, H - 20), rand(6, 12), rand(4, 8), rand(0, TAU), 0, TAU);
      c.fill();
    }
  }

  /* ---------- предметы на полянке ---------- */

  function drawBush(t) {
    var b = props.bush;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#2f4a1f';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 4, 46, 12, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    var sway = Math.sin(t * 0.9) * 1.6;
    var blobs = [
      [-26, -14, 22, 18, '#5e9e46'],
      [22, -12, 20, 16, '#5e9e46'],
      [-6, -30, 26, 22, '#6fb352'],
      [10, -20, 24, 20, '#79c05c'],
      [-16, -8, 20, 15, '#6aab4f']
    ];
    blobs.forEach(function (blob, i) {
      ctx.fillStyle = blob[4];
      ctx.beginPath();
      ctx.ellipse(b.x + blob[0] + sway * (i % 2 ? 1 : -1), b.y + blob[1], blob[2], blob[3], 0, 0, TAU);
      ctx.fill();
    });

    // Ягодки.
    ctx.fillStyle = '#ff7a97';
    [[-14, -26], [6, -34], [18, -18]].forEach(function (p) {
      ctx.beginPath();
      ctx.arc(b.x + p[0] + sway, b.y + p[1], 3, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawBowl() {
    var b = props.bowl;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#2f4a1f';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 3, 24, 7, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#e8f0f5';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - 4, 22, 11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c8d6e0';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - 6, 17, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f0b167';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - 7, 13, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e09a4d';
    [[-6, -8], [2, -6], [7, -9]].forEach(function (p) {
      ctx.beginPath();
      ctx.arc(b.x + p[0], b.y + p[1], 2.2, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  }

  /* ============================================================
     Указатель (мышь + палец)
     ============================================================ */

  var pointer = {
    x: 0, y: 0, prevX: 0, prevY: 0,
    frameDist: 0, speed: 0,
    down: false, inside: false, seen: false,
    dirX: 1, dirY: 0
  };

  function setPointer(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var nx = clientX - rect.left;
    var ny = clientY - rect.top;
    if (pointer.seen) pointer.frameDist += Math.hypot(nx - pointer.x, ny - pointer.y);
    pointer.x = nx;
    pointer.y = ny;
    pointer.inside = true;
    pointer.seen = true;
  }

  canvas.addEventListener('pointermove', function (e) { setPointer(e.clientX, e.clientY); });
  canvas.addEventListener('pointerdown', function (e) {
    setPointer(e.clientX, e.clientY);
    pointer.down = true;
    Sound.unlock();
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
  });
  window.addEventListener('pointerup', function () { pointer.down = false; });
  window.addEventListener('pointercancel', function () { pointer.down = false; });
  canvas.addEventListener('pointerleave', function () { pointer.inside = false; pointer.down = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function updatePointer(dt) {
    var instant = pointer.frameDist / Math.max(dt, 0.001);
    // Сглаживаем по времени, а не по кадрам: события указателя приходят реже кадров,
    // и один кадр с событием иначе даёт ложный пик скорости в сотни px/s.
    pointer.speed = lerp(pointer.speed, instant, 1 - Math.exp(-dt / 0.1));
    if (pointer.frameDist > 0.5) {
      var dx = pointer.x - pointer.prevX;
      var dy = pointer.y - pointer.prevY;
      var len = Math.hypot(dx, dy) || 1;
      pointer.dirX = lerp(pointer.dirX, dx / len, 0.25);
      pointer.dirY = lerp(pointer.dirY, dy / len, 0.25);
    }
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.frameDist = 0;
  }

  /* ============================================================
     Звук (WebAudio, без файлов)
     ============================================================ */

  var Sound = {
    ac: null,
    master: null,
    enabled: store.get('cutten.sound', true),
    purrGain: null,
    purrNodes: null,

    unlock: function () {
      if (!this.enabled) return;
      if (!this.ac) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.enabled = false; return; }
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ac.destination);
      }
      if (this.ac.state === 'suspended') this.ac.resume();
    },

    setEnabled: function (on) {
      this.enabled = on;
      store.set('cutten.sound', on);
      if (!on) {
        this.setPurr(false);
        if (this.master) this.master.gain.value = 0;
      } else {
        this.unlock();
        if (this.master) this.master.gain.value = 0.5;
      }
    },

    meow: function (pitch) {
      if (!this.enabled || !this.ac) return;
      var ac = this.ac;
      var now = ac.currentTime;
      var base = 520 * (pitch || 1);

      var osc = ac.createOscillator();
      osc.type = 'sawtooth';
      var sub = ac.createOscillator();
      sub.type = 'sine';

      var filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 4;
      filter.frequency.setValueAtTime(base * 1.6, now);
      filter.frequency.exponentialRampToValueAtTime(base * 2.4, now + 0.12);
      filter.frequency.exponentialRampToValueAtTime(base * 1.2, now + 0.4);

      osc.frequency.setValueAtTime(base * 0.8, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.15, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(base * 0.75, now + 0.42);
      sub.frequency.setValueAtTime(base * 0.5, now);

      var gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start(now); sub.start(now);
      osc.stop(now + 0.5); sub.stop(now + 0.5);
    },

    /** Короткое «мрр?» — котик заинтересовался. */
    chirp: function (pitch) {
      if (!this.enabled || !this.ac) return;
      var ac = this.ac;
      var now = ac.currentTime;
      var osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(380 * (pitch || 1), now);
      osc.frequency.exponentialRampToValueAtTime(720 * (pitch || 1), now + 0.13);
      var gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.25);
    },

    /** Испуг — короткий низкий «шшк». */
    hiss: function () {
      if (!this.enabled || !this.ac) return;
      var ac = this.ac;
      var now = ac.currentTime;
      var buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.25), ac.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      var src = ac.createBufferSource();
      src.buffer = buffer;
      var filter = ac.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2200;
      var gain = ac.createGain();
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(now);
    },

    chime: function () {
      if (!this.enabled || !this.ac) return;
      var ac = this.ac;
      var now = ac.currentTime;
      [784, 988, 1319].forEach(function (freq, i) {
        var osc = ac.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        var gain = ac.createGain();
        var t = now + i * 0.07;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(gain);
        gain.connect(Sound.master);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    },

    setPurr: function (active) {
      if (!this.enabled || !this.ac) return;
      var ac = this.ac;
      if (active && !this.purrNodes) {
        var osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 58;

        var filter = ac.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220;
        filter.Q.value = 3;

        var lfo = ac.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 22;
        var lfoGain = ac.createGain();
        lfoGain.gain.value = 0.55;

        var gain = ac.createGain();
        gain.gain.value = 0.0001;

        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        osc.start(); lfo.start();

        this.purrGain = gain;
        this.purrNodes = { osc: osc, lfo: lfo, gain: gain };
      }
      if (this.purrGain) {
        this.purrGain.gain.setTargetAtTime(active ? 0.09 : 0.0001, ac.currentTime, 0.08);
      }
    }
  };

  /* ============================================================
     Частицы
     ============================================================ */

  var particles = [];

  function spawnParticle(p) {
    if (particles.length > 320) particles.shift();
    particles.push(p);
  }

  function heartBurst(x, y, count, color) {
    for (var i = 0; i < count; i++) {
      spawnParticle({
        type: 'heart', x: x + rand(-14, 14), y: y + rand(-10, 10),
        vx: rand(-40, 40), vy: rand(-90, -40),
        life: 0, max: rand(0.9, 1.6), size: rand(10, 20),
        rot: rand(-0.4, 0.4), spin: rand(-1.6, 1.6),
        color: color || pick(['#ff7aa5', '#ff9dbb', '#ff5f92', '#ffc2d6'])
      });
    }
  }

  function sparkle(x, y, count) {
    for (var i = 0; i < count; i++) {
      spawnParticle({
        type: 'sparkle', x: x, y: y,
        vx: rand(-70, 70), vy: rand(-70, 20),
        life: 0, max: rand(0.3, 0.6), size: rand(2, 4.5),
        color: pick(['#fff6c9', '#ffffff', '#ffe08a'])
      });
    }
  }

  function furPuff(x, y, color) {
    spawnParticle({
      type: 'fur', x: x + rand(-16, 16), y: y + rand(-14, 6),
      vx: rand(-30, 30), vy: rand(-45, -10),
      life: 0, max: rand(0.4, 0.8), size: rand(2.5, 5),
      color: color
    });
  }

  function note(x, y) {
    spawnParticle({
      type: 'note', x: x + rand(-8, 8), y: y,
      vx: rand(-16, 16), vy: rand(-42, -26),
      life: 0, max: rand(0.8, 1.2), size: rand(12, 17),
      rot: rand(-0.3, 0.3), spin: rand(-1, 1),
      color: 'rgba(255,255,255,0.92)'
    });
  }

  function popup(x, y, text, color) {
    spawnParticle({
      type: 'text', x: x, y: y, vx: 0, vy: -46,
      life: 0, max: 1.2, size: 22, text: text, color: color || '#fff'
    });
  }

  function dust(x, y, count) {
    for (var i = 0; i < count; i++) {
      spawnParticle({
        type: 'dust', x: x + rand(-8, 8), y: y,
        vx: rand(-50, 50), vy: rand(-20, -4),
        life: 0, max: rand(0.35, 0.6), size: rand(3, 6),
        color: 'rgba(232, 226, 200, 0.85)'
      });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'sparkle') p.vy += 160 * dt;
      if (p.type === 'fur') p.vy += 90 * dt;
      if (p.type === 'dust') p.vy += 30 * dt;
      if (p.type === 'heart' || p.type === 'note') p.vy += 14 * dt;
      if (p.spin) p.rot += p.spin * dt;
      p.vx *= (1 - 1.2 * dt);
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var t = p.life / p.max;
      var alpha = t < 0.15 ? t / 0.15 : 1 - Math.pow((t - 0.15) / 0.85, 2);
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.translate(p.x, p.y);

      if (p.type === 'heart') {
        ctx.rotate(p.rot);
        var scale = 1 + Math.sin(t * 10) * 0.08;
        ctx.scale(scale, scale);
        ctx.fillStyle = p.color;
        heartPath(ctx, 0, 0, p.size);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else if (p.type === 'sparkle' || p.type === 'dust') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (1 - t * 0.5), 0, TAU);
        ctx.fill();
      } else if (p.type === 'fur') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.7, p.life * 3, 0, TAU);
        ctx.fill();
      } else if (p.type === 'note') {
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.font = '700 ' + p.size + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(120,90,70,0.35)';
        ctx.lineWidth = 3;
        ctx.strokeText('♪', 0, 0);
        ctx.fillText('♪', 0, 0);
      } else if (p.type === 'text') {
        ctx.font = '900 ' + p.size + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(110, 80, 60, 0.45)';
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
      }
      ctx.restore();
    }
  }

  /* ============================================================
     Бабочки — просто для настроения
     ============================================================ */

  var butterflies = [];

  function makeButterfly() {
    return {
      x: rand(0, W), y: rand(field.top, field.bottom),
      angle: rand(0, TAU), speed: rand(30, 55),
      flap: rand(0, TAU), color: pick(['#ffd6ec', '#fff2b0', '#d6e4ff', '#ffd0b0']),
      wobble: rand(0.6, 1.4)
    };
  }

  function updateButterflies(dt, t) {
    while (butterflies.length < 4) butterflies.push(makeButterfly());
    butterflies.forEach(function (b) {
      b.angle += Math.sin(t * b.wobble) * dt * 2.2;
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt * 0.6;
      b.flap += dt * 18;
      if (b.x < -20) b.x = W + 20;
      if (b.x > W + 20) b.x = -20;
      if (b.y < field.top - 30) b.y = field.bottom;
      if (b.y > field.bottom + 30) b.y = field.top;
    });
  }

  function drawButterflies() {
    butterflies.forEach(function (b) {
      var wing = Math.abs(Math.sin(b.flap)) * 0.75 + 0.25;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.sin(b.angle) * 0.3);

      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#2f4a1f';
      ctx.beginPath();
      ctx.ellipse(3, 9, 7 * wing, 3, 0, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 0.95;
      [-1, 1].forEach(function (side) {
        ctx.save();
        ctx.scale(side * wing, 1);
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.ellipse(6, -3.5, 6.5, 5, -0.35, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.ellipse(4.5, 4, 4.6, 3.6, 0.4, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(7, -4, 1.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      });

      ctx.fillStyle = 'rgba(85, 66, 56, 0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.5, 5.5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(85, 66, 56, 0.7)';
      ctx.lineWidth = 0.9;
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(side * 2.5, -8, side * 3.5, -9.5);
        ctx.stroke();
      });
      ctx.restore();
    });
  }

  /* ============================================================
     Котики
     ============================================================ */

  var NAMES = [
    'Мурзик', 'Барсик', 'Пушок', 'Матильда', 'Симба', 'Персик', 'Тишка', 'Маркиз',
    'Плюшка', 'Кекс', 'Василиса', 'Байт', 'Ириска', 'Тофу', 'Бублик', 'Люся',
    'Степан', 'Муся', 'Зефир', 'Компот', 'Пельмень', 'Соня'
  ];

  var COATS = [
    { base: '#f4a35c', dark: '#d97e35', belly: '#ffe3c4' },
    { base: '#9aa3ad', dark: '#767f8a', belly: '#e8edf2' },
    { base: '#f5efe4', dark: '#d9cdb8', belly: '#fffaf0' },
    { base: '#5b5560', dark: '#403c46', belly: '#8d8794' },
    { base: '#c98b60', dark: '#a76c45', belly: '#f3ddc6' },
    { base: '#e9d7a8', dark: '#cdb37c', belly: '#fff6dd' },
    { base: '#8fa7c4', dark: '#6b83a1', belly: '#dde7f3' }
  ];

  var PATTERNS = ['solid', 'tabby', 'spots', 'tuxedo'];
  var EYE_COLORS = ['#4a8f3c', '#3f7fbf', '#c08a2a', '#5b8f8f'];

  // Характеры. В v1 их три — см. DESIGN.md, остальные в v2.
  var PERSONALITIES = {
    sweet: { id: 'sweet', label: 'ласковый', need: 'pet', scale: [0.92, 1.16], speed: [46, 62] },
    shy: { id: 'shy', label: 'пугливый', need: 'pet', scale: [0.8, 0.96], speed: [56, 76] },
    playful: { id: 'playful', label: 'игривый', need: 'play', scale: [0.84, 1.04], speed: [62, 84] }
  };

  var PERSONALITY_IDS = ['sweet', 'shy', 'playful'];

  var cats = [];

  function Cat(x, y, options) {
    options = options || {};
    var personality = options.personality || pick(PERSONALITY_IDS);
    var conf = PERSONALITIES[personality];

    this.x = x;
    this.y = y;
    this.personality = personality;
    this.scale = options.scale || rand(conf.scale[0], conf.scale[1]);
    this.coatIndex = options.coatIndex !== undefined ? options.coatIndex : randInt(0, COATS.length - 1);
    this.coat = COATS[this.coatIndex];
    this.pattern = options.pattern || pick(PATTERNS);
    this.eyeColor = options.eyeColor || pick(EYE_COLORS);
    this.name = options.name || uniqueName();
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.speed = rand(conf.speed[0], conf.speed[1]);

    this.trust = options.trust || 0;
    this.resident = this.trust >= 3;
    this.brought = !!options.brought;

    this.state = 'wander';
    this.stateT = 0;
    this.sit = 0;
    this.progress = 0;          // насколько выполнена потребность
    this.need = null;           // 'pet' | 'play' | null
    this.needTimer = 0;
    this.needCooldown = rand(4, 14);
    this.interactIdle = 0;

    this.alert = 0;             // пугливый: насколько напуган
    this.stillTimer = 0;        // пугливый: сколько игрок стоит неподвижно рядом
    this.ready = 0;             // пугливый: обнюхал руку, можно гладить
    this.nervous = 0;           // пугливый: напряжение от слишком быстрой руки
    this.grace = 0;             // пугливый: он только что сам потянулся — не пугаем
    this.chaseIdle = 0;         // игривый: сколько игрок не двигается

    this.earsFlat = 0;
    this.tailUp = 0;
    this.crouch = 0;
    this.showTrust = 0;         // сколько ещё показывать полоску доверия
    this.greet = 0;             // свой котик идёт здороваться

    this.walkPhase = rand(0, TAU);
    this.tailPhase = rand(0, TAU);
    this.breathPhase = rand(0, TAU);
    this.blinkTimer = rand(1.5, 5);
    this.blink = 0;
    this.earTwitch = 0;
    this.earTimer = rand(2, 6);
    this.voiceTimer = 0;
    this.wiggle = 0;
    this.hop = 0;
    this.idleTime = rand(1, 3);

    this.targetX = x;
    this.targetY = y;
    this.pickTarget();
  }

  function uniqueName() {
    var taken = {};
    cats.forEach(function (c) { taken[c.name] = true; });
    var free = NAMES.filter(function (n) { return !taken[n]; });
    return free.length ? pick(free) : pick(NAMES) + ' ' + randInt(2, 9);
  }

  Cat.prototype.conf = function () { return PERSONALITIES[this.personality]; };

  Cat.prototype.pickTarget = function () {
    if (this.personality === 'shy' && Math.random() < 0.55) {
      // Пугливые держатся поближе к кустику.
      this.targetX = clamp(props.bush.x + rand(-90, 90), field.left, field.right);
      this.targetY = clamp(props.bush.y + rand(-50, 60), field.top, field.bottom);
      return;
    }
    this.targetX = rand(field.left, field.right);
    this.targetY = rand(field.top, field.bottom);
  };

  Cat.prototype.radiusX = function () { return 42 * this.scale; };
  Cat.prototype.radiusY = function () { return 38 * this.scale; };

  Cat.prototype.petCenterY = function () {
    return this.y - lerp(26, 34, this.sit) * this.scale;
  };

  Cat.prototype.contains = function (px, py) {
    var dx = (px - this.x) / this.radiusX();
    var dy = (py - this.petCenterY()) / this.radiusY();
    return dx * dx + dy * dy <= 1;
  };

  Cat.prototype.distanceToPointer = function () {
    return Math.hypot(pointer.x - this.x, pointer.y - this.petCenterY());
  };

  Cat.prototype.setState = function (state) {
    this.state = state;
    this.stateT = 0;
  };

  Cat.prototype.startNeed = function () {
    this.need = this.conf().need;
    this.progress = 0;
    this.needTimer = rand(20, 28);
    this.voiceTimer = 0.4;
    this.setState('want');
  };

  Cat.prototype.moveTo = function (dt, tx, ty, speedScale) {
    var dx = tx - this.x;
    var dy = ty - this.y;
    var d = Math.hypot(dx, dy);
    if (d < 4) return true;
    var sp = this.speed * (speedScale || 1);
    var step = Math.min(d, sp * dt);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    this.walkPhase += dt * (6 + sp * 0.06);
    if (Math.abs(dx) > 6) this.dir = dx > 0 ? 1 : -1;
    return false;
  };

  Cat.prototype.update = function (dt, t) {
    this.stateT += dt;
    this.breathPhase += dt * 2.2;
    this.tailPhase += dt * (this.state === 'delight' ? 6 : (this.state === 'play' ? 4 : 1.8));

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blink = 0.16; this.blinkTimer = rand(2.5, 6.5); }
    if (this.blink > 0) this.blink -= dt;

    this.earTimer -= dt;
    if (this.earTimer <= 0) { this.earTwitch = 0.35; this.earTimer = rand(3, 8); }
    if (this.earTwitch > 0) this.earTwitch -= dt;

    if (this.showTrust > 0) this.showTrust -= dt;
    if (this.ready > 0) this.ready -= dt;
    if (this.alert > 0 && this.state !== 'flee') this.alert = Math.max(0, this.alert - dt * 0.45);
    if (this.nervous > 0 && this.state !== 'pet') this.nervous = Math.max(0, this.nervous - dt * 0.5);
    if (this.grace > 0) this.grace -= dt;

    var wantsSit = (this.state === 'want' && this.need === 'pet') || this.state === 'pet' ||
      this.state === 'sniff' || this.state === 'idle' || this.state === 'eat';
    this.sit = approach(this.sit, wantsSit ? 1 : 0, dt * 3.2);

    // Телесные сигналы.
    var targetEars = 0, targetTail = 0, targetCrouch = 0;
    if (this.state === 'flee' || this.alert > 0.35) { targetEars = clamp(this.alert + 0.3, 0, 1); targetCrouch = 0.8; }
    if (this.state === 'pet' || this.state === 'delight') { targetEars = 0.2; targetTail = 0.4; }
    if (this.state === 'want' && this.need === 'play') targetTail = 1;
    if (this.state === 'play') { targetTail = 1; targetCrouch = 0.2; }
    if (this.state === 'sniff' || this.ready > 0) { targetEars = 0; targetTail = 0.7; }
    if (this.resident && this.state === 'want') targetTail = Math.max(targetTail, 0.6);
    this.earsFlat = approach(this.earsFlat, targetEars, dt * 4);
    this.tailUp = approach(this.tailUp, targetTail, dt * 3);
    this.crouch = approach(this.crouch, targetCrouch, dt * 4);

    switch (this.state) {
      case 'wander': this.updateWander(dt); break;
      case 'idle': this.updateIdle(dt); break;
      case 'want': this.updateWant(dt); break;
      case 'sniff': this.updateSniff(dt); break;
      case 'pet': this.updatePet(dt); break;
      case 'play': this.updatePlay(dt); break;
      case 'flee': this.updateFlee(dt); break;
      case 'eat': this.updateEat(dt); break;
      case 'delight': this.updateDelight(dt); break;
    }

    // Потребность созревает у спокойного котика.
    if (this.state === 'wander' || this.state === 'idle') {
      this.needCooldown -= dt;
      if (this.needCooldown <= 0 && game.running) this.startNeed();
    }

    this.x = clamp(this.x, field.left - 10, field.right + 10);
    this.y = clamp(this.y, field.top - 10, field.bottom + 10);
  };

  Cat.prototype.updateWander = function (dt) {
    var tx = this.targetX, ty = this.targetY, speedScale = 1;

    // Свой котик здоровается: подходит к руке.
    if (this.resident && this.greet > 0 && pointer.inside) {
      this.greet -= dt;
      tx = pointer.x;
      ty = pointer.y + 24;
      speedScale = 1.3;
      if (Math.hypot(tx - this.x, ty - this.y) < 50) { this.greet = 0; this.startNeed(); return; }
    }

    if (this.moveTo(dt, tx, ty, speedScale)) {
      // Иногда по дороге заходим к миске.
      if (Math.random() < 0.28 && this.personality !== 'shy') {
        this.setState('eat');
        this.targetX = props.bowl.x + rand(-18, 18);
        this.targetY = props.bowl.y + rand(8, 18);
      } else {
        this.setState('idle');
        this.idleTime = rand(1.2, 3.4);
      }
    }
  };

  Cat.prototype.updateIdle = function (dt) {
    if (this.stateT > this.idleTime) {
      this.pickTarget();
      this.setState('wander');
    }
  };

  Cat.prototype.updateEat = function (dt) {
    if (this.stateT < 6 && Math.hypot(this.targetX - this.x, this.targetY - this.y) > 6) {
      this.moveTo(dt, this.targetX, this.targetY);
      return;
    }
    if (this.stateT > 8) {
      this.pickTarget();
      this.setState('wander');
      return;
    }
    if (Math.random() < dt * 1.4) dust(this.x + 10 * this.dir, this.y - 4, 1);
  };

  /** Ожидание: котик показал, чего хочет, и ждёт, что игрок это поймёт. */
  Cat.prototype.updateWant = function (dt) {
    this.needTimer -= dt;
    this.voiceTimer -= dt;

    if (this.voiceTimer <= 0) {
      this.voiceTimer = rand(3, 5.5);
      if (this.need === 'play') Sound.chirp(rand(0.9, 1.2) / this.scale);
      else Sound.meow(rand(0.85, 1.25) / this.scale);
      note(this.x + 14 * this.dir * this.scale, this.petCenterY() - 34 * this.scale);
    }

    if (pointer.inside && Math.abs(pointer.x - this.x) > 20) {
      this.dir = pointer.x > this.x ? 1 : -1;
    }

    if (this.personality === 'shy') this.updateShyApproach(dt);
    else if (this.personality === 'playful') this.updatePlayfulApproach(dt);
    else this.updateSweetApproach(dt);

    // Никакого наказания: просто теряет интерес и уходит гулять.
    if (this.needTimer <= 0 && this.state === 'want') {
      this.need = null;
      this.needCooldown = rand(12, 24);
      this.pickTarget();
      this.setState('wander');
    }
  };

  /** Ласковый: гладь как угодно, лишь бы рука двигалась. */
  Cat.prototype.updateSweetApproach = function (dt) {
    if (pointer.inside && pointer.speed > 55 && this.contains(pointer.x, pointer.y)) {
      this.setState('pet');
      this.interactIdle = 0;
    }
  };

  /** Насколько резким должно быть движение, чтобы напугать. Знакомый котик спокойнее. */
  Cat.prototype.panicSpeed = function () { return 420 + this.trust * 30; };
  Cat.prototype.roughSpeed = function () { return 360 + this.trust * 25; };

  /** Копит напряжение от резкой руки. Вернёт true, если котик всё-таки отшатнулся. */
  Cat.prototype.strain = function (dt) {
    this.nervous = clamp(this.nervous + dt * 1.5, 0, 1);
    game.hint('shy-fast', this.name + ' напрягся — веди рукой медленнее');
    if (this.nervous >= 1) {
      this.nervous = 0;
      this.shyRecoil();
      return true;
    }
    return false;
  };

  /** Он дёрнулся, но доверие не потеряно — можно просто замереть снова. */
  Cat.prototype.shyRecoil = function () {
    this.ready = 0;
    this.alert = clamp(this.alert + 0.3, 0, 0.9);
    this.stillTimer = 0.4;   // он тебя уже знает, знакомиться заново быстрее
    this.startle();
    game.hint('shy-rough', this.name + ' дёрнулся — гладь его медленнее');
  };

  /** Пугливый: резкое движение пугает, помогает медленный подход и неподвижная рука. */
  Cat.prototype.updateShyApproach = function (dt) {
    var d = this.distanceToPointer();
    var near = d < 170;

    if (near && pointer.speed > this.panicSpeed() && this.grace <= 0) {
      // Пока он тебе доверился, до побега дело не доходит — только вздрагивает.
      var ceiling = this.ready > 0 ? 0.9 : 1;
      var growth = 2 * (1 - clamp(this.trust * 0.12, 0, 0.5));
      this.alert = clamp(this.alert + dt * growth, 0, ceiling);
      if (this.alert >= 1) {
        this.flee();
        return;
      }
    }

    if (this.ready > 0) {
      // Уже обнюхал руку — можно гладить, но только мягко.
      if (this.contains(pointer.x, pointer.y) && pointer.speed > 45) {
        if (pointer.speed > this.roughSpeed() && this.grace <= 0) {
          this.strain(dt);
        } else {
          this.nervous = Math.max(0, this.nervous - dt);
          this.setState('pet');
          this.interactIdle = 0;
        }
      }
      return;
    }

    // Замри рядом — и он потянется к руке сам.
    if (d < 70 && pointer.speed < 32) {
      this.stillTimer += dt;
      if (Math.random() < dt * 2) sparkle(this.x + rand(-10, 10), this.petCenterY() - 30, 1);
      if (this.stillTimer > 1) {
        this.stillTimer = 0;
        this.setState('sniff');
      }
    } else {
      this.stillTimer = Math.max(0, this.stillTimer - dt * 0.8);
      if (d < 120 && pointer.speed > 120) {
        game.hint('shy-slow', this.name + ' пугливый — подойди медленно и замри рядом');
      }
    }
  };

  /** Игривый: чесать не даст, зато погоняется за рукой. */
  Cat.prototype.updatePlayfulApproach = function (dt) {
    var d = this.distanceToPointer();

    if (d < 46 && pointer.speed > 60) {
      // Схватили сразу — отпрыгивает.
      this.hopAway();
      this.progress = Math.max(0, this.progress - 0.12);
      game.hint('play-grab', this.name + ' не даётся в руки — поводи лапкой рядом, пусть погоняется');
      return;
    }

    if (d > 50 && d < 300 && pointer.speed > 230) {
      this.chaseIdle = 0;
      this.setState('play');
      this.interactIdle = 0;
      Sound.chirp(rand(1, 1.3));
    }
  };

  /** Пугливый обнюхивает руку — переломный момент знакомства. */
  Cat.prototype.updateSniff = function (dt) {
    if (this.stateT > 1.1) {
      this.ready = 7;
      this.grace = 1.5;   // рука неизбежно дёрнется, когда потянется гладить — это не считается
      this.setState('want');
      Sound.chirp(rand(0.9, 1.15) / this.scale);
      heartBurst(this.x, this.petCenterY() - 26 * this.scale, 2);
      game.hint('shy-ready', this.name + ' принюхался! Теперь гладь, только мягко');
      return;
    }
    // Тянется носом к руке.
    if (pointer.inside) {
      var dx = pointer.x - this.x;
      if (Math.abs(dx) > 10) this.dir = dx > 0 ? 1 : -1;
      if (pointer.speed > 520) {
        this.startle();
        this.alert = clamp(this.alert + 0.35, 0, 1);
        this.setState('want');
      }
    }
  };

  Cat.prototype.updatePet = function (dt) {
    this.wiggle = Math.sin(this.stateT * 14) * 0.6;
    var petting = pointer.inside && pointer.speed > 45 && this.contains(pointer.x, pointer.y);

    if (petting && this.personality === 'shy') {
      if (pointer.speed > this.roughSpeed() && this.grace <= 0) {
        // Слишком быстро: котик напрягается. Сбавишь — расслабится.
        if (this.strain(dt)) { this.setState('want'); return; }
        this.ready = Math.max(this.ready, 2);
        return;
      }
      this.nervous = Math.max(0, this.nervous - dt * 0.8);
      this.alert = Math.max(0, this.alert - dt * 0.6);
      this.ready = Math.max(this.ready, 3);
    }

    if (petting) {
      this.interactIdle = 0;
      var intensity = this.personality === 'shy'
        ? clamp(1 - pointer.speed / 420, 0.45, 1)          // мягче — приятнее
        : clamp(pointer.speed / 420, 0.35, 1);
      this.progress = clamp(this.progress + dt * (0.4 + intensity * 0.5), 0, 1);
      if (Math.random() < dt * 14) furPuff(pointer.x, pointer.y, this.coat.base);
      if (Math.random() < dt * 3.5) note(this.x, this.petCenterY() - 30 * this.scale);
      if (Math.random() < dt * 6) sparkle(pointer.x, pointer.y, 1);
    } else {
      this.interactIdle += dt;
      if (this.interactIdle > 0.45) {
        this.setState(this.need ? 'want' : 'idle');
        this.idleTime = rand(0.8, 2);
        return;
      }
    }

    if (this.progress >= 1) this.satisfy();
  };

  /** Догонялки: котик бежит за рукой, пока рука двигается. */
  Cat.prototype.updatePlay = function (dt) {
    var d = this.distanceToPointer();
    this.tailUp = 1;

    if (!pointer.inside || pointer.speed < 120) {
      this.chaseIdle += dt;
      if (this.chaseIdle > 1.8) {
        this.setState('want');
        return;
      }
    } else {
      this.chaseIdle = 0;
    }

    if (d < 40) {
      // Догнал руку — маленькая победа, отскакивает и снова гонится.
      this.hopAway();
      this.progress = clamp(this.progress + 0.18, 0, 1);
      sparkle(this.x, this.petCenterY(), 8);
      Sound.chirp(rand(1.1, 1.4));
    } else if (d < 340) {
      this.moveTo(dt, pointer.x, pointer.y + 10, 1.9);
      this.progress = clamp(this.progress + dt * 0.3, 0, 1);
      if (Math.random() < dt * 8) dust(this.x, this.y, 1);
    }

    if (this.progress >= 1) this.satisfy();
  };

  Cat.prototype.updateFlee = function (dt) {
    var done = this.moveTo(dt, this.targetX, this.targetY, 2.1);
    if (Math.random() < dt * 12) dust(this.x, this.y, 1);
    if (done || this.stateT > 3.5) {
      this.alert = 0.3;
      this.needCooldown = rand(5, 10);
      this.setState('idle');
      this.idleTime = rand(1.5, 3);
    }
  };

  Cat.prototype.updateDelight = function (dt) {
    this.hop = Math.abs(Math.sin(this.stateT * 7)) * 12 * this.scale;
    if (this.stateT > 0.25 && this.stateT % 0.35 < dt) {
      heartBurst(this.x, this.petCenterY() - 20 * this.scale, 1);
    }
    if (this.stateT > 2.1) {
      this.hop = 0;
      this.progress = 0;
      this.need = null;
      this.needCooldown = rand(10, 22);
      this.pickTarget();
      this.setState('wander');
    }
  };

  /* ---------- реакции ---------- */

  Cat.prototype.flee = function () {
    this.alert = 1;
    this.ready = 0;
    this.stillTimer = 0;
    this.need = null;
    this.needCooldown = rand(8, 14);
    this.targetX = clamp(props.bush.x + rand(-40, 40), field.left, field.right);
    this.targetY = clamp(props.bush.y + rand(-20, 30), field.top, field.bottom);
    this.setState('flee');
    Sound.hiss();
    dust(this.x, this.y, 6);
    game.hint('shy-flee', this.name + ' испугался резкого движения и убежал в кусты');
  };

  /** Отшатнулся, но не убежал. */
  Cat.prototype.startle = function () {
    var away = this.x < pointer.x ? -1 : 1;
    this.x = clamp(this.x + away * 26, field.left, field.right);
    this.dir = -away;
    dust(this.x, this.y, 4);
    Sound.hiss();
  };

  Cat.prototype.hopAway = function () {
    var ax = this.x - pointer.x;
    var ay = this.y - pointer.y;
    var len = Math.hypot(ax, ay) || 1;
    this.x = clamp(this.x + (ax / len) * 46, field.left, field.right);
    this.y = clamp(this.y + (ay / len) * 34, field.top, field.bottom);
    dust(this.x, this.y, 5);
  };

  /** Потребность выполнена: доверие, мурчалки, сердечки. */
  Cat.prototype.satisfy = function () {
    var fulfilledNeed = !!this.need;
    this.setState('delight');
    this.showTrust = 3.5;
    this.nervous = 0;

    var gained = fulfilledNeed ? (this.personality === 'sweet' ? 12 : 18) : 5;
    game.addPurrs(gained, this);

    heartBurst(this.x, this.petCenterY() - 16 * this.scale, fulfilledNeed ? 12 : 6);
    sparkle(this.x, this.petCenterY(), 10);
    Sound.chime();
    Sound.meow(rand(1.1, 1.35) / this.scale);

    if (fulfilledNeed && this.trust < 5) {
      this.trust++;
      game.onTrustGained(this);
    } else if (fulfilledNeed) {
      showToast(this.name + ' мурчит от счастья');
    }
    game.save();
  };

  /* ============================================================
     Отрисовка котика
     ============================================================ */

  function drawCat(cat, t) {
    var s = cat.scale;
    var sit = cat.sit;
    var breath = Math.sin(cat.breathPhase) * 0.02;
    var walking = (cat.state === 'wander' || cat.state === 'flee' || cat.state === 'play')
      ? Math.sin(cat.walkPhase) : 0;
    var petting = cat.state === 'pet';
    var delighted = cat.state === 'delight';
    var scared = cat.state === 'flee' || cat.alert > 0.4;
    var sniffing = cat.state === 'sniff';
    var eating = cat.state === 'eat';
    var coat = cat.coat;

    // Тень.
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#2f4a1f';
    ctx.beginPath();
    ctx.ellipse(cat.x, cat.y + 2, 30 * s, 9 * s, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cat.x, cat.y - cat.hop);
    ctx.rotate((petting ? cat.wiggle * 0.05 : 0) + (delighted ? Math.sin(t * 9) * 0.06 : 0));
    ctx.scale(cat.dir * s, s * (1 + breath) * (1 - cat.crouch * 0.12));

    var bodyY = lerp(-24, -26, sit) + cat.crouch * 3;
    var bodyRX = lerp(30, 24, sit) + cat.crouch * 2;
    var bodyRY = lerp(21, 27, sit) - cat.crouch * 2;
    var headX = lerp(19, 9, sit) + (sniffing ? 7 : 0);
    var headY = lerp(-44, -56, sit) + cat.crouch * 5 + (sniffing ? 6 : 0);
    var headR = 17;

    // Хвост: вниз-волной, трубой или поджат.
    var tailWave = Math.sin(cat.tailPhase) * (delighted ? 16 : petting ? 10 : 7);
    var up = cat.tailUp;
    var tailBase = { x: -bodyRX * 0.75, y: bodyY + 4 };
    var c1x = lerp(tailBase.x - 20, tailBase.x - 12, up);
    var c1y = lerp(tailBase.y + 6 + tailWave * 0.2, tailBase.y - 16, up);
    var c2x = lerp(tailBase.x - 30, tailBase.x - 14, up);
    var c2y = lerp(tailBase.y - 22 - tailWave * 0.4, tailBase.y - 44, up);
    var ex = lerp(tailBase.x - 12 - tailWave * 0.5, tailBase.x - 1 + tailWave * 0.25, up);
    var ey = lerp(tailBase.y - 38 - Math.abs(tailWave) * 0.3, tailBase.y - 56, up);
    if (scared) { // поджатый хвост
      c1x = tailBase.x - 12; c1y = tailBase.y + 12;
      c2x = tailBase.x - 4; c2y = tailBase.y + 18;
      ex = tailBase.x + 12; ey = tailBase.y + 14;
    }

    ctx.strokeStyle = coat.dark;
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailBase.x, tailBase.y);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = coat.base;
    ctx.lineWidth = 4.6;
    ctx.stroke();

    // Задние лапки.
    ctx.fillStyle = coat.dark;
    ctx.beginPath();
    ctx.ellipse(-bodyRX * 0.45, -6 + walking * 1.5, 9, 6.5, 0, 0, TAU);
    ctx.fill();

    // Тело.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, bodyY, bodyRX, bodyRY, 0, 0, TAU);
    ctx.closePath();
    ctx.fillStyle = coat.base;
    ctx.fill();
    ctx.clip();

    ctx.fillStyle = coat.belly;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(bodyRX * 0.35, bodyY + bodyRY * 0.45, bodyRX * 0.6, bodyRY * 0.6, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = coat.dark;
    ctx.strokeStyle = coat.dark;
    if (cat.pattern === 'tabby') {
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 10, bodyY - bodyRY);
        ctx.quadraticCurveTo(i * 10 + 4, bodyY, i * 10, bodyY + bodyRY * 0.2);
        ctx.stroke();
      }
    } else if (cat.pattern === 'spots') {
      for (var sp = 0; sp < 6; sp++) {
        var ang = (sp / 6) * TAU;
        ctx.beginPath();
        ctx.ellipse(Math.cos(ang) * bodyRX * 0.55, bodyY + Math.sin(ang) * bodyRY * 0.5, 5.5, 4.5, ang, 0, TAU);
        ctx.fill();
      }
    } else if (cat.pattern === 'tuxedo') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(bodyRX * 0.42, bodyY + bodyRY * 0.3, bodyRX * 0.5, bodyRY * 0.75, -0.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Передние лапки.
    ctx.fillStyle = cat.pattern === 'tuxedo' ? '#fdfaf3' : coat.base;
    var pawLift = petting ? Math.abs(Math.sin(t * 6)) * 2 : 0;
    ctx.beginPath();
    ctx.ellipse(bodyRX * 0.55, -4 - walking * 2 - pawLift, 8, 6, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bodyRX * 0.3, -4 + walking * 2, 8, 6, 0, 0, TAU);
    ctx.fill();

    // Голова.
    var headBob = walking * 1.2 + (petting ? Math.sin(t * 12) * 1.2 : 0) + (eating ? Math.sin(t * 5) * 2 : 0);
    ctx.save();
    ctx.translate(headX, headY + headBob);
    ctx.rotate(petting ? 0.12 : (sniffing ? 0.2 : (eating ? 0.35 : 0)));

    // Ушки: торчком, прижаты при испуге.
    var twitch = cat.earTwitch > 0 ? Math.sin(cat.earTwitch * 40) * 0.25 : 0;
    var earDrop = cat.earsFlat * 0.9 + (petting || delighted ? 0.22 : 0);
    [-1, 1].forEach(function (side) {
      ctx.save();
      ctx.translate(side * 9, -headR * 0.72);
      ctx.rotate(side * (0.25 + earDrop) + twitch * side);
      ctx.fillStyle = coat.base;
      ctx.beginPath();
      ctx.moveTo(-7, 4);
      ctx.quadraticCurveTo(-2, -13, 7, 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 170, 190, 0.85)';
      ctx.beginPath();
      ctx.moveTo(-3.6, 2.5);
      ctx.quadraticCurveTo(-1, -7, 3.6, 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    ctx.fillStyle = coat.base;
    ctx.beginPath();
    ctx.ellipse(0, 0, headR, headR * 0.92, 0, 0, TAU);
    ctx.fill();

    if (cat.pattern === 'tabby') {
      ctx.strokeStyle = coat.dark;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      for (var m = -1; m <= 1; m++) {
        ctx.beginPath();
        ctx.moveTo(m * 5, -headR * 0.82);
        ctx.lineTo(m * 5 + 1, -headR * 0.45);
        ctx.stroke();
      }
    }

    ctx.fillStyle = coat.belly;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(2, 5, headR * 0.72, headR * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Глаза.
    var eyeY = -1.5;
    var closed = cat.blink > 0 || petting || delighted;
    var wide = cat.state === 'play' || cat.state === 'want' && cat.need === 'play' || scared;
    [-1, 1].forEach(function (side) {
      var ex2 = side * 6.4;
      if (closed) {
        ctx.strokeStyle = '#3a2f28';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ex2, eyeY + 2.5, 4, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#fffdf8';
        ctx.beginPath();
        ctx.ellipse(ex2, eyeY, 4.4, 5.2, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = cat.eyeColor;
        ctx.beginPath();
        ctx.ellipse(ex2, eyeY, 3.4, 4.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2a2320';
        ctx.beginPath();
        ctx.ellipse(ex2 + 0.4, eyeY, wide ? 2.8 : 1.5, 4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(ex2 + 1.8, eyeY - 2.2, 1.5, 0, TAU);
        ctx.fill();
      }
    });

    if (petting || delighted || cat.ready > 0) {
      ctx.fillStyle = 'rgba(255, 140, 170, 0.35)';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.ellipse(side * 11, 4, 4.2, 2.8, 0, 0, TAU);
        ctx.fill();
      });
    }

    // Носик и рот.
    ctx.fillStyle = '#ff9db4';
    ctx.beginPath();
    ctx.moveTo(-2.4, 4.6);
    ctx.lineTo(2.4, 4.6);
    ctx.lineTo(0, 6.8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#4a3b32';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    if ((cat.state === 'want' && cat.voiceTimer > 2.4) || eating) {
      ctx.fillStyle = '#e07a92';
      ctx.beginPath();
      ctx.ellipse(0, 9, 3, 3.6, 0, 0, TAU);
      ctx.fill();
    } else if (delighted || petting) {
      ctx.beginPath();
      ctx.arc(0, 7.4, 3.4, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-2, 7.2, 2.2, 0, Math.PI);
      ctx.arc(2, 7.2, 2.2, 0, Math.PI);
      ctx.stroke();
    }

    // Усы.
    ctx.strokeStyle = 'rgba(70, 55, 45, 0.45)';
    ctx.lineWidth = 1.1;
    [-1, 1].forEach(function (side) {
      for (var w = 0; w < 3; w++) {
        ctx.beginPath();
        ctx.moveTo(side * 7, 4 + w * 1.6);
        ctx.quadraticCurveTo(side * 15, 2 + w * 3 - 2, side * 21, 1 + w * 4 - 3);
        ctx.stroke();
      }
    });

    ctx.restore(); // голова
    ctx.restore(); // котик

    // Точки «принюхивается» — рисуем в экранных координатах.
    if (sniffing) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (var k = 0; k < 3; k++) {
        var phase = (t * 2 + k * 0.3) % 1;
        ctx.globalAlpha = 1 - phase;
        ctx.beginPath();
        ctx.arc(cat.x + cat.dir * (26 + k * 9) * s, cat.petCenterY() - 10 * s - phase * 8, 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Пузырь с потребностью: сердечко — хочу ласки, клубок — хочу играть. */
  function drawNeedBubble(cat, t) {
    var active = (cat.state === 'want' || cat.state === 'pet' || cat.state === 'play' || cat.state === 'sniff');
    if (!active || !cat.need) return;

    var bob = Math.sin(t * 3) * 3;
    var bx = cat.x;
    var by = cat.petCenterY() - 56 * cat.scale + bob;
    var size = 30;
    var playful = cat.need === 'play';
    var pathFn = playful ? yarnPath : heartPath;

    ctx.save();

    ctx.fillStyle = 'rgba(255, 253, 246, 0.92)';
    ctx.beginPath();
    ctx.moveTo(bx - 6, by + 16);
    ctx.lineTo(bx + 6, by + 16);
    ctx.lineTo(bx, by + 26);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(bx, by, 21, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = playful ? 'rgba(255, 190, 120, 0.3)' : 'rgba(255, 140, 175, 0.28)';
    pathFn(ctx, bx, by, size);
    ctx.fill();

    var level = clamp(cat.progress, 0, 1);
    if (level > 0) {
      ctx.save();
      pathFn(ctx, bx, by, size);
      ctx.clip();
      var grad = ctx.createLinearGradient(0, by + size * 0.5, 0, by - size * 0.5);
      if (playful) {
        grad.addColorStop(0, '#ff9d3b');
        grad.addColorStop(1, '#ffd06b');
      } else {
        grad.addColorStop(0, '#ff5f92');
        grad.addColorStop(1, '#ff9dbb');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(bx - size, by + size * 0.5 - size * level, size * 2, size * 1.2);
      ctx.restore();
    }

    ctx.strokeStyle = playful ? '#f09030' : '#ff87ad';
    ctx.lineWidth = 2;
    pathFn(ctx, bx, by, size);
    ctx.stroke();

    // Намотанные нитки и торчащий кончик — чтобы кружок читался как клубок.
    if (playful) {
      ctx.save();
      ctx.strokeStyle = 'rgba(198, 106, 24, 0.7)';
      ctx.lineWidth = 1.5;
      var r = size / 2;
      [-0.6, 0.1, 0.8].forEach(function (angle) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.92, r * 0.38, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      });
      // Кончик нитки наружу.
      ctx.strokeStyle = 'rgba(240, 144, 48, 0.95)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx + r * 0.7, by + r * 0.6);
      ctx.quadraticCurveTo(bx + r * 1.5, by + r * 1.1, bx + r * 0.9, by + r * 1.6);
      ctx.stroke();
      ctx.restore();
    }

    // Пугливый: показываем, что он насторожён.
    var tension = Math.max(cat.alert, cat.nervous);
    if (cat.personality === 'shy' && tension > 0.15) {
      ctx.strokeStyle = 'rgba(255, 130, 110, ' + clamp(tension, 0, 1) + ')';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(bx, by, 26, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  /** Полоска доверия — пять сердечек над котиком. */
  function drawTrust(cat) {
    var visible = cat.showTrust > 0 || cat.state === 'pet' || cat.state === 'play' || cat.state === 'delight';
    if (!visible || cat.trust === 0 && cat.state === 'wander') return;

    var y = cat.y + 26;
    var gap = 13;
    var startX = cat.x - gap * 2;
    ctx.save();
    ctx.globalAlpha = clamp(cat.showTrust > 0 ? cat.showTrust : 1, 0, 1);
    for (var i = 0; i < 5; i++) {
      var filled = i < cat.trust;
      heartPath(ctx, startX + i * gap, y, 11);
      ctx.fillStyle = filled ? '#ff5f92' : 'rgba(255,255,255,0.55)';
      ctx.fill();
      ctx.strokeStyle = filled ? '#ffffff' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Имя и характер — когда с котиком взаимодействуют. */
  function drawCatName(cat) {
    var show = cat.state === 'pet' || cat.state === 'delight' || cat.state === 'play' ||
      cat.state === 'sniff' || cat.showTrust > 0;
    if (!show) return;

    var label = cat.resident ? cat.name + ' 🏡' : cat.name;
    ctx.save();
    ctx.font = '800 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(label).width + 16;
    var y = cat.y + (cat.showTrust > 0 || cat.trust > 0 ? 46 : 12);
    ctx.fillStyle = 'rgba(255, 253, 246, 0.9)';
    roundRect(ctx, cat.x - w / 2, y - 11, w, 20, 10);
    ctx.fill();
    ctx.fillStyle = '#7a5c48';
    ctx.fillText(label, cat.x, y + 3.5);
    ctx.restore();
  }

  /* ============================================================
     Курсор-ладошка
     ============================================================ */

  function drawCursor(t, mode) {
    if (!pointer.inside || !pointer.seen) return;
    var x = pointer.x, y = pointer.y;
    var tilt = clamp(pointer.dirX, -1, 1) * 0.35 + (mode === 'pet' ? Math.sin(t * 18) * 0.18 : 0);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    if (mode === 'pet') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + Math.sin(t * 12) * 4, 0, TAU);
      ctx.stroke();
    } else if (mode === 'still') {
      // Рука замерла рядом с пугливым — показываем, что это работает.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 26 - Math.sin(t * 3) * 3, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = 'rgba(60, 45, 35, 0.18)';
    ctx.beginPath();
    ctx.ellipse(2, 5, 15, 13, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#fff4ea';
    ctx.beginPath();
    ctx.ellipse(0, 2, 14, 12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffc4d3';
    ctx.beginPath();
    ctx.ellipse(0, 3.5, 8.5, 7, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#fff4ea';
    var toes = [[-10, -8], [-3.5, -12], [3.5, -12], [10, -8]];
    toes.forEach(function (p, i) {
      var lift = mode === 'pet' ? Math.sin(t * 16 + i) * 1.2 : 0;
      ctx.beginPath();
      ctx.ellipse(p[0], p[1] + lift, 4.2, 4.8, 0, 0, TAU);
      ctx.fill();
    });
    ctx.fillStyle = '#ffc4d3';
    toes.forEach(function (p, i) {
      var lift = mode === 'pet' ? Math.sin(t * 16 + i) * 1.2 : 0;
      ctx.beginPath();
      ctx.ellipse(p[0], p[1] + lift, 2.4, 2.8, 0, 0, TAU);
      ctx.fill();
    });

    ctx.restore();
  }

  /* ============================================================
     Игра
     ============================================================ */

  var ui = {
    purrs: document.getElementById('purrs'),
    residents: document.getElementById('residents'),
    catsLine: document.getElementById('catsLine'),
    toast: document.getElementById('toast'),
    startScreen: document.getElementById('startScreen'),
    helpScreen: document.getElementById('helpScreen'),
    playBtn: document.getElementById('playBtn'),
    helpBtn: document.getElementById('helpBtn'),
    closeHelpBtn: document.getElementById('closeHelpBtn'),
    soundBtn: document.getElementById('soundBtn')
  };

  var SAVE_KEY = 'cutten.save.v1';

  var game = {
    running: false,
    purrs: 0,
    spawnTimer: 20,
    petTarget: null,
    stillTarget: null,
    hintsSeen: {},
    saveTimer: 0,

    maxCats: function () {
      // Уютная игра: важнее внимание к каждому, чем толпа.
      var area = (field.right - field.left) * (field.bottom - field.top);
      return clamp(Math.round(area / 90000) + 3, 4, 6);
    },

    hint: function (key, text) {
      if (this.hintsSeen[key]) return;
      this.hintsSeen[key] = true;
      showToast(text);
    },

    addPurrs: function (amount, cat) {
      this.purrs += amount;
      popup(cat.x, cat.petCenterY() - 72 * cat.scale, '+' + amount, '#fff0a8');
    },

    onTrustGained: function (cat) {
      cat.showTrust = 4;
      if (cat.trust === 3 && !cat.resident) {
        cat.resident = true;
        showToast(cat.name + ' теперь живёт на полянке 🏡');
        heartBurst(cat.x, cat.petCenterY() - 30 * cat.scale, 14);
      } else if (cat.trust >= 5 && !cat.brought) {
        cat.brought = true;
        var friend = this.spawnCat();
        showToast(cat.name + ' привёл друга: ' + friend.name + '!');
      } else {
        showToast(cat.name + ' (' + PERSONALITIES[cat.personality].label + ') стал доверять тебе больше');
      }
    },

    spawnCat: function (options) {
      var edge = randInt(0, 3);
      var x, y;
      if (edge === 0) { x = field.left - 30; y = rand(field.top, field.bottom); }
      else if (edge === 1) { x = field.right + 30; y = rand(field.top, field.bottom); }
      else if (edge === 2) { x = rand(field.left, field.right); y = field.top - 20; }
      else { x = rand(field.left, field.right); y = field.bottom + 30; }
      var cat = new Cat(x, y, options);
      cats.push(cat);
      return cat;
    },

    /* ---------- сохранение ---------- */

    save: function () {
      var residents = cats.filter(function (c) { return c.resident; }).map(function (c) {
        return {
          name: c.name, personality: c.personality, coatIndex: c.coatIndex,
          pattern: c.pattern, eyeColor: c.eyeColor, scale: c.scale,
          trust: c.trust, brought: c.brought
        };
      });
      store.set(SAVE_KEY, { v: 1, purrs: this.purrs, cats: residents });
    },

    load: function () {
      var data = store.get(SAVE_KEY, null);
      if (!data || data.v !== 1) return [];
      this.purrs = data.purrs || 0;
      return data.cats || [];
    },

    start: function () {
      this.running = true;
      Sound.unlock();
      var residents = cats.filter(function (c) { return c.resident; });
      if (residents.length) {
        showToast('Тебя встречают: ' + residents.map(function (c) { return c.name; }).join(', '));
        residents.forEach(function (c) { c.greet = rand(2, 6); });
      } else {
        showToast('Котики разные — попробуй понять, чего хочет каждый');
      }
    },

    update: function (dt, t) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = rand(20, 32);
        if (cats.length < this.maxCats()) {
          var cat = this.spawnCat();
          if (this.running) {
            showToast('На полянку заглянул новый котик: ' + cat.name);
          }
        }
      }

      // Кого гладим прямо сейчас.
      var petting = null;
      var stillNear = null;
      var moving = pointer.speed > 55 || (pointer.down && pointer.speed > 25);

      for (var i = 0; i < cats.length; i++) {
        var c = cats[i];
        if (this.running && pointer.inside) {
          if (c.state === 'pet' && moving && c.contains(pointer.x, pointer.y)) petting = c;
          if (c.personality === 'shy' && c.ready <= 0 && pointer.speed < 32 && c.distanceToPointer() < 90) stillNear = c;
        }
        c.update(dt, t);
      }

      // Ласковых и жующих можно гладить просто так — без потребности.
      if (this.running && pointer.inside && moving) {
        for (var j = 0; j < cats.length; j++) {
          var cat2 = cats[j];
          var casual = (cat2.state === 'idle' || cat2.state === 'wander' || cat2.state === 'eat');
          if (!casual || !cat2.contains(pointer.x, pointer.y)) continue;
          if (cat2.personality === 'shy') {
            cat2.alert = clamp(cat2.alert + dt * 1.8, 0, 1);
            if (cat2.alert >= 1) cat2.flee();
          } else if (cat2.personality === 'playful' && cat2.state !== 'eat') {
            cat2.hopAway();
            this.hint('play-grab', cat2.name + ' не даётся в руки — поводи лапкой рядом, пусть погоняется');
          } else {
            cat2.progress = 0;
            cat2.need = null;
            cat2.setState('pet');
            cat2.interactIdle = 0;
          }
        }
      }

      this.petTarget = petting;
      this.stillTarget = stillNear;
      Sound.setPurr(!!petting);

      updateParticles(dt);
      updateButterflies(dt, t);
      this.syncHud();

      this.saveTimer -= dt;
      if (this.saveTimer <= 0) { this.saveTimer = 5; this.save(); }
    },

    hudCache: {},

    syncHud: function () {
      var cache = this.hudCache;
      if (cache.purrs !== this.purrs) { ui.purrs.textContent = this.purrs; cache.purrs = this.purrs; }

      var residents = 0;
      for (var i = 0; i < cats.length; i++) if (cats[i].resident) residents++;
      if (cache.residents !== residents) { ui.residents.textContent = residents; cache.residents = residents; }

      var line = cats.length + ' ' + plural(cats.length, 'котик', 'котика', 'котиков') + ' на полянке';
      if (cache.line !== line) { ui.catsLine.textContent = '🐈 ' + line; cache.line = line; }
    },

    draw: function (t) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(bgCanvas, 0, 0, W, H);

      drawBowl();
      drawButterflies();

      // Сортируем по глубине: кустик и котики по y.
      var drawables = cats.map(function (c) { return { y: c.y, kind: 'cat', cat: c }; });
      drawables.push({ y: props.bush.y, kind: 'bush' });
      drawables.sort(function (a, b) { return a.y - b.y; });
      drawables.forEach(function (item) {
        if (item.kind === 'bush') drawBush(t);
        else drawCat(item.cat, t);
      });

      cats.forEach(function (cat) {
        drawTrust(cat);
        drawCatName(cat);
        drawNeedBubble(cat, t);
      });

      drawParticles();
      drawCursor(t, this.petTarget ? 'pet' : (this.stillTarget ? 'still' : null));
    }
  };

  function plural(n, one, few, many) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  /* ============================================================
     Тосты и кнопки
     ============================================================ */

  var toastTimer = null;
  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.classList.remove('show'); }, 2600);
  }

  ui.playBtn.addEventListener('click', function () {
    ui.startScreen.classList.add('hidden');
    game.start();
  });
  ui.helpBtn.addEventListener('click', function () { ui.helpScreen.classList.remove('hidden'); });
  ui.closeHelpBtn.addEventListener('click', function () { ui.helpScreen.classList.add('hidden'); });

  function syncSoundBtn() { ui.soundBtn.textContent = Sound.enabled ? '🔊' : '🔇'; }
  ui.soundBtn.addEventListener('click', function () {
    Sound.setEnabled(!Sound.enabled);
    syncSoundBtn();
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') ui.helpScreen.classList.add('hidden');
  });

  /* ============================================================
     Цикл
     ============================================================ */

  var lastTime = 0;
  var elapsed = 0;

  function frame(now) {
    var dt = lastTime ? (now - lastTime) / 1000 : 0.016;
    lastTime = now;
    dt = clamp(dt, 0, 0.05);
    elapsed += dt;

    updatePointer(dt);
    game.update(dt, elapsed);
    game.draw(elapsed);

    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { Sound.setPurr(false); game.save(); }
    else lastTime = 0;
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  window.addEventListener('beforeunload', function () { game.save(); });

  function init() {
    resize();
    pointer.x = W / 2;
    pointer.y = H / 2;
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;

    // Сначала возвращаем своих котиков.
    var saved = game.load();
    saved.forEach(function (data) {
      var cat = new Cat(
        clamp(props.bush.x + rand(-120, 120), field.left, field.right),
        clamp(props.bush.y + rand(-60, 90), field.top, field.bottom),
        data
      );
      cat.greet = rand(2, 6);
      cats.push(cat);
    });

    // Добираем новичков так, чтобы были представлены все характеры.
    var needed = Math.max(0, 4 - cats.length);
    var order = PERSONALITY_IDS.slice();
    for (var i = 0; i < needed; i++) {
      var cat2 = new Cat(
        rand(field.left + 40, field.right - 40),
        rand(field.top + 40, field.bottom - 40),
        { personality: order[i % order.length] }
      );
      cat2.needCooldown = rand(2, 10);
      cats.push(cat2);
    }

    syncSoundBtn();
    game.syncHud();
    requestAnimationFrame(frame);
  }

  init();

  // Для отладки и автотестов.
  window.__cutten = {
    game: game, cats: cats, pointer: pointer, props: props,
    reset: function () { store.set(SAVE_KEY, null); }
  };
})();
