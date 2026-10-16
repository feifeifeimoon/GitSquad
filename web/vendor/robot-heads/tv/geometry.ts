/* The TV head as real geometry: a shell with a rolled edge, the antenna collar
   and the visor, built once per shape as quad meshes in head units (x right,
   y down, z toward the viewer). Every frame the vertices are turned with the
   pose and projected orthographically, so a turn, a nod or a full spin shows
   the true silhouette — the shell is convex, so back-face culling alone hides
   what cannot be seen.

   Every shape is one outline: a convex polygon of corner centres grown
   by a corner radius (a circle is a single centre). The front plate and the
   shell's edge are that outline inset step by step; the screen layers (hole,
   gasket, glass) are the visor capsule, scaled to the shell's width, on every
   shape — so the outline is the only thing that tells the five apart. */

import type { RobotHeadShape } from '../types';

export type V3 = [number, number, number];

/* what every shape shares */
export const HEAD = {
  /* radius of the rolled edge round the front and the back */
  bevel: 0.075,
  /* the shell's rim round the screen, then the rubber gasket */
  margin: 0.045,
  gasket: 0.022,
  /* how far the glass sits behind the face */
  recess: 0.03,
  earY: 0.03,
  /* the antenna: the stem's length and the ball's radius */
  stem: 0.2,
  ball: 0.052,
} as const;

/* how far in from the outline each layer of the face starts */
export const INSET = {
  plate: HEAD.bevel,
  hole: HEAD.bevel + HEAD.margin,
  glass: HEAD.bevel + HEAD.margin + HEAD.gasket,
} as const;

export interface Mesh {
  /* x, y, z per vertex */
  pos: Float32Array;
  /* four vertex indices per quad */
  quads: Uint16Array;
  /* x, y, z per quad */
  normals: Float32Array;
}

/** v' = Roll · Yaw · Pitch · v, row-major. */
export function rotation(yaw: number, pitch: number, roll: number): number[] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  /* Yaw · Pitch */
  const a = [cy, sy * sp, sy * cp, 0, cp, -sp, -sy, cy * sp, cy * cp];
  /* Roll · that */
  return [
    cr * a[0] - sr * a[3], cr * a[1] - sr * a[4], cr * a[2] - sr * a[5],
    sr * a[0] + cr * a[3], sr * a[1] + cr * a[4], sr * a[2] + cr * a[5],
    a[6], a[7], a[8],
  ];
}

