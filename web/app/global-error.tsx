"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * The last resort: a crash outside any route group — the login and landing
 * pages, or the root layout itself, which has no shell to fall back into.
 *
 * It replaces the root layout, so it carries its own <html> and <body> and can
 * rely on nothing but the stylesheet.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app crashed outside the console", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-page text-ink antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-error-soft text-destructive">
            <TriangleAlert className="size-5" />
          </span>
          <h1 className="text-title font-semibold">GitSquad didn&apos;t load</h1>
          <p className="max-w-md text-copy text-body">
            Something failed before the console could start. Reloading is
            usually enough; if it is not, the failure is not on your side.
          </p>
          {error.digest && (
            <p className="font-mono text-micro text-mute">ref {error.digest}</p>
          )}
          <button
            onClick={reset}
            className="mt-1 h-8 rounded-sm bg-primary px-3 text-copy font-medium text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
