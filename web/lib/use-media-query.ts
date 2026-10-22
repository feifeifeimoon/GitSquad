"use client";

import { useSyncExternalStore } from "react";

// Whether the window is at least this wide. The console has one layout below
// `lg` and another above it, and the PR page's peek is the only place a
// component has to *behave* differently rather than just restyle: an aside
// cannot exist on a narrow screen, so the same content becomes a dialog.
//
// `useSyncExternalStore` rather than state-in-an-effect, for the reason the
// shell's platform check uses it: the media query is an external store, the
// server has no opinion, and reading it through this hook avoids a render pass
// that paints the wrong layout first. The server snapshot says "narrow" — the
// page renders its loading skeleton at that point, so nothing is painted in the
// wrong shape before hydration.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