export function rotate(m: number[], x: number, y: number, z: number): V3 {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

const norm = (x: number, y: number, z: number): V3 => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/* ── the outline ─────────────────────────────────────────────────────── */

interface Corner {
  x: number;
  y: number;
  /* the arc round this centre, in canvas angles (clockwise on screen) */
  a0: number;
  a1: number;
}

export interface Shape {
  name: RobotHeadShape;
  /* corner radius of the outline */
  r: number;
  /* the shell's thickness, front to back */
  depth: number;
  corners: Corner[];
  /* the outline's half extents */
  hx: number;
  hy: number;
  /* the LED pitch on this screen, in head units */
  pitch: number;
  /* the visor capsule, scaled to this shell's width — every outline carries the
     same screen, so the visible cell count is the same everywhere */
  screen: { w: number; h: number; y: number; r: number };
  /* where the ears meet the shell */
  earX: number;
  /* screws on the face and on the back: x, y, the slot's angle */
  screws: Array<[number, number, number]>;
  backScrews: Array<[number, number, number]>;
  /** Signed distance to the outline inset by `inset` (negative inside). */
  sd: (x: number, y: number, inset: number) => number;
  /** Trace the outline inset by `inset` as a closed path. */
  path: (ctx: CanvasRenderingContext2D | Path2D, inset: number) => void;
}

const TAU = Math.PI * 2;

function makeShape(
  name: RobotHeadShape,
  centres: Array<[number, number]>,
  r: number,
  depth: number,
  /* the directions, from the middle, of the screws on the face and on the back */
  screwAt: number[],
  backScrewAt: number[],
): Shape {
  /* corners in order of angle round the middle: clockwise on screen */
  const pts = centres
    .map(([x, y]) => ({ x, y, t: Math.atan2(y, x) }))
    .sort((a, b) => a.t - b.t);
  const n = pts.length;
  /* each edge's outward normal angle */
  const edge: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    edge.push(Math.atan2(-(b.x - a.x), b.y - a.y));
  }
  const corners: Corner[] = pts.map((p, i) => {
    if (n === 1) return { x: p.x, y: p.y, a0: -Math.PI, a1: Math.PI };
    let a0 = edge[(i - 1 + n) % n];
    let a1 = edge[i];
    while (a1 < a0) a1 += TAU;
    return { x: p.x, y: p.y, a0, a1 };
  });

  const sdPoly = (x: number, y: number) => {
    if (n === 1) return Math.hypot(x - pts[0].x, y - pts[0].y);
    let d = Infinity;
    let inside = true;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const ex = b.x - a.x, ey = b.y - a.y;
      const px = x - a.x, py = y - a.y;
      const t = Math.max(0, Math.min(1, (px * ex + py * ey) / (ex * ex + ey * ey)));
      d = Math.min(d, Math.hypot(px - ex * t, py - ey * t));
      /* clockwise on screen: the inside is to the right of each edge */
      if (ex * py - ey * px < 0) inside = false;
    }
    return inside ? -d : d;
  };
  const sdOutline = (x: number, y: number, inset: number) => sdPoly(x, y) - (r - inset);
  const pathOutline = (ctx: CanvasRenderingContext2D | Path2D, inset: number) => {
    const rr = Math.max(0.0005, r - inset);
    corners.forEach((c, i) => {
      if (i === 0) ctx.moveTo(c.x + rr * Math.cos(c.a0), c.y + rr * Math.sin(c.a0));
      ctx.arc(c.x, c.y, rr, c.a0, c.a1);
    });
    ctx.closePath();
  };
  let hx = 0, hy = 0;
  for (const p of pts) {
    hx = Math.max(hx, Math.abs(p.x) + r);
    hy = Math.max(hy, Math.abs(p.y) + r);
  }
  /* The visor is a 156 × 64 capsule on the 192-wide grid the shell is measured
     in — a shape no inset of the shell's outline can be. So the screen layers
     (hole, gasket, glass) trace the capsule and everything else keeps tracing
     the outline. Scaled by this shell's width every outline carries the same
     visor, and because the LED pitch scales with it the visible cell count is
     the same too — the three cells read the same on all five shapes. */
  const visor = { w: SCREEN.w * 2 * hx, h: SCREEN.h * 2 * hx, y: SCREEN.y * 2 * hx, r: SCREEN.r * 2 * hx };
  const sdCap = (x: number, y: number, d: number) => {
    const dx = Math.abs(x) - (visor.w / 2 - visor.r + d);
    const dy = Math.abs(y - visor.y) - (visor.h / 2 - visor.r + d);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - visor.r + d;
  };
  const sd = (x: number, y: number, inset: number) =>
    inset >= INSET.hole ? sdCap(x, y, inset - INSET.hole) : sdOutline(x, y, inset);
  const path = (ctx: CanvasRenderingContext2D | Path2D, inset: number) => {
    if (inset >= INSET.hole) {
      const d = inset - INSET.hole;
      ctx.roundRect(
        -visor.w / 2 + d,
        visor.y - visor.h / 2 + d,
        Math.max(0.002, visor.w - 2 * d),
        Math.max(0.002, visor.h - 2 * d),
        Math.max(0.001, visor.r - d),
      );
      return;
    }
    pathOutline(ctx, inset);
  };
  /* the ears go where the outline crosses their height */
  let lo = 0, hi = hx + 0.1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (sd(mid, HEAD.earY, 0) < 0) lo = mid;
    else hi = mid;
  }
  /* a screw sits in the corner whose arc faces its way, at `inward` in from the outline */
  const place = (dirs: number[], inward: number) =>
    dirs.map((d, i): [number, number, number] => {
      const a = (d * Math.PI) / 180;
      const c = corners.find((k) => [a, a + TAU, a - TAU].some((x) => x >= k.a0 - 1e-6 && x <= k.a1 + 1e-6)) ?? corners[0];
      return [c.x + Math.cos(a) * (r - inward), c.y + Math.sin(a) * (r - inward), 0.5 + i * 0.9];
    });
  /* the pitch is the visor's own — eight rows of cells across it — so the grid
     the face is laid out on is the same on every shape */
  const pitch = visor.h / 8;
  return {
    name, r, depth, corners, hx, hy, pitch, screen: visor,
    earX: lo - 0.008,
    /* on the face: halfway between the lip round the hole and the rolled edge */
    screws: place(screwAt, (INSET.hole - 0.018 + INSET.plate) / 2),
    /* on the back: inside the panel line */
    backScrews: place(backScrewAt, INSET.plate + 0.07),
    sd, path,
  };
}

