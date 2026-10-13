/* What the screen shows: an LED matrix, one brightness per cell, composed
   every frame from the state and the face's live parameters (where the
   eyes look, how far a blink has closed them).

   Faces are drawn on a 22 × 14 face area — the eyes at columns 6–8 and
   13–15, rows 5–8, symmetric about the middle — centred on a matrix that
   covers the whole screen, whatever its shape. Effects that belong to the
   screen rather than the face (the search beam) run across all of it. */

import type { RobotHeadState } from '../types';

export const COLS = 22;
export const ROWS = 14;

export interface FaceParams {
  /* where the eyes look, in cells */
  lookX: number;
  lookY: number;
  /* 0 open … 1 shut */
  blink: number;
  /* seconds in the state */
  time: number;
  /* thinking turns to one side, then the other */
  side: number;
  seed: number;
}

export interface Grid {
  v: Float32Array;
  /* the whole matrix */
  cols: number;
  rows: number;
  /* where the face area starts in it */
  ox: number;
  oy: number;
}

/** A matrix of `cols` × `rows` (each at least the face area, by even steps) with the face area centred. */
export function makeGrid(cols: number, rows: number): Grid {
  const c = COLS + 2 * Math.max(0, Math.ceil((cols - COLS) / 2));
  const r = ROWS + 2 * Math.max(0, Math.ceil((rows - ROWS) / 2));
  return { v: new Float32Array(c * r), cols: c, rows: r, ox: (c - COLS) / 2, oy: (r - ROWS) / 2 };
}

/* in face-area coordinates; the matrix reaches past them on every side by ox, oy */
const put = (g: Grid, c: number, r: number, v: number) => {
  const x = c + g.ox, y = r + g.oy;
  if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) return;
  const i = y * g.cols + x;
  if (v > g.v[i]) g.v[i] = v;
};

const rect = (g: Grid, c: number, r: number, w: number, h: number, v: number) => {
  for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) put(g, x, y, v);
};

/* a sprite: '#' full, '+' half, '.' off */
const sprite = (g: Grid, c: number, r: number, rows: string[], v: number) => {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') put(g, c + x, r + y, v);
      else if (row[x] === '+') put(g, c + x, r + y, v * 0.5);
    }
  });
};

const EYE_L = 6;
const EYE_R = 13;
const EYE_TOP = 5;

/* two block eyes, 3 wide and `h` tall, closing toward their middle */
function eyes(g: Grid, f: FaceParams, h = 4, v = 1, dy = 0, lid = 0) {
  const dx = Math.round(f.lookX);
  const ly = Math.round(f.lookY) + dy;
  const open = Math.max(1, Math.round(h - (h - 1) * f.blink));
  const top = EYE_TOP + Math.floor((4 - h) / 2) + ly + Math.floor((h - open) / 2);
  for (const c of [EYE_L, EYE_R]) {
    /* a heavy lid dims the top row */
    if (lid > 0 && open > 1) {
      rect(g, c + dx, top, 3, 1, v * (1 - lid));
      rect(g, c + dx, top + 1, 3, open - 1, v);
    } else rect(g, c + dx, top, 3, open, v);
  }
}

const noise = (x: number) => {
  /* a smooth 1D value noise from a few incommensurate sines */
  return 0.5 + 0.25 * Math.sin(x * 1.7) + 0.15 * Math.sin(x * 3.1 + 1.3) + 0.1 * Math.sin(x * 5.3 + 4.1);
};

const CARET = ['..#..', '.#.#.', '#...#'];
const CROSS = ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'];
const Z_BIG = ['####', '..#.', '.#..', '####'];
const Z_SMALL = ['###', '.#.', '###'];

