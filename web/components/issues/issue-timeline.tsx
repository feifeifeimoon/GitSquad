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

/** What the preview card says about one entry. */
function preview(entry: TimelineEntry): string {
  return entry.content
    .replace(/[#*`>~[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

/** The DOM anchor a tick scrolls to. */
const anchorId = (id: string) => `activity-${id}`;

/** The rail's preview card, named so a focused tick can describe itself with it. */
const RAIL_PREVIEW_ID = "activity-rail-preview";

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
 * The shape is multica's `ThreadMinimap`, which is the same problem solved the
 * same way: the rail is **the scroll viewport** — centred in it, ticks evenly
 * pitched, spacing shrinking as the thread grows rather than the rail growing
 * with it. Two earlier versions got this wrong in different directions. The
 * first stacked one tick per entry in flow, so a long thread drew a dashed line
 * down the whole page. The second mapped each entry's document position onto a
 * viewport-tall rail, which is a minimap of the feed but not of anything the
 * reader is looking at: measured on a six-entry issue it floated from y=323 to
 * y=785 beside a 900px window, unrelated to the page's edges, and its length
 * still grew with the thread.
 *
 * What a tick is *for* here is jumping, so hovering one shows what it leads to.
 * Without the card the rail is a row of identical dashes and every jump is
 * blind; multica's version opens a scrollable outline of the whole thread, and
 * a card with the one entry under the pointer is the part of that which fits
 * this rail's width.
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
  const [rail, setRail] = useState<{
    height: number;
    here: string[];
    offset: number;
  }>({ height: 0, here: [], offset: 0 });
  // The entry the pointer (or focus) is on, and how far down the rail its tick
  // sits — the card is a caption for one tick, so it points at that tick.
  const [hovered, setHovered] = useState<{
    entry: TimelineEntry;
    top: number;
  } | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const box = scroller.getBoundingClientRect();
      if (!box.height) return;

      const bandTop = box.top + box.height * BAND_TOP;
      const bandBottom = box.top + box.height * BAND_BOTTOM;
      let spanTop = Infinity;
      let spanBottom = -Infinity;
      const here = entries.flatMap((entry) => {
        const node = document.getElementById(anchorId(entry.id));
        if (!node) return [];
        const rect = node.getBoundingClientRect();
        spanTop = Math.min(spanTop, rect.top);
        spanBottom = Math.max(spanBottom, rect.bottom);
        return rect.bottom > bandTop && rect.top < bandBottom ? [entry.id] : [];
      });
      if (!Number.isFinite(spanTop)) return;
      // As tall as the reader's viewport, or as the feed when the whole thread
      // already fits — a rail taller than the thread it describes is a pointer
      // to nothing.
      const height = Math.max(96, Math.min(box.height, spanBottom - spanTop));

      // A sticky element only starts sticking once its own top reaches the
      // scroller's, so until then a rail taller than the window hangs off the
      // bottom of it and a centred cluster sits a header-and-description below
      // the middle. Half the distance still to travel is the correction, and it
      // is zero the moment the rail is pinned — and zero for a rail the whole
      // thread already fits inside, which never gets cut off in the first place.
      const railBox = railRef.current?.getBoundingClientRect();
      const cutOff = railBox ? railBox.bottom - (box.top + box.height) : 0;
      const offset =
        railBox && cutOff > 0
          ? -Math.round(Math.max(0, railBox.top - box.top) / 2)
          : 0;

      // Measuring runs on every frame of a scroll and almost always produces
      // the same answer — only the band moves — so handing React the previous
      // value back lets it skip the render.
      setRail((prev) =>
        prev.height === height &&
        prev.offset === offset &&
        prev.here.length === here.length &&
        prev.here.every((id, i) => id === here[i])
          ? prev
          : { height, here, offset },
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

  /**
   * Where a tick sits on the rail, for the card that captions it.
   *
   * Read off screen rectangles rather than `offsetTop`: the tick's offsetParent
   * is the transformed cluster rather than the rail, so `offsetTop` answers a
   * question measured from the wrong origin.
   */
  const spot = (
    event: React.FocusEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>,
    entry: TimelineEntry,
  ) => {
    const railBox = railRef.current?.getBoundingClientRect();
    const box = event.currentTarget.getBoundingClientRect();
    return {
      entry,
      top: railBox ? box.top - railBox.top + box.height / 2 : 0,
    };
  };

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
      // Sticky so the rail stays the reader's, not the article's: pinned while
      // the thread it belongs to is on screen, and never taller than the
      // scroller's viewport.
      className="sticky top-0 flex w-5 shrink-0 flex-col justify-center self-start py-4"
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
      <div
        className="flex max-h-full flex-col overflow-hidden"
        style={{ transform: `translateY(${rail.offset}px)` }}
      >
        {entries.map((entry, index) => {
          const here = rail.here.includes(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              tabIndex={index === 0 ? 0 : -1}
              onClick={() => jump(entry.id)}
              onPointerEnter={(event) => setHovered(spot(event, entry))}
              onPointerLeave={() => setHovered(null)}
              onFocus={(event) => setHovered(spot(event, entry))}
              onBlur={() => setHovered(null)}
              aria-describedby={
                hovered?.entry.id === entry.id ? RAIL_PREVIEW_ID : undefined
              }
              aria-label={`${
                entry.kind === "event"
                  ? "Update"
                  : `Comment from ${entry.author}`
              }, ${index + 1} of ${entries.length}`}
              // Shrinkable rather than fixed: past the point where a tick each
              // fits the rail, flex compresses the pitch instead of overflowing
              // it. The box is the tap target and is deliberately taller than
              // the dash inside it.
              className="flex min-h-[5px] w-5 flex-[0_1_0.875rem] cursor-pointer items-center justify-end outline-none"
            >
              {/* Kind is not encoded in the dash: at two pixels tall, the
                  difference between an agent and a person read as a rendering
                  artifact. Colour is spent on position instead — where you are,
                  and where the pointer is. */}
              <span
                className={cn(
                  "h-0.5 origin-right rounded-full transition-[width,background-color] duration-100 ease-out",
                  here ? "w-4 bg-ink" : "w-2.5 bg-hairline-strong",
                  hovered?.entry.id === entry.id && "w-5 bg-ink",
                )}
              />
            </button>
          );
        })}
      </div>

      {/* What the tick under the pointer leads to. The rail is otherwise a row
          of identical dashes and every jump is a guess. */}
      {hovered && (
        <div
          id={RAIL_PREVIEW_ID}
          role="tooltip"
          // Kept inside the rail: a card anchored to the first or last tick
          // would otherwise hang half out of it.
          style={{
            top: Math.min(
              Math.max(hovered.top, 60),
              Math.max(60, rail.height - 60),
            ),
          }}
          className="pointer-events-none absolute right-6 z-10 w-72 -translate-y-1/2 rounded-lg border border-hairline bg-canvas p-3 shadow-level-4"
        >
          <p className="flex items-center gap-2 text-caption text-mute">
            <span className="truncate font-medium text-body">
              {hovered.entry.kind === "agent"
                ? `@${hovered.entry.author}`
                : hovered.entry.author}
            </span>
            <TimeAgo iso={hovered.entry.createdAt} className="shrink-0" />
          </p>
          <p className="mt-1.5 line-clamp-4 text-copy text-body">
            {preview(hovered.entry)}
          </p>
        </div>
      )}
    </div>
  );
}
