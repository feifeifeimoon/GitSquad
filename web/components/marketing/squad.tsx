import Image from "next/image";

// The squad, scattered through the hero's margins — and this time it is artwork
// made for the job rather than cut out of something else.
//
// `docs/assets/banner.png` is a flattened render with no alpha, and every figure
// taken off it kept a few percent of the background it stood in front of — worst
// where a white robot stood against a white UI panel, which no threshold
// separates. These three are generated renders **with a real alpha channel**:
// nothing to key, and nothing lost at the edges.
//
// The three are chosen for what tells them apart at a glance, because an earlier
// pass cut them all as chest-up portraits and three heads under the same cap is
// one figure repeated. **The hats differ in the artwork itself** — a cap, a white
// helmet, a hard hat — and so do the props: a magnifying glass, a multimeter, a
// clipboard. Cutting a little below the waist is what keeps the props; cutting at
// the chin takes them with it and leaves exactly the sameness this set exists to
// avoid.
//
// The hover is a gesture, not the work — a render is one flat layer with no
// magnifier inside it to sweep. **And a different gesture each**: one lift shared
// by three figures reads as one figure, which is the same mistake one size of
// crop made.
//
// The layer and each figure are `aria-hidden`: it is a picture of the product's
// idea, and the prose above it already says the same thing in words. `hidden
// xl:block`, because below 1280px the content column stops leaving a margin wide
// enough for a figure.

const SQUAD: {
  src: string;
  doing: string;
  hover: string;
  x: number;
  y: number;
  width: number;
  w: number;
  h: number;
}[] = [
  // The display widths are solved from the **head**, not the crop: the three
  // figures are drawn at the same scale, but their crops are framed differently
  // (one carries an antenna, one is not cut as close), so equal widths render
  // equal heads at three different sizes. Measuring the head in each file and
  // dividing a target into it is what makes them read as one squad.
  {
    src: "/robots/v2/inspector.png",
    doing: "hunting a bug",
    hover: "group-hover/robot:animate-[robot-sweep_2.4s_ease-in-out_infinite]",
    x: 1,
    y: 104,
    width: 155,
    w: 435,
    h: 499,
  },
  {
    src: "/robots/v2/tester.png",
    doing: "checking the build",
    hover: "group-hover/robot:animate-[robot-nod_1.8s_ease-in-out_infinite]",
    x: 85,
    y: 142,
    width: 156,
    w: 512,
    h: 588,
  },
  {
    src: "/robots/v2/planner.png",
    doing: "drawing a screen",
    hover: "group-hover/robot:animate-[robot-lift_1.6s_ease-in-out_infinite]",
    x: 5,
    y: 336,
    width: 155,
    w: 437,
    h: 498,
  },
];

export function Squad() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden select-none xl:block"
    >
      {SQUAD.map((worker) => (
        <span
          key={worker.doing}
          className="group/robot pointer-events-auto absolute flex flex-col items-center gap-1.5"
          style={{ left: `${worker.x}%`, top: worker.y, width: worker.width }}
        >
          <Image
            src={worker.src}
            alt=""
            width={worker.w}
            height={worker.h}
            sizes={`${worker.width}px`}
            className={`relative h-auto w-full drop-shadow-[0_12px_20px_rgba(6,16,41,0.18)] ${worker.hover}`}
          />
          <span className="relative flex h-6 items-center rounded-full border border-hairline bg-canvas px-2.5 font-mono text-micro whitespace-nowrap text-body shadow-level-1">
            {worker.doing}
          </span>
        </span>
      ))}
    </div>
  );
}
