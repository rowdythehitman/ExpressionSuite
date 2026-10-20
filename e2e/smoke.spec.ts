import { expect, test, type Page } from "@playwright/test";

const POSITION = "100:13:ADBE Transform Group/ADBE Position";
const mod = process.platform === "darwin" ? "Meta" : "Control";

const row = (page: Page, key: string) => page.locator(`.row[data-key="${key}"]`);

async function typeInEditor(page: Page, text: string) {
  await page.locator(".monaco-editor .view-lines").click();
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.press("Delete");
  await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/ide/index.html");
  await expect(page.getByText("COMP: Main_Title")).toBeVisible();
});

test("selected layer shows its scriptable properties with badges", async ({ page }) => {
  await expect(row(page, POSITION)).toContainText("{ }");
  await expect(row(page, "100:13:ADBE Transform Group/ADBE Rotate Z")).toContainText("⚠");
  await expect(row(page, "100:13:ADBE Transform Group/ADBE Opacity")).toHaveClass(/disabled/);
  // The empty Effects group on Logo is never offered.
  await page.evaluate(() => window.__mockAE!.selectLayers([12]));
  await expect(row(page, "100:12:ADBE Mask Parade")).toBeVisible();
  await expect(row(page, "100:12:ADBE Effect Parade")).toHaveCount(0);
});

test("timeline selection reaches the tree within 0.5 s", async ({ page }) => {
  await page.evaluate(() => window.__mockAE!.selectLayers([11]));
  await expect(row(page, "100:11:ADBE Effect Parade/ADBE Slider Control")).toBeVisible({ timeout: 500 });
});

test("edit Position, Ctrl+S applies in one undo step", async ({ page }) => {
  await row(page, POSITION).click();
  await expect(page.getByRole("tab", { name: /Title_Text › Position/ })).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("wiggle(");
  await typeInEditor(page, "[100, 200]");
  await expect(page.locator(".tab-close.dirty")).toBeVisible();
  await page.keyboard.press(`${mod}+S`);
  await expect(page.getByTestId("status-message")).toHaveText("Applied: Title_Text › Position");
  await expect(page.locator(".tab-close.dirty")).toHaveCount(0);
  expect(await page.evaluate((k) => window.__mockAE!.getExpression(k), POSITION)).toBe("[100, 200]");
  expect(await page.evaluate(() => window.__mockAE!.undoGroups())).toEqual(["Expression IDE: Position"]);
});

test("an AE error after apply squiggles its line and badges the tree", async ({ page }) => {
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "const s = 50;\n\ns *");
  await page.keyboard.press(`${mod}+S`);
  await expect(page.getByTestId("status-message")).toHaveText("Title_Text › Scale: Line 3: SyntaxError: Unexpected token");
  await expect(row(page, "100:13:ADBE Transform Group/ADBE Scale")).toContainText("⚠");
  await expect(page.locator(".monaco-editor .squiggly-error")).not.toHaveCount(0);
});

test("filter finds properties by word prefix", async ({ page }) => {
  await page.getByLabel("Filter properties").fill("rot");
  await expect(row(page, "100:13:ADBE Transform Group/ADBE Rotate Z")).toBeVisible();
  await expect(row(page, "100:13:ADBE Transform Group/ADBE Anchor Point")).toHaveCount(0);
});

test("a new project closes the editor and clears messages", async ({ page }) => {
  await row(page, POSITION).dblclick();
  await typeInEditor(page, "time *");
  await page.keyboard.press(`${mod}+S`);
  await expect(page.getByTestId("status-message")).toContainText("SyntaxError");
  await page.evaluate(() => window.__mockAE!.newProject());
  await expect(page.getByText("COMP: Comp 1")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByTestId("status-message")).toHaveText("New project: editor reset.");
  // Same comp/layer ids as before, but the old tab's content is gone.
  await page.evaluate(() => window.__mockAE!.selectLayers([11]));
  await page.locator('.row[data-key="100:11:ADBE Transform Group/ADBE Position"]').click();
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("time");
});

test("reset closes tabs and reloads; messages can be dismissed", async ({ page }) => {
  await row(page, POSITION).dblclick();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByLabel("Reset editor").click();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(row(page, POSITION)).toBeVisible();
  await expect(page.getByTestId("status-message")).toContainText("Editor reset");
  await page.getByLabel("Dismiss message").click();
  await expect(page.getByTestId("status-message")).toHaveCount(0);
});

