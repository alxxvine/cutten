# 🐉 Dragon Meadow

A small dragon of bone and emberlight keeps you company on a dead floating island. They do not wait
for clicks: they wander the ash, chase moths, sniff the ground, dig with a claw, yawn — and look you
in the eye if you have been quiet for too long. Your virtual pet, just not a living one.

**Play:** https://alxxvine.github.io/cutten/

## What to do

- **Pet them** — drag your mouse or finger across the bones: the ember in their ribs flares and they
  lean into your hand.
- **Throw a wisp** — press Wisp and tap the ash: they dash off, catch it and carry it back to you.
- **Feed them** — press Marrow and hold the bone up to their jaws. They crunch it and burp sparks.
- **Let them rest** — when tired they curl up inside the bone circle and the dark deepens.
- **Look around** — drag the ground to circle the island, scroll or pinch to come closer.

The dragon has three gentle bars (fullness, energy, play) and a bond that only ever grows.
You cannot lose: a hungry dragon stares into your eyes, but nothing bad ever happens here.

**They grow.** With the bond a boneling becomes a wyrmling and then a wraith that circles above the
island. Proportions change too: the skull gets smaller, the wings get bigger.

Everything is stored in the browser, including the time of your last visit — come back a day later
and their ember will be dimmer, and they will be very glad you came.

The world is dark on purpose: bone-white against near-black, one ember colour for everything alive,
and a glass interface that stays out of the way.

## What is inside

Zero runtime dependencies, zero build step, zero external models or textures — all geometry is
built in code.

| File | What it does |
| --- | --- |
| `index.html` / `style.css` | Waking screen, glass HUD, line icons, activity bar |
| `js/scene.js` | Island, terrain, dead grass with wind, black water, moonlight, shadows, dusk |
| `js/dragon.js` | The skeleton — ribs, skull, soul ember — its rig and all the procedural animation |
| `js/pet.js` | Needs, behaviour, activities, growth |
| `js/input.js` | Petting, wisp throwing, marrow, camera |
| `js/audio.js` | WebAudio sound: rumbling, dry chirps, bone clicks, wing beats |
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