/* Where the visor sits, as a share of the shell's width: the mark's 156 × 64
   capsule on the 192-wide grid, two units below the shell's centre. Every shape
   scales this by its own width (see `makeShape`). */
export const SCREEN = { w: 0.8125, h: 0.3333, y: 0.0104, r: 0.1667 };

/* flat top and bottom, a point at either side */
const hexCentres = (a: number): Array<[number, number]> =>
  [0, 60, 120, 180, 240, 300].map((d) => [a * Math.cos((d * Math.PI) / 180), a * Math.sin((d * Math.PI) / 180)]);

const CORNERS = [45, 135];
const BACK_CORNERS = [-135, -45, 45, 135];

const SHAPES: Record<RobotHeadShape, () => Shape> = {
  rectangle: () => makeShape('rectangle', [[-0.29, -0.17], [0.29, -0.17], [0.29, 0.17], [-0.29, 0.17]], 0.21, 0.6, CORNERS, BACK_CORNERS),
  square: () => makeShape('square', [[-0.22, -0.22], [0.22, -0.22], [0.22, 0.22], [-0.22, 0.22]], 0.2, 0.6, CORNERS, BACK_CORNERS),
  circle: () => makeShape('circle', [[0, 0]], 0.46, 0.56, CORNERS, BACK_CORNERS),
  hexagon: () => makeShape('hexagon', hexCentres(0.35), 0.16, 0.58, [60, 120], [-120, -60, 60, 120]),
  /* GitSquad's own mark: 192 × 140 with a 52 radius on the 256 grid, so in head
     units (the shell's width is 1) the corner centres are ±0.229 / ±0.0935 and
     the radius is 0.271. No screws — the mark has none — and the fins arrive as
     their own parts, the way the ears do on the shapes above. Depth: the mark is
     a wide low shell, so a case half the depth of the TV is already chunky. */
  gitsquad: () => makeShape('gitsquad', [[-0.229, -0.0935], [0.229, -0.0935], [0.229, 0.0935], [-0.229, 0.0935]], 0.271, 0.42, [], []),
};

const shapeCache = new Map<RobotHeadShape, Shape>();
export function getShape(name: RobotHeadShape): Shape {
  let s = shapeCache.get(name);
  if (!s) {
    s = (SHAPES[name] ?? SHAPES.rectangle)();
    shapeCache.set(name, s);
  }
  return s;
}

/* ── meshes ──────────────────────────────────────────────────────────── */

function finish(pos: number[], quads: number[], vn: number[]): Mesh {
  const normals = new Float32Array((quads.length / 4) * 3);
  for (let q = 0; q < quads.length / 4; q++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 4; k++) {
      const i = quads[q * 4 + k] * 3;
      x += vn[i]; y += vn[i + 1]; z += vn[i + 2];
    }
    normals.set(norm(x, y, z), q * 3);
  }
  return { pos: new Float32Array(pos), quads: new Uint16Array(quads), normals };
}

