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

test("value strip follows the playhead and shows colours", async ({ page }) => {
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  const strip = page.getByTestId("value-strip");
  await expect(strip).toContainText("Value at 0:00:00:00");
  await expect(strip).toContainText("100");
  await page.evaluate(() => {
    window.__mockAE!.setValue("100:13:ADBE Transform Group/ADBE Scale", [42, 43]);
    window.__mockAE!.setTime(1.48);
  });
  await expect(strip).toContainText("Value at 0:00:01:12");
  await expect(strip).toContainText("42");
  await expect(strip).toContainText("43");

  await page.evaluate(() => window.__mockAE!.selectLayers([11]));
  await row(page, "100:11:ADBE Effect Parade/ADBE Color Control").click();
  await row(page, "100:11:ADBE Effect Parade/ADBE Color Control/ADBE Color Control-0001").click();
  await expect(strip.locator(".swatch")).toBeVisible();
});

test("problems list shows the comp's errors and opens them", async ({ page }) => {
  await page.getByRole("button", { name: /Problems/ }).click();
  const panel = page.getByRole("region", { name: "Problems" });
  await expect(panel).toContainText("1 error in 4 expressions");
  await expect(panel).toContainText("3 Title_Text › Transform › Rotation");
  await expect(panel).toContainText("Line 1: SyntaxError: Unexpected end of input");
  await expect(page.locator(".problems-toggle")).toHaveText("⚠ 1");
  await panel.getByRole("button", { name: /Rotation/ }).click();
  await expect(page.getByRole("tab", { name: /Title_Text › Rotation/ })).toBeVisible();
  await expect(page.locator('.row.selected[data-key="100:13:ADBE Transform Group/ADBE Rotate Z"]')).toBeVisible();
});

test("pin a layer to the top from its context menu", async ({ page }) => {
  await row(page, "100:14").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin to top" }).click();
  await expect(page.locator(".row.layer").first()).toContainText("BG_Shape");
  await expect(page.locator(".row.layer").first().locator(".pin")).toHaveText("★");
  await page.reload();
  await expect(page.locator(".row.layer").first()).toContainText("BG_Shape");
  await row(page, "100:14").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unpin" }).click();
  await expect(page.locator(".row.layer").first()).toContainText("CTRLS");
});

test("split view edits two properties side by side", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, POSITION).dblclick();
  await page.getByLabel("Open to the side").click();
  const right = page.getByLabel("Split editor");
  await expect(right).toContainText("Title_Text › Position");
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await expect(page.getByRole("tab", { name: /Scale/ })).toHaveAttribute("aria-selected", "true");

  // Edit and apply in the right-hand editor: it applies Position, not the active tab (Scale).
  await right.locator(".monaco-editor .view-lines").click();
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.press("Delete");
  await page.keyboard.type("[1, 2]");
  await page.keyboard.press(`${mod}+S`);
  await expect(page.getByTestId("status-message")).toHaveText("Applied: Title_Text › Position");
  expect(await page.evaluate((k) => window.__mockAE!.getExpression(k), POSITION)).toBe("[1, 2]");

  await right.getByLabel("Close split").click();
  await expect(right).toHaveCount(0);
});

test("a change made in AE under unapplied edits shows a banner and a diff", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, POSITION).dblclick();
  await typeInEditor(page, "[9, 9]");
  await page.evaluate((k) => window.__mockAE!.setExpressionInAE(k, "[1, 1]"), POSITION);
  const banner = page.locator(".conflict");
  await expect(banner).toContainText("changed in After Effects");
  await banner.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByTestId("conflict-diff")).toContainText("[1, 1]");
  await expect(page.getByTestId("conflict-diff")).toContainText("[9, 9]");
  await banner.getByRole("button", { name: "Keep mine" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("[9, 9]");
  await expect(page.locator(".tab-close.dirty")).toBeVisible();
});

