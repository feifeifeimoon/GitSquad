// Relative time formatting shared across console pages. Returns a short
// human-friendly label (e.g. "5m ago", "2d ago") and falls back to a full
// date for anything older than four weeks.
//
// `now` is an argument rather than a Date.now() call inside so a caller that
// already holds a clock reading can pass it down — a label is only ever as
// fresh as the value that produced it. Callers without a clock get the current
// time, which is what a one-shot format wants.
export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "never";
  const diff = now - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
