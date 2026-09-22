"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * The handful of things you do *to* an issue rather than *with* it.
 *
 * They are icon buttons in the page's top-right corner, which is where Linear
 * puts them and what the eye already reads as "actions on this thing". They
 * were a labelled list in the details rail, where they sat underneath the facts
 * and read as two more facts — and the rail is for what the issue *is*, not for
 * what you can do to it.
 *
 * Icon-only means the label has to survive somewhere else: it is the tooltip
 * and the accessible name. The key is what gets copied most in practice — it is
 * what goes into a commit message or a chat — so it keeps a button of its own
 * rather than hiding behind "copy link" with a modifier.
 *
 * The labels name the thing rather than the act — "Copy issue URL" and "Copy
 * issue ID". With two copy buttons, "Copy" says nothing about which one you
 * want, so the words that help are the ones after it. The id's icon was a `#` at
 * first and that reads as a hashtag; nothing about it said "the issue's id",
 * which is its whole job.
 */
export function IssueActions({
  issueKey,
  url,
}: {
  issueKey: string;
  url: string;
}) {
  const [copied, setCopied] = useState<"link" | "key" | null>(null);

  const copy = async (which: "link" | "key", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // The clipboard API needs a secure context; over plain http on a LAN
      // address it is simply not there.
      toast.error("This browser will not give the page the clipboard");
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <ActionButton
        label={copied === "link" ? "Copied" : "Copy issue URL"}
        copied={copied === "link"}
        onClick={() => copy("link", url)}
      >
        <Link2 className="size-4" />
      </ActionButton>
      <ActionButton
        label={copied === "key" ? "Copied" : "Copy issue ID"}
        copied={copied === "key"}
        onClick={() => copy("key", issueKey)}
      >
        <Copy className="size-4" />
      </ActionButton>
    </div>
  );
}

function ActionButton({
  label,
  copied,
  onClick,
  children,
}: {
  label: string;
  copied: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-md transition-colors",
        copied ? "text-success" : "text-mute hover:bg-muted hover:text-ink",
      )}
    >
      {copied ? <Check className="size-4" /> : children}
    </button>
  );
}
