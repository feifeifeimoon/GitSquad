import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownMarkerAt, markerListName } from "./markdown-syntax.ts";

test("headings", () => {
  assert.deepEqual(markdownMarkerAt("# Title"), {
    block: { kind: "heading", level: 1 },
    length: 2,
  });
  assert.deepEqual(markdownMarkerAt("### Title"), {
    block: { kind: "heading", level: 3 },
    length: 4,
  });
  assert.deepEqual(markdownMarkerAt("###### Title"), {
    block: { kind: "heading", level: 6 },
    length: 7,
  });
  // Seven hashes is not a heading, and neither is a hash without its space.
  assert.equal(markdownMarkerAt("####### Title"), null);
  assert.equal(markdownMarkerAt("#Title"), null);
  assert.equal(markdownMarkerAt("#12345"), null);
});

test("lists", () => {
  assert.deepEqual(markdownMarkerAt("- one"), {
    block: { kind: "bulletList" },
    length: 2,
  });
  assert.deepEqual(markdownMarkerAt("* one"), {
    block: { kind: "bulletList" },
    length: 2,
  });
  assert.deepEqual(markdownMarkerAt("1. one"), {
    block: { kind: "orderedList", start: 1 },
    length: 3,
  });
  assert.deepEqual(markdownMarkerAt("12. one"), {
    block: { kind: "orderedList", start: 12 },
    length: 4,
  });
  assert.equal(markdownMarkerAt("-one"), null);
  assert.equal(markdownMarkerAt("1.one"), null);
});

test("quotes and fences", () => {
  assert.deepEqual(markdownMarkerAt("> quote"), {
    block: { kind: "blockquote" },
    length: 2,
  });
  assert.deepEqual(markdownMarkerAt("```"), {
    block: { kind: "codeBlock", language: "" },
    length: 3,
  });
  assert.deepEqual(markdownMarkerAt("```ts"), {
    block: { kind: "codeBlock", language: "ts" },
    length: 5,
  });
  // A fence only opens a block when it is the whole line.
  assert.equal(markdownMarkerAt("```const x = 1"), null);
});

test("markers only count at the start of the paragraph", () => {
  assert.equal(markdownMarkerAt("see # not a heading"), null);
  assert.equal(markdownMarkerAt("plain text"), null);
  assert.equal(markdownMarkerAt(""), null);
});

function listNameOf(text) {
  const marker = markdownMarkerAt(text);
  assert.ok(marker, `expected a marker in ${JSON.stringify(text)}`);
  return markerListName(marker);
}

test("only the two list markers name a list", () => {
  assert.equal(listNameOf("- one"), "bulletList");
  assert.equal(listNameOf("2. one"), "orderedList");
  assert.equal(listNameOf("# one"), null);
  assert.equal(listNameOf("> one"), null);
});
