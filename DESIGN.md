# Dragon Meadow — design document

Status: **v1 is done**. The roadmap is at the bottom.

## 1. The fantasy

> A small dragon lives on a floating island. They are little, curious and busy with their own
> things: sniffing the grass, chasing butterflies, digging a hole, yawning. You arrive — and they
> come running.

The key feeling is **they are alive even without you**. A virtual pet dies as an idea the moment it
turns into a set of buttons — feed / play / wash — because then it is not a creature, it is a
to-do list. That is why most of the work went not into the activities but into what the dragon does
on their own.

Target session: 3–7 minutes, "let me check how they are doing".

## 2. What makes it feel alive

None of these details is noticeable on its own; together they are the whole creature:

| Technique | What it does |
| --- | --- |
| Breathing | The sides and belly swell constantly, faster when running |
| Blinking, sometimes a double blink | The eye is not made of glass |
| Saccades | Pupils drift slightly — the gaze is not dead |
| Head tracking | The head springs toward the cursor, with a limit on how far it turns |
| Tail lag | Each segment trails the previous one, so the tail has weight |
| Weight shifting | Standing still, the dragon keeps stepping in place |
| Ear twitches | Every few seconds, at random |
| Looking at the camera | If the player has been idle, the dragon looks them in the eye |
| Their own business | Sniffing, digging, chasing a butterfly, yawning, shaking off |

The rule: **a pose is a target, not a frame**. Poses (`stand`, `walk`, `sit`, `sleep`, `eat`,
`play`, `fly`) are defined as numbers that blend into each other, with breathing, gaze and tail
layered on top. That is why any transition between any two states looks natural.

## 3. The activities

Four of them, and each carries its own emotion rather than a bar increment:

- **Petting** — touch. Only a moving hand pets; the dragon squints and rumbles.
- **Fetch** — playing together. An arcing throw, a dash, a catch, a return trip to you.
- **Feeding** — care. Sniffing, chewing, a happy burp of sparks.
- **Sleep** — calm. Curling up, snoring smoke, the meadow dimming.

They can always be distracted: carrying the ball but spotting a berry means the ball gets dropped.
That matters more than tidy mechanics — a pet that stubbornly finishes every task feels like a robot.

## 4. Needs and growth

Fullness, energy, fun — three gentle bars. The bond grows and **never falls**.
There is no punishment: a hungry dragon looks sad and stares into your eyes, but nothing breaks.

Between visits the bars change with time, but capped at 8 hours: a day away should read as
"missed you", not as guilt.

Three stages by bond: **hatchling** (0) → **fledgling** (0.35) → **flier** (0.75).
Proportions change (smaller head, bigger wings and legs) and so does the behaviour set: a fledgling
hops on their wings, a flier circles above the meadow.

## 5. The world

A floating island — so there is no endless landscape to build, and so the world reads as
*their place*. The terrain is analytic (a sum of sines): easy to walk on, to plant grass on and to
drop a ball onto. Grass is instanced with wind in the vertex shader; there is a rippling pond,
trees, rocks, flowers, a cushion, butterflies by day and fireflies at night.

The camera keeps a cosy three-quarter view, follows the dragon and orbits by dragging.
The sun travels with the camera, so a small shadow map covers everything that matters.

## 6. What we learned while building it

- **The ball hung in mid-air.** At the island edge the whole velocity was reflected, vertical
  component included, so the ball flipped sign every frame. Only the horizontal part should bounce.
- **The dragon carried the ball forever.** They brought it "to the player", meaning to the camera —
  and the camera follows the dragon, so the target kept running away. The drop point is now fixed at
  the moment of the catch.
- **Two dragons.** The hatching form had two submit handlers, so returning players got both their
  saved pet and a brand new one.
- **Treats interrupted sleep.** A list of states that a treat must not interrupt turned out to be
  mandatory.
- **Pointer speed** is smoothed over time, not per frame (a lesson inherited from the cat game:
  pointer events arrive less often than frames and produce false spikes).

## 7. Roadmap

**v1 — "They are alive". ✅ Done.**
The island, the dragon with a rig and procedural animation, four activities, needs, growth, saving,
day and night, adaptive quality.

**v2 — "My dragon".**
Colour and pattern choice at hatching, name suggestions, a diary ("today they learned to fly"),
different treats with different reactions, toys beyond the ball, a bath in the pond.

**v3 — "The world around".**
Weather (rain sends them under a tree), a real day cycle, seasons, a second pet visiting,
decorating the meadow with something you earn.

## 8. Open questions

- Should there be offline progress with notifications ("your dragon missed you") — or is that
  pressure on the player.
- Does anything need to sit on top of the bond as a goal, or is cosy aimlessness enough.
- How to show the character of *this particular* dragon: right now every dragon behaves the same.
  The idea from the previous game (cat temperaments) is asking to come here, but there is only one
  pet — so temperament would have to be set at hatching and shape their favourite activities.
