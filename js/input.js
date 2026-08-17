/* Input: the same logic for mouse and finger.
   Pointer speed is smoothed over time rather than per frame — otherwise a single frame
   carrying an event spikes to hundreds of pixels per second (we hit this in the previous game). */
window.Input = (function () {
  'use strict';

  var canvas, pet;
  var ndc = new THREE.Vector2();
  var pointer = {
    x: 0, y: 0, prevX: 0, prevY: 0,
    frameDist: 0, speed: 0,
    down: false, inside: false, seen: false, touch: false
  };

  var dragging = false;       // dragging the camera
  var dragStart = { x: 0, y: 0 };
  var dragMoved = 0;
  var overDragon = false;
  var petting = false;
  var mode = 'idle';          // idle | aimBall | treat
  var pinchDist = 0;
  var activePointers = {};
  var groundPoint = null;
  var hoverPoint = null;

  function updateNdc(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  function isOverDragon() {
    if (!pet) return false;
    var hits = World.intersect(ndc, [pet.dragon.root]);
    return hits.length > 0 ? hits[0] : null;
  }

  function onDown(e) {
    activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    pointer.down = true;
    pointer.touch = e.pointerType !== 'mouse';
    updateNdc(e.clientX, e.clientY);
    window.Audio3D.unlock();

    var hit = isOverDragon();
    overDragon = !!hit;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
    dragMoved = 0;
    // The camera only orbits when the drag started away from the dragon.
    dragging = !overDragon && mode === 'idle';

    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  }

  function onMove(e) {
    if (activePointers[e.pointerId]) {
      activePointers[e.pointerId].x = e.clientX;
      activePointers[e.pointerId].y = e.clientY;
    }

    var rect = canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var py = e.clientY - rect.top;
    if (pointer.seen) pointer.frameDist += Math.hypot(px - pointer.x, py - pointer.y);
    pointer.x = px;
    pointer.y = py;
    pointer.inside = true;
    pointer.seen = true;
    updateNdc(e.clientX, e.clientY);

    // Two-finger pinch — zoom.
    var ids = Object.keys(activePointers);
    if (ids.length === 2) {
      var a = activePointers[ids[0]], b = activePointers[ids[1]];
      var dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) World.zoom((pinchDist - dist) * 0.02);
      pinchDist = dist;
      dragging = false;
      return;
    }

    if (pointer.down) {
      dragMoved += Math.hypot(e.movementX || 0, e.movementY || 0);
      if (dragging) World.orbit(e.movementX || 0, e.movementY || 0);
    }

    if (!pointer.down || !dragging) {
      var hit = isOverDragon();
      overDragon = !!hit;
    }
  }

  function onUp(e) {
    delete activePointers[e.pointerId];
    if (Object.keys(activePointers).length < 2) pinchDist = 0;

    var click = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) < 8;
    pointer.down = false;

    if (click) {
      if (mode === 'aimBall') {
        var point = World.groundPoint(ndc);
        if (point) {
          pet.throwBall(point);
          setMode('idle');
        }
      } else if (mode === 'treat') {
        // Tapping again drops the treat — the dragon will find it anyway.
        var p = World.groundPoint(ndc);
        if (p) pet.moveTreat(p);
      }
    }

    dragging = false;
  }

  function setMode(next) {
    mode = next;
    canvas.classList.toggle('aiming', next === 'aimBall');
    if (next !== 'treat' && pet) pet.offerTreat(false);
    if (Input.onMode) Input.onMode(next);
  }

  var Input = {
    get mode() { return mode; },
    onMode: null,

    init: function (canvasEl, petRef) {
      canvas = canvasEl;
      pet = petRef;

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      canvas.addEventListener('pointerleave', function () { pointer.inside = false; });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        World.zoom(e.deltaY * 0.006);
      }, { passive: false });

      return this;
    },

    setMode: setMode,

    toggleBall: function () { setMode(mode === 'aimBall' ? 'idle' : 'aimBall'); },

    toggleTreat: function () {
      if (mode === 'treat') { setMode('idle'); return; }
      setMode('treat');
      pet.offerTreat(true);
    },

    /** Returns the point the dragon is currently looking at (or null). */
    update: function (dt) {
      var instant = pointer.frameDist / Math.max(dt, 0.001);
      pointer.speed = lerp(pointer.speed, instant, 1 - Math.exp(-dt / 0.1));
      pointer.frameDist = 0;

      groundPoint = pointer.inside ? World.groundPoint(ndc) : null;

      // The treat follows the hand.
      if (mode === 'treat' && groundPoint) pet.moveTreat(groundPoint);

      // Petting: the hand is over the dragon and moving.
      var canPet = overDragon && !dragging && mode === 'idle' &&
        (pointer.touch ? pointer.down : pointer.inside);
      var moving = pointer.speed > 40;
      var wantPet = canPet && moving;

      if (wantPet !== petting) {
        petting = wantPet;
        canvas.classList.toggle('petting', petting);
        if (!petting) window.Audio3D.purr(false);
      }

      if (petting) {
        var hit = isOverDragon();
        pet.setPetting(true, hit ? hit.point : null);
      } else {
        pet.setPetting(false, null);
      }

      hoverPoint = null;
      if (pointer.inside && pointer.speed > 12 && groundPoint) {
        hoverPoint = groundPoint.clone();
        hoverPoint.y += 0.4;
      }
      return hoverPoint;
    },

    get pointerOverDragon() { return overDragon; }
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  return Input;
})();
