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
// the substance — the rail is the scroll viewport rather than the document, and
// a tick sits where its entry actually is — so that is what this is.

/** Below this the rail is more furniture than help. */
const RAIL_MIN_ENTRIES = 4;

/** The slice of the scroller an entry has to be in to count as "here". */
const BAND_TOP = 0.12;
const BAND_BOTTOM = 0.4;

type EntryKind = "agent" | "user" | "event";

interface TimelineEntry {
  id: string;
  kind: EntryKind;
  author: string;
  type: IssueComment["type"];
  content: string;
  createdAt: string;
}

/** One tick: where it sits on the rail, and whether the reader is there. */
interface Tick {
  entry: TimelineEntry;
  y: number;
  here: boolean;
}

/** The DOM anchor a tick scrolls to. */
const anchorId = (id: string) => `activity-${id}`;

function toEntry(c: IssueComment): TimelineEntry {
  // A row the server wrote is an event however it was typed. `task.go` files
  // "queued a task" as `type: "comment"` with `author_type: "system"`, so
  // typing on `type` alone gave that row an author called "system" and set its
  // one sentence as if somebody had written it.
  const kind: EntryKind =
    c.type === "comment" && c.author_type !== "system"
      ? c.author_type === "agent"
        ? "agent"
        : "user"
      : "event";
  return {
    id: c.id,
    kind,
    author: c.author_name,
    type: c.type,
    content: c.content,
    createdAt: c.created_at,
  };
}

export function IssueTimeline({
  comments,
  scrollerRef,
}: {
  comments: IssueComment[];
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
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
      {entries.length >= RAIL_MIN_ENTRIES && (
        <TimelineRail entries={entries} scrollerRef={scrollerRef} />
      )}
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
 * Where you are in the feed, and a way to get somewhere else in it.
 *
 * The rail is the height of the **scroll viewport**, not of the thread, and
 * every tick is placed where its entry really is in the document. Both of those
 * are the point: an earlier version stacked one tick per entry in flow, so on a
 * thread of any length the rail grew to the height of the article and drew a
 * dashed line down the whole page — decoration, since a tick's position said
 * nothing about the entry it stood for.
 *
 * A tick in the band is drawn at full strength and the rest recede, so the rail
 * answers "where am I in this" as well as "take me there".
 *
 * The ticks are a roving focus: the rail is one tab stop and the arrows move
 * between ticks, because twenty comments would otherwise be twenty stops
 * between the feed and the composer.
 */
function TimelineRail({
  entries,
  scrollerRef,
}: {
  entries: TimelineEntry[];
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [rail, setRail] = useState<{ height: number; ticks: Tick[] }>({
    height: 0,
    ticks: [],
  });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const box = scroller.getBoundingClientRect();
      if (!box.height) return;

      const rects = entries.flatMap((entry) => {
        const node = document.getElementById(anchorId(entry.id));
        return node ? [{ entry, rect: node.getBoundingClientRect() }] : [];
      });
      if (rects.length === 0) return;

      // The rail stands for the feed, not for the page. Measuring against the
      // document put every tick wherever the feed happened to sit in it — the
      // whole rail's worth of offset, since the feed starts below the header
      // and the title.
      let spanTop = Infinity;
      let spanBottom = -Infinity;
      for (const { rect } of rects) {
        spanTop = Math.min(spanTop, rect.top);
        spanBottom = Math.max(spanBottom, rect.bottom);
      }
      const span = spanBottom - spanTop || 1;
      // As tall as the feed, and never taller than the reader's viewport: a
      // rail that grows with a long thread is a dashed line down the whole page.
      const height = Math.max(96, Math.min(box.height - 64, span));
      const bandTop = box.top + box.height * BAND_TOP;
      const bandBottom = box.top + box.height * BAND_BOTTOM;

      const ticks: Tick[] = rects.map(({ entry, rect }) => ({
        entry,
        y: Math.min(
          height - 10,
          Math.max(10, ((rect.top - spanTop) / span) * height),
        ),
        here: rect.bottom > bandTop && rect.top < bandBottom,
      }));

      // Measuring runs on every frame of a scroll, and almost every one of them
      // produces the same rail: the ticks are pinned to the document, so only
      // the band moves. Handing React the previous object back lets it skip the
      // render — the alternative is a state update per frame for a rail that
      // reads the same.
      setRail((prev) =>
        prev.height === height &&
        prev.ticks.length === ticks.length &&
        prev.ticks.every(
          (tick, i) => tick.y === ticks[i]?.y && tick.here === ticks[i]?.here,
        )
          ? prev
          : { height, ticks },
      );
    };

    // Measured one frame after the effect, never during it: the first frame
    // after a paint is the first one with geometry to read, and it keeps the
    // effect from setting state synchronously.
    frame = requestAnimationFrame(measure);
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(onScroll);
    resize.observe(scroller);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, [entries, scrollerRef]);

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
      // Sticky inside the feed's full height, but only ever as tall as the
      // reader's viewport.
      className="sticky top-4 w-5 shrink-0 self-start"
      style={{ height: rail.height || undefined }}
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
      {rail.ticks.map((tick, index) => (
        <button
          key={tick.entry.id}
          type="button"
          tabIndex={index === 0 ? 0 : -1}
          onClick={() => jump(tick.entry.id)}
          aria-label={`${
            tick.entry.kind === "event"
              ? "Update"
              : `Comment from ${tick.entry.author}`
          }, ${index + 1} of ${rail.ticks.length}`}
          title={tick.entry.content.replace(/[#*`>~]/g, "").slice(0, 120)}
          // The box is the tap target and is deliberately larger than the 2px
          // dash inside it: a rail you cannot hit is not a rail.
          style={{ top: tick.y }}
          className="group absolute right-0 flex size-5 -translate-y-1/2 items-center justify-center outline-none"
        >
          {/* Kind is not encoded in the dash: at two pixels tall, the
              difference between an agent and a person read as a rendering
              artifact. Position is what the rail is for, and colour is spent
              on it — where you are, and where the pointer is. */}
          <span
            className={cn(
              "h-0.5 rounded-full transition-all",
              tick.here
                ? "w-4 bg-ink"
                : "w-2.5 bg-hairline-strong group-hover:w-4 group-hover:bg-ink",
            )}
          />
        </button>
      ))}
    </div>
  );
}
