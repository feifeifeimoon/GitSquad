// Key a generated image's background off, and cut the figures out.
//
// Two modes, and the difference between them is the whole point of this file:
//
//   SOLID="#ff00ff"  A background of one flat colour that appears nowhere on the
//                    figure. Exact, instant, no guessing — and the mode to *ask
//                    a generator for*. A JPEG cannot carry an alpha channel, but
//                    it can carry a colour nothing else uses.
//
//   (default)        A baked-in *checkerboard*, which is what generators draw
//                    when they mean transparent. It works, and this does it, but
//                    it is second best for a measured reason: the pattern's light
//                    square is pure white (255,255,255) and so is the robot's
//                    shell. Equal colours cannot be separated by any threshold,
//                    and JPEG noise takes away the pattern test that would
//                    otherwise do it — a loose neutrality eats the shell, a
//                    strict one keeps the squares. Prefer SOLID.
//
// Usage:
//   IMG=in.jpg OUT=out.png [SOLID="#ff00ff" CROPS="name,left,top,w,h ..."] \
//     node scripts/alpha-key.mjs

import sharp from "sharp";

const IMG = process.env.IMG;
const OUT = process.env.OUT;
const SOLID = (process.env.SOLID ?? "").trim();
const TOL = Number(process.env.TOL ?? 9);
const NEUTRAL = Number(process.env.NEUTRAL ?? 4);
const STEP_BAND = Number(process.env.STEP_BAND ?? 12);
const HOLE_MAX = Number(process.env.HOLE_MAX ?? 4000);

const { data, info } = await sharp(IMG).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

