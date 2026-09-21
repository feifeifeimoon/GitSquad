"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A read that failed, said out loud.
 *
 * Without this a failed request looked exactly like a successful one with no
 * data: the cache returns no value, the page falls back to its empty state, and
 * the reader is told "no issues yet" by a server that never answered. The two
 * are different facts and the screen has to distinguish them.
 */
export function ErrorState({
  what,
  error,
  onRetry,
  className,
}: {
  /** What could not be loaded, phrased for the reader: "this workspace". */
  what: string;
  error: Error;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hairline px-6 py-12 text-center ${className ?? ""}`}
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-error-soft text-destructive">
        <TriangleAlert className="size-5" />
      </span>
      <div className="max-w-sm">
        <p className="text-copy font-medium text-ink">
          Couldn&apos;t load {what}
        </p>
        <p className="mt-1 text-label text-body">{error.message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
