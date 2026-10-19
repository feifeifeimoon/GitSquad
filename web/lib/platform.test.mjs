import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORMS,
  PLATFORM_LABEL,
  installSteps,
  platformFrom,
} from "./platform.ts";

test("the platform is inferred from the browser strings", () => {
  assert.equal(
    platformFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32"),
    "windows",
  );
  assert.equal(
    platformFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", "MacIntel"),
    "macos",
  );
  assert.equal(
    platformFrom("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64"),
    "linux",
  );
  // Unknown is correctable with the tabs, not fatal.
  assert.equal(platformFrom("", ""), "macos");
});

test("Windows gets PowerShell, macOS and Linux get the shell installer", () => {
  for (const platform of ["macos", "linux"]) {
    const install = installSteps(platform)[0];
    assert.equal(install.id, "install");
    assert.match(install.command, /install\.sh/);
    assert.match(install.command, /\| bash$/);
  }

  const windows = installSteps("windows")[0];
  assert.match(windows.command, /install\.ps1/);
  assert.match(windows.command, /\| iex$/);
});

test("every platform has a label and the same three steps", () => {
  for (const platform of PLATFORMS) {
    assert.ok(PLATFORM_LABEL[platform]);
    const steps = installSteps(platform);
    assert.deepEqual(
      steps.map((step) => step.id),
      ["install", "login", "run"],
    );
    assert.equal(steps[1].command, "gitsquad daemon login");
    assert.equal(steps[2].command, "gitsquad daemon run");
  }
});