/* rings × samples round a closed loop → quads between neighbouring rings */
function stitch(rings: number, samples: number, closed = true): number[] {
  const quads: number[] = [];
  const span = closed ? samples : samples - 1;
  for (let k = 0; k < rings - 1; k++) {
    for (let j = 0; j < span; j++) {
      const j2 = (j + 1) % samples;
      quads.push(k * samples + j, k * samples + j2, (k + 1) * samples + j2, (k + 1) * samples + j);
    }
  }
  return quads;
}

/** The shell's sides and its rolled edges, front and back (the flat faces are drawn as plates). */
export function buildBody(shape: Shape, bevelSteps = 10): Mesh {
  const R = shape.r, b = HEAD.bevel, zf = shape.depth / 2;
  /* the outline: each sample's corner centre and its outward normal */
  const outline: Array<[number, number, number, number]> = [];
  for (const c of shape.corners) {
    const sweep = c.a1 - c.a0;
    const steps = Math.max(2, Math.ceil((sweep / (Math.PI / 2)) * 14));
    /* a full circle closes on itself, so its last sample would repeat the first */
    const last = sweep >= TAU - 1e-6 ? steps - 1 : steps;
    for (let i = 0; i <= last; i++) {
      const a = c.a0 + (i / steps) * sweep;
      outline.push([c.x, c.y, Math.cos(a), Math.sin(a)]);
    }
  }
  /* the profile through the depth: back cap → back roll → side → front roll → front cap */
  const profile: Array<[number, number, number]> = [];
  for (let i = bevelSteps; i >= 0; i--) {
    const t = (i / bevelSteps) * (Math.PI / 2);
    profile.push([-zf + b - b * Math.sin(t), b * (1 - Math.cos(t)), -t]);
  }
  for (let i = 0; i <= bevelSteps; i++) {
    const t = (i / bevelSteps) * (Math.PI / 2);
    profile.push([zf - b + b * Math.sin(t), b * (1 - Math.cos(t)), t]);
  }
  const pos: number[] = [], vn: number[] = [];
  for (const [z, inset, t] of profile) {
    for (const [cx, cy, nx, ny] of outline) {
      pos.push(cx + (R - inset) * nx, cy + (R - inset) * ny, z);
      vn.push(nx * Math.cos(t), ny * Math.cos(t), Math.sin(t));
    }
  }
  return finish(pos, stitch(profile.length, outline.length), vn);
}

/**
 * A solid of revolution: `profile` is [radius, distance along the axis]
 * from `origin` outward, closing on the axis at its end.
 */
export function buildLathe(profile: Array<[number, number]>, origin: V3, axis: V3, segments = 36): Mesh {
  /* two directions across the axis */
  const e1: V3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e2 = norm(axis[1] * e1[2] - axis[2] * e1[1], axis[2] * e1[0] - axis[0] * e1[2], axis[0] * e1[1] - axis[1] * e1[0]);
  const pos: number[] = [], vn: number[] = [];
  for (let k = 0; k < profile.length; k++) {
    const [r, t] = profile[k];
    const prev = profile[Math.max(0, k - 1)], next = profile[Math.min(profile.length - 1, k + 1)];
    /* the profile's outward normal in (radial, axial) */
    const dr = next[0] - prev[0], dt = next[1] - prev[1];
    const l = Math.hypot(dr, dt) || 1;
    const nr = dt / l, na = -dr / l;
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * TAU;
      const rx = Math.cos(a) * e1[0] + Math.sin(a) * e2[0];
      const ry = Math.cos(a) * e1[1] + Math.sin(a) * e2[1];
      const rz = Math.cos(a) * e1[2] + Math.sin(a) * e2[2];
      pos.push(origin[0] + axis[0] * t + r * rx, origin[1] + axis[1] * t + r * ry, origin[2] + axis[2] * t + r * rz);
      vn.push(rx * nr + axis[0] * na, ry * nr + axis[1] * na, rz * nr + axis[2] * na);
    }
  }
  return finish(pos, stitch(profile.length, segments), vn);
}

