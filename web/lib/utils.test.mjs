import { test } from "node:test";
import assert from "node:assert/strict";
import { cn } from "./utils";

// tailwind-merge only knows Tailwind's own `text-sm`/`text-base` ramp. Our
// scale is named by role, so an unknown `text-label` used to be read as a
// colour and dropped the moment a real colour followed it — the settings
// section headings rendered at 16px and every empty-state title lost its step.
test("a role size and a text colour both survive the merge", () => {
  assert.equal(cn("text-label", "text-ink"), "text-label text-ink");
  assert.equal(cn("text-copy", "text-body"), "text-copy text-body");
  assert.equal(cn("text-title-sm", "text-ink"), "text-title-sm text-ink");
});

test("one role size still replaces another", () => {
  assert.equal(cn("text-copy", "text-title"), "text-title");
  assert.equal(cn("text-display", "text-micro"), "text-micro");
});
