/* Лужайка: летающий островок, свет, трава, пруд и вся мелочь вокруг дракончика.
   Вся геометрия строится кодом — никаких внешних моделей и текстур. */
window.World = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  var renderer, scene, camera, sun, hemi, sky, ground, water, bed;
  var grass, grassMat, flowers = [];
  var butterflies = [], fireflies = null;
  var clockUniform = { value: 0 };
  var canvas;

  var ISLAND_R = 12.5;      // радиус лужайки
  var WALK_R = 10.2;        // куда дракончику можно бегать

  // Камера: уютный ракурс три четверти, вращается перетаскиванием.
  var cam = {
    azimuth: -0.65, polar: 0.95, distance: 7.6,
    targetAzimuth: -0.65, targetPolar: 0.95, targetDistance: 7.6,
    target: null, desiredTarget: null, sway: 0
  };

  var night = 0;            // 0 — день, 1 — ночь
  var nightTarget = 0;

  /* ---------- рельеф ---------- */

  /** Высота лужайки в точке. Аналитическая, поэтому по ней легко ходить. */
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

  /* ---------- материалы ---------- */

  function mat(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, opts || {}));
  }

  var PALETTE = {
    grassLight: 0x9ede72,
    grassDark: 0x6fbf55,
    soil: 0x8a6a4a,
    rock: 0x9a9bad,
    water: 0x7fd4e8,
    trunk: 0x9a6b48,
    leaf: 0x5fb45c,
    leafWarm: 0x86c95e,
    petal: [0xfff1f4, 0xffd9e6, 0xfff6c8, 0xe3dcff],
    cushion: 0xf0a7b4
  };

  /* ---------- сборка мира ---------- */

  function buildSky() {
    var geo = new THREE.SphereGeometry(90, 20, 14);
    var colors = [];
    var pos = geo.attributes.position;
    var top = new THREE.Color(0x63b8e8);
    var bottom = new THREE.Color(0xdff2f6);
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

    // Скалистое донышко — островок парит в воздухе.
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
    underMesh.rotation.x = Math.PI;   // вершиной вниз
    underMesh.position.y = -6.05;     // основание конуса уходит под край лужайки
    scene.add(underMesh);
  }

  function buildGrass() {
    var blade = new THREE.ConeGeometry(0.05, 0.3, 3);
    blade.translate(0, 0.15, 0);

    grassMat = new THREE.MeshLambertMaterial({ color: 0x86cf62, flatShading: true });
    // Ветер: верхушки травинок качаются в вершинном шейдере.
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
      if (Math.hypot(x - 5.4, z - 4.2) < 2.9) continue;      // не растёт в пруду
      dummy.position.set(x, heightAt(x, z) - 0.03, z);
      dummy.rotation.set(rand(-0.13, 0.13), Math.random() * TAU, rand(-0.13, 0.13));
      var s = rand(0.7, 1.3);
      dummy.scale.set(s, rand(0.7, 1.35), s);
      dummy.updateMatrix();
      grass.setMatrixAt(placed, dummy.matrix);
      color.setHSL(0.26 + rand(-0.03, 0.04), rand(0.42, 0.62), rand(0.42, 0.6));
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
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.5, 6), mat(PALETTE.trunk));
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    group.add(trunk);

    var tiers = [
      { r: 1.15, h: 1.5, y: 1.65, c: PALETTE.leaf },
      { r: 0.9, h: 1.25, y: 2.4, c: PALETTE.leafWarm },
      { r: 0.6, h: 1.0, y: 3.05, c: PALETTE.leaf }
    ];
    tiers.forEach(function (t) {
      var cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 7), mat(t.c));
      cone.position.y = t.y;
      cone.rotation.y = rand(0, TAU);
      cone.castShadow = true;
      group.add(cone);
    });

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
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 4), mat(0x66b653));
    stem.position.y = 0.15;
    group.add(stem);
    var petalColor = PALETTE.petal[Math.floor(Math.random() * PALETTE.petal.length)];
    var head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mat(petalColor));
    head.position.y = 0.32;
    head.scale.y = 0.7;
    group.add(head);
    var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), mat(0xffcc57));
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
    water = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      color: PALETTE.water, flatShading: true, transparent: true, opacity: 0.85
    }));
    water.position.set(5.4, heightAt(5.4, 4.2) - 0.12, 4.2);
    water.receiveShadow = false;
    scene.add(water);

    // Бережок из камушков.
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * TAU + rand(-0.15, 0.15);
      buildRock(5.4 + Math.cos(a) * rand(2.6, 3.0), 4.2 + Math.sin(a) * rand(2.6, 3.0), rand(0.16, 0.3));
    }
  }

  /** Лежанка — сюда дракончик приходит спать. */
  function buildBed() {
    bed = new THREE.Group();
    var pad = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.22, 12), mat(PALETTE.cushion));
    pad.receiveShadow = true;
    pad.castShadow = true;
    bed.add(pad);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.17, 6, 14), mat(0xe08fa0));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    rim.castShadow = true;
    bed.add(rim);
    bed.position.set(-5.2, heightAt(-5.2, -3.4) + 0.1, -3.4);
    scene.add(bed);
  }

  function buildButterflies() {
    for (var i = 0; i < 5; i++) {
      var g = new THREE.Group();
      var color = [0xfff0a8, 0xffd0e4, 0xd6e6ff, 0xffc9a8][i % 4];
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
      color: 0xfff0a0, size: 0.16, transparent: true, opacity: 0, depthWrite: false,
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

  /* ---------- частицы ---------- */

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
      g.fillStyle = '#ff7d9e';
      g.beginPath();
      g.moveTo(32, 52);
      g.bezierCurveTo(-6, 28, 10, 4, 32, 22);
      g.bezierCurveTo(54, 4, 70, 28, 32, 52);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 3;
      g.stroke();
    });
    textures.spark = makeSpriteTexture(function (g) {
      var grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
      grd.addColorStop(0, 'rgba(255,255,220,1)');
      grd.addColorStop(0.4, 'rgba(255,220,120,0.9)');
      grd.addColorStop(1, 'rgba(255,200,80,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    });
    textures.smoke = makeSpriteTexture(function (g) {
      var grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
      grd.addColorStop(0, 'rgba(255,255,255,0.85)');
      grd.addColorStop(1, 'rgba(230,235,245,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    });
    textures.note = makeSpriteTexture(function (g) {
      g.fillStyle = '#ffffff';
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

  /* ---------- камера ---------- */

  function updateCamera(dt) {
    cam.azimuth += (cam.targetAzimuth - cam.azimuth) * Math.min(1, dt * 6);
    cam.polar += (cam.targetPolar - cam.polar) * Math.min(1, dt * 6);
    cam.distance += (cam.targetDistance - cam.distance) * Math.min(1, dt * 4);

    if (cam.desiredTarget) cam.target.lerp(cam.desiredTarget, Math.min(1, dt * 1.4));

    // Солнце едет за дракончиком: маленькой карты теней хватает на всё важное.
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

  /* ---------- публичное ---------- */

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
      scene.fog = new THREE.Fog(0xcfeaf2, 26, 62);

      camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
      cam.target = new THREE.Vector3(0, 0.4, 0);
      cam.desiredTarget = new THREE.Vector3(0, 0.4, 0);

      hemi = new THREE.HemisphereLight(0xd9f2ff, 0x76a55a, 1.15);
      scene.add(hemi);

      sun = new THREE.DirectionalLight(0xfff2d6, 1.5);
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

    /* --- камера --- */

    /** Поставить камеру в конкретный ракурс — нужно для отладки и автотестов. */
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

    /* --- время суток --- */

    /** Понижает качество на слабых устройствах: тени и часть травы уходят, плавность остаётся. */
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

    /* --- лучи --- */

    /** Точка на лужайке под курсором (ndc: {x, y} в диапазоне -1..1). */
    groundPoint: function (ndc) {
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObject(ground, false);
      return hits.length ? hits[0].point : null;
    },

    intersect: function (ndc, objects) {
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(objects, true);
    },

    /** Экранные координаты точки мира — для эмодзи-мысли над головой. */
    toScreen: function (vec3) {
      var v = vec3.clone().project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        visible: v.z < 1
      };
    },

    /* --- эффекты --- */

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

    /* --- кадр --- */

    update: function (dt, time) {
      clockUniform.value = time;

      night += (nightTarget - night) * Math.min(1, dt * 0.7);

      // Свет и небо мягко уходят в сумерки.
      var dayColor = new THREE.Color(0xfff2d6);
      var nightColor = new THREE.Color(0x8fa8ff);
      sun.color.copy(dayColor).lerp(nightColor, night);
      sun.intensity = 1.5 - night * 1.05;
      hemi.intensity = 1.15 - night * 0.6;
      hemi.color.setHex(0xd9f2ff).lerp(new THREE.Color(0x415c9c), night);
      hemi.groundColor.setHex(0x76a55a).lerp(new THREE.Color(0x2c3f52), night);
      sky.material.color.setRGB(1, 1, 1).lerp(new THREE.Color(0x2f4a86), night * 0.92);
      scene.fog.color.setHex(0xcfeaf2).lerp(new THREE.Color(0x27385f), night);
      renderer.setClearColor(scene.fog.color);

      if (fireflies) {
        fireflies.material.opacity = night * 0.9;
        if (night > 0.05) {
          var fpos = fireflies.geometry.attributes.position;
          var phases = fireflies.userData.phases;
          for (var f = 0; f < phases.length; f++) {
            fpos.setY(f, fpos.getY(f) + Math.sin(time * 1.2 + phases[f]) * dt * 0.35);
          }
          fpos.needsUpdate = true;
        }
      }

      // Бабочки прячутся на ночь.
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
        b.visible = night < 0.55;
      });

      // Цветочки покачиваются.
      for (var i = 0; i < flowers.length; i++) {
        flowers[i].rotation.z = Math.sin(time * 1.1 + flowers[i].userData.phase) * 0.09;
      }

      // Рябь на пруду.
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
