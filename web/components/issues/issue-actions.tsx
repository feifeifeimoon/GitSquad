"use client";

import { useState } from "react";
import { Check, Hash, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * The handful of things you do *to* an issue rather than *with* it.
 *
 * Both references put these where you can see them — orca keeps a labelled
 * Actions card in the rail rather than hiding them in a menu, and the useful
 * one there is not "copy link" but "copy prompt": the issue as a handoff
 * payload. This is the smaller version of that idea, and the issue key is the
 * part that matters most in practice: it is what you paste into a commit
 * message or a chat.
 */
export function IssueActions({
  issueKey,
  url,
}: {
  issueKey: string;
  url: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // The clipboard API needs a secure context; over plain http on a LAN
      // address it is simply not there.
      toast.error("This browser will not give the page the clipboard");
    }
  };

  return (
    <div className="space-y-0.5">
      <ActionRow
        icon={<Link2 className="size-3.5 shrink-0 text-mute" />}
        label="Copy link"
        copied={copied === "link"}
        onClick={() => copy("link", url)}
      />
      <ActionRow
        icon={<Hash className="size-3.5 shrink-0 text-mute" />}
        label={`Copy ${issueKey}`}
        copied={copied === "key"}
        onClick={() => copy("key", issueKey)}
      />
    </div>
  );
}

function ActionRow({
  icon,
  label,
  copied,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-label transition-colors",
        copied ? "text-mute" : "text-body hover:bg-muted hover:text-ink",
      )}
    >
      {copied ? (
        <Check className="size-3.5 shrink-0 text-success" />
      ) : (
        icon
      )}
      {copied ? "Copied" : label}
    </button>
  );
}
