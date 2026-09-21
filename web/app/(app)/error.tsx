"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * What a crashed page looks like inside the console.
 *
 * Placed in this route group rather than at the root so the sidebar survives:
 * one page failing is not a reason to take the navigation away from whoever was
 * using it. Next remounts the segment when the route changes, so navigating
 * away from the broken page resets this without a reload.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The console has no error reporter wired up; until it does, the browser
    // console is where a digest can be matched against a server log.
    console.error("console page crashed", error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-error-soft text-destructive">
        <TriangleAlert className="size-5" />
      </span>
      <div className="max-w-md">
        <h1 className="text-title-sm font-semibold text-ink">
          Something broke on this page
        </h1>
        <p className="mt-1 text-copy text-body">
          The rest of the console still works — try again, or pick another page
          from the sidebar.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-micro text-mute">
            ref {error.digest}
          </p>
        )}
      </div>
      <Button size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
