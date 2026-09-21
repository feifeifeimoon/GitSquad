"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// The stylesheet already collapses durations, but a timer that swaps content is
// motion the cascade cannot reach — it has to be stopped in the component. This
// is the query for that.
//
// Read through useSyncExternalStore rather than an effect: the server has no
// matchMedia, so the first client render must agree with the server's answer,
// and the real value arrives on the store's first read.
function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const getSnapshot = (): boolean => window.matchMedia(QUERY).matches;
const getServerSnapshot = (): boolean => false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
