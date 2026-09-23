import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SLASH_COMMANDS,
  filterSlashCommands,
  groupSlashCommands,
  slashQueryAt,
} from "./slash-commands.ts";

test("slash query detection", () => {
  assert.equal(slashQueryAt("/"), "");
  assert.equal(slashQueryAt("/h1"), "h1");
  assert.equal(slashQueryAt("please fix /code"), "code");
  assert.equal(slashQueryAt("line one\n/h2"), "h2");
  assert.equal(slashQueryAt("no trigger"), null);
  // The guard that keeps everyday text from opening the menu.
  assert.equal(slashQueryAt("https://example.com"), null);
  assert.equal(slashQueryAt("see https://example.com/a"), null);
  assert.equal(slashQueryAt("src/lib"), null);
  assert.equal(slashQueryAt("and/or"), null);
});

test("an empty query lists every command", () => {
  assert.equal(filterSlashCommands("").length, SLASH_COMMANDS.length);
});

test("queries match labels and aliases", () => {
  assert.deepEqual(filterSlashCommands("h1").map((c) => c.id), ["heading1"]);
  assert.deepEqual(
    filterSlashCommands("heading").map((c) => c.id),
    ["heading1", "heading2", "heading3"],
  );
  assert.deepEqual(filterSlashCommands("code").map((c) => c.id), ["codeBlock"]);
  assert.deepEqual(
    filterSlashCommands("list").map((c) => c.id),
    ["bulletList", "orderedList"],
  );
  assert.deepEqual(filterSlashCommands("divider").map((c) => c.id), ["divider"]);
  assert.deepEqual(filterSlashCommands("zzz"), []);
});

test("every command is addressable", () => {
  const ids = new Set(SLASH_COMMANDS.map((c) => c.id));
  assert.equal(ids.size, SLASH_COMMANDS.length);
  for (const command of SLASH_COMMANDS) {
    assert.ok(command.label.length > 0, `${command.id} needs a label`);
    assert.ok(command.icon.length > 0, `${command.id} needs an icon name`);
    assert.ok(command.aliases.length > 0, `${command.id} needs an alias`);
  }
});

test("the bare menu is three sections in table order", () => {
  const sections = groupSlashCommands(filterSlashCommands(""));
  assert.deepEqual(
    sections.map((s) => s.group),
    ["text", "lists", "blocks"],
  );
  assert.deepEqual(
    sections.map((s) => s.commands.map((c) => c.id)),
    [
      ["text", "heading1", "heading2", "heading3"],
      ["bulletList", "orderedList"],
      ["codeBlock", "quote", "divider"],
    ],
  );
});

test("a section with no matches is dropped, not shown empty", () => {
  assert.deepEqual(
    groupSlashCommands(filterSlashCommands("h1")).map((s) => s.group),
    ["text"],
  );
  assert.deepEqual(
    groupSlashCommands(filterSlashCommands("list")).map((s) => s.group),
    ["lists"],
  );
  assert.deepEqual(
    groupSlashCommands(filterSlashCommands("zzz")).map((s) => s.group),
    [],
  );
});

test("grouping keeps the flat order the keyboard walks", () => {
  const sections = groupSlashCommands(filterSlashCommands(""));
  const flattened = sections.flatMap((s) => s.commands.map((c) => c.id));
  assert.deepEqual(flattened, SLASH_COMMANDS.map((c) => c.id));
});
