// Which robot an agent is.
//
// The five outlines the vendored renderer knows, in the order the picker draws
// them: our mark first, then the four plain ones. The column stores a token, and
// a token the app does not know — an old row, a value from a newer server — must
// not blank an agent's face out, so the fallback is the mark as well.

import type { RobotHeadShape } from "@/vendor/robot-heads/types";

/** Also the column's default: every agent is the hero's own head until picked. */
export const DEFAULT_HEAD_SHAPE: RobotHeadShape = "gitsquad";

export const HEAD_SHAPES: readonly RobotHeadShape[] = [
  "gitsquad",
  "square",
  "circle",
  "hexagon",
  "rectangle",
];

export const HEAD_SHAPE_LABEL: Record<RobotHeadShape, string> = {
  gitsquad: "GitSquad",
  square: "Square",
  circle: "Circle",
  hexagon: "Hexagon",
  rectangle: "Rectangle",
};

export function headShapeOf(value: string | null | undefined): RobotHeadShape {
  return HEAD_SHAPES.includes(value as RobotHeadShape)
    ? (value as RobotHeadShape)
    : DEFAULT_HEAD_SHAPE;
}
