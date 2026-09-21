"use client";

import { Suspense, lazy, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import type { MarkdownEditor as MarkdownEditorImpl } from "@/components/markdown-editor";

// The editor carries the whole ProseMirror/TipTap graph with it, which is the
// single largest chunk the app ships. A board only needs it once someone opens
// the create dialog, and an issue page only once someone types, so the import
// is deferred to first render rather than paid for by the route.
const Editor = lazy(() =>
  import("@/components/markdown-editor").then((m) => ({
    default: m.MarkdownEditor,
  })),
);

/**
 * The editor with a placeholder that occupies the box it is about to fill.
 *
 * Lazy rather than next/dynamic because the fallback needs the caller's
 * className: the sizing lives on the editor's inner content element, so a
 * fallback without it would collapse and the real editor would then push the
 * layout down as it arrived.
 */
export function MarkdownEditor({
  className,
  ...props
}: ComponentProps<typeof MarkdownEditorImpl>) {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className={cn("tiptap-content", className)} />
        </div>
      }
    >
      <Editor className={className} {...props} />
    </Suspense>
  );
}
