"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

/** A 404 is a fact about the address; anything else is a fact about the moment. */
export function isNotFound(error: Error): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * A read that failed, said out loud.
 *
 * Without this a failed request looked exactly like a successful one with no
 * data: the cache returns no value, the page falls back to its empty state, and
 * the reader is told "no issues yet" by a server that never answered. The two
 * are different facts and the screen has to distinguish them.
 *
 * `notFoundHref` matters more than it looks. The console reads an unknown first
 * path segment as a workspace slug, so a mistyped URL arrives here as a 404 —
 * and offering "Try again" for something that will never exist is a dead end.
 * With a destination, that case gets a way out instead.
 */
export function ErrorState({
  what,
  error,
  onRetry,
  notFoundHref,
  notFoundLabel = "Go back",
  className,
}: {
  /** What could not be loaded, phrased for the reader: "this workspace". */
  what: string;
  error: Error;
  onRetry?: () => void;
  /** Where to send the reader when the thing simply does not exist. */
  notFoundHref?: string;
  notFoundLabel?: string;
  className?: string;
}) {
  const missing = isNotFound(error);

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
          {missing ? `No such ${what}` : `Couldn't load ${what}`}
        </p>
        <p className="mt-1 text-label text-body">{error.message}</p>
      </div>
      {missing && notFoundHref ? (
        <Button size="sm" variant="outline" asChild>
          <Link href={notFoundHref}>{notFoundLabel}</Link>
        </Button>
      ) : (
        !missing &&
        onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )
      )}
    </div>
  );
}
