/* The dragon: a low-poly model, a rig and procedural animation.
   Not a single prebuilt model and not a single animation clip — everything is computed per frame.
   The feeling of being alive comes from small things: breathing, blinking, head tracking,
   the tail and neck lagging behind, weight shifting from paw to paw. */
window.Dragon = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  var COLORS = {
    bone: 0xe9e2cf,
    boneShade: 0xb6ad96,
    socket: 0x241f2e,
    ember: 0x76f0c8,
    emberLight: 0x63e6c4,
    membrane: 0x584a70
  };

  /** Bones are lit normally; embers ignore light so they glow against the dark. */
  function boneMat() {
    // A touch of emissive keeps the bones readable against a very dark world,
    // without washing out the shading.
    return new THREE.MeshLambertMaterial({
      color: COLORS.bone, emissive: 0x2f3444, flatShading: true
    });
  }

  function emberMat(opacity) {
    return new THREE.MeshBasicMaterial({
      color: COLORS.ember, transparent: opacity < 1, opacity: opacity, fog: false
    });
  }

  var STAGES = {
    baby: { root: 0.95, head: 1.08, wing: 0.6, leg: 1, label: 'boneling' },
    teen: { root: 1.2, head: 1.0, wing: 0.85, leg: 1.08, label: 'wyrmling' },
    flyer: { root: 1.45, head: 0.94, wing: 1.15, leg: 1.14, label: 'wraith' }
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

    // --- body: a spine, a ribcage and a soul ember instead of flesh ---
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.torso = new THREE.Group();
    this.body.add(this.torso);

    // The spine runs through the whole torso; ribs hang off it.
    var spine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 1.35, 6),
      boneMat()
    );
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, 0.16, -0.05);
    this.torso.add(spine);

    // torsoMesh is what the breathing animation scales — here it is the ribcage.
    this.torsoMesh = new THREE.Group();
    this.torso.add(this.torsoMesh);

    var ribCount = 5;
    for (var r = 0; r < ribCount; r++) {
      var t = r / (ribCount - 1);
      var span = 0.5 - Math.abs(t - 0.42) * 0.34;      // widest around the chest
      var rib = new THREE.Mesh(
        new THREE.TorusGeometry(span, 0.045, 4, 10, Math.PI * 1.15),
        boneMat()
      );
      rib.rotation.set(0, Math.PI / 2, Math.PI * 0.5 + 0.08);
      rib.position.set(0, 0.12, 0.44 - t * 1.12);
      this.torsoMesh.add(rib);
    }

    // Sternum, so the ribcage reads as closed from the front.
    var sternum = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.95), boneMat());
    sternum.position.set(0, -0.32, 0.0);
    this.torsoMesh.add(sternum);

    // Hips.
    var pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 4, 8), boneMat());
    pelvis.rotation.set(Math.PI / 2, 0, 0);
    pelvis.position.set(0, 0.02, -0.6);
    this.torso.add(pelvis);

    // Shoulder blades.
    [-1, 1].forEach(function (side) {
      var blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.3), boneMat());
      blade.position.set(side * 0.3, 0.28, 0.34);
      blade.rotation.z = side * 0.3;
      self.torso.add(blade);
    });

    // The soul: a warm ember floating inside the ribs. bellyMesh, so it breathes.
    this.bellyMesh = new THREE.Group();
    this.bellyMesh.position.set(0, 0.02, 0.1);
    this.torso.add(this.bellyMesh);

    var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), emberMat(0.95));
    this.bellyMesh.add(core);
    var halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), emberMat(0.22));
    this.bellyMesh.add(halo);
    this.soulCore = core;
    this.soulHalo = halo;

    // A single light lives in the chest: it lifts the bones out of the dark
    // and paints the grass around the dragon.
    this.soulLight = new THREE.PointLight(COLORS.emberLight, 2.6, 7, 2);
    this.bellyMesh.add(this.soulLight);

    // Spikes along the spine.
    this.crest = [];
    for (var i = 0; i < 5; i++) {
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.05 - i * 0.005, 0.2 - i * 0.02, 4), boneMat());
      spike.position.set(0, 0.42 - i * 0.02, 0.38 - i * 0.24);
      spike.rotation.x = -0.3 + i * 0.05;
      this.torso.add(spike);
      this.crest.push(spike);
    }

    // --- neck and skull ---
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.38, 0.42);
    this.torso.add(this.neck);

    [0, 1, 2].forEach(function (n) {
      var vert = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11 - n * 0.008, 0), boneMat());
      vert.position.set(0, 0.09 * n, 0.02 * n);
      self.neck.add(vert);
    });

    this.neck2 = new THREE.Group();
    this.neck2.position.set(0, 0.28, 0.06);
    this.neck.add(this.neck2);

    [0, 1].forEach(function (n) {
      var vert = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 - n * 0.01, 0), boneMat());
      vert.position.set(0, 0.09 * n, 0.02 * n);
      self.neck2.add(vert);
    });

    this.head = new THREE.Group();
    this.head.position.set(0, 0.2, 0.06);
    this.neck2.add(this.head);

    // Cranium: round and slightly oversized, because a cute skull is a round skull.
    var skullGeo = new THREE.IcosahedronGeometry(0.34, 1);
    skullGeo.scale(1, 0.95, 1.02);
    this.head.add(new THREE.Mesh(skullGeo, boneMat()));

    // Muzzle with a hint of a nasal ridge.
    var snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.34), boneMat());
    snout.position.set(0, -0.04, 0.32);
    this.head.add(snout);
    this.snout = snout;

    var nasal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.3), boneMat());
    nasal.position.set(0, 0.08, 0.33);
    this.head.add(nasal);

    // Upper teeth.
    [-0.09, -0.03, 0.03, 0.09].forEach(function (x) {
      var tooth = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 4), boneMat());
      tooth.position.set(x, -0.13, 0.36);
      tooth.rotation.x = Math.PI;
      self.head.add(tooth);
    });

    // Lower jaw: opens for yawns, meals and chirps.
    this.jawGroup = new THREE.Group();
    this.jawGroup.position.set(0, -0.14, 0.14);
    this.head.add(this.jawGroup);

    var jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.34), boneMat());
    jawMesh.position.set(0, -0.03, 0.16);
    this.jawGroup.add(jawMesh);
    [-0.07, 0, 0.07].forEach(function (x) {
      var tooth = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), boneMat());
      tooth.position.set(x, 0.04, 0.24);
      self.jawGroup.add(tooth);
    });

    // Eye sockets with an ember inside. Blinking squeezes the flame, which reads
    // as a flicker rather than an eyelid.
    this.eyes = [];
    this.pupils = [];
    [-1, 1].forEach(function (side) {
      var socket = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshLambertMaterial({
        color: COLORS.socket, flatShading: true
      }));
      socket.position.set(side * 0.19, 0.06, 0.2);
      socket.scale.set(1, 0.92, 0.7);
      self.head.add(socket);

      var eye = new THREE.Group();
      eye.position.set(side * 0.19, 0.06, 0.26);
      self.head.add(eye);

      var flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), emberMat(0.98));
      eye.add(flame);
      var glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), emberMat(0.3));
      eye.add(glow);
      var spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), emberMat(1));
      spark.position.set(side * 0.03, 0.03, 0.05);
      eye.add(spark);

      self.eyes.push(eye);
      self.pupils.push({ ball: flame, shine: spark, shine2: glow });
    });

    // Horns: curved back, a little too big for the skull.
    this.horns = [];
    [-1, 1].forEach(function (side) {
      var horn = new THREE.Group();
      horn.position.set(side * 0.15, 0.26, -0.08);
      var base = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 5), boneMat());
      base.position.y = 0.12;
      base.rotation.x = -0.45;
      horn.add(base);
      var tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 5), boneMat());
      tip.position.set(0, 0.26, -0.12);
      tip.rotation.x = -0.95;
      horn.add(tip);
      horn.rotation.z = side * 0.22;
      self.head.add(horn);
      self.horns.push(horn);
    });

    // "Ears": thin bone fins that twitch like ears.
    this.ears = [];
    [-1, 1].forEach(function (side) {
      var ear = new THREE.Group();
      ear.position.set(side * 0.26, 0.1, -0.1);
      var fin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 3), boneMat());
      fin.scale.set(1, 1, 0.32);
      fin.position.y = 0.12;
      ear.add(fin);
      var strut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 4), boneMat());
      strut.position.y = 0.12;
      ear.add(strut);
      ear.rotation.z = side * 0.5;
      self.head.add(ear);
      self.ears.push(ear);
    });

    // --- tail: a chain of vertebrae, each lagging behind the previous one ---
    this.tail = [];
    var parent = this.torso;
    for (var s = 0; s < 8; s++) {
      var seg = new THREE.Group();
      seg.position.set(0, s === 0 ? 0.04 : 0, s === 0 ? -0.66 : -0.2);
      var rad = 0.1 - s * 0.009;

      var vertebra = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 0), boneMat());
      vertebra.position.z = -0.1;
      seg.add(vertebra);

      var link = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.4, rad * 0.4, 0.14, 4), boneMat());
      link.rotation.x = Math.PI / 2;
      link.position.z = -0.03;
      seg.add(link);

      if (s > 0 && s < 7) {
        var fin = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 4), boneMat());
        fin.position.set(0, rad * 1.1, -0.09);
        fin.rotation.x = -0.35;
        seg.add(fin);
      }

      parent.add(seg);
      parent = seg;
      this.tail.push(seg);
    }

    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), boneMat());
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.2;
    this.tail[this.tail.length - 1].add(tip);

    // --- wings: bone fingers with a tattered membrane ---
    this.wings = [];
    [-1, 1].forEach(function (side) {
      var wing = new THREE.Group();
      wing.position.set(side * 0.28, 0.46, -0.02);
      self.torso.add(wing);

      var upper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.5, 5), boneMat());
      upper.rotation.z = side * -Math.PI / 2;
      upper.position.x = side * 0.25;
      wing.add(upper);

      var elbow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), boneMat());
      elbow.position.x = side * 0.5;
      wing.add(elbow);

      // Three finger bones fanning out.
      [[0.34, -0.2], [0.16, -0.5], [-0.05, -0.62]].forEach(function (dir) {
        var len = Math.hypot(0.55, dir[1]);
        var finger = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, len, 4), boneMat());
        finger.position.set(side * (0.5 + 0.27), dir[0] * 0.5 + dir[1] * 0.5, 0);
        finger.rotation.z = side * (-Math.PI / 2 + Math.atan2(dir[1], 0.55) * -1);
        wing.add(finger);
      });

      // The membrane: torn at the trailing edge, so it reads as old.
      var pts = [
        0, 0, 0,
        side * 0.52, 0.02, -0.04,
        side * 1.02, 0.3, -0.1,
        side * 1.06, -0.12, 0.0,
        side * 0.86, -0.34, 0.03,
        side * 0.7, -0.16, 0.03,
        side * 0.52, -0.46, 0.04,
        side * 0.3, -0.24, 0.02
      ];
      var idx = [0, 1, 2, 1, 3, 2, 1, 5, 3, 3, 5, 4, 1, 7, 5, 5, 7, 6, 0, 7, 1];
      var membraneGeo = new THREE.BufferGeometry();
      membraneGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      membraneGeo.setIndex(idx);
      membraneGeo.computeVertexNormals();
      var membrane = new THREE.Mesh(membraneGeo, new THREE.MeshLambertMaterial({
        color: COLORS.membrane, emissive: 0x231d33, flatShading: true,
        side: THREE.DoubleSide, transparent: true, opacity: 0.6
      }));
      wing.add(membrane);

      self.wings.push(wing);
    });

    // --- legs: bare bone with joints ---
    this.legs = [];
    var legDefs = [
      { x: -0.3, z: 0.36, front: true },
      { x: 0.3, z: 0.36, front: true },
      { x: -0.32, z: -0.44, front: false },
      { x: 0.32, z: -0.44, front: false }
    ];
    legDefs.forEach(function (def, index) {
      var hip = new THREE.Group();
      hip.position.set(def.x, -0.18, def.z);
      self.torso.add(hip);

      hip.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), boneMat()));

      var thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.32, 5), boneMat());
      thigh.position.y = -0.16;
      hip.add(thigh);

      var knee = new THREE.Group();
      knee.position.y = -0.3;
      hip.add(knee);
      knee.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), boneMat()));

      var shin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.28, 5), boneMat());
      shin.position.y = -0.15;
      knee.add(shin);

      var foot = new THREE.Group();
      foot.position.y = -0.28;
      knee.add(foot);

      var pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.2), boneMat());
      pad.position.z = 0.04;
      foot.add(pad);

      [-0.06, 0, 0.06].forEach(function (cx) {
        var claw = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.11, 4), boneMat());
        claw.rotation.x = Math.PI / 2;
        claw.position.set(cx, -0.01, 0.18);
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

    // The soul in the ribcage is the only warm thing about this dragon:
    // it beats with the breath and flares when they are happy.
    var beat = 1 + Math.sin(this.breath * 1.6) * 0.09 + Math.sin(this.breath * 4.1) * 0.03;
    var warmth = 0.55 + this.happiness * 0.75;
    this.soulCore.scale.setScalar(beat);
    this.soulHalo.scale.setScalar(beat * (1.05 + this.happiness * 0.2));
    this.soulHalo.material.opacity = 0.14 + this.happiness * 0.16;
    this.soulLight.intensity = 1.9 * warmth + Math.sin(this.breath * 1.6) * 0.25;

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
