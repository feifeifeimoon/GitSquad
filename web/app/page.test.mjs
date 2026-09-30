import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { anchors, links } from "../components/marketing/links.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const page = read("./(marketing)/page.tsx");
const nav = read("../components/marketing/landing-nav.tsx");
const board = read("../components/marketing/demo-board.tsx");
const footer = read("../components/marketing/landing-footer.tsx");
const cta = read("../components/marketing/get-started-cta.tsx");
const layout = read("./layout.tsx");
const css = read("./globals.css");
const squad = read("../components/marketing/squad.tsx");
const toggle = read("../components/theme-toggle.tsx");
const mark = read("../components/github-mark.tsx");

const MARKETING = [page, nav, board, footer, cta];

test("the landing page is server-rendered with client islands", () => {
  // The directive, not the words: this file's own comment says the page used
  // to be a client component, and a bare string match would fail on it.
  assert.doesNotMatch(page, /^["']use client["'];/m);
  assert.match(page, /<LandingNav \/>/);
  assert.match(page, /<DemoBoard \/>/);
  assert.match(page, /<LandingFooter \/>/);
  // The one thing that needs state is the button that opens the login modal.
  assert.match(cta, /^["']use client["'];/m);
  assert.match(cta, /useState/);
  assert.match(cta, /<LoginModal/);
});

test("the page says what the product is", () => {
  assert.match(page, /Your autonomous developer team on GitHub\./);
  assert.match(page, /Mention an agent on an issue and it plans against the repository/);
  assert.match(page, /The tool loop stays in the CLI you already have\./);
  assert.match(page, /An orchestration shell, not another agent\./);
  assert.match(page, /Open source · Apache-2\.0/);
});

test("the invented control center is gone", () => {
  // It claimed a version, a CPU column, an uptime in hours and a latency in
  // milliseconds, and the product measures none of them. Checked on the page
  // rather than the mock: the mock's header comment quotes what it replaced.
  assert.doesNotMatch(page, /Squad control center/);
  assert.doesNotMatch(page, /net uptime/);
  assert.doesNotMatch(page, /Latency/);
  assert.doesNotMatch(page, /\bCPU\b/);
});

test("the demo board is this repository", () => {
  // The example is the product's own repo, so a reader can go and read the work
  // being described. The keys follow from the name — `deriveIssuePrefix` takes
  // the first three letters, so GitSquad issues are GIT-*.
  assert.match(board, /name: "GitSquad", repo: "feifeifeimoon\/GitSquad"/);
  assert.doesNotMatch(board, /ORI-/);
  assert.match(board, /GIT-142/);

  // Each agent wears the face the hero shows rather than a second, unrelated
  // monogram — and the thread draws a person as a monogram and an agent as a
  // portrait, so "who said what" is legible without reading the name.
  assert.match(board, /\/robots\/v2\/avatars\//);
  assert.match(board, /<WorkspaceAvatar name=\{entry\.author\}/);

  // Four columns have to fit the frame: at the console's 288px the fourth came
  // out sliced through a card, which reads as a layout bug rather than as a row
  // that continues.
  assert.match(board, /w-\[272px\]/);
});

test("the demo board is drawn with the console's own parts", () => {
  assert.match(board, /from "@\/components\/status-icon"/);
  assert.match(board, /from "@\/components\/issues\/agent-chip"/);
  assert.match(board, /from "@\/components\/status-dot"/);
  assert.match(board, /from "@\/components\/provider-icon"/);
  assert.match(board, /from "@\/components\/workspace-avatar"/);

  // All five columns the mock draws, and cards that can be selected.
  assert.match(board, /\["backlog", "todo", "in_progress", "in_review", "done"\]/);
  assert.match(board, /aria-pressed=\{selected\}/);

  // A thread with all three kinds of entry the real feed distinguishes.
  assert.match(board, /kind: "person"/);
  assert.match(board, /kind: "agent"/);
  assert.match(board, /kind: "event"/);

  // And the run behind it, ending in the branch that became the pull request.
  assert.match(board, /op: "push"/);
  assert.match(board, /pr create/);
});

test("every link on the page resolves", () => {
  assert.match(nav, /Product/);
  assert.match(nav, /Why GitSquad/);
  assert.match(nav, /How it works/);
  assert.match(nav, /GitHub/);

  // The bar this replaced pointed four items at `href="#"` and sent "Read the
  // docs" at a route that did not exist.
  for (const source of MARKETING) {
    assert.doesNotMatch(source, /href="#"/);
  }
  assert.doesNotMatch(page, /href="\/docs"/);

  // Every in-page destination the nav and the footer use exists on the page.
  // Matched by key, not by value: the page writes `id={anchors.howItWorks}` and
  // the DOM id it produces is the value — the same object either way.
  for (const name of Object.keys(anchors)) {
    assert.match(page, new RegExp(`id=\\{anchors\\.${name}\\}`));
  }

  for (const [name, href] of Object.entries(links)) {
    assert.ok(
      href.startsWith("https://github.com/feifeifeimoon/GitSquad"),
      `links.${name} does not point at the repository: ${href}`,
    );
  }
});

test("the page ends with the project's terms and its source", () => {
  assert.match(footer, /Apache-2\.0/);
  assert.match(footer, /Pre-1\.0/);
  assert.match(footer, /links\.documentation/);
  assert.match(footer, /clamp\(/);
});

test("the marketing page keeps the brand and the metadata", () => {
  assert.match(nav, /alt="GitSquad logo"/);
  assert.match(layout, /GitSquad/);
  assert.doesNotMatch(layout, /Create Next App/);
});

test("the hero scatters the squad through its margins", () => {
  assert.match(page, /<Squad \/>/);

  // A picture, not content: out of the accessibility tree, out of the flow, and
  // drawn only where the content column leaves a margin for it.
  assert.match(squad, /aria-hidden="true"/);
  assert.match(squad, /absolute inset-0 hidden select-none xl:block/);
  // The layer covers the band, so the figures take the pointer and not clicks.
  assert.match(squad, /pointer-events-none/);
  assert.match(squad, /pointer-events-auto/);

  // Three figures with three jobs.
  const captions = [...squad.matchAll(/doing: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(captions, ["hunting a bug", "checking the build", "drawing a screen"]);

  // Scattered, not lined up: different heights, and both margins used.
  const xs = [...squad.matchAll(/x: (\d+)/g)].map((m) => Number(m[1]));
  const ys = [...squad.matchAll(/y: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(new Set(xs).size, xs.length, "two share an x position");
  assert.equal(new Set(ys).size, ys.length, "two share a height");
  assert.ok(xs.some((x) => x < 20) && xs.some((x) => x > 70), "not on both sides");

  // The display widths *agree* while the crops do not, and that is the point:
  // each width is solved from the head in that file, so three differently framed
  // crops render three heads of one size. Equal widths were once the bug — they
  // made the widest crop read as the smallest robot.
  const widths = [...squad.matchAll(/width: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 3);
  assert.ok(
    Math.max(...widths) - Math.min(...widths) <= 4,
    `display widths should match within a few px: ${widths.join(", ")}`,
  );
  const sourceWidths = [...squad.matchAll(/\bw: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(new Set(sourceWidths).size, sourceWidths.length, "the crops should differ");
});

test("the squad is artwork with its own alpha channel", () => {
  // Three files, one per figure. The takeaway from two days of cut-outs: a
  // generated render *with alpha* beats anything taken off a flattened image,
  // because a white robot against a white background has no edge to find.
  //
  // The `/v1/` is not decoration. Next serves an optimised image at a URL that
  // holds only the source *path*, with `max-age=14400` — so replacing a file's
  // contents under the same name leaves the old bytes served for four hours, in
  // the browser and on the CDN alike. Changing the path is what changes the URL.
  for (const name of ["inspector", "tester", "planner"]) {
    assert.match(squad, new RegExp(`/robots/v2/${name}\\.png`), `${name} is not used`);
  }
  assert.doesNotMatch(squad, /favicon\.ico/);
  // A render is one flat layer, so the hover is a gesture rather than the work —
  // and a different gesture per figure, because one lift shared by three reads
  // as one figure, which is the same sameness a single crop size produced.
  const gestures = [...squad.matchAll(/group-hover\/robot:animate-\[([a-z-]+)_/g)].map(
    (m) => m[1],
  );
  assert.equal(gestures.length, 3, `expected a gesture per figure, found ${gestures.length}`);
  assert.equal(new Set(gestures).size, 3, "two figures share a gesture");
  for (const name of gestures) {
    assert.match(css, new RegExp(`@keyframes ${name} \\{`), `${name} has no keyframes`);
  }
});

test("the marketing nav links to GitHub by its mark", () => {
  // An icon rather than a fourth nav word: it is the one destination in the bar
  // that leaves the page. The label names the artifact — "GitHub" alone leaves a
  // screen reader with a link whose purpose is a guess.
  assert.match(nav, /<GitHubMark/);
  assert.match(nav, /aria-label="GitSquad on GitHub"/);
  assert.match(nav, /href={links.github}/);
  assert.doesNotMatch(nav, /label: "GitHub"/);
  // Inline, because the file it replaces had  baked in and an
  //  cannot inherit currentColor — which made the mark invisible on a
  // near-black card in dark mode.
  assert.match(mark, /fill="currentColor"/);
});

test("the marketing nav carries the theme control", () => {
  // The page has followed the system theme from the start — the provider is in
  // the root layout and every surface is a pair of tokens — so what was missing
  // was any way to say otherwise without changing an operating-system setting.
  // It uses the console's own button rather than a second one.
  assert.match(nav, /<ThemeToggle/);
  assert.match(nav, /from "@\/components\/theme-toggle"/);
  // And the icon pair is swapped by the `dark:` variant, not by reading the
  // theme in JavaScript: `resolvedTheme` is unknown on the server, so a render
  // that depended on it would disagree with the markup it hydrates.
  assert.match(toggle, /dark:hidden/);
  assert.match(toggle, /dark:block/);
  assert.doesNotMatch(toggle, /useState/);
});

test("the hero backdrop is the brand's own palette, not the template's", () => {
  // Both layers, and the grid underneath the glow.
  assert.match(page, /blueprint-grid/);
  assert.match(page, /<MeshGradient/);

  const rule = css.match(/\.mesh-gradient \{([\s\S]*?)\n  \}/);
  assert.ok(rule, "no .mesh-gradient rule in globals.css");
  const gradient = rule[1];

  // The mark's navy and the cyan of its eyes, the banner's blue and its amber.
  for (const stop of [
    "rgba(6, 16, 41", // #061029, the icon's shell
    "rgba(52, 166, 209", // #34a6d1, the icon's eyes
    "rgba(31, 111, 208", // the banner's repository blue
    "rgba(245, 166, 35", // the banner's machinery amber
  ]) {
    assert.ok(gradient.includes(stop), `mesh gradient lost ${stop}`);
  }

  // And none of the five pastels the page was first written with.
  for (const pastel of ["#007cf0", "#7928ca", "#ff0080", "#00dfd8", "#f9cb28"]) {
    assert.ok(!gradient.includes(pastel), `mesh gradient still has ${pastel}`);
  }
});
