/* The dragon as a pet: needs, temperament, activities and growth.
   Same rule as in the previous game: no punishment and no timers.
   A hungry dragon looks sad and stares into your eyes, but nothing bad ever happens. */
window.Pet = (function () {
  'use strict';

  var TAU = Math.PI * 2;
  var V = THREE.Vector3;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // How fast needs drain (per second).
  var DECAY = { food: 0.0022, energy: 0.0016, fun: 0.0035 };

  var STAGE_AT = { teen: 0.35, flyer: 0.75 };

  function Pet(saveData) {
    this.needs = saveData.needs;
    this.bond = saveData.bond;
    this.name = saveData.name;

    this.stage = this.stageForBond(this.bond);
    this.dragon = new Dragon(this.stage);
    World.scene.add(this.dragon.root);

    this.position = new V(0, 0, 2.5);
    this.facing = 0;
    this.speed = 0;
    this.moveTarget = null;
    this.arrived = true;

    this.state = 'idle';
    this.stateT = 0;
    this.stateTime = 2;
    this.pose = 'stand';

    this.petting = false;
    this.pettingPoint = null;
    this.pettingTime = 0;
    this.lookPoint = null;
    this.lookTimer = 0;

    this.happiness = 0.5;
    this.voiceTimer = rand(4, 9);
    this.idleAttention = 0;     // how long the player has been idle
    this.mood = '';

    this.buildBall();
    this.buildTreat();

    this.onToast = function () {};
    this.onGrow = function () {};
  }

  Pet.prototype.stageForBond = function (bond) {
    if (bond >= STAGE_AT.flyer) return 'flyer';
    if (bond >= STAGE_AT.teen) return 'teen';
    return 'baby';
  };

  /* ---------- props ---------- */

  Pet.prototype.buildBall = function () {
    var group = new THREE.Group();
    var core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 0),
      new THREE.MeshBasicMaterial({ color: 0x9ffbe4, fog: false })
    );
    group.add(core);
    var halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color: 0x76f0c8, transparent: true, opacity: 0.28, fog: false })
    );
    group.add(halo);
    var wispLight = new THREE.PointLight(0x76f0c8, 1.6, 4.5, 2);
    group.add(wispLight);
    group.visible = false;
    World.scene.add(group);

    this.ball = {
      group: group,
      state: 'away',            // away | flying | resting | carried
      velocity: new V(),
      spin: new V()
    };
  };

  Pet.prototype.buildTreat = function () {
    var group = new THREE.Group();
    var boneMaterial = new THREE.MeshLambertMaterial({ color: 0xe9e2cf, flatShading: true });
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 5), boneMaterial);
    shaft.rotation.z = Math.PI / 2;
    shaft.castShadow = true;
    group.add(shaft);
    [-0.17, 0.17].forEach(function (x) {
      [-1, 1].forEach(function (y) {
        var knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), boneMaterial);
        knob.position.set(x, y * 0.045, 0);
        group.add(knob);
      });
    });
    group.visible = false;
    World.scene.add(group);

    this.treat = { group: group, active: false, position: new V() };
  };

  /* ---------- interaction from outside ---------- */

  Pet.prototype.throwBall = function (point) {
    var b = this.ball;
    b.group.visible = true;
    b.state = 'flying';
    var start = World.camera.position.clone().lerp(point, 0.35);
    var r0 = Math.hypot(start.x, start.z);
    if (r0 > World.WALK_R) {
      start.x *= World.WALK_R / r0;
      start.z *= World.WALK_R / r0;
    }
    start.y = Math.max(start.y, World.heightAt(start.x, start.z) + 2.2);
    b.group.position.copy(start);

    var dx = point.x - start.x;
    var dz = point.z - start.z;
    var flight = 1.05;
    b.velocity.set(dx / flight, 3.2, dz / flight);
    b.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    b.flightTime = 0;

    this.setState('goToBall');
    this.idleAttention = 0;
    window.Audio3D.pop();
  };

  Pet.prototype.offerTreat = function (active) {
    this.treat.active = active;
    this.treat.group.visible = active;
    if (active) this.idleAttention = 0;
  };

  Pet.prototype.moveTreat = function (point) {
    if (!this.treat.active) return;
    this.treat.position.copy(point);
    this.treat.position.y = Math.max(point.y, World.heightAt(point.x, point.z)) + 0.45;
    this.treat.group.position.copy(this.treat.position);
  };

  Pet.prototype.setPetting = function (active, point) {
    if (active && !this.petting) this.idleAttention = 0;
    this.petting = active;
    this.pettingPoint = point || null;
  };

  Pet.prototype.putToBed = function () {
    if (this.state === 'sleep' || this.state === 'goToBed') {
      this.wakeUp();
      return;
    }
    this.offerTreat(false);
    this.setState('goToBed');
    this.onToast(this.name + ' goes to rest');
  };

  Pet.prototype.wakeUp = function () {
    if (this.state !== 'sleep' && this.state !== 'goToBed') return;
    this.setState('wake');
    World.setNight(0);
    window.Audio3D.chirp(1.1);
  };

  /* ---------- states ---------- */

  Pet.prototype.setState = function (state, time) {
    // Distracted by food, sleep or petting — the ball simply drops out of the mouth.
    if (this.ball && this.ball.state === 'carried' && state !== 'returnBall' && state !== 'goToBall') {
      this.dropBall();
    }
    this.state = state;
    this.stateT = 0;
    this.stateTime = time || 0;
    this.moveTarget = null;
  };

  Pet.prototype.dropBall = function () {
    var b = this.ball;
    if (b.state !== 'carried') return;
    b.state = 'resting';
    b.velocity.set(0, 0, 0);
    b.group.position.set(
      this.position.x, World.heightAt(this.position.x, this.position.z) + 0.22, this.position.z
    );
  };

  Pet.prototype.wanderPoint = function () {
    var a = Math.random() * TAU;
    var r = Math.sqrt(Math.random()) * World.WALK_R;
    return new V(Math.cos(a) * r, 0, Math.sin(a) * r);
  };

  /** What to do next when the dragon has nothing going on. */
  Pet.prototype.chooseIdleBehaviour = function () {
    var n = this.needs;

    if (n.energy < 0.16) { this.setState('goToBed'); return; }
    if (n.food < 0.25 && Math.random() < 0.5) { this.setState('beg', rand(2.5, 4)); return; }

    if (this.ball.state === 'resting' && n.fun < 0.55 && Math.random() < 0.5) {
      this.setState('goToBall');
      return;
    }

    var options = ['wander', 'wander', 'sniff', 'sit', 'look', 'dig', 'butterfly'];
    if (n.fun < 0.4) options.push('zoomies', 'zoomies');
    if (n.energy < 0.4) options.push('sit', 'sit');
    if (this.stage === 'flyer' && n.energy > 0.45) options.push('fly', 'fly');
    if (this.stage === 'teen' && Math.random() < 0.3) options.push('hop');

    var next = pick(options);
    if (next === 'wander') {
      this.setState('wander');
      this.moveTarget = this.wanderPoint();
    } else if (next === 'sniff') {
      this.setState('sniff', rand(2, 3.5));
    } else if (next === 'sit') {
      this.setState('sit', rand(3, 7));
    } else if (next === 'look') {
      this.setState('look', rand(2, 4));
    } else if (next === 'dig') {
      this.setState('dig', rand(2, 3.4));
    } else if (next === 'butterfly') {
      this.setState('butterfly', rand(4, 7));
    } else if (next === 'zoomies') {
      this.setState('zoomies', rand(3.5, 6));
      this.moveTarget = this.wanderPoint();
    } else if (next === 'fly') {
      this.setState('fly', rand(6, 9));
    } else if (next === 'hop') {
      this.setState('hop', 1.2);
    }
  };

  /* ---------- movement ---------- */

  Pet.prototype.moveToward = function (dt, target, speed) {
    var dx = target.x - this.position.x;
    var dz = target.z - this.position.z;
    var dist = Math.hypot(dx, dz);
    if (dist < 0.16) {
      this.speed = lerp(this.speed, 0, dt * 8);
      return true;
    }
    var step = Math.min(dist, speed * dt);
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this.speed = speed;

    // Turns smoothly rather than instantly.
    var want = Math.atan2(dx, dz);
    var diff = want - this.facing;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    this.facing += diff * Math.min(1, dt * 6);
    return false;
  };

  /* ---------- frame ---------- */

  Pet.prototype.update = function (dt, time, pointerWorld) {
    var n = this.needs;
    var d = this.dragon;
    var sleeping = this.state === 'sleep';

    // Needs.
    var activity = this.state === 'zoomies' || this.state === 'goToBall' || this.state === 'fly' ? 2.2 : 1;
    if (sleeping) {
      n.energy = clamp01(n.energy + dt * 0.035);
      n.food = clamp01(n.food - dt * DECAY.food * 0.3);
    } else {
      n.food = clamp01(n.food - dt * DECAY.food);
      n.energy = clamp01(n.energy - dt * DECAY.energy * activity);
      n.fun = clamp01(n.fun - dt * DECAY.fun);
    }

    this.happiness = clamp01((n.food + n.energy + n.fun) / 3 * 0.7 + this.bond * 0.3);
    d.happiness = this.happiness;

    // Where to look: the treat, the ball, the hand, or the player.
    this.updateGaze(dt, pointerWorld);

    // Voice: every so often it says something on its own.
    this.voiceTimer -= dt;
    if (this.voiceTimer <= 0 && !sleeping) {
      this.voiceTimer = rand(7, 16);
      if (n.food < 0.3 || n.fun < 0.25) window.Audio3D.whine(1.05);
      else if (this.happiness > 0.6) window.Audio3D.chirp(rand(0.95, 1.15));
    }

    // Gets bored when the player does nothing for a while.
    this.idleAttention += dt;

    this.updateBall(dt);
    this.updateTreat(dt);

    // Petting overrides almost everything except sleep (a sleeping dragon can be petted too).
    if (this.petting && this.state !== 'sleep' && this.state !== 'fly') {
      if (this.state !== 'petted') this.setState('petted');
    } else if (this.state === 'petted' && !this.petting) {
      this.setState('idle', rand(0.6, 1.4));
    }

    this.stateT += dt;
    this[this.stateHandler(this.state)](dt, time);

    // Drop onto the terrain and hand the pose over to the model.
    this.position.x = Math.max(-World.WALK_R, Math.min(World.WALK_R, this.position.x));
    this.position.z = Math.max(-World.WALK_R, Math.min(World.WALK_R, this.position.z));
    var groundY = World.heightAt(this.position.x, this.position.z);
    d.root.position.set(this.position.x, groundY + (this.flyHeight || 0), this.position.z);
    d.root.rotation.y = this.facing;
    d.speed = this.speed;
    d.setPose(this.pose);
    d.update(dt, time);

    this.mood = this.moodIcon();
  };

  Pet.prototype.stateHandler = function (state) {
    var name = 'state_' + state;
    return this[name] ? name : 'state_idle';
  };

  Pet.prototype.updateGaze = function (dt, pointerWorld) {
    var d = this.dragon;
    if (this.state === 'sleep') { d.lookAt(null); return; }

    if (this.treat.active) {
      d.lookAt(this.treat.position);
    } else if (this.ball.state === 'flying') {
      d.lookAt(this.ball.group.position);
    } else if (this.petting && this.pettingPoint) {
      d.lookAt(this.pettingPoint);
    } else if (pointerWorld) {
      this.lookPoint = pointerWorld;
      this.lookTimer = 1.6;
      d.lookAt(pointerWorld);
    } else if (this.lookTimer > 0) {
      this.lookTimer -= dt;
      d.lookAt(this.lookPoint);
    } else if (this.idleAttention > 8) {
      // Nobody has interacted in a while — it looks the player in the eye.
      d.lookAt(World.camera.position);
    } else {
      d.lookAt(null);
    }
  };

  /* ---------- behaviours ---------- */

  Pet.prototype.state_idle = function (dt) {
    this.pose = 'stand';
    this.speed = lerp(this.speed, 0, dt * 6);
    if (this.stateT > (this.stateTime || rand(1.5, 3.5))) this.chooseIdleBehaviour();
  };

  Pet.prototype.state_wander = function (dt) {
    this.pose = 'walk';
    if (!this.moveTarget) this.moveTarget = this.wanderPoint();
    if (this.moveToward(dt, this.moveTarget, 1.15)) {
      this.setState('idle', rand(1, 2.5));
    }
  };

  Pet.prototype.state_sit = function (dt) {
    this.pose = 'sit';
    this.speed = 0;
    if (this.stateT > this.stateTime) this.setState('idle', rand(0.5, 1.5));
  };

  Pet.prototype.state_look = function (dt) {
    this.pose = 'stand';
    this.speed = 0;
    this.dragon.lookAt(World.camera.position);
    if (this.stateT > this.stateTime) this.setState('idle', rand(0.5, 1.5));
  };

  Pet.prototype.state_sniff = function (dt, time) {
    this.pose = 'sniff';
    this.speed = 0;
    if (Math.random() < dt * 3) {
      World.fx.dust(this.dragon.mouthWorldPosition(), 1);
    }
    if (this.stateT > this.stateTime) this.setState('idle', rand(0.4, 1.2));
  };

  Pet.prototype.state_dig = function (dt) {
    this.pose = 'sniff';
    this.speed = 0;
    // Digs with a front paw in jerky strokes, kicking up dirt.
    var leg = this.dragon.legs[0];
    leg.hip.rotation.x += Math.sin(this.stateT * 16) * 0.35;
    if (Math.random() < dt * 8) {
      var p = this.dragon.root.position.clone();
      p.y += 0.1;
      World.fx.dust(p, 1);
    }
    if (this.stateT > this.stateTime) {
      this.setState('idle', rand(0.5, 1.2));
      this.dragon.triggerShake();
    }
  };

  Pet.prototype.state_butterfly = function (dt, time) {
    this.pose = 'walk';
    // Chases an imaginary butterfly: the target circles nearby.
    var a = time * 1.3;
    if (!this.butterflyCenter) this.butterflyCenter = this.wanderPoint();
    var target = new V(
      this.butterflyCenter.x + Math.cos(a) * 2.2,
      0,
      this.butterflyCenter.z + Math.sin(a * 1.4) * 2.0
    );
    this.moveToward(dt, target, 1.5);
    this.dragon.lookAt(new V(target.x, World.heightAt(target.x, target.z) + 1.4, target.z));
    if (Math.random() < dt * 0.7) this.dragon.triggerBlink();
    if (this.stateT > this.stateTime) {
      this.butterflyCenter = null;
      this.needs.fun = clamp01(this.needs.fun + 0.05);
      this.setState('idle', rand(0.6, 1.4));
    }
  };

  Pet.prototype.state_zoomies = function (dt) {
    this.pose = 'run';
    this.dragon.flapSpeed = 0.35;
    if (!this.moveTarget || this.moveToward(dt, this.moveTarget, 3.4)) {
      this.moveTarget = this.wanderPoint();
    }
    if (Math.random() < dt * 6) World.fx.dust(this.dragon.root.position, 1);
    if (this.stateT > this.stateTime) {
      this.dragon.flapSpeed = 0;
      this.needs.fun = clamp01(this.needs.fun + 0.08);
      this.setState('idle', rand(0.8, 1.6));
    }
  };

  Pet.prototype.state_hop = function (dt) {
    this.pose = 'play';
    this.speed = 0;
    this.flyHeight = Math.max(0, Math.sin(this.stateT * 5) * 0.5);
    this.dragon.flapSpeed = 0.8;
    if (this.stateT > this.stateTime) {
      this.flyHeight = 0;
      this.dragon.flapSpeed = 0;
      this.setState('idle', rand(0.4, 1));
    }
  };

  Pet.prototype.state_beg = function (dt) {
    this.pose = 'sit';
    this.speed = 0;
    this.dragon.lookAt(World.camera.position);
    if (this.stateT < dt * 2) window.Audio3D.whine(1.1);
    if (this.stateT > this.stateTime) this.setState('idle', rand(0.5, 1.5));
  };

  /* --- flight (grown-up dragons only) --- */

  Pet.prototype.state_fly = function (dt, time) {
    this.pose = 'fly';
    this.dragon.flapSpeed = 1;
    var phase = Math.min(1, this.stateT / 1.2);
    var landing = this.stateT > this.stateTime - 1.2;
    var targetHeight = landing ? 0 : 2.4;
    this.flyHeight = lerp(this.flyHeight || 0, targetHeight, dt * 2);

    var a = time * 0.9;
    var target = new V(Math.cos(a) * 5.5, 0, Math.sin(a) * 5.5);
    this.moveToward(dt, target, 3.6);

    if (this.stateT < 0.6 && Math.random() < dt * 10) World.fx.dust(this.dragon.root.position, 1);
    if (Math.random() < dt * 2.5) window.Audio3D.flap();

    if (this.stateT > this.stateTime && this.flyHeight < 0.15) {
      this.flyHeight = 0;
      this.dragon.flapSpeed = 0;
      this.needs.fun = clamp01(this.needs.fun + 0.12);
      this.needs.energy = clamp01(this.needs.energy - 0.05);
      this.setState('idle', rand(0.6, 1.4));
    }
  };

  /* --- petting --- */

  Pet.prototype.state_petted = function (dt) {
    this.pose = 'pet';
    this.speed = lerp(this.speed, 0, dt * 8);
    this.pettingTime += dt;

    this.bond = clamp01(this.bond + dt * 0.012);
    this.needs.fun = clamp01(this.needs.fun + dt * 0.045);
    this.dragon.happiness = 1;
    this.dragon.tailWag = 1.4;

    window.Audio3D.purr(true);
    if (Math.random() < dt * 1.6) {
      World.fx.hearts(this.dragon.headWorldPosition().add(new V(0, 0.35, 0)), 1);
    }
    if (Math.random() < dt * 0.35) window.Audio3D.happy(1.05);
    this.checkGrowth();
  };

  /* --- the ball --- */

  Pet.prototype.updateBall = function (dt) {
    var b = this.ball;
    if (b.state === 'away') return;

    if (b.state === 'flying') {
      b.velocity.y -= 9.8 * dt;
      b.group.position.addScaledVector(b.velocity, dt);
      b.group.rotation.x += b.spin.x * dt;
      b.group.rotation.z += b.spin.z * dt;

      var groundY = World.heightAt(b.group.position.x, b.group.position.z) + 0.22;
      if (b.group.position.y <= groundY) {
        b.group.position.y = groundY;
        if (Math.abs(b.velocity.y) > 1.2) {
          b.velocity.y *= -0.45;
          b.velocity.x *= 0.7;
          b.velocity.z *= 0.7;
          World.fx.dust(b.group.position, 2);
        } else {
          b.state = 'resting';
          b.velocity.set(0, 0, 0);
        }
      }
      // The ball never flies off the island.
      var r = Math.hypot(b.group.position.x, b.group.position.z);
      if (r > World.WALK_R) {
        var k = World.WALK_R / r;
        b.group.position.x *= k;
        b.group.position.z *= k;
        b.velocity.x *= -0.4;
        b.velocity.z *= -0.4;
      }

      // Safety net: the ball cannot fly forever.
      b.flightTime = (b.flightTime || 0) + dt;
      if (b.flightTime > 5) {
        b.state = 'resting';
        b.velocity.set(0, 0, 0);
        b.group.position.y = World.heightAt(b.group.position.x, b.group.position.z) + 0.22;
      }
    }

    if (b.state === 'carried') {
      var mouth = this.dragon.mouthWorldPosition();
      b.group.position.copy(mouth);
      b.group.rotation.y += dt * 2;
    }
  };

  Pet.prototype.state_goToBall = function (dt) {
    var b = this.ball;
    if (b.state === 'away') { this.setState('idle'); return; }

    this.pose = 'run';
    this.dragon.flapSpeed = 0.5;

    var target = b.group.position;
    var reached = this.moveToward(dt, target, 3.2);
    var close = Math.hypot(target.x - this.position.x, target.z - this.position.z) < 0.7;

    if ((reached || close) && b.state !== 'flying') {
      b.state = 'carried';
      this.dragon.openJaw(0.6, 0.4);
      this.dragon.flapSpeed = 0;
      window.Audio3D.chirp(1.2);
      World.fx.sparkles(b.group.position, 5);
      this.needs.fun = clamp01(this.needs.fun + 0.18);
      this.bond = clamp01(this.bond + 0.014);
      this.checkGrowth();
      this.setState('returnBall');
      var camDir = World.camera.position.clone();
      camDir.y = 0;
      var len = camDir.length() || 1;
      this.dropPoint = camDir.multiplyScalar(Math.min(len, 4.5) / len);
    }

    // The ball got lost — just go back to whatever we were doing.
    if (this.stateT > 14) {
      this.dragon.flapSpeed = 0;
      this.setState('idle');
    }
  };

  Pet.prototype.state_returnBall = function (dt) {
    this.pose = 'walk';
    if (!this.dropPoint) this.dropPoint = new V(0, 0, 0);

    // Delivered — or has been walking too long, in which case it drops the ball where it stands.
    if (this.moveToward(dt, this.dropPoint, 1.9) || this.stateT > 8) {
      this.ball.state = 'resting';
      var drop = this.position.clone();
      drop.y = World.heightAt(drop.x, drop.z) + 0.22;
      this.ball.group.position.copy(drop);
      this.dragon.openJaw(0.35, 0.25);
      window.Audio3D.happy(1.1);
      World.fx.hearts(this.dragon.headWorldPosition(), 2);
      this.setState('sit', rand(1.5, 2.5));
    }
  };

  /* --- the treat --- */

  // While the dragon sleeps, heads to bed or is being petted, the treat does not take over.
  var TREAT_BLOCKED = { sleep: 1, goToBed: 1, wake: 1, eat: 1, petted: 1, fly: 1 };

  Pet.prototype.updateTreat = function (dt) {
    if (!this.treat.active) return;
    if (TREAT_BLOCKED[this.state]) return;
    var mouth = this.dragon.mouthWorldPosition();
    var dist = this.treat.position.distanceTo(mouth);

    if (dist < 6 && this.state !== 'eat' && this.state !== 'sleep') {
      if (dist > 1.1) {
        // Walking to the treat.
        if (this.state !== 'goToTreat') this.setState('goToTreat');
      } else if (this.state !== 'eat') {
        this.setState('eat', 2.2);
      }
    }
  };

  Pet.prototype.state_goToTreat = function (dt) {
    if (!this.treat.active) { this.setState('idle'); return; }
    this.pose = 'walk';
    var t = this.treat.position;
    var target = new V(t.x, 0, t.z);
    this.moveToward(dt, target, 1.7);
    this.dragon.openJaw(0.15, 0.2);
  };

  Pet.prototype.state_eat = function (dt) {
    this.pose = 'eat';
    this.speed = 0;

    if (this.stateT < 0.1) {
      window.Audio3D.munch();
      this.offerTreat(false);
      this.needs.food = clamp01(this.needs.food + 0.35);
      this.bond = clamp01(this.bond + 0.02);
      this.onToast(this.name + ' crunches happily');
      this.checkGrowth();
    }

    // Chewing: the jaw works up and down and sparks fly.
    this.dragon.openJaw(0.3 + Math.sin(this.stateT * 18) * 0.28, 0.1);
    if (Math.random() < dt * 5) World.fx.sparkles(this.dragon.mouthWorldPosition(), 1);

    if (this.stateT > this.stateTime) {
      // A happy little burp of sparks — a small joke, but it makes the dragon feel alive.
      World.fx.fire(this.dragon.mouthWorldPosition(), 6);
      window.Audio3D.pop();
      this.setState('idle', rand(0.6, 1.2));
    }
  };

  /* --- sleep --- */

  Pet.prototype.state_goToBed = function (dt) {
    this.pose = 'walk';
    var bed = World.bedPosition;
    if (this.moveToward(dt, new V(bed.x, 0, bed.z), 1.1)) {
      this.setState('sleep');
      World.setNight(0.8);
      this.dragon.openJaw(0.8, 1.1);
      window.Audio3D.whine(0.8);
      this.onToast(this.name + ' settles among the bones…');
    }
  };

  Pet.prototype.state_sleep = function (dt) {
    this.pose = 'sleep';
    this.speed = 0;
    if (Math.random() < dt * 0.55) {
      var head = this.dragon.headWorldPosition();
      World.fx.sleep(head.add(new V(0, 0.4, 0)));
      window.Audio3D.snore();
    }
    if (Math.random() < dt * 0.3) World.fx.smoke(this.dragon.mouthWorldPosition());

    if (this.petting) {
      this.bond = clamp01(this.bond + dt * 0.004);
    }
    if (this.needs.energy > 0.96) this.wakeUp();
  };

  Pet.prototype.state_wake = function (dt) {
    this.pose = 'sit';
    if (this.stateT < 0.1) this.dragon.openJaw(0.9, 0.8);
    if (this.stateT > 0.9 && this.stateT < 1.0) this.dragon.triggerShake();
    if (this.stateT > 1.8) this.setState('idle', 0.5);
  };

  /* --- greeting on arrival --- */

  Pet.prototype.state_greet = function (dt) {
    this.pose = 'run';
    var camDir = World.camera.position.clone();
    camDir.y = 0;
    var len = camDir.length() || 1;
    var target = camDir.multiplyScalar(Math.min(len, 3.6) / len);
    if (this.moveToward(dt, target, 2.6) || this.stateT > 4) {
      window.Audio3D.happy(1.15);
      World.fx.hearts(this.dragon.headWorldPosition(), 4);
      this.dragon.openJaw(0.5, 0.5);
      this.setState('hop', 1.2);
    }
  };

  /* ---------- growth ---------- */

  Pet.prototype.checkGrowth = function () {
    var next = this.stageForBond(this.bond);
    if (next === this.stage) return;
    this.stage = next;
    this.dragon.applyStage(next);
    World.fx.hearts(this.dragon.headWorldPosition(), 10);
    World.fx.sparkles(this.dragon.headWorldPosition(), 12);
    window.Audio3D.happy(0.95);
    this.onGrow(next);
  };

  /* ---------- what to show the player ---------- */

  Pet.prototype.moodIcon = function () {
    if (this.state === 'sleep') return 'zzz';
    if (this.state === 'petted') return 'spark';
    if (this.state === 'eat' || this.state === 'goToTreat') return 'bone';
    if (this.state === 'goToBall' || this.state === 'returnBall') return 'orb';
    if (this.needs.food < 0.25) return 'bone';
    if (this.needs.energy < 0.22) return 'moon';
    if (this.needs.fun < 0.25) return 'orb';
    if (this.idleAttention > 12) return 'eye';
    if (this.happiness > 0.75) return 'spark';
    return '';
  };

  Pet.prototype.toSave = function (base) {
    base.needs = this.needs;
    base.bond = this.bond;
    base.name = this.name;
    return base;
  };

  return Pet;
})();
