"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { SegmentedControl, type SegmentedItem } from "@/components/segmented-control";

export type ViewMode = "cards" | "list";

const VIEW_ITEMS: ReadonlyArray<SegmentedItem<ViewMode>> = [
  { value: "cards", label: "Cards", icon: LayoutGrid },
  { value: "list", label: "List", icon: List },
];

function storedView(storageKey: string): ViewMode | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem(storageKey);
  return saved === "list" || saved === "cards" ? saved : null;
}

/**
 * The cards/list choice, remembered per page.
 *
 * A view preference is not server data, so it lives in localStorage rather than
 * going near the API. The first render reads it lazily, so a remembered choice
 * is in place before paint and never flashes the default.
 */
export function useViewMode(
  storageKey: string,
  fallback: ViewMode = "cards",
): [ViewMode, (view: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(
    () => storedView(storageKey) ?? fallback,
  );

  useEffect(() => {
    localStorage.setItem(storageKey, view);
  }, [storageKey, view]);

  return [view, setView];
}

/** The two-up toggle, shared by every list page. */
export function ViewSwitcher({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <SegmentedControl
      label="Layout"
      iconOnly
      items={VIEW_ITEMS}
      value={view}
      onChange={onChange}
    />
  );
}
