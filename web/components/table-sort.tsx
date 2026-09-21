"use client";

import { useCallback, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/**
 * The header cell every console table shares.
 *
 * Sentence case, no mono: a column heading is a label, and reserving the
 * monospace family and the uppercase treatment for identifiers and code is what
 * keeps them meaning something when they do appear.
 */
export const TH_CLASS =
  "px-4 py-2 text-left text-caption font-medium text-mute";

/**
 * Column sorting for a list page.
 *
 * Clicking the active column reverses it; a fresh column starts the way it is
 * usually read, which is A-to-Z for names and newest-first for dates. `textKey`
 * is the one column that is not a date.
 */
export function useSort<K extends string>(initial: SortState<K>, textKey: K) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const toggle = useCallback(
    (key: K) => {
      setSort((current) =>
        current.key === key
          ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
          : { key, dir: key === textKey ? "asc" : "desc" },
      );
    },
    [textKey],
  );

  return { sort, toggle };
}

/** A sortable column: its label, and the arrow while it is the active one. */
export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  /** Match the column's cells — a right-aligned cell needs a right-aligned head. */
  align?: "left" | "right";
}) {
  return (
    <th className={cn(TH_CLASS, align === "right" && "text-right")}>
      <button
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 text-mute transition-colors hover:text-ink"
      >
        {label}
        {sort.key === column &&
          (sort.dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          ))}
      </button>
    </th>
  );
}
