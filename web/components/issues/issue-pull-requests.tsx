"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, GitPullRequest } from "lucide-react";
import { Issue, PullRequest, issueApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";
import { toast } from "sonner";

/** The colour of a PR's state, in one place rather than a chain of ternaries. */
const STATE_CLASS: Record<PullRequest["state"], string> = {
  merged: "text-emerald-600 dark:text-emerald-400",
  closed: "text-mute",
  open: "text-amber-600 dark:text-amber-400",
};

/** One PR row: the state colour, number, title and the link out to GitHub. */
function PullRequestRow({
  pr,
  onUnlink,
  onRestore,
}: {
  pr: PullRequest;
  onUnlink?: (pr: PullRequest) => void;
  onRestore?: (pr: PullRequest) => void;
}) {
  const stateClass = STATE_CLASS[pr.state] ?? STATE_CLASS.open;
  return (
    <div className="flex items-start gap-2 text-copy" data-testid={`pull-request-${pr.number}`}>
      <GitPullRequest className={`mt-0.5 size-3.5 shrink-0 ${stateClass}`} />
      <div className="min-w-0 flex-1">
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate hover:underline"
          title={pr.title}
        >
          <span className="font-mono text-caption text-mute">#{pr.number}</span> {pr.title}
        </a>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={`font-mono text-[11px] ${stateClass}`}>
            {pr.draft ? "draft" : pr.state}
          </span>
          {pr.suppressed && (
            <span className="font-mono text-[11px] text-mute">unlinked</span>
          )}
        </div>
      </div>
      {!pr.suppressed && onUnlink && (
        <button
          type="button"
          onClick={() => onUnlink(pr)}
          className="shrink-0 text-[11px] text-mute hover:text-body"
          title="Unlink this pull request"
        >
          unlink
        </button>
      )}
      {pr.suppressed && onRestore && (
        <button
          type="button"
          onClick={() => onRestore(pr)}
          className="shrink-0 text-[11px] text-mute hover:text-body"
          title="Link this pull request again"
        >
          restore
        </button>
      )}
    </div>
  );
}

/**
 * The issue's pull requests: the one it is working on, and the history of how
 * it got here.
 *
 * At most one PR is active at a time; the rest are merged, closed, or unlinked
 * by hand. Unlinking is a tombstone rather than a delete, so the PR stays in the
 * history and no automatic linking brings it back.
 */
export function IssuePullRequests({
  slug,
  issue,
  onChange,
}: {
  slug: string;
  issue: Issue;
  onChange: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  const all = issue.pull_requests ?? [];
  const active = all.filter((pr) => !pr.suppressed && pr.active);
  const history = all.filter((pr) => !active.includes(pr));
  const shown = showHistory ? history : history.slice(0, 2);

  // Returns whether it worked, so callers can decide what a success means —
  // clearing a form input, for instance, must not happen on failure.
  const act = async (fn: () => Promise<unknown>, message: string): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      onChange();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label="Pull requests">
      <div className="space-y-2">
        {active.map((pr) => (
          <PullRequestRow
            key={pr.id}
            pr={pr}
            onUnlink={(p) =>
              act(
                () => issueApi.unlinkPullRequest(slug, issue.issue_key, p.id),
                `Unlinked #${p.number}`,
              )
            }
          />
        ))}
        {active.length === 0 && (
          <p className="text-copy text-body">No pull request yet.</p>
        )}

        {history.length > 0 && (
          <div className="space-y-2 border-t border-hairline pt-2">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-mute hover:text-body"
            >
              {showHistory ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              History ({history.length})
            </button>
            {shown.map((pr) => (
              <PullRequestRow
                key={pr.id}
                pr={pr}
                onRestore={(p) =>
                  act(
                    () => issueApi.restorePullRequest(slug, issue.issue_key, p.id),
                    `Restored #${p.number}`,
                  )
                }
              />
            ))}
          </div>
        )}

        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ref.trim() || busy) return;
            // Keep what the user pasted when the link is refused — the refusal
            // is usually about a different PR, and retyping a URL is a tax on an
            // error they did not make.
            act(
              () => issueApi.linkPullRequest(slug, issue.issue_key, ref.trim()),
              "Linked the pull request",
            ).then((linked) => {
              if (linked) setRef("");
            });
          }}
        >
          <Input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Link a pull request: paste a URL or number"
            className="h-8 text-caption"
            disabled={busy}
          />
          <Button type="submit" size="sm" variant="outline" disabled={!ref.trim() || busy}>
            Link
          </Button>
        </form>
        {active.length > 0 && (
          <p className="text-[11px] text-mute">
            One active pull request at a time. To start a new line of work, close the
            current one.
          </p>
        )}
      </div>
    </Field>
  );
}

/** The board's compact form: a PR badge, shown only when there is one. */
export function IssuePullRequestBadge({ issue }: { issue: Issue }) {
  if (!issue.active_pr_number) return null;
  return (
    <Badge variant="outline" className="gap-1 font-mono text-[10px]">
      <GitPullRequest className="size-3" />#{issue.active_pr_number}
    </Badge>
  );
}