export const FACES: Record<RobotHeadState, (g: Grid, f: FaceParams) => void> = {
  idle(g, f) {
    eyes(g, f);
  },

  thinking(g, f) {
    /* eyes up toward the side it is turned to, lids heavy, a row of dots */
    eyes(g, { ...f, lookX: f.lookX + f.side * 1.4, lookY: f.lookY - 1.2 }, 3, 1, 0, 0.45);
    for (let i = 0; i < 3; i++) {
      const p = (f.time * 1.6 - i * 0.22) % 1;
      const pulse = p < 0.35 ? Math.sin((p / 0.35) * Math.PI) : 0;
      rect(g, 6 + i * 4, 11 - (pulse > 0.5 ? 1 : 0), 2, 2, 0.28 + 0.72 * pulse);
    }
  },

  searching(g, f) {
    eyes(g, f);
    /* a beam sweeping across the whole screen, top to bottom, with a trail */
    const first = -g.ox, last = COLS - 1 + g.ox;
    const sweep = first + (Math.sin(f.time * 1.6 + 0.4) * 0.5 + 0.5) * (last - first);
    const dir = Math.cos(f.time * 1.6 + 0.4) > 0 ? -1 : 1;
    for (let k = 0; k < 5; k++) {
      const c = Math.round(sweep + dir * k);
      const v = 0.32 * (1 - k / 5);
      for (let r = -g.oy; r < ROWS + g.oy; r++) put(g, c, r, v);
    }
  },

  listening(g, f) {
    eyes(g, f, 4, 1, -1);
    /* an equaliser, bottom-anchored, louder in the middle */
    for (let i = 0; i < 12; i++) {
      const centre = 1 - Math.abs(i - 5.5) / 7;
      const level = noise(f.time * 7 + i * 1.9 + f.seed * 10) * centre;
      const h = Math.max(1, Math.round(level * 4));
      for (let k = 0; k < h; k++) put(g, 5 + i, 12 - k, 0.75 - k * 0.12);
    }
  },

  speaking(g, f) {
    eyes(g, f, 4, 1, -1);
    /* a mouth that opens and closes with the words */
    const env = Math.max(0, Math.sin(f.time * 2.1) * 0.5 + Math.sin(f.time * 3.7 + 1) * 0.5);
    for (let i = 0; i < 8; i++) {
      const centre = 1 - Math.abs(i - 3.5) / 5;
      const a = noise(f.time * 11 + i * 0.9) * centre * (0.35 + env);
      const h = a > 0.55 ? 3 : a > 0.28 ? 2 : 1;
      const top = h === 3 ? 10 : 11;
      const rows = h === 3 ? 3 : h === 2 ? 2 : 1;
      rect(g, 7 + i, top, 1, rows, 1);
    }
  },

  working(g, f) {
    /* focused: flat eyes looking down at the job, a progress bar */
    eyes(g, { ...f, lookY: f.lookY + 1 }, 2, 1, 0);
    const p = (f.time / 2.6) % 1;
    const fill = Math.round(p * 12);
    for (let i = 0; i < 12; i++) put(g, 5 + i, 11, i < fill ? 0.95 : 0.16);
    put(g, 4, 11, 0.4);
    put(g, 17, 11, 0.4);
  },

  happy(g, f) {
    const hop = Math.round(Math.max(0, Math.sin(f.time * 5.6)) * -1);
    sprite(g, EYE_L - 1, EYE_TOP + hop, CARET, 1);
    sprite(g, EYE_R - 1, EYE_TOP + hop, CARET, 1);
    /* a wide smile */
    sprite(g, 7, 10 + hop, ['#......#', '.######.'], 0.9);
  },

  error(g, f) {
    const on = Math.sin(f.time * 7) > -0.6 ? 1 : 0.55;
    sprite(g, EYE_L - 1, 4, CROSS, on);
    sprite(g, EYE_R - 1, 4, CROSS, on);
    for (let i = 0; i < 8; i++) put(g, 7 + i, i % 2 ? 11 : 12, 0.8);
  },

  sleeping(g, f) {
    /* shut eyes, curved down at the ends, dim */
    for (const c of [EYE_L, EYE_R]) {
      put(g, c - 1, 7, 0.32);
      rect(g, c, 8, 3, 1, 0.42);
      put(g, c + 3, 7, 0.32);
    }
    /* a z rising and fading, a small one after it */
    for (const [delay, big] of [[0, true], [1.1, false]] as const) {
      const p = ((f.time + delay) / 2.2) % 1;
      const v = Math.sin(p * Math.PI) * 0.6;
      const y = Math.round(5 - p * 5);
      const x = 16 + Math.round(p * 2);
      sprite(g, x, y, big ? Z_BIG : Z_SMALL, v);
    }
  },
};

/** The light the screen and the antenna ball carry in a state. */
export interface StateLight {
  /* LED colour on the screen, null for the head's own */
  screen: [number, number, number] | null;
  ball: [number, number, number];
  /* how bright the antenna ball is at time t */
  pulse: (t: number) => number;
}

const steady = (v: number) => () => v;

export const LIGHTS: Record<RobotHeadState, StateLight> = {
  idle: { screen: null, ball: [255, 250, 240], pulse: (t) => 0.75 + 0.1 * Math.sin(t * 1.4) },
  thinking: { screen: null, ball: [255, 184, 64], pulse: (t) => 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 4.2)) },
  searching: { screen: null, ball: [90, 220, 255], pulse: (t) => ((t * 2.4) % 1 < 0.18 ? 1 : 0.25) },
  listening: { screen: null, ball: [96, 255, 150], pulse: steady(0.95) },
  speaking: { screen: null, ball: [255, 250, 240], pulse: (t) => 0.55 + 0.45 * noise(t * 11) },
  working: { screen: null, ball: [110, 160, 255], pulse: (t) => ((t * 1.7) % 1 < 0.5 ? 1 : 0.35) },
  happy: { screen: null, ball: [255, 130, 200], pulse: (t) => 0.8 + 0.2 * Math.sin(t * 8) },
  error: { screen: [255, 70, 64], ball: [255, 60, 50], pulse: (t) => ((t * 3) % 1 < 0.5 ? 1 : 0.15) },
  sleeping: { screen: null, ball: [255, 250, 240], pulse: steady(0) },
};

