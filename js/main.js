/* Glue: the meet-your-dragon screen, the game loop, the HUD and saving. */
(function () {
  'use strict';

  var ui = {
    canvas: document.getElementById('scene'),
    hud: document.getElementById('hud'),
    toolbar: document.getElementById('toolbar'),
    petName: document.getElementById('petName'),
    petStage: document.getElementById('petStage'),
    bond: document.getElementById('bond'),
    needFood: document.getElementById('needFood'),
    needEnergy: document.getElementById('needEnergy'),
    needFun: document.getElementById('needFun'),
    mood: document.getElementById('mood'),
    toast: document.getElementById('toast'),
    startScreen: document.getElementById('startScreen'),
    startTitle: document.getElementById('startTitle'),
    startSub: document.getElementById('startSub'),
    startBtn: document.getElementById('startBtn'),
    nameForm: document.getElementById('nameForm'),
    nameInput: document.getElementById('nameInput'),
    eggArt: document.getElementById('eggArt'),
    helpScreen: document.getElementById('helpScreen'),
    helpBtn: document.getElementById('helpBtn'),
    closeHelpBtn: document.getElementById('closeHelpBtn'),
    soundBtn: document.getElementById('soundBtn'),
    treatBtn: document.getElementById('treatBtn'),
    ballBtn: document.getElementById('ballBtn'),
    sleepBtn: document.getElementById('sleepBtn'),
    loading: document.getElementById('loading')
  };

  var NAME_IDEAS = ['Puff', 'Ember', 'Sparky', 'Bubble', 'Cloud', 'Pip', 'Minty', 'Peach'];

  var state = null;      // data for the current session
  var savedData = null;  // the save we found (if a dragon already existed)
  var pet = null;
  var running = false;
  var lastTime = 0;
  var elapsed = 0;
  var saveTimer = 0;

  /* ---------- HUD ---------- */

  var hudCache = {};

  function syncHud() {
    if (!pet) return;

    if (hudCache.name !== pet.name) {
      ui.petName.textContent = pet.name;
      hudCache.name = pet.name;
    }

    var stageLabel = Dragon.STAGES[pet.stage].label;
    if (hudCache.stage !== stageLabel) {
      ui.petStage.textContent = stageLabel;
      hudCache.stage = stageLabel;
    }

    var hearts = Math.round(pet.bond * 5);
    if (hudCache.hearts !== hearts) {
      ui.bond.innerHTML = '';
      for (var i = 0; i < 5; i++) {
        var span = document.createElement('span');
        span.textContent = '💗';
        if (i < hearts) span.className = 'on';
        ui.bond.appendChild(span);
      }
      hudCache.hearts = hearts;
    }

    setBar(ui.needFood, pet.needs.food);
    setBar(ui.needEnergy, pet.needs.energy);
    setBar(ui.needFun, pet.needs.fun);

    // The emoji thought floats above the dragon head.
    if (pet.mood) {
      var head = pet.dragon.headWorldPosition();
      head.y += 0.9;
      var screen = World.toScreen(head);
      ui.mood.hidden = false;
      ui.mood.textContent = pet.mood;
      ui.mood.style.left = screen.x + 'px';
      ui.mood.style.top = screen.y + 'px';
      ui.mood.classList.toggle('show', screen.visible);
    } else {
      ui.mood.classList.remove('show');
    }
  }

  function setBar(el, value) {
    var pct = Math.round(value * 100);
    if (el.dataset.pct === String(pct)) return;
    el.dataset.pct = pct;
    el.style.width = pct + '%';
    el.classList.toggle('low', value < 0.3);
  }

  var toastTimer = null;
  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.classList.remove('show'); }, 2800);
  }

  /* ---------- start-up ---------- */

  function startGame(saveData, isNew) {
    if (pet) World.scene.remove(pet.dragon.root);
    state = saveData;
    pet = new Pet(saveData);
    pet.onToast = showToast;
    pet.onGrow = function (stage) {
      var text = stage === 'teen'
        ? pet.name + ' grew up! They can hop on their wings now'
        : pet.name + ' grew up and learned to fly! 🐉';
      showToast(text);
      hudCache.stage = null;
    };

    Input.init(ui.canvas, pet);
    Input.onMode = function (mode) {
      ui.ballBtn.classList.toggle('active', mode === 'aimBall');
      ui.treatBtn.classList.toggle('active', mode === 'treat');
      if (mode === 'aimBall') showToast('Tap the grass — your dragon will chase the ball');
    };

    ui.hud.hidden = false;
    ui.toolbar.hidden = false;
    running = true;

    pet.setState('greet');
    window.Audio3D.unlock();

    if (isNew) {
      showToast('Say hello to ' + pet.name + '!');
    } else if (saveData.awayHours > 0.5) {
      showToast(pet.name + ' missed you while you were away');
    } else {
      showToast('Welcome back!');
    }
  }

  ui.nameForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (running) return;              // never hatch a second pet
    ui.startScreen.classList.add('hidden');
    if (savedData) {
      startGame(savedData, false);
      return;
    }
    var name = (ui.nameInput.value || '').trim();
    if (!name) name = NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)];
    startGame(Save.fresh(name), true);
  });

  ui.startBtn.addEventListener('click', function () {
    if (!ui.nameInput.value.trim()) {
      ui.nameInput.placeholder = NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)];
    }
  });

  ui.helpBtn.addEventListener('click', function () { ui.helpScreen.classList.remove('hidden'); });
  ui.closeHelpBtn.addEventListener('click', function () { ui.helpScreen.classList.add('hidden'); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') ui.helpScreen.classList.add('hidden');
  });

  ui.soundBtn.addEventListener('click', function () {
    window.Audio3D.setEnabled(!window.Audio3D.enabled);
    ui.soundBtn.textContent = window.Audio3D.enabled ? '🔊' : '🔇';
  });

  ui.ballBtn.addEventListener('click', function () { Input.toggleBall(); });
  ui.treatBtn.addEventListener('click', function () { Input.toggleTreat(); });
  ui.sleepBtn.addEventListener('click', function () {
    Input.setMode('idle');
    pet.putToBed();
  });

  /* ---------- loop ---------- */

  function frame(now) {
    var dt = lastTime ? (now - lastTime) / 1000 : 0.016;
    lastTime = now;
    dt = Math.max(0, Math.min(dt, 0.05));
    elapsed += dt;

    if (running && pet) {
      var lookPoint = Input.update(dt);
      pet.update(dt, elapsed, lookPoint);
      World.followTarget(pet.position);

      saveTimer -= dt;
      if (saveTimer <= 0) {
        saveTimer = 6;
        Save.save(pet.toSave(state));
      }
      syncHud();
    }

    World.update(dt, elapsed);
    World.render();
    watchPerformance(dt);
    requestAnimationFrame(frame);
  }

  /* ---------- quality for the hardware ---------- */

  var perf = { avg: 60, samples: 0, decided: false };

  function watchPerformance(dt) {
    if (perf.decided || dt <= 0) return;
    perf.avg = perf.avg * 0.94 + (1 / dt) * 0.06;
    perf.samples++;
    // Skip the first seconds — shaders are still warming up.
    if (perf.samples > 90 && perf.avg < 30) {
      perf.decided = true;
      World.setQuality('low');
    } else if (perf.samples > 600) {
      perf.decided = true;
    }
  }

  /* ---------- boot ---------- */

  function boot() {
    try {
      World.init(ui.canvas);
    } catch (err) {
      ui.loading.textContent = 'Looks like this browser cannot do 3D 😿';
      console.error(err);
      return;
    }

    window.addEventListener('resize', function () { World.resize(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { World.resize(); }, 150); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        window.Audio3D.purr(false);
        if (pet) Save.save(pet.toSave(state));
      } else {
        lastTime = 0;
      }
    });
    window.addEventListener('beforeunload', function () {
      if (pet) Save.save(pet.toSave(state));
    });

    savedData = Save.load();
    if (savedData) {
      // A dragon already exists — the welcome screen invites you straight back to them.
      ui.eggArt.textContent = '🐉';
      ui.startTitle.textContent = 'Welcome back!';
      ui.startSub.textContent = savedData.name + ' has been waiting for you in the meadow.';
      ui.nameInput.hidden = true;
      ui.startBtn.textContent = 'Go to ' + savedData.name;
    }

    ui.loading.classList.add('gone');
    setTimeout(function () { ui.loading.hidden = true; }, 600);
    requestAnimationFrame(frame);
  }

  boot();

  // For debugging and automated tests.
  window.__dragon = {
    get pet() { return pet; },
    get world() { return World; },
    input: Input,
    save: Save,
    startNew: function (name) {
      ui.startScreen.classList.add('hidden');
      startGame(Save.fresh(name || 'Test'), true);
    }
  };
})();
