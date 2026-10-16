import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_HEAD_SHAPE,
  HEAD_SHAPES,
  HEAD_SHAPE_LABEL,
  headShapeOf,
} from "./agent-shape.ts";

test("an unknown token falls back to the mark", () => {
  // The column is a plain text column: a value from a newer server, a typo in a
  // hand-edit, or nothing at all must not blank an agent's face out.
  assert.equal(headShapeOf(undefined), "gitsquad");
  assert.equal(headShapeOf(null), "gitsquad");
  assert.equal(headShapeOf(""), "gitsquad");
  assert.equal(headShapeOf("pentagon"), "gitsquad");
  assert.equal(headShapeOf("Circle"), "gitsquad");
});

test("every pickable shape resolves to itself", () => {
  for (const shape of HEAD_SHAPES) {
    assert.equal(headShapeOf(shape), shape);
  }
});

test("every pickable shape is labelled, and the default is pickable", () => {
  for (const shape of HEAD_SHAPES) {
    assert.ok(HEAD_SHAPE_LABEL[shape], `${shape} has no label`);
  }
  assert.equal(DEFAULT_HEAD_SHAPE, "gitsquad");
  assert.ok(HEAD_SHAPES.includes(DEFAULT_HEAD_SHAPE));
});

test("the picker offers exactly what the renderer knows", () => {
  // Two lists, one meaning: a name missing here can never be picked, and a name
  // here that the renderer does not know falls back to `rectangle` inside
  // RobotHead — silently, and never on purpose. The vendored file is read as
  // text: importing it would pull React and the whole head into this test.
  const source = readFileSync(
    new URL("../vendor/robot-heads/RobotHead.tsx", import.meta.url),
    "utf8",
  );
  const line = source
    .split("\n")
    .find((l) => l.includes("export const robotHeadShapes"));
  assert.ok(line, "robotHeadShapes not found in the vendored renderer");
  const known = [...line.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...HEAD_SHAPES].sort(), known.sort());
});