/* ── GitSquad: three cells, not a matrix ─────────────────────────────────────
   The mark's visor holds three marks, so this face writes three tall cells
   instead of a 22 × 14 matrix — the rest of the pipeline (the dark lenses, the
   glass, the bloom) is upstream's and unchanged.

   The layout is derived from the grid, which the renderer sizes from the screen,
   so it survives a change to the visor. The cells are square LEDs, so their
   shape comes from brightness alone: a falloff toward each cell's ends is what
   makes them read as the mark's rounded bars rather than as blocks. */

function three(g: Grid, level: number[]) {
  /* Laid out in the grid's own coordinates, then handed to `put` in face-area
     ones. `put` drops anything at a negative coordinate, and on this screen the
     grid is exactly the face area (ox = oy = 0), so a layout centred on zero
     would be dropped cell by cell and the visor would come out dark. */
  /* Narrow cells, wide gaps: the bloom is tuned for single-cell eyes, and a
     four-wide bar with a two-wide gap blooms into one continuous band. */
  const cw = Math.max(2, Math.round(g.cols * 0.13));
  const gp = Math.max(2, Math.round(g.cols * 0.14));
  const ch = Math.max(3, Math.round(g.rows * 0.68));
  const gx0 = Math.max(0, Math.round((g.cols - (3 * cw + 2 * gp)) / 2));
  const gy0 = Math.max(0, Math.round((g.rows - ch) / 2));
  for (let i = 0; i < 3; i++) {
    const v = Math.max(0, Math.min(1, level[i] ?? 0));
    if (v <= 0.01) continue;
    for (let yy = 0; yy < ch; yy++) {
      /* round the cell's ends: square LEDs can only shape themselves in brightness */
      const rows = Math.min(1, Math.min(yy, ch - 1 - yy) / (ch * 0.22));
      for (let xx = 0; xx < cw; xx++) {
        const cols = Math.min(1, Math.min(xx, cw - 1 - xx) / (cw * 0.3));
        put(g, gx0 + i * (cw + gp) + xx - g.ox, gy0 + yy - g.oy, v * Math.min(rows, cols));
      }
    }
  }
}

const dip = (f: FaceParams) => 1 - 0.88 * f.blink;

export const GITSQUAD_FACES: Record<RobotHeadState, (g: Grid, f: FaceParams) => void> = {
  idle(g, f) {
    three(g, [dip(f), dip(f), dip(f)]);
  },

  thinking(g, f) {
    /* Discrete, not a ramp: at hero size a brightness gradient across three bars
       reads as "three bars", and a cell that is *on* reads as a thought moving. */
    const step = Math.floor(f.time * 1.8) % 6;
    const at = step < 3 ? step : 5 - step;
    three(g, [0, 1, 2].map((i) => (i === at ? 1 : 0.12)));
  },

  searching(g, f) {
    /* one lit cell sweeping the row, the way the beam sweeps upstream's screen */
    const p = (f.time * 0.75) % 1;
    const at = Math.round((p < 0.5 ? p * 2 : (1 - p) * 2) * 2);
    three(g, [0, 1, 2].map((i) => (i === at ? 1 : 0.1)));
  },

  listening(g, f) {
    three(g, [0, 1, 2].map((i) => (noise(f.time * 5 + i * 2.1 + f.seed * 7) > 0.5 ? 1 : 0.14)));
  },

  speaking(g, f) {
    const on = noise(f.time * 9 + f.seed * 5) > 0.42 ? 1 : 0.2;
    three(g, [on, on * 0.9, on]);
  },

  working(g, f) {
    /* three cells are a progress bar, and a bar fills rather than dims: two done
       and the third arriving, then round again. */
    const p = (f.time / 2.4) % 1;
    const done = Math.min(2, Math.floor(p * 3));
    const arriving = p * 3 - done;
    three(g, [0, 1, 2].map((i) => (i < done ? 1 : i === done ? 0.25 + 0.75 * arriving : 0.12)));
  },

  happy(g, f) {
    const flash = Math.max(0, Math.sin(f.time * 6)) > 0.25 ? 1 : 0.3;
    three(g, [dip(f) * flash, dip(f) * flash, dip(f) * flash]);
  },

  error(g, f) {
    const on = (f.time * 3) % 1 < 0.5 ? 1 : 0.16;
    three(g, [0.12, on, 0.12]);
  },

  sleeping(g, f) {
    const breath = Math.sin(f.time * 1.1) > 0 ? 0.16 : 0.06;
    three(g, [breath, breath, breath]);
  },
};
