"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bot, GitBranch, User } from "lucide-react";
import type { IssueComment } from "@/lib/api";
import { Markdown } from "@/components/markdown";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";

// The activity on an issue, and a rail to move through it.
//
// Two things were wrong with the flat comment list this replaces. It rendered
// every entry the same way, so a status change written by the server appeared
// as a comment from an author called "system" — the data distinguishes them
// (`author_type`, `type`) and the UI flattened it. And a long feed had no way
// through it except scrolling.
//
// multica's version of the rail is 551 lines: a Dock-style proximity
// magnification wave driven by rAF and direct style writes, 150ms intent and
// grace delays, markdown flattened into preview cards. The part worth having is
// the substance — one tick per entry, the viewport position visible, clicking
// one goes there — so that is what this is.

/** Below this the rail is more furniture than help. */
const RAIL_MIN_ENTRIES = 4;

type EntryKind = "agent" | "user" | "event";

interface TimelineEntry {
  id: string;
  kind: EntryKind;
  author: string;
  type: IssueComment["type"];
  content: string;
  createdAt: string;
}

/** The DOM anchor a tick scrolls to. */
const anchorId = (id: string) => `activity-${id}`;

function toEntry(c: IssueComment): TimelineEntry {
  const kind: EntryKind =
    c.type === "comment" ? (c.author_type === "agent" ? "agent" : "user") : "event";
  return {
    id: c.id,
    kind,
    author: c.author_name,
    type: c.type,
    content: c.content,
    createdAt: c.created_at,
  };
}

export function IssueTimeline({ comments }: { comments: IssueComment[] }) {
  // Oldest first, and left that way: `ListCommentsByIssue` orders by
  // `created_at ASC`, which is the order a timeline means — the server writes
  // "queued a task" before the agent answers. The composer sits below the feed,
  // so the newest entry is the one nearest to where you write.
  const entries = useMemo(() => comments.map(toEntry), [comments]);

  if (entries.length === 0) {
    return <p className="text-copy text-mute">No activity yet.</p>;
  }

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        {entries.map((entry) => (
          <TimelineRow key={entry.id} entry={entry} />
        ))}
      </div>
      {entries.length >= RAIL_MIN_ENTRIES && <TimelineRail entries={entries} />}
    </div>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "event") {
    return (
      <div
        id={anchorId(entry.id)}
        className="flex scroll-mt-6 items-center gap-2 py-1.5 text-caption text-mute"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {entry.type === "status_change" ? (
            <GitBranch className="size-3" />
          ) : (
            <Activity className="size-3" />
          )}
        </span>
        {/* The server writes these as whole sentences, so they are text, not
            markdown — and they read as a log line rather than as somebody
            speaking. */}
        <span className="min-w-0 flex-1 truncate">{entry.content}</span>
        <TimeAgo iso={entry.createdAt} className="shrink-0" />
      </div>
    );
  }

  return (
    <div id={anchorId(entry.id)} className="flex scroll-mt-6 gap-3 py-2">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          entry.kind === "agent"
            ? "bg-link-bg-soft text-link-deep"
            : "bg-canvas-soft-2 text-body",
        )}
      >
        {entry.kind === "agent" ? (
          <Bot className="size-3.5" />
        ) : (
          <User className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-copy font-medium text-ink">
            {entry.kind === "agent" ? `@${entry.author}` : entry.author}
          </span>
          <TimeAgo iso={entry.createdAt} className="text-caption text-mute" />
        </div>
        <div className="mt-1.5 text-copy text-body">
          <Markdown>{entry.content}</Markdown>
        </div>
      </div>
    </div>
  );
}

/**
 * One tick per entry, down the right edge of the feed.
 *
 * A tick in the viewport is drawn at full strength and the rest recede, so the
 * rail answers "where am I in this" as well as "take me there".
 *
 * The ticks are a roving focus: the rail is one tab stop and the arrows move
 * between ticks, because twenty comments would otherwise be twenty stops
 * between the feed and the composer.
 */
function TimelineRail({ entries }: { entries: TimelineEntry[] }) {
  const [inView, setInView] = useState<string[]>([]);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nodes = entries
      .map((e) => document.getElementById(anchorId(e.id)))
      .filter((n): n is HTMLElement => n !== null);
    if (nodes.length === 0) return;

    // The band is the upper-middle of the viewport: an entry counts as "here"
    // once it is comfortably in view rather than the moment a pixel of it is.
    const observer = new IntersectionObserver(
      (records) => {
        setInView((prev) => {
          const next = new Set(prev);
          for (const record of records) {
            if (record.isIntersecting) next.add(record.target.id);
            else next.delete(record.target.id);
          }
          return [...next];
        });
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [entries]);

  const jump = useCallback((id: string) => {
    document
      .getElementById(anchorId(id))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const move = (from: number, delta: number) => {
    const ticks = railRef.current?.querySelectorAll<HTMLButtonElement>("button");
    if (!ticks?.length) return;
    const next = Math.min(ticks.length - 1, Math.max(0, from + delta));
    ticks[next]?.focus();
  };

  return (
    <div
      ref={railRef}
      role="group"
      aria-label="Jump to an entry in the activity"
      className="w-6 shrink-0"
      onKeyDown={(event) => {
        const ticks = [...(railRef.current?.querySelectorAll("button") ?? [])];
        const index = ticks.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(index, 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(index, -1);
        } else if (event.key === "Home") {
          event.preventDefault();
          move(index, -index);
        } else if (event.key === "End") {
          event.preventDefault();
          move(index, ticks.length);
        }
      }}
    >
      <div className="sticky top-2 flex flex-col items-center gap-1 py-1">
        {entries.map((entry, index) => {
          const here = inView.includes(anchorId(entry.id));
          return (
            <button
              key={entry.id}
              type="button"
              tabIndex={index === 0 ? 0 : -1}
              onClick={() => jump(entry.id)}
              aria-label={`${entry.kind === "event" ? "Update" : `Comment from ${entry.author}`}, ${index + 1} of ${entries.length}`}
              title={entry.content.replace(/[#*`>~]/g, "").slice(0, 120)}
              // The box is the tap target and is deliberately larger than the
              // 2px dash inside it: a rail you cannot hit is not a rail.
              className="group flex size-6 items-center justify-center outline-none"
            >
              {/* Kind is not encoded in the dash: at two pixels tall the
                  difference between an agent and a person read as a rendering
                  artifact. Position is what the rail is for, and color is spent
                  on it — where you are, and where the pointer is. */}
              <span
                className={cn(
                  "h-0.5 rounded-full transition-all",
                  here
                    ? "w-5 bg-ink"
                    : "w-3 bg-hairline-strong group-hover:w-5 group-hover:bg-ink",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
