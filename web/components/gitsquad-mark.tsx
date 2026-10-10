// The GitSquad mark — a robot head whose visor holds three marks, the squad.
//
// One path per colour, both filled: no strokes, no masks, no filters, so it
// stays crisp at 16 px and never needs a raster. The head draws in
// `currentColor` and the three marks take the link token, which is what makes
// the mark follow the theme the way every other token in the system does —
// ink with a blue visor on light, near-white with a lifted blue on dark.
//
// Decorative by default: it always sits beside the name, so the accessible name
// belongs to that text. Pass `title` only for a standalone use.
//
// The viewBox is the mark's own ink (28 28 200 184), not the masters' padded
// 256 square, so `size-*` is the mark and the box has no hidden margin to guess
// at — the same framing `app/icon.svg` uses. In a lockup the symbol reads at
// 2.17 × the wordmark's cap height; at 20 px that is a `size-6` mark beside
// 14 px text.
//
// Geometry is generated — see docs/brand/wip/heads.py and kitgen.py; the
// delivered masters are docs/brand/kit/gitsquad-symbol-*.svg.
const HEAD =
  "M 32.0 124.0 Q 32.0 72.0 84.0 72.0 L 172.0 72.0 Q 224.0 72.0 224.0 124.0 L 224.0 160.0 Q 224.0 212.0 172.0 212.0 L 84.0 212.0 Q 32.0 212.0 32.0 160.0 Z M 84.6 92.5 Q 86.6 96.0 82.6 96.0 L 32.0 96.0 Q 28.0 96.0 28.0 92.0 L 28.0 40.0 Q 28.0 36.0 32.0 36.0 L 48.0 36.0 Q 52.0 36.0 54.0 39.5 Z M 202.0 39.5 Q 204.0 36.0 208.0 36.0 L 224.0 36.0 Q 228.0 36.0 228.0 40.0 L 228.0 92.0 Q 228.0 96.0 224.0 96.0 L 173.4 96.0 Q 169.4 96.0 171.4 92.5 Z M 114.0 42.0 A 14.0 14.0 0 0 1 128.0 28.0 A 14.0 14.0 0 0 1 142.0 42.0 A 14.0 14.0 0 0 1 128.0 56.0 A 14.0 14.0 0 0 1 114.0 42.0 Z M 121.0 57.0 Q 121.0 52.0 126.0 52.0 L 130.0 52.0 Q 135.0 52.0 135.0 57.0 L 135.0 77.0 Q 135.0 82.0 130.0 82.0 L 126.0 82.0 Q 121.0 82.0 121.0 77.0 Z M 50.0 147.2 Q 50.0 176.0 78.8 176.0 L 177.2 176.0 Q 206.0 176.0 206.0 147.2 L 206.0 140.8 Q 206.0 112.0 177.2 112.0 L 78.8 112.0 Q 50.0 112.0 50.0 140.8 Z";
const MARKS =
  "M 60.0 136.0 Q 60.0 122.0 74.0 122.0 L 74.0 122.0 Q 88.0 122.0 88.0 136.0 L 88.0 152.0 Q 88.0 166.0 74.0 166.0 L 74.0 166.0 Q 60.0 166.0 60.0 152.0 Z M 114.0 136.0 Q 114.0 122.0 128.0 122.0 L 128.0 122.0 Q 142.0 122.0 142.0 136.0 L 142.0 152.0 Q 142.0 166.0 128.0 166.0 L 128.0 166.0 Q 114.0 166.0 114.0 152.0 Z M 168.0 136.0 Q 168.0 122.0 182.0 122.0 L 182.0 122.0 Q 196.0 122.0 196.0 136.0 L 196.0 152.0 Q 196.0 166.0 182.0 166.0 L 182.0 166.0 Q 168.0 166.0 168.0 152.0 Z";

export function GitSquadMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="28 28 200 184"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path fill="currentColor" d={HEAD} />
      <path className="fill-link" d={MARKS} />
    </svg>
  );
}

// The name, set as the identity's wordmark rather than as three words of copy:
// `Git` is the machine's voice and takes the mono face, `Squad` is the team's
// and stays in the sans. One word, so the two halves live in one element —
// wherever this sits in a `gap-*` flex row, the gap must not fall between them.
export function GitSquadWordmark() {
  return (
    <span><span className="font-mono">Git</span>Squad</span>
  );
}
