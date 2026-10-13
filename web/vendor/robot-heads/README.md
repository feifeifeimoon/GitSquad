# vendored: fayazara/robot-heads

`src/` and `LICENSE` copied from https://github.com/fayazara/robot-heads
(MIT, © Fayazara), at the version the site repository used on 2026-10-12.

Copied rather than installed because GitSquad needs to change two things a
dependency could not give us:

1. **A shape of its own.** `tv/geometry.ts` builds every head from an outline of
   corner centres grown by one radius, then derives the ears, the antenna collar
   and the screen insets from it. Our mark is a wide squircle with two fins, and
   its outline is *not convex* — the renderer relies on convexity for back-face
   culling, so a concave region would need a painter's order.
2. **A palette and a tone curve that belong to this project's design system.**
   Upstream's material is a glossy studio render in its own three colours; the
   console's is flat ink on paper. `tv/light.ts` holds that model, and the three
   colours are props.

## Local patches to upstream

The tree is no longer byte-for-byte upstream's. Everything here is a change to
what was copied, and nothing else in the folder was touched:

| File | Change |
|---|---|
| `types.ts` | `RobotHeadShape` gains `'gitsquad'` |
| `RobotHead.tsx` | `robotHeadShapes` lists it, or the prop falls back to `rectangle` |
| `tv/geometry.ts` | `buildPrism` (a flat polygon extruded through the depth); the `gitsquad` shape, its two fins and its screen box; `HeadMeshes`' ears and fins are nullable; the screen layers (hole, gasket, glass) trace a capsule on this shape instead of an inset of the shell's outline. **The fins are parked behind a `FINS` flag** — they read as someone else's ears bolted to this head |
| `tv/render.ts` | draws the fins into the shell's own layer (when they are on); guards the ears; `glassOf` follows the capsule; the face table is chosen per shape |
| `tv/faces.ts` | `GITSQUAD_FACES`: three cells instead of a 22 × 14 matrix, one behaviour per state |
| `tv/sim.ts` | the idle hop comes every 4–8 s instead of 7–14: twice as long as a reader's glance at a hero, so the thing read as motionless |

Upstream's own numbers for our shape, so the arithmetic can be checked: the mark
is 192 × 140 with a 52 radius on a 256 grid, so in head units (the shell's width
is 1) the corner centres are ±0.229 / ±0.0935 with r 0.271; the visor is a
156 × 64 capsule two units below the shell's centre, r 0.167; and the fins —
outer edge vertical, inner edge at 60°, rising 36 units above the crown — are at
1/192 of the grid too.

## What the three-cell face does

A GitSquad visor holds three marks, so a matrix of 22 × 14 patterns has nowhere
to land: the state has to be legible in three buckets. The layout is computed
from the grid the renderer sizes from the screen, so it survives a change to the
visor, and the cells are square LEDs — their shape comes from a brightness
falloff toward each end, not from their outline.

| State | The three cells |
|---|---|
| `idle` | all three even, dimming together on a blink |
| `thinking` | one thought travelling across them |
| `working` | a progress bar: three cells fill left to right |
| `searching` | a sweep, narrowed to what three cells can say |
| `listening` / `speaking` | an equaliser, from the reference's own noise |
| `happy` | all three flash together |
| `error` | the middle one flickers, the outer two dim |
| `sleeping` | all three breathing at a tenth |

Note on the two traps this cost, both of which outlive the port: `INSET` has no
`gasket` (it lives on `HEAD`), and `put` **drops any write at a negative
coordinate** — on this screen the grid is exactly the face area, so `ox`/`oy` are
0 and a layout centred on zero is dropped cell by cell, leaving a dark visor.


