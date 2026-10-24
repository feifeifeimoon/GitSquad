"use client";

import { useId } from "react";

// The trend line that sits beside a headline figure. It is deliberately not the
// chart below: at this size the shape is the whole message, so there is no axis,
// no gridlines and no interaction.
//
// Gaps are gaps. A bucket with no runs has no success rate, and plotting it as
// zero would draw a cliff that never happened. Contiguous runs of values become
// separate paths, so the line simply stops and starts again.

const WIDTH = 100;
const HEIGHT = 32;
const PAD = 3;

interface Point {
  x: number;
  y: number;
}

export function Sparkline({
  values,
  domain,
  area = false,
  className,
}: {
  /** One value per bucket; null means there was nothing to measure. */
  values: Array<number | null>;
  /** A fixed range — rates use [0, 1] so 85% sits high — or 0..max by default. */
  domain?: [number, number];
  /** Fill under the line with a fade, for a headline rather than a card. */
  area?: boolean;
  className?: string;
}) {
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const known = values.filter((v): v is number => v !== null);
  const base = (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    />
  );
  if (known.length === 0) return base;

  const [low, high] = domain ?? [0, Math.max(...known, 1)];
  const span = high - low;
  const yOf = (v: number) =>
    span === 0
      ? HEIGHT / 2
      : HEIGHT - PAD - ((v - low) / span) * (HEIGHT - PAD * 2);
  const xOf = (i: number) =>
    values.length <= 1 ? WIDTH / 2 : (i / (values.length - 1)) * WIDTH;

  const segments: Point[][] = [];
  let current: Point[] = [];
  values.forEach((value, i) => {
    if (value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: xOf(i), y: yOf(value) });
  });
  if (current.length > 0) segments.push(current);

  const line = (points: Point[]) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  // A closed shape down to the baseline, so the fill has something to sit on.
  const fill = (points: Point[]) => {
    if (points.length < 2) return null;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    return `${line(points)} L${last.x.toFixed(2)},${HEIGHT} L${first.x.toFixed(2)},${HEIGHT} Z`;
  };

  // The newest reading, marked so the line has a "here". A circle would be
  // stretched by preserveAspectRatio="none"; a one-dimensional tick is not.
  const lastIndex = values.reduce<number>(
    (last, value, i) => (value === null ? last : i),
    -1,
  );
  const lastPoint =
    lastIndex >= 0 && values[lastIndex] !== null
      ? { x: xOf(lastIndex), y: yOf(values[lastIndex] as number) }
      : null;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      {area && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {area &&
        segments.map((points, i) => {
          const d = fill(points);
          return d ? <path key={`f${i}`} d={d} fill={`url(#${gradientId})`} /> : null;
        })}
      {segments.map((points, i) => (
        <path
          key={`l${i}`}
          d={line(points)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {lastPoint && (
        <path
          d={`M${lastPoint.x.toFixed(2)},${lastPoint.y - 2.5}V${lastPoint.y + 2.5}`}
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