/* a knob ear: a short collar sunk into the shell, a drum, a domed cap */
const EAR_PROFILE: Array<[number, number]> = [
  [0.06, -0.012], [0.068, 0], [0.074, 0.006], [0.08, 0.018], [0.084, 0.032], [0.084, 0.048],
  [0.079, 0.06], [0.068, 0.07], [0.052, 0.077], [0.032, 0.081], [0.014, 0.083], [0, 0.0835],
];

/* the antenna's collar on the top of the head */
const COLLAR_PROFILE: Array<[number, number]> = [
  [0.05, -0.012], [0.052, 0.006], [0.05, 0.016], [0.042, 0.024], [0.026, 0.029], [0.014, 0.031], [0, 0.032],
];

export interface HeadMeshes {
  body: Mesh;
  /* Upstream's knob ears, parked on every shape (see `headMeshes`). The
     GitSquad shell wore fins at the crown instead — also parked. Both sets are
     optional and the renderer guards. */
  earL: Mesh | null;
  earR: Mesh | null;
  finL: Mesh | null;
  finR: Mesh | null;
  collar: Mesh;
}

/* A prism: a flat polygon extruded through the depth, with a cap at either end.
   This is the shape the fins are, and the same thing `buildBody` does for the
   shell — one outline, four side quads, two plates. */
export function buildPrism(pts: Array<[number, number]>, zFront: number, zBack: number): Mesh {
  const n = pts.length;
  const pos: number[] = [];
  for (const z of [zFront, zBack]) for (const [x, y] of pts) pos.push(x, y, z);
  const front: number[] = [];
  for (let i = 0; i < n; i++) front.push(i);
  const back: number[] = [];
  for (let i = n - 1; i >= 0; i--) back.push(n + i);
  const sides: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sides.push(i, j, n + j, n + i);
  }
  return finish(pos, [...front, ...back, ...sides], pos.slice());
}

/* The GitSquad shell: 192 × 140 with a 52 radius in the mark's 256 grid, which
   in head units (the shell's width is 1) is centre ±0.229 / ±0.0935, r 0.271.
   The fins are the mark's own quad — outer edge vertical, inner edge at 60° —
   at 1/192 of the grid, extruded with the shell's depth. */
const GITSQUAD_FIN_L: Array<[number, number]> = [
  [-0.521, -0.552],
  [-0.396, -0.552],
  [-0.216, -0.240],
  [-0.521, -0.240],
];
const GITSQUAD_FIN_R: Array<[number, number]> = [
  [0.521, -0.552],
  [0.396, -0.552],
  [0.216, -0.240],
  [0.521, -0.240],
];

const meshCache = new Map<RobotHeadShape, HeadMeshes>();
export function headMeshes(shape: Shape): HeadMeshes {
  let m = meshCache.get(shape.name);
  if (!m) {
    const own = shape.name === 'gitsquad';
    /* Parked: the fins read as someone else's ears bolted to this head. The
       prisms and the outline below are kept so bringing them back is one line. */
    const FINS = false;
    /* Parked: upstream's knob ears. The GitSquad shell never had them, and the
       console now picks a shape at 28px where the outline is meant to be the
       whole difference — two knobs on four of the five outlines make them read
       as other robots. `EAR_PROFILE` and this line are kept for the same
       reason as the fins. */
    const EARS = false;
    const finZ = shape.depth / 2 - 0.008;
    m = {
      body: buildBody(shape),
      earL: EARS ? buildLathe(EAR_PROFILE, [-shape.earX, HEAD.earY, 0], [-1, 0, 0]) : null,
      earR: EARS ? buildLathe(EAR_PROFILE, [shape.earX, HEAD.earY, 0], [1, 0, 0]) : null,
      finL: own && FINS ? buildPrism(GITSQUAD_FIN_L, finZ, -finZ) : null,
      finR: own && FINS ? buildPrism(GITSQUAD_FIN_R, finZ, -finZ) : null,
      collar: buildLathe(COLLAR_PROFILE, [0, -shape.hy, 0], [0, -1, 0], 16),
    };
    meshCache.set(shape.name, m);
  }
  return m;
}
