import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One labelled control or value, in every editing surface.
 *
 * The callers all wrote the same div and the same label classes by hand, ten
 * times over six files; the label rhythm and the textarea's focus treatment
 * could only drift apart that way.
 */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-caption text-mute">{label}</label>
      {children}
    </div>
  );
}

/**
 * Multiline input, styled from the same tokens as ui/input.tsx — the dialogs
 * used to hand-roll one with a grey background and no focus ring, sitting
 * directly above a real Input.
 */
export function TextArea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full min-w-0 resize-y rounded-sm border border-hairline bg-card px-3 py-2 text-copy text-ink transition-colors outline-none placeholder:text-mute focus-visible:border-hairline-strong focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}
