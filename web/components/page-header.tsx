import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// The console's section header. Every list and section page draws it through
// one of these two so the title lands at the same height and weight wherever
// the sidebar navigates to — before this, half the pages drew a header rule and
// half floated the title on the page background, and settings used a different
// size again.
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
      <h1 className="text-sm font-medium text-ink">{title}</h1>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The same row while the page loads, so the title does not shift into place. */
export function PageHeaderSkeleton({ actions }: { actions?: ReactNode }) {
  return (
    <div className={ROW}>
      <Skeleton className="h-5 w-24" />
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
