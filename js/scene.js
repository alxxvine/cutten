/* The meadow: a floating island, light, grass, a pond and all the small things around the dragon.
   Every bit of geometry is built in code — no external models and no textures. */
window.World = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  var renderer, scene, camera, sun, hemi, sky, ground, water, bed;
  var grass, grassMat, flowers = [];
  var butterflies = [], fireflies = null;
  var clockUniform = { value: 0 };
  var canvas;

  var ISLAND_R = 12.5;      // meadow radius
  var WALK_R = 10.2;        // how far the dragon may roam

  // Camera: a cosy three-quarter view, orbited by dragging.
  var cam = {
    azimuth: -0.65, polar: 0.95, distance: 7.6,
    targetAzimuth: -0.65, targetPolar: 0.95, targetDistance: 7.6,
    target: null, desiredTarget: null, sway: 0
  };

  var night = 0;            // 0 is day, 1 is night
  var nightTarget = 0;

  /* ---------- terrain ---------- */

  /** Meadow height at a point. Analytic, which makes walking on it easy. */
  function heightAt(x, z) {
    var d = Math.sqrt(x * x + z * z);
    var edge = 1 - smoothstep(ISLAND_R * 0.72, ISLAND_R, d);
    var h = Math.sin(x * 0.34) * Math.cos(z * 0.29) * 0.5
          + Math.sin(x * 0.13 + 1.7) * Math.sin(z * 0.17 - 0.6) * 0.42
          + Math.cos(d * 0.55) * 0.16;
    return h * edge - (1 - edge) * 1.6;
  }

  function smoothstep(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---------- materials ---------- */

  function mat(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, opts || {}));
  }

  var PALETTE = {
    grassLight: 0x3c4a52,
    grassDark: 0x232c38,
    soil: 0x1b1a26,
    rock: 0x39394a,
    water: 0x16283a,
    trunk: 0x2b2533,
    leaf: 0x2f3a3f,
    leafWarm: 0x3a4148,
    petal: [0x8fe8d0, 0x7fd4ff, 0xc9b6ff, 0xdfe8ff],   // ghost blooms
    cushion: 0x2a2436,
    ember: 0x76f0c8
  };

  /* ---------- building the world ---------- */

  function buildSky() {
    var geo = new THREE.SphereGeometry(90, 20, 14);
    var colors = [];
    var pos = geo.attributes.position;
    var top = new THREE.Color(0x080a14);
    var bottom = new THREE.Color(0x2a2340);
    for (var i = 0; i < pos.count; i++) {
      var t = smoothstep(-20, 55, pos.getY(i));
      var c = bottom.clone().lerp(top, t);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    scene.add(sky);
  }

  function buildIsland() {
    var seg = 46;
    var geo = new THREE.CircleGeometry(ISLAND_R, seg, 1, TAU);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var colors = [];
    var light = new THREE.Color(PALETTE.grassLight);
    var dark = new THREE.Color(PALETTE.grassDark);

    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, heightAt(x, z));
      var shade = 0.5 + Math.sin(x * 0.6) * 0.25 + Math.cos(z * 0.5) * 0.25;
      var c = dark.clone().lerp(light, Math.max(0, Math.min(1, shade)));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    ground.receiveShadow = true;
    scene.add(ground);

    // A rocky underside — the island floats in the air.
    var under = new THREE.ConeGeometry(ISLAND_R * 0.98, 9.5, 13, 3);
    var upos = under.attributes.position;
    for (var j = 0; j < upos.count; j++) {
      var uy = upos.getY(j);
      if (uy > -4.6) {
        upos.setX(j, upos.getX(j) * rand(0.86, 1.06));
        upos.setZ(j, upos.getZ(j) * rand(0.86, 1.06));
        upos.setY(j, uy + rand(-0.5, 0.5));
      }
    }
    under.computeVertexNormals();
    var underMesh = new THREE.Mesh(under, mat(PALETTE.soil));
    underMesh.rotation.x = Math.PI;   // tip pointing down
    underMesh.position.y = -6.05;     // the cone base sits below the meadow rim
    scene.add(underMesh);
  }

  function buildGrass() {
    var blade = new THREE.ConeGeometry(0.05, 0.3, 3);
    blade.translate(0, 0.15, 0);

    grassMat = new THREE.MeshLambertMaterial({ color: 0x46525c, flatShading: true });
    // Wind: blade tips sway in the vertex shader.
    grassMat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = clockUniform;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          '  vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
          '  float sway = sin(uTime * 1.6 + iPos.x * 0.7 + iPos.z * 0.5) * 0.16;',
          '  sway += sin(uTime * 3.1 + iPos.z * 1.3) * 0.05;',
          '  transformed.x += sway * max(transformed.y, 0.0);',
          '  transformed.z += sway * 0.4 * max(transformed.y, 0.0);',
          '#endif'
        ].join('\n')
      );
    };

    var count = 2600;
    grass = new THREE.InstancedMesh(blade, grassMat, count);
    grass.castShadow = false;
    grass.receiveShadow = false;

    var dummy = new THREE.Object3D();
    var color = new THREE.Color();
    var placed = 0;
    var guard = 0;
    while (placed < count && guard < count * 6) {
      guard++;
      var a = Math.random() * TAU;
      var r = Math.sqrt(Math.random()) * (ISLAND_R - 0.5);
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - 5.4, z - 4.2) < 2.9) continue;      // nothing grows in the pond
      dummy.position.set(x, heightAt(x, z) - 0.03, z);
      dummy.rotation.set(rand(-0.13, 0.13), Math.random() * TAU, rand(-0.13, 0.13));
      var s = rand(0.7, 1.3);
      dummy.scale.set(s, rand(0.7, 1.35), s);
      dummy.updateMatrix();
      grass.setMatrixAt(placed, dummy.matrix);
      // Dead, cold grass with the odd blade catching the soul light.
      color.setHSL(0.46 + rand(-0.05, 0.06), rand(0.06, 0.22), rand(0.16, 0.34));
      grass.setColorAt(placed, color);
      placed++;
    }
    grass.count = placed;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    scene.add(grass);
  }

  function buildTree(x, z, scale) {
    var group = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.26, 2.1, 6), mat(PALETTE.trunk));
    trunk.position.y = 1.05;
    trunk.rotation.z = rand(-0.12, 0.12);
    trunk.castShadow = true;
    group.add(trunk);

    // Bare branches instead of a crown: the meadow died a long time ago.
    var branches = Math.floor(rand(5, 8));
    for (var b = 0; b < branches; b++) {
      var len = rand(0.7, 1.5);
      var branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, len, 4), mat(PALETTE.trunk));
      var ang = (b / branches) * TAU + rand(-0.4, 0.4);
      var lift = 1.0 + rand(0, 0.9);
      branch.position.set(Math.cos(ang) * len * 0.32, lift + len * 0.32, Math.sin(ang) * len * 0.32);
      branch.rotation.set(Math.cos(ang) * rand(0.5, 1.1), 0, -Math.sin(ang) * rand(0.5, 1.1));
      branch.castShadow = true;
      group.add(branch);

      // A twig or two off each branch.
      if (Math.random() < 0.7) {
        var twig = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, len * 0.55, 4), mat(PALETTE.trunk));
        twig.position.set(
          Math.cos(ang) * len * 0.62, lift + len * 0.72, Math.sin(ang) * len * 0.62
        );
        twig.rotation.set(Math.cos(ang + 0.8) * 1.2, 0, -Math.sin(ang + 0.8) * 1.2);
        group.add(twig);
      }
    }

    group.position.set(x, heightAt(x, z), z);
    group.scale.setScalar(scale);
    group.rotation.y = rand(0, TAU);
    scene.add(group);
    return group;
  }

  function buildRock(x, z, s) {
    var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat(PALETTE.rock));
    rock.position.set(x, heightAt(x, z) + s * 0.35, z);
    rock.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    rock.scale.set(1, rand(0.6, 0.85), rand(0.85, 1.15));
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    return rock;
  }

  function buildFlower(x, z) {
    var group = new THREE.Group();
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 4), mat(0x2c3a38));
    stem.position.y = 0.15;
    group.add(stem);
    var petalColor = PALETTE.petal[Math.floor(Math.random() * PALETTE.petal.length)];
    var head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({
      color: petalColor, transparent: true, opacity: 0.5
    }));
    head.position.y = 0.32;
    head.scale.y = 0.7;
    group.add(head);
    var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({
      color: 0xdffff4, transparent: true, opacity: 0.8
    }));
    core.position.y = 0.37;
    group.add(core);
    group.position.set(x, heightAt(x, z), z);
    group.userData.phase = rand(0, TAU);
    scene.add(group);
    flowers.push(group);
    return group;
  }

  function buildPond() {
    var geo = new THREE.CircleGeometry(2.6, 22);
    geo.rotateX(-Math.PI / 2);
    water = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      color: PALETTE.water, flatShading: true, transparent: true, opacity: 0.9,
      shininess: 90, specular: 0x9fd8ff
    }));
    water.position.set(5.4, heightAt(5.4, 4.2) - 0.12, 4.2);
    water.receiveShadow = false;
    scene.add(water);

    // A pebble shoreline.
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * TAU + rand(-0.15, 0.15);
      buildRock(5.4 + Math.cos(a) * rand(2.6, 3.0), 4.2 + Math.sin(a) * rand(2.6, 3.0), rand(0.16, 0.3));
    }
  }

  /** The bed — where the dragon comes to sleep. */
  function buildBed() {
    bed = new THREE.Group();
    var slab = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.22, 9), mat(PALETTE.cushion));
    slab.receiveShadow = true;
    slab.castShadow = true;
    bed.add(slab);

    // A ring of old bones instead of a cushion.
    for (var b = 0; b < 11; b++) {
      var a = (b / 11) * TAU;
      var boneMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, rand(0.4, 0.7), 4),
        mat(0xd9d2be)
      );
      boneMesh.position.set(Math.cos(a) * 1.16, 0.14, Math.sin(a) * 1.16);
      boneMesh.rotation.set(Math.PI / 2, 0, -a + rand(-0.3, 0.3));
      boneMesh.castShadow = true;
      bed.add(boneMesh);

      var knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), mat(0xd9d2be));
      knob.position.set(Math.cos(a) * 1.16 + rand(-0.2, 0.2), 0.16, Math.sin(a) * 1.16 + rand(-0.2, 0.2));
      bed.add(knob);
    }

    // A candle-like ember marking the resting place.
    var flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({
      color: PALETTE.ember, transparent: true, opacity: 0.85, fog: false
    }));
    flame.position.set(0, 0.5, -1.25);
    bed.add(flame);
    var flameLight = new THREE.PointLight(PALETTE.ember, 1.4, 5, 2);
    flameLight.position.copy(flame.position);
    bed.add(flameLight);
    bed.userData.flame = flame;    bed.position.set(-5.2, heightAt(-5.2, -3.4) + 0.1, -3.4);
    scene.add(bed);
  }

  function buildButterflies() {
    for (var i = 0; i < 5; i++) {
      var g = new THREE.Group();
      var color = [0x9fb6c9, 0x8aa0b8, 0xb9c6d6, 0x7f93aa][i % 4];
      var wingGeo = new THREE.CircleGeometry(0.16, 4);
      var m = new THREE.MeshLambertMaterial({ color: color, flatShading: true, side: THREE.DoubleSide });
      var left = new THREE.Mesh(wingGeo, m);
      var right = new THREE.Mesh(wingGeo, m);
      left.position.x = -0.1;
      right.position.x = 0.1;
      g.add(left, right);
      g.userData = {
        left: left, right: right,
        angle: rand(0, TAU), radius: rand(2.5, 8), speed: rand(0.25, 0.5),
        height: rand(0.9, 2.4), bob: rand(0, TAU), flap: rand(0, TAU)
      };
      scene.add(g);
      butterflies.push(g);
    }
  }

  function buildFireflies() {
    var count = 70;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * TAU;
      var r = Math.sqrt(Math.random()) * ISLAND_R;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rand(0.4, 3.2);
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x8ff0d8, size: 0.19, transparent: true, opacity: 0.6, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    fireflies.userData.phases = Array.from({ length: count }, function () { return rand(0, TAU); });
    scene.add(fireflies);
  }

  function buildProps() {
    buildTree(-7.6, 5.4, 1.05);
    buildTree(-9.2, 1.6, 0.78);
    buildTree(7.2, -6.1, 0.92);
    buildTree(2.4, -8.6, 0.66);

    buildRock(-2.8, 7.4, 0.5);
    buildRock(8.4, 1.2, 0.42);
    buildRock(-6.4, -6.8, 0.62);

    for (var i = 0; i < 46; i++) {
      var a = Math.random() * TAU;
      var r = Math.sqrt(Math.random()) * (ISLAND_R - 1.2);
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - 5.4, z - 4.2) < 3.1) continue;
      buildFlower(x, z);
    }
  }

  /* ---------- particles ---------- */

  function makeSpriteTexture(draw) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    draw(g);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  var textures = {};
  var particles = [];
  var particlePool = [];

  function initTextures() {
    textures.heart = makeSpriteTexture(function (g) {
      var grd = g.createRadialGradient(32, 32, 0, 32, 32, 26);
      grd.addColorStop(0, 'rgba(232, 255, 246, 1)');
      grd.addColorStop(0.45, 'rgba(118, 240, 200, 0.85)');
      grd.addColorStop(1, 'rgba(118, 240, 200, 0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(32, 4);
      g.lineTo(48, 32);
      g.lineTo(32, 60);
      g.lineTo(16, 32);
      g.closePath();
      g.fill();
    });
    textures.spark = makeSpriteTexture(function (g) {
      var grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
      grd.addColorStop(0, 'rgba(236,255,248,1)');
      grd.addColorStop(0.4, 'rgba(140,244,208,0.85)');
      grd.addColorStop(1, 'rgba(118,240,200,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    });
    textures.smoke = makeSpriteTexture(function (g) {
      var grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
      grd.addColorStop(0, 'rgba(186,200,225,0.6)');
      grd.addColorStop(1, 'rgba(150,168,200,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    });
    textures.note = makeSpriteTexture(function (g) {
      g.fillStyle = '#bff4e4';
      g.font = 'bold 46px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('z', 32, 34);
    });
  }

  function takeSprite(texture, blending) {
    var sprite = particlePool.pop();
    if (!sprite) {
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      scene.add(sprite);
    }
    sprite.material.map = texture;
    sprite.material.blending = blending || THREE.NormalBlending;
    sprite.material.opacity = 1;
    sprite.material.needsUpdate = true;
    sprite.visible = true;
    return sprite;
  }

  function emit(texture, position, options) {
    var o = options || {};
    var count = o.count || 1;
    for (var i = 0; i < count; i++) {
      var sprite = takeSprite(texture, o.blending);
      var spread = o.spread === undefined ? 0.25 : o.spread;
      sprite.position.set(
        position.x + rand(-spread, spread),
        position.y + rand(-spread * 0.5, spread * 0.5),
        position.z + rand(-spread, spread)
      );
      var scale = o.scale === undefined ? 0.4 : o.scale;
      sprite.scale.setScalar(scale * rand(0.8, 1.2));
      particles.push({
        sprite: sprite,
        life: 0,
        max: (o.life || 1.1) * rand(0.85, 1.15),
        vx: rand(-0.5, 0.5) * (o.spreadSpeed || 1),
        vy: (o.rise === undefined ? 1.1 : o.rise) * rand(0.8, 1.25),
        vz: rand(-0.5, 0.5) * (o.spreadSpeed || 1),
        gravity: o.gravity || 0,
        baseScale: sprite.scale.x,
        grow: o.grow || 0
      });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        p.sprite.visible = false;
        particlePool.push(p.sprite);
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      var t = p.life / p.max;
      p.sprite.material.opacity = t < 0.15 ? t / 0.15 : 1 - Math.pow((t - 0.15) / 0.85, 1.7);
      p.sprite.scale.setScalar(p.baseScale * (1 + p.grow * t));
    }
  }

  /* ---------- camera ---------- */

  function updateCamera(dt) {
    cam.azimuth += (cam.targetAzimuth - cam.azimuth) * Math.min(1, dt * 6);
    cam.polar += (cam.targetPolar - cam.polar) * Math.min(1, dt * 6);
    cam.distance += (cam.targetDistance - cam.distance) * Math.min(1, dt * 4);

    if (cam.desiredTarget) cam.target.lerp(cam.desiredTarget, Math.min(1, dt * 1.4));

    // The sun follows the dragon, so a small shadow map covers everything that matters.
    sun.position.set(cam.target.x + 9, 14, cam.target.z + 6);
    sun.target.position.set(cam.target.x, 0, cam.target.z);
    sun.target.updateMatrixWorld();

    cam.sway += dt * 0.22;
    var sway = Math.sin(cam.sway) * 0.02;

    var sinP = Math.sin(cam.polar + sway * 0.5);
    camera.position.set(
      cam.target.x + Math.cos(cam.azimuth + sway) * sinP * cam.distance,
      cam.target.y + Math.cos(cam.polar + sway * 0.5) * cam.distance + 1.2,
      cam.target.z + Math.sin(cam.azimuth + sway) * sinP * cam.distance
    );
    camera.lookAt(cam.target.x, cam.target.y + 0.7, cam.target.z);
  }

  /* ---------- public API ---------- */

  var raycaster = new THREE.Raycaster();

  return {
    ISLAND_R: ISLAND_R,
    WALK_R: WALK_R,
    heightAt: heightAt,

    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get bedPosition() { return bed.position; },

    init: function (canvasEl) {
      canvas = canvasEl;
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x0e1120, 14, 46);

      camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
      cam.target = new THREE.Vector3(0, 0.4, 0);
      cam.desiredTarget = new THREE.Vector3(0, 0.4, 0);

      hemi = new THREE.HemisphereLight(0x4a5891, 0x14171f, 1.05);
      scene.add(hemi);

      sun = new THREE.DirectionalLight(0xbfd2ff, 1.25);   // moonlight
      sun.position.set(9, 14, 6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 48;
      sun.shadow.camera.left = -11;
      sun.shadow.camera.right = 11;
      sun.shadow.camera.top = 11;
      sun.shadow.camera.bottom = -11;
      sun.shadow.bias = -0.0016;
      sun.shadow.normalBias = 0.02;
      scene.add(sun);
      scene.add(sun.target);

      initTextures();
      buildSky();
      buildIsland();
      buildGrass();
      buildPond();
      buildBed();
      buildProps();
      buildButterflies();
      buildFireflies();

      this.resize();
      return this;
    },

    resize: function () {
      var w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },

    /* --- camera --- */

    /** Places the camera at an exact angle — used by debugging and automated tests. */
    setCamera: function (opts) {
      if (opts.azimuth !== undefined) cam.azimuth = cam.targetAzimuth = opts.azimuth;
      if (opts.polar !== undefined) cam.polar = cam.targetPolar = opts.polar;
      if (opts.distance !== undefined) cam.distance = cam.targetDistance = opts.distance;
    },

    orbit: function (dx, dy) {
      cam.targetAzimuth -= dx * 0.006;
      cam.targetPolar = Math.max(0.42, Math.min(1.32, cam.targetPolar - dy * 0.005));
    },

    zoom: function (delta) {
      cam.targetDistance = Math.max(4.2, Math.min(17, cam.targetDistance + delta));
    },

    followTarget: function (vec) {
      cam.desiredTarget.set(vec.x * 0.9, heightAt(vec.x, vec.z) * 0.5 + 0.5, vec.z * 0.9);
    },

    /* --- time of day --- */

    /** Drops quality on weak devices: shadows and some grass go, smoothness stays. */
    qualityLevel: 'high',
    setQuality: function (level) {
      if (this.qualityLevel === level) return;
      this.qualityLevel = level;
      if (level === 'low') {
        renderer.shadowMap.enabled = false;
        renderer.setPixelRatio(1);
        grass.count = Math.floor(grass.count * 0.45);
        scene.traverse(function (o) { if (o.isMesh) o.castShadow = false; });
      } else {
        renderer.shadowMap.enabled = true;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      }
      renderer.shadowMap.needsUpdate = true;
    },

    setNight: function (value) { nightTarget = Math.max(0, Math.min(1, value)); },
    get night() { return night; },

    /* --- raycasting --- */

    /** The meadow point under the cursor (ndc: {x, y} in the -1..1 range). */
    groundPoint: function (ndc) {
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObject(ground, false);
      return hits.length ? hits[0].point : null;
    },

    intersect: function (ndc, objects) {
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(objects, true);
    },

    /** Screen coordinates of a world point — used by the emoji thought above the head. */
    toScreen: function (vec3) {
      var v = vec3.clone().project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        visible: v.z < 1
      };
    },

    /* --- effects --- */

    fx: {
      hearts: function (pos, count) {
        emit(textures.heart, pos, { count: count || 3, scale: 0.42, life: 1.5, rise: 1.0, spread: 0.3, spreadSpeed: 0.6 });
      },
      sparkles: function (pos, count) {
        emit(textures.spark, pos, {
          count: count || 6, scale: 0.32, life: 0.75, rise: 1.4, spread: 0.35,
          gravity: -1.8, blending: THREE.AdditiveBlending
        });
      },
      fire: function (pos, count) {
        emit(textures.spark, pos, {
          count: count || 8, scale: 0.4, life: 0.5, rise: 0.6, spread: 0.12, spreadSpeed: 2.2,
          blending: THREE.AdditiveBlending, grow: 0.8
        });
      },
      dust: function (pos, count) {
        emit(textures.smoke, pos, { count: count || 4, scale: 0.35, life: 0.6, rise: 0.35, spread: 0.3, grow: 1.2 });
      },
      smoke: function (pos) {
        emit(textures.smoke, pos, { count: 1, scale: 0.3, life: 2.2, rise: 0.5, spread: 0.05, spreadSpeed: 0.2, grow: 2.2 });
      },
      sleep: function (pos) {
        emit(textures.note, pos, { count: 1, scale: 0.42, life: 2.4, rise: 0.55, spread: 0.1, spreadSpeed: 0.3, grow: 0.6 });
      }
    },

    /* --- frame --- */

    update: function (dt, time) {
      clockUniform.value = time;

      night += (nightTarget - night) * Math.min(1, dt * 0.7);

      // Light and sky drift gently into dusk.
      // The world is already dark; "night" deepens it further while the dragon sleeps.
      var duskColor = new THREE.Color(0xa9c0ff);
      var deepColor = new THREE.Color(0x5566b0);
      sun.color.copy(duskColor).lerp(deepColor, night);
      sun.intensity = 1.25 - night * 0.6;
      hemi.intensity = 1.05 - night * 0.5;
      hemi.color.setHex(0x35406b).lerp(new THREE.Color(0x1b2242), night);
      sky.material.color.setRGB(1, 1, 1).lerp(new THREE.Color(0x4a4870), night * 0.6);
      scene.fog.color.setHex(0x0e1120).lerp(new THREE.Color(0x06070f), night);
      renderer.setClearColor(scene.fog.color);

      if (fireflies) {
        fireflies.material.opacity = 0.55 + night * 0.4;
        {
          var fpos = fireflies.geometry.attributes.position;
          var phases = fireflies.userData.phases;
          for (var f = 0; f < phases.length; f++) {
            fpos.setY(f, fpos.getY(f) + Math.sin(time * 1.2 + phases[f]) * dt * 0.35);
          }
          fpos.needsUpdate = true;
        }
      }

      // Butterflies hide for the night.
      butterflies.forEach(function (b) {
        var u = b.userData;
        u.angle += u.speed * dt;
        u.bob += dt * 1.8;
        u.flap += dt * 22;
        var x = Math.cos(u.angle) * u.radius;
        var z = Math.sin(u.angle * 1.3) * u.radius * 0.8;
        b.position.set(x, heightAt(x, z) + u.height + Math.sin(u.bob) * 0.25, z);
        b.rotation.y = -u.angle * 1.1;
        var flap = Math.abs(Math.sin(u.flap)) * 1.1;
        u.left.rotation.y = flap;
        u.right.rotation.y = -flap;
        b.visible = true;
      });

      // Flowers sway.
      for (var i = 0; i < flowers.length; i++) {
        flowers[i].rotation.z = Math.sin(time * 1.1 + flowers[i].userData.phase) * 0.09;
      }

      // Ripples on the pond.
      if (water) {
        var wp = water.geometry.attributes.position;
        for (var k = 0; k < wp.count; k++) {
          var wx = wp.getX(k), wz = wp.getZ(k);
          wp.setY(k, Math.sin(time * 1.6 + wx * 1.1 + wz * 0.9) * 0.045);
        }
        wp.needsUpdate = true;
      }

      updateParticles(dt);
      updateCamera(dt);
    },

    render: function () {
      renderer.render(scene, camera);
    }
  };
})();
