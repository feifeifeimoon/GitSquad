"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { TvHead } from "@/components/marketing/tv-head";
import type { RobotHeadState } from "@/vendor/robot-heads/types";

// The hero's head, and the picker for what it is doing.
//
// Upstream draws nine states — nine faces, nine poses, and a light in the
// antenna for each. This is the control that reaches them: hover the head and a
// panel lifts, the way an account-status picker works, and a row holds the face
// there until you pick another.
//
// It carried an automatic layer first — a greeting on load, states following the
// pointer down the hero, a sleep after thirty seconds of being ignored, a hop on
// the way to the buttons. That went: a reader who wants a particular face now
// says so, and the head's own life (it follows the pointer, it blinks, it hops
// every 4–8 seconds) is upstream's, not a script of ours. What is left is a
// control, and a control should be one thing.
//
// There is no animation code here at all: `happy` hops with a full spin and
// `sleeping` shuts its eyes inside the component, so a state is the whole API.

const OPEN_AFTER = 220; // hover before the panel lifts
const HOLD_FOR = 260; // grace for moving from the head down onto the panel

/* Where a chosen state is remembered, beside the other preferences this browser
   already keeps (the sidebar's width, the theme). Read through
   `useSyncExternalStore` rather than in an effect: the server has no
   localStorage, so its snapshot is null and the client's is the stored value,
   which React reconciles without a hydration mismatch. */
const HELD_KEY = "gitsquad.hero.state";

const STATES: Array<[RobotHeadState, string, string]> = [
  ["idle", "🟢", "Idle"],
  ["thinking", "🤔", "Thinking"],
  ["searching", "🔍", "Searching"],
  ["listening", "👂", "Listening"],
  ["speaking", "💬", "Speaking"],
  ["working", "⚙️", "Working"],
  ["happy", "😄", "Happy"],
  ["error", "⚠️", "Error"],
  ["sleeping", "😴", "Sleeping"],
];

const listeners = new Set<() => void>();

function subscribeHeld(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readHeld(): RobotHeadState | null {
  const saved = window.localStorage.getItem(HELD_KEY);
  return saved && STATES.some(([name]) => name === saved) ? (saved as RobotHeadState) : null;
}

const noHeld = () => null;

export function HeroHead({ size = 210 }: { size?: number }) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const held = useSyncExternalStore(subscribeHeld, readHeld, noHeld);

  const choose = useCallback((next: RobotHeadState) => {
    window.localStorage.setItem(HELD_KEY, next);
    listeners.forEach((listener) => listener());
    setOpen(false);
  }, []);

  const enter = () => {
    window.clearTimeout(closeTimer.current);
    openTimer.current = window.setTimeout(() => setOpen(true), OPEN_AFTER);
  };
  const leave = () => {
    window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), HOLD_FOR);
  };

  return (
    <div
      className="relative mb-3"
      onPointerEnter={enter}
      onPointerLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      {/* A real button: the head is a control here, so it has to be reachable
          without a pointer and to say what it opens. */}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="What the mark is doing"
        onClick={() => setOpen((was) => !was)}
        className="block cursor-pointer rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <TvHead size={size} shape="gitsquad" state={held ?? "idle"} />
      </button>

      {open ? (
        <div
          role="group"
          aria-label="What the mark is doing"
          className="absolute left-1/2 top-full z-50 w-max -translate-x-1/2 rounded-md border border-hairline bg-canvas p-1 shadow-level-4"
        >
          <div className="grid grid-cols-3 gap-0.5">
            {STATES.map(([name, glyph, label]) => {
              const selected = (held ?? "idle") === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => choose(name)}
                  aria-pressed={selected}
                  className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-copy transition-colors ${
                    selected ? "bg-muted text-ink" : "text-body hover:bg-muted hover:text-ink"
                  }`}
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {glyph}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
