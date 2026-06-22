import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const liveLog = readFileSync(
  new URL("../components/live-agent-log.tsx", import.meta.url),
  "utf8",
);

test("home page presents the GitSquad product shell", () => {
  assert.match(page, /Your autonomous developer team on GitHub/i);
  assert.match(
    page,
    /Git Squad is a collection of autonomous AI agents that live in your\s+repository/i,
  );
  assert.match(
    page,
    /They review code, fix bugs, and refactor architecture\s+while you sleep/i,
  );
  assert.match(page, /Squad control center/i);
  assert.match(page, /Issue blackboard/i);
  assert.match(page, /Install on GitHub/i);
  assert.match(page, /src="\/favicon.ico"/);
  assert.match(page, /alt="GitSquad logo"/);
  assert.match(page, /alt="GitSquad mark"/);
  assert.match(page, /size-14/);
  assert.doesNotMatch(page, /To get started, edit the page\.tsx file/i);
});

test("home page uses requested agent identities and icons", () => {
  assert.match(page, /🔍/u);
  assert.match(page, /🏗️/u);
  assert.match(page, /🧹/u);
  assert.match(page, /⚡/u);
  assert.match(page, /The Janitor/);
});

test("live agent log rotates one row every three seconds", () => {
  assert.match(liveLog, /"use client"/);
  assert.match(liveLog, /setInterval/);
  assert.match(liveLog, /3000/);
  assert.match(liveLog, /Identified pattern for code duplication in \/ui/);
  assert.match(liveLog, /Cleaning up stale branches older than 30 days/);
});

test("root metadata is branded for GitSquad", () => {
  assert.match(layout, /GitSquad/);
  assert.doesNotMatch(layout, /Create Next App/);
});
