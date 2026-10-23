import { test } from "node:test";
import assert from "node:assert/strict";
import { countPrs, filterPrs, prHasDiff, prInFilter, selectedPr } from "./pr-list.ts";

const prs = [
  { id: "a", state: "open" },
  { id: "b", state: "open" },
  { id: "c", state: "merged" },
  { id: "d", state: "closed" },
];

test("Closed means closed or merged, the way GitHub's tab does", () => {
  assert.deepEqual(
    filterPrs(prs, "closed").map((p) => p.id),
    ["c", "d"],
  );
  assert.equal(prInFilter({ state: "merged" }, "open"), false);
  assert.equal(prInFilter({ state: "open" }, "closed"), false);
});

test("the All tab keeps every state", () => {
  assert.deepEqual(
    filterPrs(prs, "all").map((p) => p.id),
    ["a", "b", "c", "d"],
  );
});

test("counts come from the whole list, not the filtered slice", () => {
  assert.deepEqual(countPrs(prs), { open: 2, closed: 2, all: 4 });
  assert.deepEqual(countPrs([]), { open: 0, closed: 0, all: 0 });
});

test("the peek falls back to the first row when nothing is selected", () => {
  assert.equal(selectedPr(prs, null), "a");
});

test("a selection that the current tab removed falls back to the first row", () => {
  assert.equal(selectedPr(filterPrs(prs, "closed"), "a"), "c");
  assert.equal(selectedPr([], "a"), null);
});

test("a rename or a binary change still has a size worth showing", () => {
  // GitHub reports zero added and removed lines for both; only the file count
  // says something changed.
  assert.equal(prHasDiff({ additions: 0, deletions: 0, changed_files: 3 }), true);
  assert.equal(prHasDiff({ additions: 5, deletions: 0, changed_files: 0 }), true);
  assert.equal(prHasDiff({ additions: 0, deletions: 0, changed_files: 0 }), false);
});
