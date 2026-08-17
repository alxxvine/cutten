# 🐉 Dragon Meadow

A cute low-poly dragon lives on a floating meadow. They do not wait for clicks: they wander around,
chase butterflies, sniff the grass, dig with a paw, yawn — and look you in the eye if you have been
quiet for too long. Your virtual pet.

**Play:** https://alxxvine.github.io/cutten/

## What to do

- ✋ **Pet them** — drag your mouse or finger across the dragon: they squint, rumble, hearts fly up.
- 🎾 **Play fetch** — press “Ball” and tap the grass: they dash off, grab it and bring it back.
- 🍓 **Feed them** — press “Treat” and hold the berry up to their snout. They chew and burp sparks.
- 💤 **Tuck them in** — when tired they curl up on the cushion by themselves and the meadow dims.
- 🖱 **Look around** — drag across the grass to walk around the meadow, scroll or pinch to zoom.

The dragon has three gentle bars (fullness, energy, fun) and a bond that only ever grows.
You cannot lose: a hungry dragon looks sad and stares into your eyes, but nothing bad happens.

**They grow.** With the bond a hatchling becomes a fledgling and then learns to fly, circling above
the meadow. Proportions change too: the head gets smaller, the wings get bigger.

Everything is stored in the browser, including the time of your last visit — come back a day later
and your dragon will be a little hungrier and very happy to see you.

## What is inside

Zero runtime dependencies, zero build step, zero external models or textures — all geometry is
built in code.

| File | What it does |
| --- | --- |
| `index.html` / `style.css` | Hatching screen, HUD, activity bar |
| `js/scene.js` | Island, terrain, grass with wind, pond, light, shadows, day and night |
| `js/dragon.js` | The dragon model, its rig and all the procedural animation |
| `js/pet.js` | Needs, behaviour, activities, growth |
| `js/input.js` | Petting, ball throwing, treats, camera |
| `js/audio.js` | WebAudio sound: rumbling, trills, wing beats, snoring |
| `js/save.js` | Saving, and accounting for the time between visits |
| `vendor/three.min.js` | three.js bundled into a single file (see below) |

The design, the dragon's character and the plans live in [DESIGN.md](DESIGN.md).
The prehistory of this project (a 2D game about cats) is in [docs/DESIGN-cats.md](docs/DESIGN-cats.md).

### Why three.js is committed to the repository

The page has to open anywhere, including environments with a strict CSP where external CDNs are
blocked. So three.js is bundled into a single IIFE file exposing a global `THREE` and committed.
To rebuild it (npm is only needed for this step):

```bash
npm install
npm run vendor
```

## The game as a single file

`dragon.html` is the whole game in one self-contained file (~820 KB): download it and open it with
a double click. It runs without a server and without internet, and makes no external requests at
all. Handy for dropping onto any host or sending to a friend.

Rebuild it after changing the code:

```bash
npm run build:single
```

`tools/build-single.js` takes the script order from `index.html`, so you never have to think about
it as more files are added.

## Running locally

```bash
git clone https://github.com/alxxvine/cutten.git
cd cutten
python3 -m http.server 8000
# open http://localhost:8000
```

You need a browser with WebGL — that is, any modern one.

## Deployment

`.github/workflows/pages.yml` publishes the repository to GitHub Pages on every push to `main`.
The workflow enables Pages itself, so nothing has to be switched on by hand.

The repository is public partly for this reason: GitHub Pages and Actions minutes are free for
public repositories, while Pages on a private repository requires a paid plan.
