import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// The console's page chrome. Every list and section page draws its header
// through these so the title lands at the same place and weight wherever the
// sidebar navigates to.
//
// The title carries the size: it is the one thing on the page that should read
// before anything else. A section heading is a step down (SectionHeading), and
// body text a step below that — three levels, rather than the two sizes the
// console used to have, where a page title and a sidebar item were identical.
const ROW =
  "flex items-center justify-between gap-3 border-b border-hairline px-8 py-4";

export function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className={ROW}>
      <h1 className="text-title font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h1>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The same row while the page loads, so the title does not shift into place. */
export function PageHeaderSkeleton({ actions }: { actions?: ReactNode }) {
  return (
    <div className={ROW}>
      <Skeleton className="h-7 w-28" />
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * A titled section inside a page — one level below PageHeader. Semibold at
 * label size reads as a divider between blocks without competing with the
 * page title, which is what "Activity" and "Runtimes" are for.
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
