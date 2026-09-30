// The eyebrow → headline → lead stack every band on the marketing page opens
// with. Linear and Vercel both hold this shape constant and vary only the
// contents, which is what lets a reader who has scrolled past two bands still
// know where the next one starts.
//
// The eyebrow is a `caption` label in uppercase, the one place the design
// system allows it outside the sidebar.

export function SectionHeading({
  eyebrow,
  title,
  lead,
  className = "",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-2xl text-center ${className}`}>
      <p className="font-mono text-caption uppercase tracking-[0.2em] text-mute">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-pretty text-base leading-7 text-body">{lead}</p>
      )}
    </div>
  );
}