test("a clean tab picks up a change made in AE", async ({ page }) => {
  await row(page, POSITION).dblclick();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("wiggle(");
  await page.evaluate((k) => window.__mockAE!.setExpressionInAE(k, "[7, 7]"), POSITION);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("[7, 7]");
  await expect(page.getByTestId("status-message")).toHaveText("Updated from After Effects: Title_Text › Position");
});

test("renaming a layer offers to update references", async ({ page }) => {
  await row(page, POSITION).dblclick();
  await page.evaluate(() => window.__mockAE!.renameLayer(11, "Controls"));
  const banner = page.getByRole("status", { name: "Renamed" });
  await expect(banner).toContainText("Layer “CTRLS” → “Controls”");
  await expect(banner).toContainText("1 reference in open tabs, 2 references in this comp");
  await banner.getByRole("button", { name: "Update everywhere" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText('thisComp.layer("Controls")');
  expect(await page.evaluate((k) => window.__mockAE!.getExpression(k), POSITION)).toContain('layer("Controls")');
});

test("apply to all selected layers", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await page.evaluate(() => window.__mockAE!.selectLayers([11, 13]));
  await row(page, "100:13:ADBE Transform Group/ADBE Opacity").dblclick();
  await typeInEditor(page, "50");
  await page.getByRole("button", { name: "Apply to 2 selected layers" }).click();
  await expect(page.getByTestId("status-message")).toHaveText("Applied Opacity to 2 layers.");
  expect(await page.evaluate(() => window.__mockAE!.getExpression("100:11:ADBE Transform Group/ADBE Opacity"))).toBe("50");
});

test("link a tab to a file; saving the file applies it", async ({ page }) => {
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await page.getByRole("button", { name: "Link file…" }).click();
  await expect(page.locator(".file-link.linked")).toContainText("Title_Text - Scale.js");
  await page.evaluate(() => window.__mockFS!.save("/mock/Title_Text - Scale.js", "[64, 64]"));
  await expect(page.getByTestId("status-message")).toHaveText("Applied from file: Title_Text › Scale");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("[64, 64]");
  expect(await page.evaluate(() => window.__mockAE!.getExpression("100:13:ADBE Transform Group/ADBE Scale"))).toBe("[64, 64]");
  await page.getByLabel("Unlink file").click();
  await expect(page.getByRole("button", { name: "Link file…" })).toBeVisible();
});

async function dropWith(page: Page, key: string, modifier: "Control" | null, x = 200, line = 1) {
  const y = 8 + (line - 1) * 19; // Monaco's default line height at 13px
  await row(page, key).hover();
  await page.mouse.down();
  await page.locator(".monaco-editor .view-lines").hover({ position: { x, y } });
  if (modifier) await page.keyboard.down(modifier);
  await page.locator(".monaco-editor .view-lines").hover({ position: { x: x + 4, y } });
  await page.mouse.up();
  if (modifier) await page.keyboard.up(modifier);
}

test("Ctrl-drop declares layer + property and uses it at the drop point", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "value * ");
  await showSlider(page);
  await dropWith(page, SLIDER, "Control", 400);
  const lines = page.locator(".monaco-editor .view-line");
  await expect(lines.nth(0)).toContainText('const ctrlsSpeed = thisComp.layer("CTRLS").effect("Speed")("Slider");');
  await expect(lines.nth(1)).toContainText("value * ctrlsSpeed");
  // Dropping the same property again reuses the const.
  await page.keyboard.press("End");
  await page.keyboard.type(" + ");
  await dropWith(page, SLIDER, "Control", 600, 2);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("value * ctrlsSpeed + ctrlsSpeed");
  await expect(lines).toHaveCount(2);
});

test("settings: theme follows AE or is chosen; font size applies", async ({ page }) => {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  // AE's Appearance › Brightness turned up.
  await page.evaluate(() => window.__setHostBackground!({ r: 205, g: 205, b: 205 }));
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Settings", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByLabel("Theme").selectOption("dark");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await dialog.getByLabel("Font size").fill("18");
  await row(page, POSITION).click();
  await expect(page.locator(".monaco-editor .view-lines")).toHaveCSS("font-size", "18px");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark"); // remembered
});

