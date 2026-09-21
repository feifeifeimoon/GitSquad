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
  let slug: string;

  test.beforeEach(async ({ page }) => {
    api = new TestApiClient();
    await api.login();
    const suffix = Date.now().toString(36);
    const workspace = await api.seedWorkspace({
      name: `Composer ${suffix}`,
      slug: `composer-${suffix}`,
    });
    slug = workspace.slug;
    await loginAsE2E(page, api);

    await page.goto(`/${slug}`);
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
});
