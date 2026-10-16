# vendored: fayazara/robot-heads

`src/` and `LICENSE` copied from https://github.com/fayazara/robot-heads
(MIT, © Fayazara), at the version the site repository used on 2026-10-12.

Copied rather than installed because GitSquad needs to change two things a
dependency could not give us:

1. **A shape of its own, and outlines that are only outlines.** `tv/geometry.ts`
   builds every head from an outline of corner centres grown by one radius, then
   derives the ears, the antenna collar and the screen insets from it. Our mark
   is a wide squircle, and its outline is *not convex* — the renderer relies on
   convexity for back-face culling, so a concave region would need a painter's
   order. The console then picks that mark **or one of the four plain outlines**
   at creation, and all five have to read as one robot: the visor is the mark's
   capsule scaled to each shell's width, on every shape, with the knob ears
   parked.
2. **A face of its own.** `tv/faces.ts` draws a 22 × 14 LED matrix; the mark's
   visor holds three cells, so `GITSQUAD_FACES` replaces the matrix on every
   shape. The colours, in the end, are upstream's own: the console wears the
   same head the homepage does, and the three colours are props if that ever
   needs to change.

## Local patches to upstream

The tree is no longer byte-for-byte upstream's. Everything here is a change to
what was copied, and nothing else in the folder was touched:

| File | Change |
|---|---|
| `types.ts` | `RobotHeadShape` gains `'gitsquad'` |
| `RobotHead.tsx` | `robotHeadShapes` lists it, or the prop falls back to `rectangle` |
| `tv/geometry.ts` | `buildPrism` (a flat polygon extruded through the depth); the `gitsquad` shape and its two fins; `HeadMeshes`' ears and fins are nullable; the screen layers (hole, gasket, glass) trace a capsule on **every** shape instead of an inset of the shell's outline — the capsule is a share of the shell's width (`SCREEN`, 0.8125 / 0.3333 / 0.0104, r 0.1667), and the LED pitch is the capsule's own (`h / 8`), so all five shapes carry the same visor and the same cell count. **The ears are parked behind an `EARS` flag, on every shape** — the console picks an outline at creation, and two knobs on four of the five made them read as other robots; **the fins** are parked the same way, behind `FINS` |
| `tv/render.ts` | draws the fins into the shell's own layer (when they are on); guards the ears; `glassOf` follows each shape's capsule; **the face table is `GITSQUAD_FACES` on every shape** — upstream's 22 × 14 `FACES` stays in `faces.ts`, unselected |
| `tv/faces.ts` | `GITSQUAD_FACES`: three cells instead of a 22 × 14 matrix, one behaviour per state — and now the table every shape draws |
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