test("auto-apply: valid code applies after a pause; a syntax error squiggles and waits", async ({ page }) => {
  const scale = "100:13:ADBE Transform Group/ADBE Scale";
  await expect(page.getByLabel("Auto-apply")).toBeChecked();
  await row(page, scale).dblclick();
  await typeInEditor(page, "value *");
  await expect(page.locator(".monaco-editor .squiggly-error")).not.toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__mockAE!.undoGroups())).toEqual([]);
  await page.keyboard.type(" 2");
  await expect(page.getByTestId("status-message")).toHaveText("Auto-applied: Title_Text › Scale", { timeout: 3000 });
  expect(await page.evaluate((k) => window.__mockAE!.getExpression(k), scale)).toBe("value * 2");
  await expect(page.locator(".monaco-editor .squiggly-error")).toHaveCount(0);

  await page.getByLabel("Auto-apply").uncheck();
  await page.keyboard.type(";");
  await page.waitForTimeout(1500);
  expect(await page.evaluate((k) => window.__mockAE!.getExpression(k), scale)).toBe("value * 2");
});

const SLIDER = "100:11:ADBE Effect Parade/ADBE Slider Control/ADBE Slider Control-0001";

async function showSlider(page: Page) {
  await row(page, "100:11").click(); // expand CTRLS
  await row(page, "100:11:ADBE Effect Parade").click();
  await row(page, "100:11:ADBE Effect Parade/ADBE Slider Control").click();
  await expect(row(page, SLIDER)).toBeVisible();
}

test("drag CTRLS › Speed › Slider into another layer's tab inserts a working reference", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "value * ");
  await showSlider(page);
  await row(page, SLIDER).dragTo(page.locator(".monaco-editor .view-lines"), { targetPosition: { x: 300, y: 8 } });
  await expect(page.locator(".monaco-editor .view-lines")).toContainText('value * thisComp.layer("CTRLS").effect("Speed")("Slider")');
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("$0");
});

test("text dropped from outside goes in as typed, never as a snippet", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "");
  // Only text/plain, as when CEP strips the explorer's own drag type and nothing is being dragged from the tree.
  await page.evaluate(() => {
    const el = document.querySelector(".monaco-editor .view-lines")!;
    const r = el.getBoundingClientRect();
    const dt = new DataTransfer();
    dt.setData("text/plain", "a$0b ${1:x}");
    const at = { clientX: r.left + 20, clientY: r.top + 8, bubbles: true, cancelable: true, dataTransfer: dt };
    el.dispatchEvent(new DragEvent("dragover", at));
    el.dispatchEvent(new DragEvent("drop", at));
  });
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("a$0b ${1:x}");
});

test("Alt-drop declares a const at the top", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "value");
  await showSlider(page);
  await row(page, SLIDER).hover();
  await page.mouse.down();
  await page.locator(".monaco-editor .view-lines").hover({ position: { x: 200, y: 8 } });
  await page.keyboard.down("Alt");
  await page.locator(".monaco-editor .view-lines").hover({ position: { x: 210, y: 8 } });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const lines = page.locator(".monaco-editor .view-line");
  await expect(lines.nth(0)).toContainText('const speed = thisComp.layer("CTRLS").effect("Speed")("Slider");');
});

test("right-click copies a reference; Ctrl+Shift+P picks from the timeline", async ({ page }) => {
  await showSlider(page);
  await row(page, SLIDER).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy reference" }).click();
  await expect(page.getByTestId("status-message")).toHaveText('Copied thisComp.layer("CTRLS").effect("Speed")("Slider")');

  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "");
  await page.evaluate((k) => window.__mockAE!.selectProperty(k), SLIDER);
  await page.locator(".monaco-editor .view-lines").click();
  await page.keyboard.press(`${mod}+Shift+P`);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText('thisComp.layer("CTRLS").effect("Speed")("Slider")');
});

test("completions know the AE expression API", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "thisComp.");
  // The TypeScript worker takes a moment to start; ask explicitly instead of waiting for the automatic popup.
  const suggest = page.locator(".monaco-editor .suggest-widget.visible");
  await expect(async () => {
    await page.keyboard.press("Control+Space");
    await expect(suggest).toContainText("numLayers", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await typeInEditor(page, "wigg");
  await page.keyboard.press("Control+Space");
  await expect(suggest).toContainText("wiggle");
});

test("completes real layer, effect and parameter names", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  const suggest = page.locator(".monaco-editor .suggest-widget.visible");
  const ask = async (text: string, expected: string) => {
    await typeInEditor(page, text);
    await expect(async () => {
      await page.keyboard.press("Control+Space");
      await expect(suggest).toContainText(expected, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press("Escape");
  };
  // Monaco closes the quote and bracket, leaving the cursor between the quotes.
  await ask('thisComp.layer("', "CTRLS");
  await ask('thisComp.layer("CTRLS").effect("', "Speed");
  await ask('thisComp.layer("CTRLS").effect("Speed")("', "Slider");
});
