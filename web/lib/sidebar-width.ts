"use client";

import { useCallback, useSyncExternalStore } from "react";

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

/**
 * The width, as a value the server and the client can both produce.
 *
 * It used to be a lazy `useState` initializer that read localStorage during the
 * first client render. The server has no localStorage, so it rendered 240 and
 * the client rendered whatever was stored — a hydration mismatch, which React
 * reports and then answers by throwing away the server's markup for the tree it
 * was hydrating. The console's whole shell was rendered twice on every load.
 *
 * `useSyncExternalStore` is the shape that cannot do that: the server snapshot
 * is the default, the client snapshot is the stored width, and React asks for
 * them separately on purpose. The difference lands as one re-render during
 * hydration, with no complaint, which is the same moment the old mismatch
 * resolved itself anyway.
 *
 * A module-level store rather than React state because the drag writes it from
 * an event handler and the snapshot has to be readable outside a render.
 */
let width: number | null = null;
const listeners = new Set<() => void>();

function storedWidth(): number | null {
  if (typeof window === "undefined") return null;
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return clampSidebarWidth(raw);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readWidth(): number {
  width ??= storedWidth() ?? DEFAULT_WIDTH;
  return width;
}

/** What the server renders: the default, since it has nowhere to remember. */
function serverWidth(): number {
  return DEFAULT_WIDTH;
}

export function useSidebarWidth(): [number, (width: number) => void] {
  const current = useSyncExternalStore(subscribe, readWidth, serverWidth);

  // Written where it changes rather than in an effect on every render: the
  // initial value is the default, and persisting the default is not a decision
  // anybody made.
  const setWidth = useCallback((next: number) => {
    width = clampSidebarWidth(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      // A full or blocked storage must not break the drag.
    }
    for (const listener of listeners) listener();
  }, []);

  return [current, setWidth];
}
