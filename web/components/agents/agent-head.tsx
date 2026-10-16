"use client";

import { TvHead } from "@/components/tv-head";
import { headShapeOf } from "@/lib/agent-shape";
import { HEAD_STATE, type AgentStatus } from "@/lib/agent-status";

// An agent's face in the console: the hero's own robot (the mark's shape, the
// vendor's colours) at row scale, its visor carrying what the agent is doing.
//
// One component owns the mapping, so the roster, the picker and the empty state
// cannot drift apart — `HEAD_STATE` lives in lib/agent-status.ts with the status
// vocabulary it belongs to.
//
// It is decoration and it says so: the written status sits beside it in the row
// (the dot and the word DESIGN.md asks for), so the head is `aria-hidden` —
// twenty canvases called "Robot, working" would be twenty redundant readings of
// a sentence already on screen.
//
// Motion is a signal too. A head with work in it is left to the vendor's own
// life; one with nothing to do gets `paused`, which is a still frame *and* no
// subscription to the shared ticker at all — that is what keeps a thirty-row
// roster cheap, and it is why `idle` here is still rather than breathing.

const AT_WORK: readonly AgentStatus[] = ["running", "queued"];

export function AgentHead({
  shape,
  status = "idle",
  size = 28,
  interactive = false,
  antenna = false,
  floorShadow = false,
  paused,
  className,
}: {
  /** The agent's `head_shape`; anything unknown falls back to the mark. */
  shape?: string | null;
  status?: AgentStatus;
  size?: number;
  /** The row's heads follow nothing and hop on nothing: they are not controls. */
  interactive?: boolean;
  /** Upstream asks for this off at list sizes; the empty state keeps it. */
  antenna?: boolean;
  floorShadow?: boolean;
  /** Defaults to "nothing to do". */
  paused?: boolean;
  className?: string;
}) {
  const resolved = headShapeOf(shape);
  const state = HEAD_STATE[status];

  return (
    <TvHead
      shape={resolved}
      state={state}
      size={size}
      interactive={interactive}
      antenna={antenna}
      floorShadow={floorShadow}
      paused={paused ?? !AT_WORK.includes(status)}
      aria-hidden="true"
      data-head-state={state}
      data-head-shape={resolved}
      className={className}
    />
  );
}
