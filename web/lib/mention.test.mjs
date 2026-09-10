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
