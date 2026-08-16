/* Полянка котиков — милая браузерная игра «почеши котика».
   Ванильный JS, без зависимостей и внешних ассетов: всё рисуется на canvas. */
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

  /* ============================================================
     Canvas и слой фона
     ============================================================ */

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var bgCanvas = document.createElement('canvas');
  var bgCtx = bgCanvas.getContext('2d');

  var W = 0, H = 0, DPR = 1;
  var field = { left: 0, right: 0, top: 0, bottom: 0 };

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
    // +56px — чтобы пузырь с сердечком над котиком тоже помещался.
    var hudHeight = (W < 620 ? 168 : 122) + 56;
    field.left = 46;
    field.right = W - 46;
    field.top = Math.min(hudHeight, H * 0.45);
    field.bottom = H - 46;

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
      var shade = pick(['rgba(108,180,80,0.85)', 'rgba(130,198,96,0.85)', 'rgba(92,164,70,0.75)']);
      c.strokeStyle = shade;
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
      var kx = rand(20, W - 20), ky = rand(20, H - 20);
      c.fillStyle = 'rgba(190, 186, 170, 0.55)';
      c.beginPath();
      c.ellipse(kx, ky, rand(6, 12), rand(4, 8), rand(0, TAU), 0, TAU);
      c.fill();
    }
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
    if (pointer.seen) {
      pointer.frameDist += Math.hypot(nx - pointer.x, ny - pointer.y);
    }
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
    pointer.speed = lerp(pointer.speed, instant, 0.45);
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
        var target = active ? 0.09 : 0.0001;
        this.purrGain.gain.setTargetAtTime(target, ac.currentTime, 0.08);
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

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'sparkle') p.vy += 160 * dt;
      if (p.type === 'fur') p.vy += 90 * dt;
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
      } else if (p.type === 'sparkle') {
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
      var wing = Math.abs(Math.sin(b.flap)) * 0.75 + 0.25; // раскрытие крыльев
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
        // Верхнее крыло.
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.ellipse(6, -3.5, 6.5, 5, -0.35, 0, TAU);
        ctx.fill();
        // Нижнее крыло — чуть темнее и меньше.
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.ellipse(4.5, 4, 4.6, 3.6, 0.4, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.95;
        // Пятнышко на крыле.
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(7, -4, 1.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      });

      // Тельце и усики.
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
    { base: '#f4a35c', dark: '#d97e35', belly: '#ffe3c4', name: 'рыжий' },
    { base: '#9aa3ad', dark: '#767f8a', belly: '#e8edf2', name: 'серый' },
    { base: '#f5efe4', dark: '#d9cdb8', belly: '#fffaf0', name: 'кремовый' },
    { base: '#5b5560', dark: '#403c46', belly: '#8d8794', name: 'дымчатый' },
    { base: '#c98b60', dark: '#a76c45', belly: '#f3ddc6', name: 'шоколадный' },
    { base: '#e9d7a8', dark: '#cdb37c', belly: '#fff6dd', name: 'песочный' },
    { base: '#8fa7c4', dark: '#6b83a1', belly: '#dde7f3', name: 'голубой' }
  ];

  var PATTERNS = ['solid', 'tabby', 'spots', 'tuxedo'];
  var EYE_COLORS = ['#4a8f3c', '#3f7fbf', '#c08a2a', '#5b8f8f'];

  var cats = [];

  function Cat(x, y) {
    this.x = x;
    this.y = y;
    this.scale = rand(0.85, 1.2);
    this.coat = pick(COATS);
    this.pattern = pick(PATTERNS);
    this.eyeColor = pick(EYE_COLORS);
    this.name = pick(NAMES);
    this.dir = Math.random() < 0.5 ? 1 : -1;

    this.state = 'wander';
    this.stateT = 0;
    this.sit = 0;              // 0 — стоит, 1 — сидит
    this.love = 0;             // насколько уже нагладили
    this.patience = 0;
    this.patienceMax = 1;
    this.askCooldown = rand(3, 10);
    this.wasAsking = false;
    this.petIdle = 0;          // сколько времени рука не двигается по котику
    this.bond = 0;             // после ласки котик ходит за курсором
    this.hop = 0;

    this.speed = rand(46, 68);
    this.targetX = x;
    this.targetY = y;
    this.walkPhase = rand(0, TAU);
    this.tailPhase = rand(0, TAU);
    this.breathPhase = rand(0, TAU);
    this.blinkTimer = rand(1.5, 5);
    this.blink = 0;
    this.earTwitch = 0;
    this.earTimer = rand(2, 6);
    this.meowTimer = 0;
    this.wiggle = 0;
    this.pickTarget();
  }

  Cat.prototype.pickTarget = function () {
    this.targetX = rand(field.left, field.right);
    this.targetY = rand(field.top, field.bottom);
  };

  Cat.prototype.radiusX = function () { return 42 * this.scale; };
  Cat.prototype.radiusY = function () { return 38 * this.scale; };

  /** Центр «гладибельной» зоны (спинка котика). */
  Cat.prototype.petCenterY = function () {
    return this.y - lerp(26, 34, this.sit) * this.scale;
  };

  Cat.prototype.contains = function (px, py) {
    var dx = (px - this.x) / this.radiusX();
    var dy = (py - this.petCenterY()) / this.radiusY();
    return dx * dx + dy * dy <= 1;
  };

  Cat.prototype.startAsking = function () {
    this.state = 'ask';
    this.stateT = 0;
    this.wasAsking = true;
    this.patienceMax = rand(11, 15);
    this.patience = this.patienceMax;
    this.meowTimer = 0.3;
    this.love = Math.min(this.love, 0.1);
  };

  Cat.prototype.setState = function (state) {
    this.state = state;
    this.stateT = 0;
  };

  Cat.prototype.update = function (dt, t) {
    this.stateT += dt;
    this.breathPhase += dt * 2.2;
    this.tailPhase += dt * (this.state === 'happy' ? 6 : 1.8);

    // Моргание.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 0.16;
      this.blinkTimer = rand(2.5, 6.5);
    }
    if (this.blink > 0) this.blink -= dt;

    // Подёргивание ушек.
    this.earTimer -= dt;
    if (this.earTimer <= 0) {
      this.earTwitch = 0.35;
      this.earTimer = rand(3, 8);
    }
    if (this.earTwitch > 0) this.earTwitch -= dt;

    if (this.bond > 0) this.bond -= dt;

    var wantsSit = (this.state === 'ask' || this.state === 'pet' || this.state === 'sad' || this.state === 'idle');
    this.sit = approach(this.sit, wantsSit ? 1 : 0, dt * 3.2);

    switch (this.state) {
      case 'wander': this.updateWander(dt); break;
      case 'idle': this.updateIdle(dt); break;
      case 'ask': this.updateAsk(dt); break;
      case 'pet': this.updatePet(dt); break;
      case 'happy': this.updateHappy(dt); break;
      case 'sad': this.updateSad(dt); break;
    }

    // Просьба о ласке созревает только у спокойного котика.
    if (this.state === 'wander' || this.state === 'idle') {
      this.askCooldown -= dt;
      if (this.askCooldown <= 0 && game.running) this.startAsking();
    }

    if (this.state !== 'pet' && this.state !== 'happy' && this.love > 0) {
      this.love = Math.max(0, this.love - dt * 0.12);
    }

    this.x = clamp(this.x, field.left - 10, field.right + 10);
    this.y = clamp(this.y, field.top - 10, field.bottom + 10);
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

  Cat.prototype.updateWander = function (dt) {
    var tx = this.targetX, ty = this.targetY, speedScale = 1;
    if (this.bond > 0 && pointer.inside) {
      tx = pointer.x;
      ty = pointer.y + 20;
      speedScale = 1.35;
      if (Math.hypot(tx - this.x, ty - this.y) < 60) { this.walkPhase += dt * 3; return; }
    }
    if (this.moveTo(dt, tx, ty, speedScale)) {
      this.setState('idle');
      this.idleTime = rand(1.2, 3.4);
    }
  };

  Cat.prototype.updateIdle = function (dt) {
    if (this.stateT > (this.idleTime || 2)) {
      this.pickTarget();
      this.setState('wander');
    }
  };

  Cat.prototype.updateAsk = function (dt) {
    this.patience -= dt;
    this.meowTimer -= dt;
    if (this.meowTimer <= 0) {
      this.meowTimer = rand(2.6, 4.6);
      Sound.meow(rand(0.85, 1.25) / this.scale);
      note(this.x + 14 * this.dir * this.scale, this.petCenterY() - 34 * this.scale);
    }
    // Ждущий котик смотрит на курсор.
    if (pointer.inside && Math.abs(pointer.x - this.x) > 20) {
      this.dir = pointer.x > this.x ? 1 : -1;
    }
    if (this.patience <= 0) {
      this.setState('sad');
      game.onIgnored(this);
    }
  };

  Cat.prototype.updatePet = function (dt) {
    this.wiggle = Math.sin(this.stateT * 14) * 0.6;
    if (this.petIdle > 0.4) {
      // Рука ушла — возвращаемся к тому, что делали.
      if (this.wasAsking && this.patience > 0) {
        this.setState('ask');
      } else {
        this.setState('idle');
        this.idleTime = rand(0.8, 2);
      }
      Sound.setPurr(false);
      return;
    }
    if (this.wasAsking) {
      this.patience -= dt * 0.35; // пока гладят, терпение почти не тратится
      if (this.patience <= 0) this.patience = 0.01;
    }
    if (this.love >= 1) {
      this.setState('happy');
      game.onSatisfied(this);
    }
  };

  Cat.prototype.updateHappy = function (dt) {
    this.hop = Math.abs(Math.sin(this.stateT * 7)) * 12 * this.scale;
    if (this.stateT > 0.25 && this.stateT % 0.35 < dt) {
      heartBurst(this.x, this.petCenterY() - 20 * this.scale, 1);
    }
    if (this.stateT > 2.1) {
      this.hop = 0;
      this.love = 0;
      this.wasAsking = false;
      this.bond = rand(3, 6);
      this.askCooldown = rand(9, 20);
      this.pickTarget();
      this.setState('wander');
    }
  };

  Cat.prototype.updateSad = function (dt) {
    if (this.stateT > 1.8) {
      this.wasAsking = false;
      this.love = 0;
      this.askCooldown = rand(12, 22);
      this.pickTarget();
      this.setState('wander');
    }
  };

  /* ---------- отрисовка котика ---------- */

  function drawCat(cat, t) {
    var s = cat.scale;
    var sit = cat.sit;
    var breath = Math.sin(cat.breathPhase) * 0.02;
    var walking = (cat.state === 'wander') ? Math.sin(cat.walkPhase) : 0;
    var petting = cat.state === 'pet';
    var happy = cat.state === 'happy';
    var sad = cat.state === 'sad';
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
    ctx.rotate((petting ? cat.wiggle * 0.05 : 0) + (happy ? Math.sin(t * 9) * 0.06 : 0));
    ctx.scale(cat.dir * s, s * (1 + breath));

    var bodyY = lerp(-24, -26, sit);
    var bodyRX = lerp(30, 24, sit);
    var bodyRY = lerp(21, 27, sit);
    var headX = lerp(19, 9, sit);
    var headY = lerp(-44, -56, sit);
    var headR = 17;

    // Хвост.
    var tailWave = Math.sin(cat.tailPhase) * (happy ? 16 : petting ? 10 : 7);
    var tailBase = { x: -bodyRX * 0.75, y: bodyY + 4 };
    ctx.strokeStyle = coat.dark;
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailBase.x, tailBase.y);
    ctx.bezierCurveTo(
      tailBase.x - 20, tailBase.y + 6 + tailWave * 0.2,
      tailBase.x - 30, tailBase.y - 22 - tailWave * 0.4,
      tailBase.x - 12 - tailWave * 0.5, tailBase.y - 38 - Math.abs(tailWave) * 0.3
    );
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

    // Животик.
    ctx.fillStyle = coat.belly;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(bodyRX * 0.35, bodyY + bodyRY * 0.45, bodyRX * 0.6, bodyRY * 0.6, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Узор.
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
        var ang = (sp / 6) * TAU + cat.tailPhase * 0;
        ctx.beginPath();
        ctx.ellipse(
          Math.cos(ang) * bodyRX * 0.55,
          bodyY + Math.sin(ang) * bodyRY * 0.5,
          5.5, 4.5, ang, 0, TAU
        );
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
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    var pawLift = petting ? Math.abs(Math.sin(t * 6)) * 2 : 0;
    ctx.beginPath();
    ctx.ellipse(bodyRX * 0.55, -4 - walking * 2 - pawLift, 8, 6, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bodyRX * 0.3, -4 + walking * 2, 8, 6, 0, 0, TAU);
    ctx.fill();

    // Голова.
    var headBob = walking * 1.2 + (petting ? Math.sin(t * 12) * 1.2 : 0);
    ctx.save();
    ctx.translate(headX, headY + headBob);
    ctx.rotate(petting ? 0.12 : (sad ? -0.12 : 0));

    // Ушки.
    var twitch = cat.earTwitch > 0 ? Math.sin(cat.earTwitch * 40) * 0.25 : 0;
    var earDrop = sad ? 0.55 : (petting || happy ? 0.22 : 0);
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

    // Мордочка.
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

    // Щёчки.
    ctx.fillStyle = coat.belly;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(2, 5, headR * 0.72, headR * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Глаза.
    var eyeY = -1.5;
    var closed = cat.blink > 0 || petting || happy;
    [-1, 1].forEach(function (side) {
      var ex = side * 6.4;
      if (closed) {
        ctx.strokeStyle = '#3a2f28';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ex, eyeY + 2.5, 4, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else if (sad) {
        ctx.strokeStyle = '#3a2f28';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(ex, eyeY - 1, 4, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#fffdf8';
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, 4.4, 5.2, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = cat.eyeColor;
        ctx.beginPath();
        ctx.ellipse(ex + (cat.state === 'ask' ? 0.6 : 0), eyeY, 3.4, 4.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2a2320';
        ctx.beginPath();
        ctx.ellipse(ex + 0.4, eyeY, cat.state === 'ask' ? 2.4 : 1.5, 4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(ex + 1.8, eyeY - 2.2, 1.5, 0, TAU);
        ctx.fill();
      }
    });

    // Румянец.
    if (petting || happy || cat.state === 'ask') {
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
    if (cat.state === 'ask' && cat.meowTimer > 2.2) {
      ctx.fillStyle = '#e07a92';
      ctx.beginPath();
      ctx.ellipse(0, 9, 3, 3.6, 0, 0, TAU);
      ctx.fill();
    } else if (happy || petting) {
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
  }

  /** Пузырь с сердечком-шкалой над котиком. */
  function drawCatBubble(cat, t) {
    var asking = cat.state === 'ask';
    var petting = cat.state === 'pet';
    if (!asking && !petting) return;

    var urgency = asking ? 1 - clamp(cat.patience / cat.patienceMax, 0, 1) : 0;
    var bob = Math.sin(t * (3 + urgency * 5)) * 3;
    var bx = cat.x;
    var by = cat.petCenterY() - 56 * cat.scale + bob;
    var size = 30;

    ctx.save();

    // Хвостик пузыря.
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

    // Пустое сердечко.
    var empty = urgency > 0.7 ? 'rgba(255, 150, 150, 0.35)' : 'rgba(255, 140, 175, 0.28)';
    ctx.fillStyle = empty;
    heartPath(ctx, bx, by, size);
    ctx.fill();

    // Заполнение по уровню любви.
    var level = clamp(cat.love, 0, 1);
    if (level > 0) {
      ctx.save();
      heartPath(ctx, bx, by, size);
      ctx.clip();
      var grad = ctx.createLinearGradient(0, by + size * 0.45, 0, by - size * 0.45);
      grad.addColorStop(0, '#ff5f92');
      grad.addColorStop(1, '#ff9dbb');
      ctx.fillStyle = grad;
      var fillTop = by + size * 0.5 - size * level;
      ctx.fillRect(bx - size, fillTop, size * 2, size * 1.2);
      ctx.restore();
    }

    ctx.strokeStyle = urgency > 0.7 ? '#ff5f6d' : '#ff87ad';
    ctx.lineWidth = 2;
    heartPath(ctx, bx, by, size);
    ctx.stroke();

    // Полоска терпения по кругу.
    if (asking) {
      ctx.strokeStyle = urgency > 0.7 ? '#ff5f6d' : (urgency > 0.4 ? '#ffa93b' : '#8fd06a');
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(bx, by, 25, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(cat.patience / cat.patienceMax, 0, 1));
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Имя котика — показываем, когда с ним взаимодействуют. */
  function drawCatName(cat) {
    if (cat.state !== 'pet' && cat.state !== 'happy') return;
    var label = cat.name;
    ctx.save();
    ctx.font = '800 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(label).width + 16;
    var y = cat.y + 12;
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

  function drawCursor(t, isPetting) {
    if (!pointer.inside || !pointer.seen) return;
    var x = pointer.x, y = pointer.y;
    var tilt = clamp(pointer.dirX, -1, 1) * 0.35 + (isPetting ? Math.sin(t * 18) * 0.18 : 0);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    if (isPetting) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + Math.sin(t * 12) * 4, 0, TAU);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(60, 45, 35, 0.18)';
    ctx.beginPath();
    ctx.ellipse(2, 5, 15, 13, 0, 0, TAU);
    ctx.fill();

    // Подушечка.
    ctx.fillStyle = '#fff4ea';
    ctx.beginPath();
    ctx.ellipse(0, 2, 14, 12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffc4d3';
    ctx.beginPath();
    ctx.ellipse(0, 3.5, 8.5, 7, 0, 0, TAU);
    ctx.fill();

    // Пальчики.
    ctx.fillStyle = '#fff4ea';
    var toes = [[-10, -8], [-3.5, -12], [3.5, -12], [10, -8]];
    toes.forEach(function (p, i) {
      var lift = isPetting ? Math.sin(t * 16 + i) * 1.2 : 0;
      ctx.beginPath();
      ctx.ellipse(p[0], p[1] + lift, 4.2, 4.8, 0, 0, TAU);
      ctx.fill();
    });
    ctx.fillStyle = '#ffc4d3';
    toes.forEach(function (p, i) {
      var lift = isPetting ? Math.sin(t * 16 + i) * 1.2 : 0;
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
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    combo: document.getElementById('combo'),
    comboVal: document.getElementById('comboVal'),
    moodFill: document.getElementById('moodFill'),
    moodPct: document.getElementById('moodPct'),
    catCount: document.getElementById('catCount'),
    askCount: document.getElementById('askCount'),
    toast: document.getElementById('toast'),
    startScreen: document.getElementById('startScreen'),
    helpScreen: document.getElementById('helpScreen'),
    playBtn: document.getElementById('playBtn'),
    helpBtn: document.getElementById('helpBtn'),
    closeHelpBtn: document.getElementById('closeHelpBtn'),
    soundBtn: document.getElementById('soundBtn')
  };

  var game = {
    running: false,
    score: 0,
    best: store.get('cutten.best', 0),
    mood: 1,
    combo: 0,
    comboTimer: 0,
    spawnTimer: 14,
    petTarget: null,

    maxCats: function () {
      var area = (field.right - field.left) * (field.bottom - field.top);
      return clamp(Math.round(area / 46000) + 2, 4, 10);
    },

    addScore: function (amount, cat, label) {
      this.score += amount;
      if (this.score > this.best) {
        this.best = this.score;
        store.set('cutten.best', this.best);
      }
      popup(cat.x, cat.petCenterY() - 72 * cat.scale, label || ('+' + amount), '#fff0a8');
    },

    onSatisfied: function (cat) {
      this.combo++;
      this.comboTimer = 6;
      var multiplier = this.multiplier();
      var base = cat.wasAsking ? 12 : 4;
      var bonus = cat.wasAsking ? Math.round(clamp(cat.patience / cat.patienceMax, 0, 1) * 8) : 0;
      var gained = Math.round((base + bonus) * multiplier);
      this.addScore(gained, cat);
      this.mood = clamp(this.mood + (cat.wasAsking ? 0.07 : 0.03), 0, 1);
      heartBurst(cat.x, cat.petCenterY() - 16 * cat.scale, cat.wasAsking ? 12 : 6);
      sparkle(cat.x, cat.petCenterY(), 10);
      Sound.chime();
      Sound.meow(rand(1.1, 1.35) / cat.scale);
      if (cat.wasAsking) {
        showToast(cat.name + ' мурчит! +' + gained + (multiplier > 1 ? ' (x' + multiplier + ')' : ''));
      }
    },

    onIgnored: function (cat) {
      this.mood = clamp(this.mood - 0.11, 0.12, 1);
      this.combo = 0;
      this.comboTimer = 0;
      popup(cat.x, cat.petCenterY() - 60 * cat.scale, '…', '#cfd8e0');
      showToast(cat.name + ' грустит 😿');
    },

    multiplier: function () {
      return clamp(1 + Math.floor(this.combo / 2), 1, 5);
    },

    spawnCat: function () {
      var edge = randInt(0, 3);
      var x, y;
      if (edge === 0) { x = field.left - 30; y = rand(field.top, field.bottom); }
      else if (edge === 1) { x = field.right + 30; y = rand(field.top, field.bottom); }
      else if (edge === 2) { x = rand(field.left, field.right); y = field.top - 20; }
      else { x = rand(field.left, field.right); y = field.bottom + 30; }
      var cat = new Cat(x, y);
      cats.push(cat);
      return cat;
    },

    start: function () {
      this.running = true;
      Sound.unlock();
      showToast('Погладь котика, который просит 💗');
    },

    update: function (dt, t) {
      // Спавн новых котиков.
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = rand(16, 24);
        if (cats.length < this.maxCats()) {
          var cat = this.spawnCat();
          if (this.running) showToast('Новый котик на полянке: ' + cat.name + '!');
        }
      }

      // Кого гладим прямо сейчас.
      var petting = null;
      var movingEnough = pointer.speed > 55 || (pointer.down && pointer.speed > 25);
      if (this.running && pointer.inside && movingEnough) {
        var bestDist = Infinity;
        for (var i = 0; i < cats.length; i++) {
          var c = cats[i];
          if (c.state === 'happy' || c.state === 'sad') continue;
          if (!c.contains(pointer.x, pointer.y)) continue;
          var d = Math.hypot(pointer.x - c.x, pointer.y - c.petCenterY());
          if (d < bestDist) { bestDist = d; petting = c; }
        }
      }

      for (var j = 0; j < cats.length; j++) {
        var cat2 = cats[j];
        if (cat2 === petting) {
          cat2.petIdle = 0;
          if (cat2.state !== 'pet' && cat2.state !== 'happy') cat2.setState('pet');
          var intensity = clamp(pointer.speed / 420, 0.35, 1);
          cat2.love = clamp(cat2.love + dt * (0.42 + intensity * 0.55), 0, 1);
          if (Math.random() < dt * 14) furPuff(pointer.x, pointer.y, cat2.coat.base);
          if (Math.random() < dt * 3.5) note(cat2.x, cat2.petCenterY() - 30 * cat2.scale);
          if (Math.random() < dt * 6) sparkle(pointer.x, pointer.y, 1);
        } else if (cat2.state === 'pet') {
          cat2.petIdle += dt;
        }
        cat2.update(dt, t);
      }

      this.petTarget = petting;
      Sound.setPurr(!!petting);

      // Комбо угасает.
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      // Настроение полянки медленно восстанавливается.
      this.mood = clamp(this.mood + dt * 0.006, 0, 1);

      updateParticles(dt);
      updateButterflies(dt, t);
      this.syncHud();
    },

    hudCache: {},

    syncHud: function () {
      var cache = this.hudCache;
      if (cache.score !== this.score) { ui.score.textContent = this.score; cache.score = this.score; }
      if (cache.best !== this.best) { ui.best.textContent = this.best; cache.best = this.best; }

      var moodPct = Math.round(this.mood * 100);
      if (cache.mood !== moodPct) {
        ui.moodFill.style.width = moodPct + '%';
        ui.moodFill.style.background = moodPct > 60
          ? 'linear-gradient(90deg, #ffb0c8, #ff7aa5)'
          : (moodPct > 30 ? 'linear-gradient(90deg, #ffd08a, #ffa93b)' : 'linear-gradient(90deg, #c3c9d6, #94a0b5)');
        ui.moodPct.textContent = moodPct + '%';
        cache.mood = moodPct;
      }

      var asking = 0;
      for (var i = 0; i < cats.length; i++) if (cats[i].state === 'ask') asking++;
      if (cache.cats !== cats.length) { ui.catCount.textContent = cats.length; cache.cats = cats.length; }
      if (cache.asking !== asking) { ui.askCount.textContent = asking; cache.asking = asking; }

      var mult = this.multiplier();
      if (cache.mult !== mult) {
        if (mult > 1) {
          ui.comboVal.textContent = mult;
          ui.combo.hidden = false;
        } else {
          ui.combo.hidden = true;
        }
        cache.mult = mult;
      }
    },

    draw: function (t) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(bgCanvas, 0, 0, W, H);

      // Полянка грустнеет вместе с котиками.
      if (this.mood < 0.99) {
        ctx.save();
        ctx.globalAlpha = (1 - this.mood) * 0.32;
        ctx.fillStyle = '#5a6a86';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      drawButterflies();

      // Сортируем по глубине, чтобы ближние котики были поверх дальних.
      var order = cats.slice().sort(function (a, b) { return a.y - b.y; });
      order.forEach(function (cat) { drawCat(cat, t); });
      order.forEach(function (cat) { drawCatName(cat); drawCatBubble(cat, t); });

      drawParticles();
      drawCursor(t, !!this.petTarget);
    }
  };

  /* ============================================================
     Тосты и кнопки
     ============================================================ */

  var toastTimer = null;
  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.classList.remove('show'); }, 2200);
  }

  ui.playBtn.addEventListener('click', function () {
    ui.startScreen.classList.add('hidden');
    game.start();
  });

  ui.helpBtn.addEventListener('click', function () {
    ui.helpScreen.classList.remove('hidden');
  });

  ui.closeHelpBtn.addEventListener('click', function () {
    ui.helpScreen.classList.add('hidden');
  });

  function syncSoundBtn() {
    ui.soundBtn.textContent = Sound.enabled ? '🔊' : '🔇';
  }

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
    if (document.hidden) {
      Sound.setPurr(false);
    } else {
      lastTime = 0;
    }
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

  function init() {
    resize();
    pointer.x = W / 2;
    pointer.y = H / 2;
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;

    for (var i = 0; i < 4; i++) {
      var cat = new Cat(rand(field.left + 40, field.right - 40), rand(field.top + 40, field.bottom - 40));
      cat.askCooldown = rand(2, 9);
      cats.push(cat);
    }

    syncSoundBtn();
    game.syncHud();
    ui.best.textContent = game.best;
    requestAnimationFrame(frame);
  }

  init();

  // Для отладки и автотестов.
  window.__cutten = { game: game, cats: cats, pointer: pointer };
})();
