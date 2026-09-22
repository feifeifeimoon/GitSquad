"use client";

import { useEffect, useState } from "react";

// The sidebar's width, remembered.
//
// It was component state, so every reload snapped back to 240 and the drag
// handle was effectively a per-session adjustment. orca and multica both keep
// this; the difference between them is that multica also persists *open* state
// and documents why that is a trap — a collapse the viewport asked for would
// follow the reader into their next, wider session. Width has no such problem.
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 400;
const DEFAULT_WIDTH = 240;
const STORAGE_KEY = "gitsquad_sidebar_width";

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)));
}

function storedWidth(): number | null {
  if (typeof window === "undefined") return null;
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return clampSidebarWidth(raw);
}

export function useSidebarWidth(): [number, (width: number) => void] {
  // Lazy, so a remembered width is in place before the first paint rather than
  // arriving as a jump.
  const [width, setWidth] = useState<number>(() => storedWidth() ?? DEFAULT_WIDTH);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  return [width, setWidth];
}
