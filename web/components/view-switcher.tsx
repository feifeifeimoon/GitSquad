"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";

export type ViewMode = "cards" | "list";

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
  const item = (v: ViewMode, Icon: typeof LayoutGrid, label: string) => (
    <button
      onClick={() => onChange(v)}
      title={label}
      aria-label={`${label} view`}
      className={`flex size-7 items-center justify-center rounded-sm transition-colors ${
        view === v ? "bg-muted text-ink" : "text-mute hover:text-ink"
      }`}
    >
      <Icon className="size-3.5" />
    </button>
  );
  return (
    <div className="flex items-center rounded-sm border border-hairline bg-canvas p-0.5">
      {item("cards", LayoutGrid, "Cards")}
      {item("list", List, "List")}
    </div>
  );
}
