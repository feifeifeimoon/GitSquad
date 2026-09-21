import { cn } from "@/lib/utils";

// Identity, not a placeholder. An uploaded image when there is one, and
// otherwise a monogram tinted from the name.
//
// It used to fall back to the GitSquad logo, so every agent and every workspace
// without a picture wore the product's own face: two agents in a list were
// indistinguishable, and the reader learned nothing from the column. A tinted
// monogram is the same amount of work and actually says who this is.
//
// The tints are the theme's soft/ink pairs, so each one is legible in both
// themes without a second palette to maintain.
const TINTS = [
  "bg-link-bg-soft text-link-deep",
  "bg-violet-soft text-violet",
  "bg-cyan-soft text-cyan-deep",
  "bg-warning-soft text-warning-deep",
  "bg-canvas-soft-2 text-body",
];

function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TINTS[hash % TINTS.length];
}

export function WorkspaceAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      // A data URL cannot be optimised by next/image, so this stays an <img>.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        className={cn("shrink-0 rounded-sm object-cover", className)}
      />
    );
  }

  const initials = name.trim().slice(0, 2) || "?";

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        // A container, so the initials can be sized against the box the caller
        // asked for rather than against a font size that has to be guessed for
        // a 16px chip and a 56px dialog alike.
        "@container flex shrink-0 select-none items-center justify-center overflow-hidden rounded-sm font-semibold uppercase",
        tintFor(name),
        className,
      )}
    >
      <span className="text-[40cqw] leading-none">{initials}</span>
    </span>
  );
}
