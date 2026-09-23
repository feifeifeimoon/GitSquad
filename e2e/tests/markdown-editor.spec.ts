// Markdown the composer has to render live.
//
// The input rules only fire when the marker and its trailing space are the last
// thing typed, which misses two everyday cases: a marker typed inside the list it
// repeats, and a whole line committed at once — an IME committing `## 标题`,
// which is how markdown gets typed with a Chinese input method. Both are driven
// here for real: the IME case through CDP's composition sequence, the rest
// through keystrokes.
import { test, expect, type Page } from "@playwright/test";
import { TestApiClient } from "../fixtures";
import { loginAsE2E } from "../helpers";

/** Commit `text` the way an input method does: a composition, then its commit. */
async function imeCommit(page: Page, text: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", {
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
  });
  await cdp.send("Input.insertText", { text });
  await page.waitForTimeout(300);
}

test.describe("Markdown editor", () => {
  let api: TestApiClient;
  let workspace: { id: string; slug: string };
  let suffix: string;

  test.beforeEach(async ({ page }) => {
    api = new TestApiClient();
    await api.login();
    suffix = Date.now().toString(36);
    workspace = await api.seedWorkspace({
      name: `Composer ${suffix}`,
      slug: `composer-${suffix}`,
    });
    await loginAsE2E(page, api);

    await page.goto(`/${workspace.slug}`);
    await page.getByRole("button", { name: "New Issue" }).click();
    await page.locator(".ProseMirror").waitFor();
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("renders markdown typed keystroke by keystroke", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("# Heading", { delay: 15 });

    await expect(editor.locator("h1")).toHaveText("Heading");
  });

  test("renders a line an input method commits in one piece", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await imeCommit(page, "## 标题");

    await expect(editor.locator("h2")).toHaveText("标题");
    await expect(editor).not.toContainText("##");
  });

  test("renders a list item an input method commits in one piece", async ({
    page,
  }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await imeCommit(page, "- 第一步");

    await expect(editor.locator("ul li")).toHaveText(["第一步"]);
    await expect(editor).not.toContainText("- 第一步");
  });

  test("keeps the number of an ordered list committed in one piece", async ({
    page,
  }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await imeCommit(page, "2. 第二步");

    const list = editor.locator("ol");
    await expect(list).toHaveAttribute("start", "2");
    await expect(list.locator("li")).toHaveText(["第二步"]);
  });

  test("continues a list when the marker is typed again", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("- first", { delay: 15 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("- second", { delay: 15 });

    await expect(editor.locator("ul > li")).toHaveText(["first", "second"]);
    await expect(editor).not.toContainText("- second");
  });

  test("continues a list when the marker arrives with the text", async ({
    page,
  }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("- first", { delay: 15 });
    await page.keyboard.press("Enter");
    await imeCommit(page, "- 第二步");

    await expect(editor.locator("ul > li")).toHaveText(["first", "第二步"]);
  });

  test("renders a quote and a code fence committed in one piece", async ({
    page,
  }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await imeCommit(page, "> 引用");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await imeCommit(page, "```ts");

    await expect(editor.locator("blockquote")).toHaveText("引用");
    await expect(editor.locator("pre code")).toHaveAttribute("class", /language-ts/);
  });

  test("applies a block command from the slash menu", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("/h1", { delay: 15 });

    // Scoped to the menu: the bubble toolbar's buttons carry the same titles.
    const item = page
      .getByTestId("caret-menu")
      .getByRole("button", { name: "Heading 1" });
    await expect(item).toBeVisible();
    await item.click();

    await page.keyboard.type("Title", { delay: 15 });
    await expect(editor.locator("h1")).toHaveText("Title");
    // The typed query is gone: it belonged to the menu, not to the document.
    await expect(editor).not.toContainText("/h1");
  });

  test("leaves the menu shut for a URL or a path", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("see https://example.com/a and src/lib", {
      delay: 10,
    });

    await expect(page.getByTestId("caret-menu")).toHaveCount(0);
  });

  test("draws the menu in sections, and drops the empty ones", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("/", { delay: 15 });

    const menu = page.getByTestId("caret-menu");
    await expect(menu).toBeVisible();
    // Text / lists / blocks, in that order, with a hairline between sections.
    await expect(menu.getByRole("button")).toHaveText([
      "Text",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Bulleted list",
      "Numbered list",
      "Code block",
      "Quote",
      "Divider",
    ]);
    await expect(page.getByTestId("caret-menu-separator")).toHaveCount(2);

    // A query that reaches one section leaves no hairline behind.
    await page.keyboard.press("Enter");
    await page.keyboard.type("/list", { delay: 15 });
    await expect(menu.getByRole("button")).toHaveText([
      "Bulleted list",
      "Numbered list",
    ]);
    await expect(page.getByTestId("caret-menu-separator")).toHaveCount(0);

    // Aliases are prefix-matched as well, so `/h` keeps Divider (`hr`) around —
    // in the second section, one hairline below the headings.
    await page.keyboard.press("Enter");
    await page.keyboard.type("/h", { delay: 15 });
    await expect(menu.getByRole("button")).toHaveText([
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Divider",
    ]);
    await expect(page.getByTestId("caret-menu-separator")).toHaveCount(1);
  });

  test("hangs the menu off the caret, not off the dialog", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("/h", { delay: 15 });

    const menu = page.getByTestId("caret-menu");
    await expect(menu).toBeVisible();

    const menuBox = await menu.boundingBox();
    const editorBox = await editor.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    // The caret sits at the start of the editor's first line, so the menu opens
    // against the editor's left edge — indented by the box's own padding only.
    expect(menuBox!.x).toBeGreaterThan(editorBox!.x - 8);
    expect(menuBox!.x).toBeLessThan(editorBox!.x + 48);
  });

  test("opens the slash menu in the comment box", async ({ page }) => {
    const issue = await api.createIssue(workspace.id, `Composer menu ${suffix}`);
    await page.goto(`/${workspace.slug}/issues/${issue.issue_key}`, {
      waitUntil: "domcontentloaded",
    });

    const editor = page.getByRole("textbox", { name: "Write a comment" });
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await editor.click();
    await page.keyboard.type("/quote", { delay: 15 });

    // The composer sits at the bottom of the page and its rounded box clips its
    // own children, so the menu has to leave that box and stay on screen.
    const menu = page.getByTestId("caret-menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

    await page.getByTestId("caret-menu").getByRole("button", { name: "Quote" }).click();
    await page.keyboard.type("quoted", { delay: 15 });
    await expect(
      page
        .getByRole("textbox", { name: "Write a comment" })
        .locator("blockquote"),
    ).toHaveText("quoted");
  });
});