test("plain drop inserts the reference; Ctrl-drop into an empty editor declares and uses it", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "");
  await showSlider(page);
  await dropWith(page, SLIDER, null, 5);
  await expect(page.locator(".monaco-editor .view-lines")).toHaveText('thisComp.layer("CTRLS").effect("Speed")("Slider")');

  await typeInEditor(page, "");
  await dropWith(page, SLIDER, "Control", 5);
  const lines = page.locator(".monaco-editor .view-line");
  await expect(lines.nth(0)).toHaveText('const ctrlsSpeed = thisComp.layer("CTRLS").effect("Speed")("Slider");');
  await expect(lines.nth(1)).toHaveText("ctrlsSpeed");
});

test("history: compare an earlier version and restore it", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "[10, 10]");
  await page.keyboard.press(`${mod}+S`);
  await typeInEditor(page, "[20, 20]");
  await page.keyboard.press(`${mod}+S`);
  await page.getByRole("button", { name: "History" }).click();
  const panel = page.getByRole("region", { name: "History" });
  // Newest first: [20, 20], [10, 10], and "before" (no expression).
  await expect(panel.locator(".history-entry")).toHaveCount(3);
  await expect(panel.locator(".history-entry").nth(2)).toContainText("(no expression)");
  await panel.locator(".history-entry").nth(1).click();
  await expect(page.getByTestId("history-diff")).toContainText("[10, 10]");
  await panel.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("[10, 10]");
  await expect(page.locator(".tab-close.dirty")).toBeVisible(); // restored as an unapplied edit
});

test("inline values after declared references", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, 'const speed = thisComp.layer("CTRLS").effect("Speed")("Slider");\nconst p = transform.position;\nvalue');
  const hints = page.locator(".monaco-editor .inline-value");
  await expect(hints).toHaveCount(2);
  await expect(hints.nth(0)).toHaveText("// = 2.5");
  await expect(hints.nth(1)).toHaveText("// = [960, 540]");
  // They follow AE: a new value shows after the playhead moves.
  await page.evaluate(() => {
    window.__mockAE!.setValue("100:11:ADBE Effect Parade/ADBE Slider Control/ADBE Slider Control-0001", 7);
    window.__mockAE!.setTime(1);
  });
  await expect(hints.nth(0)).toHaveText("// = 7");
});

test("value graph plots the property over the work area", async ({ page }) => {
  await page.evaluate(() => window.__mockAE!.animate("100:13:ADBE Transform Group/ADBE Scale", (t) => [100 + t * 20, 100 - t * 10]));
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await page.getByRole("button", { name: "Graph" }).click();
  const graph = page.getByTestId("value-graph");
  await expect(graph.locator("path")).toHaveCount(2);
  await expect(graph.locator(".graph-max")).toHaveText("200");
  await expect(graph.locator(".graph-min")).toHaveText("50");
  await expect(graph.locator(".graph-playhead")).toHaveCount(1);
});

test("make a slider from a number in the code", async ({ page }) => {
  await page.getByLabel("Auto-apply").uncheck();
  await row(page, "100:13:ADBE Transform Group/ADBE Scale").dblclick();
  await typeInEditor(page, "wiggle(2, 50)");
  await page.keyboard.press("ArrowLeft"); // cursor on 50
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+F10"); // the context menu, at the cursor
  await page.getByRole("menuitem", { name: "Make control on this layer" }).click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText('wiggle(2, effect("Wiggle Amplitude")("Slider"))');
  await expect(page.getByTestId("status-message")).toHaveText("Added Slider Control “Wiggle Amplitude” on Title_Text.");
  // The new effect shows up in the (already open) Effects group.
  await expect(page.locator('.row:has-text("Wiggle Amplitude")')).toBeVisible();
});
