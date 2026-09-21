import Link from "next/link";

/** A URL that matches no route. Quiet, and offers the one place worth going. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page px-6 text-center">
      <p className="font-mono text-caption uppercase tracking-wide text-mute">
        404
      </p>
      <h1 className="text-title font-semibold text-ink">Nothing here</h1>
      <p className="max-w-md text-copy text-body">
        This address does not match a page. The workspace list is the way back.
      </p>
      <Link
        href="/workspaces"
        className="mt-1 inline-flex h-8 items-center rounded-sm bg-primary px-3 text-copy font-medium text-primary-foreground"
      >
        Go to workspaces
      </Link>
    </div>
  );
}
