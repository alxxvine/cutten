/* The dragon: a low-poly model, a rig and procedural animation.
   Not a single prebuilt model and not a single animation clip — everything is computed per frame.
   The feeling of being alive comes from small things: breathing, blinking, head tracking,
   the tail and neck lagging behind, weight shifting from paw to paw. */
window.Dragon = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  var COLORS = {
    body: 0x63cfae,
    bodyDeep: 0x46b394,
    belly: 0xfbe6c4,
    crest: 0xff9d7d,
    membrane: 0xffb59c,
    horn: 0xfff2d8,
    eye: 0x2b2440,
    blush: 0xff9fb0
  };

  var STAGES = {
    baby: { root: 0.95, head: 1.08, wing: 0.6, leg: 1, label: 'hatchling' },
    teen: { root: 1.2, head: 1.0, wing: 0.85, leg: 1.08, label: 'fledgling' },
    flyer: { root: 1.45, head: 0.94, wing: 1.15, leg: 1.14, label: 'flier' }
  };

  // Target values for a pose. Everything animated lives here and blends smoothly.
  var POSES = {
    stand: { height: 0.8, pitch: 0, neck: -0.18, headPitch: 0.06, curl: 0, wing: 0.22, tail: 0.12, eyes: 1, sit: 0, spread: 0 },
    walk: { height: 0.78, pitch: 0.04, neck: -0.1, headPitch: 0.04, curl: 0, wing: 0.16, tail: 0.2, eyes: 1, sit: 0, spread: 0 },
    run: { height: 0.84, pitch: 0.12, neck: 0.05, headPitch: -0.05, curl: 0, wing: 0.5, tail: 0.42, eyes: 1, sit: 0, spread: 0 },
    sit: { height: 0.54, pitch: -0.18, neck: -0.3, headPitch: 0.1, curl: 0, wing: 0.18, tail: 0.05, eyes: 1, sit: 1, spread: 0 },
    sleep: { height: 0.36, pitch: 0.02, neck: 0.5, headPitch: 0.32, curl: 1, wing: 0.05, tail: -0.15, eyes: 0, sit: 1, spread: 0 },
    eat: { height: 0.62, pitch: 0.1, neck: 0.45, headPitch: 0.35, curl: 0, wing: 0.2, tail: 0.25, eyes: 1, sit: 0, spread: 0 },
    sniff: { height: 0.64, pitch: 0.12, neck: 0.6, headPitch: 0.55, curl: 0, wing: 0.18, tail: 0.18, eyes: 1, sit: 0, spread: 0 },
    play: { height: 0.72, pitch: -0.1, neck: -0.25, headPitch: 0.1, curl: 0, wing: 0.55, tail: 0.5, eyes: 1, sit: 0, spread: 0.25 },
    pet: { height: 0.74, pitch: 0.02, neck: 0.12, headPitch: 0.22, curl: 0, wing: 0.12, tail: 0.15, eyes: 0.18, sit: 0.5, spread: 0 },
    fly: { height: 2.0, pitch: -0.12, neck: -0.35, headPitch: -0.08, curl: 0, wing: 1, tail: 0.35, eyes: 1, sit: 0, spread: 0 }
  };

  function mesh(geo, color, opts) {
    var m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial(Object.assign({
      color: color, flatShading: true
    }, opts || {})));
    m.castShadow = true;
    return m;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function Dragon(stage) {
    this.stage = stage || 'baby';
    this.root = new THREE.Group();

    this.pose = Object.assign({}, POSES.stand);
    this.target = POSES.stand;
    this.poseName = 'stand';

    this.walkPhase = 0;
    this.speed = 0;           // current movement speed (metres per second)
    this.blink = 0;           // 0 means eyes open, 1 means closed
    this.blinkTimer = rand(2, 5);
    this.doubleBlink = false;
    this.jaw = 0;
    this.jawTarget = 0;
    this.lookTarget = null;   // what it looks at (Vector3), or null
    this.lookAmount = 0;
    this.headYaw = 0;
    this.headPitchExtra = 0;
    this.eyeShift = 0;        // saccades — the eyes drift a little
    this.eyeShiftTimer = 1;
    this.earTwitch = 0;
    this.earTimer = rand(3, 7);
    this.shake = 0;
    this.wingFlap = 0;
    this.flapSpeed = 0;
    this.tailWag = 0;         // wag amplitude
    this.happiness = 0;       // drives how perky the tail and ears are
    this.breath = rand(0, TAU);
    this.stepSound = 0;

    this.build();
    this.applyStage(this.stage);
  }

  Dragon.STAGES = STAGES;

  Dragon.prototype.build = function () {
    var self = this;

    // --- body ---
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.torso = new THREE.Group();
    this.body.add(this.torso);

    var torsoGeo = new THREE.IcosahedronGeometry(0.66, 1);
    torsoGeo.scale(0.98, 0.9, 1.3);
    this.torsoMesh = mesh(torsoGeo, COLORS.body);
    this.torso.add(this.torsoMesh);

    var bellyGeo = new THREE.IcosahedronGeometry(0.46, 1);
    bellyGeo.scale(0.92, 0.8, 1.1);
    this.bellyMesh = mesh(bellyGeo, COLORS.belly);
    this.bellyMesh.position.set(0, -0.22, 0.06);
    this.torso.add(this.bellyMesh);

    // The crest along the spine.
    this.crest = [];
    for (var i = 0; i < 4; i++) {
      var spike = mesh(new THREE.ConeGeometry(0.09 - i * 0.012, 0.24 - i * 0.03, 4), COLORS.crest);
      spike.position.set(0, 0.55 - i * 0.04, 0.35 - i * 0.3);
      spike.rotation.x = -0.25 + i * 0.06;
      this.torso.add(spike);
      this.crest.push(spike);
    }

    // --- neck and head ---
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.42, 0.38);
    this.torso.add(this.neck);

    var neckGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.42, 7);
    var neckMesh = mesh(neckGeo, COLORS.body);
    neckMesh.position.y = 0.18;
    neckMesh.rotation.x = 0.16;
    this.neck.add(neckMesh);

    this.neck2 = new THREE.Group();
    this.neck2.position.set(0, 0.3, 0.08);
    this.neck.add(this.neck2);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.2, 0.06);
    this.neck2.add(this.head);

    var skullGeo = new THREE.IcosahedronGeometry(0.36, 1);
    skullGeo.scale(1, 0.94, 1.06);
    this.head.add(mesh(skullGeo, COLORS.body));

    var snoutGeo = new THREE.BoxGeometry(0.34, 0.24, 0.34);
    var snout = mesh(snoutGeo, COLORS.body);
    snout.position.set(0, -0.06, 0.32);
    this.head.add(snout);
    this.snout = snout;

    var nostrilGeo = new THREE.SphereGeometry(0.03, 5, 4);
    [-0.09, 0.09].forEach(function (x) {
      var n = mesh(nostrilGeo, COLORS.bodyDeep);
      n.position.set(x, 0.02, 0.49);
      self.head.add(n);
    });

    // The jaw — opens for yawns, meals and chirps.
    this.jawGroup = new THREE.Group();
    this.jawGroup.position.set(0, -0.14, 0.16);
    this.head.add(this.jawGroup);
    var jawMesh = mesh(new THREE.BoxGeometry(0.3, 0.12, 0.32), COLORS.belly);
    jawMesh.position.set(0, -0.04, 0.16);
    this.jawGroup.add(jawMesh);

    // Eyes: big, dark, with a highlight. Blinking squashes them vertically.
    this.eyes = [];
    this.pupils = [];
    [-1, 1].forEach(function (side) {
      var eye = new THREE.Group();
      eye.position.set(side * 0.21, 0.08, 0.24);
      self.head.add(eye);

      var ball = mesh(new THREE.SphereGeometry(0.115, 10, 8), COLORS.eye);
      eye.add(ball);

      var shine = mesh(new THREE.SphereGeometry(0.042, 6, 5), 0xffffff);
      shine.position.set(side * 0.03, 0.045, 0.085);
      eye.add(shine);

      var shine2 = mesh(new THREE.SphereGeometry(0.022, 5, 4), 0xffffff);
      shine2.position.set(side * -0.04, -0.03, 0.09);
      eye.add(shine2);

      self.eyes.push(eye);
      self.pupils.push({ ball: ball, shine: shine, shine2: shine2 });
    });

    // Blush.
    [-1, 1].forEach(function (side) {
      var blush = mesh(new THREE.SphereGeometry(0.075, 6, 5), COLORS.blush, { transparent: true, opacity: 0.55 });
      blush.scale.set(1, 0.6, 0.4);
      blush.position.set(side * 0.28, -0.04, 0.16);
      self.head.add(blush);
    });

    // Horns.
    this.horns = [];
    [-1, 1].forEach(function (side) {
      var horn = mesh(new THREE.ConeGeometry(0.07, 0.34, 5), COLORS.horn);
      horn.position.set(side * 0.15, 0.3, -0.1);
      horn.rotation.set(-0.5, 0, side * 0.25);
      self.head.add(horn);
      self.horns.push(horn);
    });

    // Ears — they twitch.
    this.ears = [];
    [-1, 1].forEach(function (side) {
      var ear = new THREE.Group();
      ear.position.set(side * 0.28, 0.16, -0.08);
      var earMesh = mesh(new THREE.ConeGeometry(0.11, 0.3, 4), COLORS.body);
      earMesh.scale.set(1, 1, 0.45);
      earMesh.position.y = 0.12;
      ear.add(earMesh);
      var inner = mesh(new THREE.ConeGeometry(0.06, 0.2, 4), COLORS.membrane);
      inner.scale.set(1, 1, 0.4);
      inner.position.set(0, 0.11, 0.03);
      ear.add(inner);
      ear.rotation.z = side * 0.55;
      self.head.add(ear);
      self.ears.push(ear);
    });

    // --- tail: a chain of segments, each lagging behind the previous one ---
    this.tail = [];
    var parent = this.torso;
    for (var t = 0; t < 7; t++) {
      var seg = new THREE.Group();
      seg.position.set(0, t === 0 ? 0.06 : 0, t === 0 ? -0.6 : -0.24);
      var r = 0.2 - t * 0.024;
      var segMesh = mesh(new THREE.CylinderGeometry(r * 0.82, r, 0.26, 6), COLORS.body);
      segMesh.rotation.x = Math.PI / 2;
      segMesh.position.z = -0.12;
      seg.add(segMesh);
      if (t > 1 && t < 6) {
        var fin = mesh(new THREE.ConeGeometry(0.055, 0.16, 4), COLORS.crest);
        fin.position.set(0, r * 0.9, -0.1);
        fin.rotation.x = -0.3;
        seg.add(fin);
      }
      parent.add(seg);
      parent = seg;
      this.tail.push(seg);
    }
    // The tuft at the tip.
    var tip = mesh(new THREE.ConeGeometry(0.16, 0.34, 5), COLORS.crest);
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.26;
    this.tail[this.tail.length - 1].add(tip);

    // --- wings ---
    this.wings = [];
    [-1, 1].forEach(function (side) {
      var wing = new THREE.Group();
      wing.position.set(side * 0.3, 0.52, -0.08);
      self.torso.add(wing);

      var arm = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 5), COLORS.bodyDeep);
      arm.rotation.z = side * -Math.PI / 2;
      arm.position.x = side * 0.25;
      wing.add(arm);

      var membraneGeo = new THREE.BufferGeometry();
      var pts = [
        0, 0, 0,
        side * 0.95, 0.34, -0.12,
        side * 1.05, -0.16, 0.02,
        side * 0.72, -0.5, 0.06,
        side * 0.3, -0.32, 0.02
      ];
      var idx = [0, 1, 2, 0, 2, 3, 0, 3, 4];
      membraneGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      membraneGeo.setIndex(idx);
      membraneGeo.computeVertexNormals();
      var membrane = mesh(membraneGeo, COLORS.membrane, { side: THREE.DoubleSide });
      wing.add(membrane);

      self.wings.push(wing);
    });

    // --- legs ---
    this.legs = [];
    var legDefs = [
      { x: -0.34, z: 0.34, front: true },
      { x: 0.34, z: 0.34, front: true },
      { x: -0.36, z: -0.3, front: false },
      { x: 0.36, z: -0.3, front: false }
    ];
    legDefs.forEach(function (def, index) {
      var hip = new THREE.Group();
      hip.position.set(def.x, -0.3, def.z);
      self.torso.add(hip);

      var thigh = mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.3, 6), COLORS.body);
      thigh.position.y = -0.15;
      hip.add(thigh);

      var knee = new THREE.Group();
      knee.position.y = -0.28;
      hip.add(knee);

      var shin = mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.26, 6), COLORS.body);
      shin.position.y = -0.13;
      knee.add(shin);

      var foot = new THREE.Group();
      foot.position.y = -0.24;
      knee.add(foot);

      var pad = mesh(new THREE.BoxGeometry(0.22, 0.1, 0.28), COLORS.belly);
      pad.position.z = 0.05;
      foot.add(pad);

      // Claws.
      [-0.07, 0, 0.07].forEach(function (cx) {
        var claw = mesh(new THREE.ConeGeometry(0.025, 0.08, 4), COLORS.horn);
        claw.rotation.x = Math.PI / 2;
        claw.position.set(cx, -0.02, 0.19);
        foot.add(claw);
      });

      self.legs.push({
        hip: hip, knee: knee, foot: foot, front: def.front,
        phase: def.front ? (def.x < 0 ? 0 : Math.PI) : (def.x < 0 ? Math.PI : 0),
        index: index
      });
    });

    this.root.traverse(function (obj) {
      if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = false; }
    });
  };

  /** Proportions change with age: a hatchling is big-headed and short-legged. */
  Dragon.prototype.applyStage = function (stage) {
    var s = STAGES[stage] || STAGES.baby;
    this.stage = stage;
    this.root.scale.setScalar(s.root);
    this.head.scale.setScalar(s.head);
    this.wings.forEach(function (w) { w.scale.setScalar(s.wing); });
    this.legs.forEach(function (leg) { leg.hip.scale.set(1, s.leg, 1); });
    this.stageInfo = s;
  };

  Dragon.prototype.setPose = function (name) {
    if (!POSES[name] || this.poseName === name) return;
    this.poseName = name;
    this.target = POSES[name];
  };

  Dragon.prototype.lookAt = function (vec3) { this.lookTarget = vec3; };

  Dragon.prototype.openJaw = function (amount, hold) {
    this.jawTarget = amount;
    this.jawHold = hold || 0.3;
  };

  Dragon.prototype.triggerBlink = function (double) {
    if (this.blink > 0.05) return;
    this.blink = 1;
    this.doubleBlink = !!double;
  };

  Dragon.prototype.triggerShake = function () { this.shake = 1; };

  Dragon.prototype.headWorldPosition = function (out) {
    return this.head.getWorldPosition(out || new THREE.Vector3());
  };

  Dragon.prototype.mouthWorldPosition = function (out) {
    var v = out || new THREE.Vector3();
    v.set(0, -0.1, 0.5);
    return this.head.localToWorld(v);
  };

  /* ---------- animation frame ---------- */

  Dragon.prototype.update = function (dt, time) {
    var p = this.pose;
    var t = this.target;
    var k = Math.min(1, dt * 4.5);

    for (var key in t) {
      if (Object.prototype.hasOwnProperty.call(t, key)) p[key] = lerp(p[key], t[key], k);
    }

    var moving = this.speed > 0.05;
    this.breath += dt * (moving ? 3.4 : 1.7);

    // --- breathing: the belly swells, the shoulders lift a little ---
    var breathAmt = Math.sin(this.breath) * (moving ? 0.012 : 0.022);
    this.torsoMesh.scale.set(1 + breathAmt, 1 + breathAmt * 0.7, 1 - breathAmt * 0.4);
    this.bellyMesh.scale.set(1 + breathAmt * 1.4, 1 + breathAmt, 1);

    // --- body pose ---
    var bob = moving ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.045 : Math.sin(this.breath * 0.6) * 0.012;
    this.body.position.y = p.height + bob;
    this.torso.rotation.x = p.pitch + (moving ? Math.sin(this.walkPhase * 2 + 1) * 0.03 : 0);
    this.torso.rotation.z = moving ? Math.sin(this.walkPhase) * 0.06 : Math.sin(this.breath * 0.5) * 0.02;
    // Curled up when asleep.
    this.torso.rotation.x -= p.curl * 0.25;

    // --- neck and head ---
    var neckBase = p.neck + p.curl * 0.15;
    this.neck.rotation.x = neckBase + Math.sin(this.breath * 0.7) * 0.02;
    this.neck2.rotation.x = neckBase * 0.5 - p.headPitch * 0.3;

    // Cursor tracking: the head springs toward the target, with a limit on how far it turns.
    var wantYaw = 0, wantPitch = 0;
    if (this.lookTarget) {
      var headPos = this.head.getWorldPosition(new THREE.Vector3());
      var dx = this.lookTarget.x - headPos.x;
      var dz = this.lookTarget.z - headPos.z;
      var dy = this.lookTarget.y - headPos.y;
      var worldYaw = Math.atan2(dx, dz);
      var localYaw = worldYaw - this.root.rotation.y;
      while (localYaw > Math.PI) localYaw -= TAU;
      while (localYaw < -Math.PI) localYaw += TAU;
      wantYaw = Math.max(-1.1, Math.min(1.1, localYaw));
      wantPitch = Math.max(-0.55, Math.min(0.6, -Math.atan2(dy, Math.hypot(dx, dz)) * 0.8));
      this.lookAmount = Math.min(1, this.lookAmount + dt * 3);
    } else {
      this.lookAmount = Math.max(0, this.lookAmount - dt * 2);
    }

    this.headYaw = lerp(this.headYaw, wantYaw * this.lookAmount, Math.min(1, dt * 5));
    this.headPitchExtra = lerp(this.headPitchExtra, wantPitch * this.lookAmount, Math.min(1, dt * 5));

    this.head.rotation.y = this.headYaw * 0.7;
    this.neck2.rotation.y = this.headYaw * 0.3;
    this.head.rotation.x = p.headPitch + this.headPitchExtra + (moving ? Math.sin(this.walkPhase * 2) * 0.04 : 0);
    this.head.rotation.z = this.headYaw * 0.12 + (this.shake > 0 ? Math.sin(this.shake * 40) * 0.35 : 0);

    // --- blinking and saccades ---
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.triggerBlink(Math.random() < 0.3);
      this.blinkTimer = rand(2.4, 6.5);
    }
    if (this.blink > 0) {
      this.blink -= dt * 7;
      if (this.blink <= 0 && this.doubleBlink) {
        this.doubleBlink = false;
        this.blink = 1;
      }
    }
    var lidClose = Math.max(0, Math.sin(Math.max(0, this.blink) * Math.PI));
    var eyeOpen = Math.max(0.06, p.eyes - lidClose * p.eyes);
    this.eyes.forEach(function (eye) { eye.scale.set(1, eyeOpen, 1); });

    this.eyeShiftTimer -= dt;
    if (this.eyeShiftTimer <= 0) {
      this.eyeShift = rand(-1, 1);
      this.eyeShiftTimer = rand(0.8, 2.6);
    }
    var self = this;
    this.pupils.forEach(function (pupil, i) {
      var side = i === 0 ? -1 : 1;
      pupil.shine.position.x = side * 0.03 + self.eyeShift * 0.012;
      pupil.ball.position.x = self.eyeShift * 0.012;
    });

    // --- ears ---
    this.earTimer -= dt;
    if (this.earTimer <= 0) {
      this.earTwitch = 1;
      this.earTimer = rand(2.5, 7);
    }
    if (this.earTwitch > 0) this.earTwitch -= dt * 4;
    var twitch = this.earTwitch > 0 ? Math.sin(this.earTwitch * 24) * 0.25 : 0;
    var earDroop = p.curl * 0.5 + (1 - Math.min(1, this.happiness + 0.35)) * 0.15;
    this.ears.forEach(function (ear, i) {
      var side = i === 0 ? -1 : 1;
      ear.rotation.z = side * (0.55 - earDroop) + twitch * side;
      ear.rotation.x = -0.15 + earDroop * 0.5 + Math.sin(time * 1.3 + i) * 0.03;
    });

    // --- jaw ---
    if (this.jawHold > 0) {
      this.jawHold -= dt;
      if (this.jawHold <= 0) this.jawTarget = 0;
    }
    this.jaw = lerp(this.jaw, this.jawTarget, Math.min(1, dt * 9));
    this.jawGroup.rotation.x = this.jaw * 0.55;

    // --- a full-body shake ---
    if (this.shake > 0) {
      this.shake -= dt * 1.6;
      this.torso.rotation.z += Math.sin(this.shake * 46) * 0.16;
    }

    // --- tail: a lagging wave plus a happy wag ---
    var wag = (0.25 + this.happiness * 0.85) * (moving ? 1.3 : 1);
    this.tailWag = lerp(this.tailWag, wag, dt * 3);
    for (var i = 0; i < this.tail.length; i++) {
      var seg = this.tail[i];
      var lag = i * 0.45;
      var amp = (0.12 + i * 0.035) * this.tailWag;
      seg.rotation.y = Math.sin(time * (2.4 + this.happiness * 1.6) - lag) * amp;
      seg.rotation.x = p.tail * (i === 0 ? 0.7 : 0.16)
        + Math.sin(time * 1.7 - lag * 0.7) * 0.04
        - p.curl * 0.32;
    }

    // --- wings ---
    this.wingFlap += dt * (6 + this.flapSpeed * 12);
    var flapAmount = p.wing;
    var flap = Math.sin(this.wingFlap) * (0.25 + this.flapSpeed * 1.1);
    this.wings.forEach(function (wing, i) {
      var side = i === 0 ? -1 : 1;
      wing.rotation.z = side * (1.05 - flapAmount * 0.5 + flap);
      wing.rotation.y = side * (0.95 - flapAmount * 0.95);
      wing.rotation.x = -0.1 + flapAmount * 0.45;
    });

    // --- legs ---
    var strideSpeed = Math.min(3.2, this.speed);
    if (moving) this.walkPhase += dt * (3.4 + strideSpeed * 2.6);
    var swing = Math.min(0.62, 0.18 + strideSpeed * 0.16);

    for (var l = 0; l < this.legs.length; l++) {
      var leg = this.legs[l];
      var restThigh = leg.front ? 0.1 : 0.16;
      var restShin = leg.front ? -0.2 : -0.34;

      // Sitting and sleeping: hind legs tucked in, front legs stretched out.
      var sitFold = p.sit * (leg.front ? 0.25 : 1.15);
      var curlFold = p.curl * (leg.front ? 1.15 : 0.9);

      var thigh = restThigh + sitFold + curlFold;
      var shin = restShin - sitFold * 1.5 - curlFold * 1.6;

      if (moving) {
        var ph = this.walkPhase + leg.phase;
        thigh += Math.sin(ph) * swing;
        shin += Math.max(0, Math.sin(ph + 1.1)) * -swing * 1.1;
      } else {
        // Standing still, it shifts its weight from paw to paw — the most alive of the small touches.
        thigh += Math.sin(time * 0.7 + l * 1.7) * 0.02;
      }

      leg.hip.rotation.x = thigh;
      leg.hip.rotation.z = p.spread * (l % 2 === 0 ? -1 : 1);
      leg.knee.rotation.x = shin;
      leg.foot.rotation.x = -(thigh + shin) * 0.85;
    }

    // Footsteps are heard as a paw lands.
    if (moving) {
      var stepPhase = Math.sin(this.walkPhase);
      if (stepPhase < 0 && this.stepSound >= 0) window.Audio3D.step();
      this.stepSound = stepPhase;
    }
  };

  return Dragon;
})();