const hex = (s) => {
  const v = s.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const solid = SOLID ? hex(SOLID) : null;

/** The two tones of a checkerboard, measured rather than assumed. */
function tones() {
  const at = (x) => data[x * 4];
  const a = at(4);
  let b = a;
  for (let x = 1; x < Math.min(W, 200); x++) {
    if (Math.abs(at(x) - a) > 20) {
      b = at(x);
      break;
    }
  }
  return [Math.min(a, b), Math.max(a, b)];
}

/** The period, measured: the median gap between tone flips along the top row. */
function period() {
  const at = (x) => data[x * 4];
  const flips = [];
  let prev = at(0);
  for (let x = 1; x < Math.min(W, 420); x++) {
    const v = at(x);
    if (Math.abs(v - prev) > 20) flips.push(x);
    prev = v;
  }
  if (flips.length < 2) return 16;
  const gaps = [];
  for (let i = 1; i < flips.length; i++) gaps.push(flips[i] - flips[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

const [DARK_TONE, LIGHT_TONE] = solid ? [0, 0] : tones();
const PERIOD = solid ? 0 : period();

const alpha = new Uint8Array(W * H).fill(255);
let cleared = 0;

// A file that already carries a real alpha channel needs none of the above —
// only the crops. That is the case to aim for, and the reason SOLID beats the
// checkerboard: a generator that emits alpha directly makes this whole file a
// cropping tool.
const KEEP_ALPHA = !!process.env.KEEP_ALPHA;
if (KEEP_ALPHA) {
  for (let i = 0; i < W * H; i++) alpha[i] = data[i * 4 + 3];
}

for (let y = 0; y < H && !KEEP_ALPHA; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);

    if (solid) {
      // One colour, and that is the whole test. Nothing else in a render is
      // magenta, which is the entire reason to ask for it.
      const d = Math.abs(r - solid[0]) + Math.abs(g - solid[1]) + Math.abs(b - solid[2]);
      if (d <= Number(process.env.SOLID_TOL ?? 90)) {
        alpha[y * W + x] = 0;
        cleared++;
      }
      continue;
    }

    if (mx - mn > NEUTRAL) continue; // the figure is tinted; the grid is not
    // The whole band between the two tones, not just the tones: the seams where
    // a light square meets a dark one are anti-aliased to values in between, and
    // matching only the two flat greys leaves the *grid lines* behind.
    if (mx < DARK_TONE - TOL || mx > LIGHT_TONE + TOL) continue;
    // And the pattern has the last word, because colour runs out here: the rim
    // light spills blue over the squares next to the figure, so those remnants
    // are tinted and no neutrality strict enough to spare the shell accepts them.
    // A checkerboard changes by a *known* step one square away, on both axes.
    const right = x + PERIOD < W ? data[(y * W + x + PERIOD) * 4] : mx;
    const below = y + PERIOD < H ? data[((y + PERIOD) * W + x) * 4] : mx;
    const step = LIGHT_TONE - DARK_TONE;
    const alternates = (d) => Math.abs(Math.abs(d) - step) <= STEP_BAND;
    if (!alternates(mx - right) || !alternates(mx - below)) continue;
    alpha[y * W + x] = 0;
    cleared++;
  }
}

const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = data[i * 4];
  rgba[i * 4 + 1] = data[i * 4 + 1];
  rgba[i * 4 + 2] = data[i * 4 + 2];
  rgba[i * 4 + 3] = alpha[i];
}

// Fill the holes the key punched in the figure, and only those.
//
// A flat neutral white inside the robot matches the pattern's light tone, and the
// Inspector's magnifying lens disappeared to exactly that. What separates a lens
// from the gap between an arm and a torso is enclosure — both touch no border —
// so the deciding factor is size. A lens is small; that gap is not.
if (!KEEP_ALPHA) {
  const seen = new Uint8Array(W * H);
  let filled = 0;
  for (let start = 0; start < W * H; start++) {
    if (alpha[start] || seen[start]) continue;
    const region = [];
    const queue = [start];
    seen[start] = 1;
    let touchesBorder = false;
    while (queue.length) {
      const i = queue.pop();
      region.push(i);
      const x = i % W;
      const y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesBorder = true;
      const visit = (j) => {
        if (!alpha[j] && !seen[j]) {
          seen[j] = 1;
          queue.push(j);
        }
      };
      if (x > 0) visit(i - 1);
      if (x < W - 1) visit(i + 1);
      if (y > 0) visit(i - W);
      if (y < H - 1) visit(i + W);
    }
    if (!touchesBorder && region.length <= HOLE_MAX) {
      for (const i of region) rgba[i * 4 + 3] = 255;
      filled += region.length;
    }
  }
  console.log(`  filled ${filled}px of enclosed holes`);
}

await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(OUT);
console.log(
  `${IMG}: ${W}x${H}, ${solid ? `solid ${SOLID}` : `checker ${DARK_TONE}/${LIGHT_TONE} period ${PERIOD}`}, cleared ${((cleared / (W * H)) * 100).toFixed(0)}%`,
);

for (const spec of (process.env.CROPS ?? "").split(" ").filter(Boolean)) {
  const [name, left, top, width, height] = spec.split(",");
  const box = { left: +left, top: +top, width: +width, height: +height };
  const { data: cutData, info: cutInfo } = await sharp(rgba, {
    raw: { width: W, height: H, channels: 4 },
  })
    .extract(box)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const CW = cutInfo.width;
  const CH = cutInfo.height;

  // Keep the one figure this box was pointed at, drop whatever else came with
  // it. A box drawn around one robot on a sheet will clip its neighbours — an
  // ear, the top of a head below — and those slivers are *disconnected* from the
  // figure, which is the whole test. Without this the tight box below stretches
  // to reach them and the file ends up wider than the robot in it, which is how
  // a page ends up with a corner of somebody else's magnifier in it.
  const label = new Int32Array(CW * CH).fill(-1);
  let best = -1;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < CW * CH; start++) {
    if (label[start] !== -1 || cutData[start * 4 + 3] < 40) continue;
    const id = next++;
    const queue = [start];
    label[start] = id;
    let size = 0;
    while (queue.length) {
      const i = queue.pop();
      size++;
      const x = i % CW;
      const y = (i - x) / CW;
      const visit = (j) => {
        if (label[j] === -1 && cutData[j * 4 + 3] >= 40) {
          label[j] = id;
          queue.push(j);
        }
      };
      if (x > 0) visit(i - 1);
      if (x < CW - 1) visit(i + 1);
      if (y > 0) visit(i - CW);
      if (y < CH - 1) visit(i + CW);
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
  }
  let dropped = 0;
  for (let i = 0; i < CW * CH; i++) {
    if (label[i] !== -1 && label[i] !== best) {
      cutData[i * 4 + 3] = 0;
      dropped++;
    }
  }

  // And the tight box comes from what is left, so the file is the figure rather
  // than the rectangle it happened to be cut in.
  let x0 = CW;
  let y0 = CH;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      if (cutData[(y * CW + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const tight = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  await sharp(cutData, { raw: { width: CW, height: CH, channels: 4 } })
    .extract(tight)
    .png()
    .toFile(`${OUT.replace(/\.png$/, "")}-${name}.png`);
  console.log(
    `  ${name}: ${tight.width}x${tight.height}${dropped ? `, dropped ${dropped}px of neighbours` : ""}`,
  );
}
