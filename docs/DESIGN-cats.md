# Cat Meadow — design document (prehistory)

This project started as a 2D game about cats, and only later turned into the 3D dragon.
The document is kept as history: the dragon inherited its tactility, its sound synthesis and,
above all, the rule of *no punishment and no timers*.

Status: v1 was implemented, then the project pivoted to [Dragon Meadow](../DESIGN.md).

## 1. The fantasy

> You come to a meadow where cats live. At first they do not know you. Little by little you learn
> to read each one — who can be scooped up straight away, who needs a slow approach, who does not
> want affection at all but a game of chase. In time the cats start waiting for *you*.

The key word is **recognition**, not reaction. The player is not racing a clock, they are
*figuring things out*. The game should feel like stroking a cat, not like a clicker.

Target session: 5–10 minutes, "let me see how mine are doing".

## 2. What was wrong with the v0 prototype

| Problem | Why it is bad for a cosy game |
| --- | --- |
| Every cat behaves the same | One action for the whole game, no depth |
| Patience meters and "the cat got sad" | Punishment and anxiety — the opposite of the genre |
| A falling meadow-happiness bar | Another source of guilt, leading nowhere |
| Score as the goal | A high score is no reason to come back tomorrow |
| Cats vanish namelessly | No attachment, while the whole game is about attachment |

What stayed untouched: **tactility** (only a moving hand pets), the procedural cat rendering,
the sound and the overall mood.

## 3. Loops

- **10 seconds.** Spot a cat → read what they want → pick the right approach → purring.
- **2 minutes.** Take one cat to the next level of trust, learn something new about them.
- **A session (5–10 minutes).** Tame a new cat or add something to the meadow.
- **Long term.** Collect cats of every temperament; the meadow becomes lived-in.

## 4. Temperaments — the core of the game

Every cat has a temperament that defines what "good" means for them. The player learns it from
behaviour, not from a label. That turns a single mechanic into six different ones.

| Temperament | What they want | How to read it | What breaks the contact |
| --- | --- | --- | --- |
| **Affectionate** | Ordinary petting, as in v0 | Walks up to you, tail high | Nothing — this is the tutorial cat |
| **Shy** | A **slow** approach, then stillness, a sniff, then gentle petting | Ears sideways, body low, backing away | A sudden move — runs off into the bushes |
| **Playful** | Not affection but chase: move the cursor nearby and they run after it | Spins, sideways hops, wide pupils | Grabbing at them — they lose interest |
| **Lazy** | Very slow, very long stroking | Lies down, barely moves, eyes half shut | Fast scratching — they just walk off to sleep |
| **Grumpy** | Scratching behind the ear; an offered belly is a trap | The tail starts thumping the ground = stop | Petting the belly — a nip, then ten seconds away |
| **Proud** | Sit nearby and **do not touch** until they come | Stares at you, keeps their distance | Reaching first — they turn away |

The design rule: every temperament has a **readable body signal** (tail, ears, posture) and an
**inversion of the core mechanic**. The shy and the lazy cat need slowness — the exact opposite of
what the game taught in the first minutes. That is the "oh, they are all different!" moment.

The shared vocabulary of signals:

- **tail up** — happy, go ahead;
- **tail thumping the ground** — stop, one more move and they leave;
- **ears flat** — scared, hold still;
- **eyes narrowed to slits** — bliss, keep going;
- **purring** (sound) — you are doing it right.

None of this is taught in text. The player works it out, and that is the pleasure.

## 5. Trust instead of score

Each cat has their own trust bar: **0 → 5 hearts**.

- A correct interaction: **+1 heart** (one per encounter, so it cannot be farmed).
- A mistake (a scare, the wrong spot): trust **does not drop**, the cat simply leaves for a while.
  There is no punishment, only slower progress.
- **3 hearts** — the cat stays in the meadow for good: a permanent name, a favourite spot, and they
  start walking up to you when you arrive.
- **5 hearts** — they bring a friend to the meadow (a new cat, often of a different temperament).

This replaces both the score and the happiness bar: progress is measured in how many cats became
yours, not in an abstract number.

**Purrs** stay, but as a **currency** rather than a score: they trickle in from purring and are
spent on furnishing the meadow.

## 6. Furnishing the meadow

Bought items are placed in the meadow and **change how cats behave** — they are not decoration.

| Item | Price | What it does |
| --- | --- | --- |
| Bowl | cheap | Cats drop by more often; contact is easier to start at the bowl |
| Cushion | cheap | Lazy cats come to sleep; a sleeping cat can be petted from any approach |
| Bush | medium | Shy cats have somewhere to feel safe, so they start visiting |
| Feather wand | medium | A tool for playful cats: chase becomes a proper mini-game |
| House | expensive | Cats stay in the meadow overnight |
| Lantern | expensive | Unlocks the night: fireflies, sleeping cats, a different set of visitors |

The point: the player decides which cats to attract. Want shy ones? Plant bushes.

## 7. What the player sees

- The trust bar sits **above the cat**, not in the HUD, and only while interacting with them.
- The HUD keeps only the purrs and a small count of how many cats became yours.
- The happiness bar, patience meters and timers are removed entirely.
- A diary: known cats with name, temperament, trust and the date you first met.
  That is what creates the feeling of *my* garden.
- Saved in `localStorage`: cats, trust, purchased items.

## 8. Roadmap (as of the pivot)

**v1 — "They are all different". ✅ Done.**
Three temperaments (affectionate, shy, playful), the body-signal vocabulary, trust and permanent
cats with saving, a bowl and a bush, removal of patience meters, the happiness bar and penalties.
The minimum version where the game is already about recognition rather than reaction.

What we learned while building it:
- A binary "too sudden" threshold turned out to be brittle: one accidental movement broke the
  contact. It was replaced with accumulated tension — the cat visibly tenses up first, shown by a
  dashed ring.
- Between "held still nearby" and "started petting" the hand inevitably jerks. A 1.5-second grace
  window after the sniff was needed, otherwise the game punished the player for playing correctly.
- Trust reduces skittishness: a familiar cat takes sudden movements more calmly. Progress is felt
  in behaviour, not only in a number.

**v2 — "My garden".** The other three temperaments, a shop and item placement, the diary, the
feather wand as a separate tool.

**v3 — "Mood".** Day and night, rain (cats hide under a burdock leaf), seasons, fireflies, cats
missing you while you were away.

## 9. Decided and open

Decisions taken during v1 (changing them is fine, but deliberately):

- **How many cats.** 4–6 at a time. The feeling of "a bunch" comes not from the count on screen but
  from the cats being permanent and familiar. Past six there is no attention left for any of them.
- **Offline progress** ("while you were away, Tofu made friends with Cupcake") — postponed. A sweet
  idea, but it drags in time tracking and notifications, and without them it reads as a lie.
- **Items** in v1 stand in the meadow from the start, with no shop: the bowl and the bush already
  shape behaviour, and buying things waits for v2 where there is something to choose between.

Open:

- Touch controls: petting with a finger works, but "hold still and do not touch" for the proud cat
  reads worse on a touchscreen. It needs its own signal.
- Where purrs should go before a shop exists — right now they just pile up.
- Whether cats need sleep and a night cycle, or whether that breaks "drop in for five minutes".
