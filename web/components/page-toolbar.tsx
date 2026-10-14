import type { ReactNode } from "react";

// The console's page chrome: the toolbar a page owns, and the section headings
// inside it.
//
// The title used to be here, and it moved up into the bar above the page. The
// bar is where Vercel puts it, and it is the only place that can hold it: the
// bar also holds the scope switcher, so the two things that answer "where am I"
// — which workspace, which page — are read in one line instead of two, and the
// title stops scrolling away on the long pages.
//
// What is left down here is what belongs to the page rather than to the
// destination: its search field, its filters, its create button.
const ROW = "flex items-center justify-end gap-3 border-b border-hairline px-8 py-4";

/**
 * The page's own toolbar, under the bar.
 *
 * Renders nothing when the page has no actions, so a page with nothing to put
 * here starts at the top of the content area instead of under an empty row.
 */
export function PageToolbar({ actions }: { actions?: ReactNode }) {
  if (!actions) return null;
  return (
    <div className={ROW}>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

/** The same row while the page loads, so nothing shifts when it lands. */
export function PageToolbarSkeleton({ actions }: { actions?: ReactNode }) {
  if (!actions) return null;
  return (
    <div className={ROW}>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

/**
 * A titled section inside a page. Semibold at label size reads as a divider
 * between blocks without competing with the page's own title in the bar, which
 * is what "Activity" and "Runtimes" are for.
 */
export function SectionHeading({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-3 flex min-h-6 items-center justify-between gap-3 ${className ?? ""}`}
    >
      <h2 className="text-label font-semibold text-ink">{children}</h2>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
