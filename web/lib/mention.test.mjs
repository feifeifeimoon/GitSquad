import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionQueryAt } from "./mention.ts";

test("mention query detection", () => {
  assert.equal(mentionQueryAt("please fix @"), "");
  assert.equal(mentionQueryAt("please fix @cod"), "cod");
  assert.equal(mentionQueryAt("please fix @coder"), "coder");
  assert.equal(mentionQueryAt("@coder"), "coder");
  assert.equal(mentionQueryAt("please fix"), null);
  assert.equal(mentionQueryAt("please fix @cod er"), null);
  assert.equal(mentionQueryAt("a@b.com"), null);
});

test("mention query accepts names in any script", () => {
  assert.equal(mentionQueryAt("请让 @"), "");
  assert.equal(mentionQueryAt("请让 @首席"), "首席");
  assert.equal(mentionQueryAt("@首席架构师"), "首席架构师");
  assert.equal(mentionQueryAt("@首席架构师 please"), null);
});
