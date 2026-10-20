// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureComp } from "../src/js/bridge/fixture";
import { createMockBridge, type MockControl } from "../src/js/bridge/mock";
import type { Bridge } from "../src/js/bridge/types";
import { getFiles, suggestFileName } from "../src/js/bridge/files";
import { storedLinks as storedLinksFor } from "../src/js/ide/store";
import { AUTO_APPLY_MS, batchTargets, canAutoApply, findNode, isDirty, referenceFor, setStoreBridge, useIde } from "../src/js/ide/store";

const TITLE = "100:13";
const CTRLS = "100:11";
const POSITION = "100:13:ADBE Transform Group/ADBE Position";
const SCALE = "100:13:ADBE Transform Group/ADBE Scale";

let bridge: Bridge;
let control: MockControl;
const initial = useIde.getState();

async function sync() {
  await useIde.getState().setTree(await bridge.getCompTree(2));
}

beforeEach(() => {
  ({ bridge, control } = createMockBridge(fixtureComp()));
  setStoreBridge(bridge);
  useIde.setState(initial, true);
  // Auto-apply has its own tests; elsewhere it would race the explicit applies.
  useIde.getState().setAutoApply(false);
});


describe("selection sync", () => {
  it("expands selected layers with Transform and Effects open, and collapses them again on deselect", async () => {
    control.selectLayers([13]);
    await sync();
    const { expanded } = useIde.getState();
    expect(expanded[TITLE]).toBe(true);
    expect(expanded["100:13:ADBE Transform Group"]).toBe(true);
    expect(expanded["100:13:ADBE Effect Parade"]).toBe(true);
    expect(expanded["100:13:ADBE Text Properties"]).toBeUndefined();

    control.selectLayers([11]);
    await sync();
    expect(useIde.getState().expanded[TITLE]).toBeUndefined();
    expect(useIde.getState().expanded[CTRLS]).toBe(true);
  });

  it("keeps a layer the user expanded when it is deselected", async () => {
    control.selectLayers([13]);
    await sync();
    await useIde.getState().toggle(TITLE); // user collapses…
    await useIde.getState().toggle(TITLE); // …and reopens: now it's theirs
    control.selectLayers([11]);
    await sync();
    expect(useIde.getState().expanded[TITLE]).toBe(true);
  });

  it("reloads the children of expanded groups after a refresh", async () => {
    control.selectLayers([13]);
    await sync();
    await useIde.getState().toggle("100:13:ADBE Effect Parade/ADBE Drop Shadow");
    expect(findNode(useIde.getState(), "100:13:ADBE Effect Parade/ADBE Drop Shadow/ADBE Drop Shadow-0002")?.name).toBe("Opacity");
    await sync();
    expect(findNode(useIde.getState(), "100:13:ADBE Effect Parade/ADBE Drop Shadow/ADBE Drop Shadow-0002")?.name).toBe("Opacity");
  });

  it("follows a property selected in the timeline", async () => {
    const slider = "100:11:ADBE Effect Parade/ADBE Slider Control/ADBE Slider Control-0001";
    control.selectProperty(slider);
    await sync();
    const s = useIde.getState();
    expect(s.selectedKey).toBe(slider);
    expect(s.expanded["100:11:ADBE Effect Parade/ADBE Slider Control"]).toBe(true);
    expect(findNode(s, slider)?.name).toBe("Slider");
  });
});

describe("tabs", () => {
  beforeEach(async () => {
    control.selectLayers([13]);
    await sync();
  });

  it("previews on click, replacing the previous preview; pins on double click", async () => {
    const ide = useIde.getState();
    await ide.openProperty(POSITION, false);
    await ide.openProperty(SCALE, false);
    expect(useIde.getState().tabs.map((t) => t.key)).toEqual([SCALE]);
    await ide.openProperty(SCALE, true);
    await ide.openProperty(POSITION, false);
    const tabs = useIde.getState().tabs;
    expect(tabs.map((t) => [t.propName, t.preview])).toEqual([
      ["Scale", false],
      ["Position", true],
    ]);
    expect(tabs[1]!.layerName).toBe("Title_Text");
    expect(tabs[1]!.code).toContain("wiggle(");
  });

  it("editing a preview tab keeps it open", async () => {
    const ide = useIde.getState();
    await ide.openProperty(POSITION, false);
    ide.updateCode(POSITION, "[0, 0]");
    await ide.openProperty(SCALE, false);
    expect(useIde.getState().tabs.map((t) => t.propName)).toEqual(["Position", "Scale"]);
  });

  it("applies through the bridge in one undo group and updates the tree", async () => {
    const ide = useIde.getState();
    await ide.openProperty(SCALE, true);
    ide.updateCode(SCALE, "[50, 50]");
    expect(isDirty(useIde.getState().tabs[0]!)).toBe(true);
    await ide.apply(SCALE);
    const s = useIde.getState();
    expect(isDirty(s.tabs[0]!)).toBe(false);
    expect(control.getExpression(SCALE)).toBe("[50, 50]");
    expect(control.undoGroups()).toEqual(["Expression IDE: Scale"]);
    expect(findNode(s, SCALE)?.expression).toBe("[50, 50]");
    expect(s.status).toEqual({ kind: "ok", text: "Applied: Title_Text › Scale" });
  });

  it("reports AE's error on apply", async () => {
    const ide = useIde.getState();
    await ide.openProperty(SCALE, true);
    ide.updateCode(SCALE, "[1,\n2,\n");
    await ide.apply(SCALE);
    const s = useIde.getState();
    expect(s.tabs[0]!.error).toMatch(/line 3/);
    expect(s.status?.kind).toBe("error");
    expect(findNode(s, SCALE)?.expressionError).toMatch(/SyntaxError/);
  });

  it("apply all applies only dirty tabs", async () => {
    const ide = useIde.getState();
    await ide.openProperty(SCALE, true);
    await ide.openProperty(POSITION, true);
    ide.updateCode(SCALE, "[10, 10]");
    await ide.applyAll();
    expect(control.undoGroups()).toEqual(["Expression IDE: Scale"]);
  });
});

describe("refresh", () => {
  it("keeps deep groups visible while refetching and picks up layer renames in tabs", async () => {
    control.selectLayers([13]);
    await sync();
    const shadow = "100:13:ADBE Effect Parade/ADBE Drop Shadow";
    await useIde.getState().toggle(shadow);
    await useIde.getState().openProperty(POSITION, true);
    control.renameLayer(13, "Headline");
    const pending = useIde.getState().setTree(await bridge.getCompTree(2));
    // Before the refetch resolves, the Drop Shadow children are still there.
    expect(findNode(useIde.getState(), `${shadow}/ADBE Drop Shadow-0002`)).toBeDefined();
    await pending;
    expect(findNode(useIde.getState(), `${shadow}/ADBE Drop Shadow-0002`)).toBeDefined();
    expect(useIde.getState().tabs[0]!.layerName).toBe("Headline");
  });
});

describe("reset", () => {
  it("closes tabs, clears caches and errors, and asks for a refetch", async () => {
    control.selectLayers([13]);
    await sync();
    await useIde.getState().openProperty(POSITION, true);
    useIde.getState().setStatus({ kind: "error", text: "boom" });
    const nonce = useIde.getState().refreshNonce;
    useIde.getState().reset();
    const s = useIde.getState();
    expect(s.tabs).toEqual([]);
    expect(s.activeTab).toBeNull();
    expect(s.status).toBeNull();
    expect(s.tree).toBeNull();
    expect(s.loaded).toEqual({});
    expect(s.refreshNonce).toBe(nonce + 1);
    // The next sync re-expands the selection as on first load.
    await sync();
    expect(useIde.getState().expanded["100:13:ADBE Transform Group"]).toBe(true);
  });

  it("summarises AE's error in the status bar and keeps the full text", async () => {
    control.selectLayers([13]);
    await sync();
    await useIde.getState().openProperty(SCALE, true);
    useIde.getState().updateCode(SCALE, "1;\ntime *");
    await useIde.getState().apply(SCALE);
    const { status } = useIde.getState();
    expect(status?.text).toBe("Title_Text › Scale: Line 2: SyntaxError: Unexpected token");
    expect(status?.detail).toMatch(/^Expression Disabled\nError at line 2 in property 'Scale'/);
  });
});

describe("double click", () => {
  it("opens one tab when clicks race", async () => {
    control.selectLayers([13]);
    await sync();
    const ide = useIde.getState();
    await Promise.all([ide.openProperty(POSITION, false), ide.openProperty(POSITION, false), ide.openProperty(POSITION, true)]);
    const tabs = useIde.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.preview).toBe(false);
  });
});

describe("auto-apply", () => {
  beforeEach(async () => {
    control.selectLayers([13]);
    await sync();
    await useIde.getState().openProperty(SCALE, true);
    useIde.getState().setAutoApply(true);
    vi.useFakeTimers();
  });
  afterEach(() => {
    useIde.getState().setAutoApply(false);
    vi.useRealTimers();
  });

  it("applies valid code once typing pauses, as one undo step", async () => {
    const ide = useIde.getState();
    ide.updateCode(SCALE, "[5");
    ide.updateCode(SCALE, "[50, 5");
    ide.updateCode(SCALE, "[50, 50]");
    await vi.advanceTimersByTimeAsync(AUTO_APPLY_MS - 100);
    expect(control.undoGroups()).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(control.getExpression(SCALE)).toBe("[50, 50]");
    expect(control.undoGroups()).toEqual(["Expression IDE: Scale"]);
    expect(useIde.getState().status?.text).toBe("Auto-applied: Title_Text › Scale");
  });

  it("waits while a reference names something the comp doesn't have", async () => {
    const pending = bridge.getCompSchema(); // the mock answers on a (fake) timer
    await vi.advanceTimersByTimeAsync(10);
    useIde.getState().setSchema((await pending)!);
    const ide = useIde.getState();
    ide.updateCode(SCALE, 'value * thisComp.layer("CTRLS").effect("")');
    await vi.advanceTimersByTimeAsync(AUTO_APPLY_MS * 2);
    expect(control.undoGroups()).toEqual([]);
    ide.updateCode(SCALE, 'value * thisComp.layer("CTRLS").effect("Speed")("Slider")');
    await vi.advanceTimersByTimeAsync(AUTO_APPLY_MS + 100);
    expect(control.undoGroups()).toEqual(["Expression IDE: Scale"]);
  });

  it("never auto-applies a syntax error or an emptied field", async () => {
    const ide = useIde.getState();
    ide.updateCode(SCALE, "[50, ");
    await vi.advanceTimersByTimeAsync(AUTO_APPLY_MS * 2);
    ide.updateCode(SCALE, "  ");
    await vi.advanceTimersByTimeAsync(AUTO_APPLY_MS * 2);
    expect(control.undoGroups()).toEqual([]);
    expect(canAutoApply({ ...useIde.getState().tabs[0]!, code: "[1, 2]" })).toBe(true);
  });

  it("does nothing when switched off, and an explicit apply cancels the pending one", async () => {
    const ide = useIde.getState();
    ide.updateCode(SCALE, "[1, 1]");
    ide.setAutoApply(false);
    await vi.advanceTimersByTimeAsync(AUTO_APPLY_MS * 2);
    expect(control.undoGroups()).toEqual([]);

    ide.setAutoApply(true);
    ide.updateCode(SCALE, "[2, 2]");
    const applied = ide.apply(SCALE); // the mock answers on a timer too
    await vi.advanceTimersByTimeAsync(AUTO_APPLY_MS * 2);
    await applied;
    expect(control.undoGroups()).toEqual(["Expression IDE: Scale"]);
  });
});

describe("references from the tree", () => {
  const SLIDER = "100:11:ADBE Effect Parade/ADBE Slider Control/ADBE Slider Control-0001";

  beforeEach(async () => {
    control.selectLayers([11, 13]);
    await sync();
    await useIde.getState().toggle("100:11:ADBE Effect Parade/ADBE Slider Control"); // load the Slider
  });

  it("references by matchName when the setting is on", async () => {
    useIde.getState().setSettings({ byMatchName: true });
    expect(referenceFor(useIde.getState(), SLIDER)?.code).toBe('thisComp.layer("CTRLS").effect("ADBE Slider Control")("ADBE Slider Control-0001")');
    useIde.getState().setSettings({ byMatchName: false });
  });

  it("writes references relative to the active tab", async () => {
    expect(referenceFor(useIde.getState(), SLIDER)?.code).toBe('thisComp.layer("CTRLS").effect("Speed")("Slider")');
    await useIde.getState().openProperty(POSITION, true);
    expect(referenceFor(useIde.getState(), SLIDER)?.code).toBe('thisComp.layer("CTRLS").effect("Speed")("Slider")');
    expect(referenceFor(useIde.getState(), SCALE)?.code).toBe("transform.scale");
    expect(referenceFor(useIde.getState(), CTRLS)?.code).toBe('thisComp.layer("CTRLS")');
  });

  it("picks the timeline selection", async () => {
    await useIde.getState().openProperty(POSITION, true);
    control.selectProperty(SLIDER);
    const ref = await useIde.getState().pickFromTimeline();
    expect(ref?.code).toBe('thisComp.layer("CTRLS").effect("Speed")("Slider")');
    control.selectProperty(null);
    control.selectLayers([]);
    expect(await useIde.getState().pickFromTimeline()).toBeNull();
    expect(useIde.getState().status?.text).toMatch(/Select a property/);
  });

  it("removes, disables and enables expressions", async () => {
    const ide = useIde.getState();
    await ide.openProperty(POSITION, true);
    await ide.setExpressionEnabled(POSITION, false);
    expect(findNode(useIde.getState(), POSITION)?.expressionEnabled).toBe(false);
    await ide.removeExpression(POSITION);
    expect(control.getExpression(POSITION)).toBe("");
    expect(useIde.getState().tabs[0]!.code).toBe("");
    expect(findNode(useIde.getState(), POSITION)?.expression).toBe("");
    expect(control.undoGroups()).toEqual(["Disable expression: Position", "Expression IDE: Position"]);
  });
});

describe("value strip", () => {
  it("reads the active tab's value at the playhead, and the expression's error", async () => {
    control.selectLayers([13]);
    await sync();
    const ide = useIde.getState();
    await ide.openProperty(SCALE, true);
    await ide.refreshValue();
    expect(useIde.getState().reading).toEqual({ key: SCALE, reading: { time: 0, value: [100, 100] } });
    control.setTime(2);
    control.setValue(SCALE, [50, 50]);
    await ide.refreshValue();
    expect(useIde.getState().reading?.reading).toEqual({ time: 2, value: [50, 50] });
    await ide.openProperty("100:13:ADBE Transform Group/ADBE Rotate Z", true);
    await ide.setExpressionEnabled("100:13:ADBE Transform Group/ADBE Rotate Z", true);
    await ide.refreshValue();
    expect(useIde.getState().reading?.reading.error).toMatch(/SyntaxError/);
  });
});

describe("problems", () => {
  it("scans only while open (or when forced), and refreshes after an apply", async () => {
    control.selectLayers([13]);
    await sync();
    const ide = useIde.getState();
    await ide.refreshProblems();
    expect(useIde.getState().problems).toBeNull();
    ide.setProblemsOpen(true);
    await ide.refreshProblems();
    const scan = useIde.getState().problems!;
    expect(scan.entries.map((e) => e.path.join(" › "))).toEqual([
      "Text › Source Text",
      "Transform › Position",
      "Transform › Rotation",
      "Transform › Opacity",
    ]);
    expect(scan.entries.filter((e) => e.error).map((e) => e.key)).toEqual(["100:13:ADBE Transform Group/ADBE Rotate Z"]);
    await ide.openProperty(SCALE, true);
    ide.updateCode(SCALE, "1 +");
    await ide.apply(SCALE);
    await vi.waitFor(() => expect(useIde.getState().problems!.entries.filter((e) => e.error)).toHaveLength(2));
  });

  it("reveals a property in the tree, loading its groups", async () => {
    control.selectLayers([]);
    await sync();
    const shadowOpacity = "100:13:ADBE Effect Parade/ADBE Drop Shadow/ADBE Drop Shadow-0002";
    await useIde.getState().revealInTree(shadowOpacity);
    const s = useIde.getState();
    expect(s.selectedKey).toBe(shadowOpacity);
    expect(findNode(s, shadowOpacity)?.name).toBe("Opacity");
    expect(s.expanded["100:13"]).toBe(true);
  });
});

describe("pinning", () => {
  afterEach(() => {
    if (useIde.getState().pinned.includes("CTRLS")) useIde.getState().togglePin("CTRLS");
  });

  it("pins a layer open with its effects, remembers it, and unpins", async () => {
    control.selectLayers([13]);
    await sync();
    useIde.getState().togglePin("CTRLS");
    await vi.waitFor(() => expect(findNode(useIde.getState(), "100:11:ADBE Effect Parade/ADBE Slider Control")).toBeDefined());
    expect(useIde.getState().expanded[CTRLS]).toBe(true);
    expect(JSON.parse(localStorage.getItem("expression-ide.pinned")!)).toEqual(["CTRLS"]);
    useIde.getState().togglePin("CTRLS");
    expect(useIde.getState().pinned).toEqual([]);
  });

  it("opens pinned layers the first time a comp shows them", async () => {
    useIde.setState({ pinned: ["CTRLS"] });
    await sync();
    expect(useIde.getState().expanded[CTRLS]).toBe(true);
    expect(useIde.getState().expanded["100:11:ADBE Effect Parade"]).toBe(true);
    useIde.setState({ pinned: [] });
  });
});

describe("split view", () => {
  it("shows a tab on the side, keeps it open, and closes with it", async () => {
    control.selectLayers([13]);
    await sync();
    const ide = useIde.getState();
    await ide.openProperty(POSITION, false);
    ide.openToSide(POSITION);
    expect(useIde.getState().splitTab).toBe(POSITION);
    expect(useIde.getState().tabs[0]!.preview).toBe(false);
    await ide.openProperty(SCALE, false);
    expect(useIde.getState().tabs.map((t) => t.key)).toEqual([POSITION, SCALE]);
    ide.closeTab(POSITION);
    expect(useIde.getState().splitTab).toBeNull();
  });

  it("writes references relative to the editor they go into", async () => {
    control.selectLayers([11, 13]);
    await sync();
    await useIde.getState().openProperty(POSITION, true);
    const ctrlsPos = "100:11:ADBE Transform Group/ADBE Position";
    expect(referenceFor(useIde.getState(), ctrlsPos)?.code).toBe('thisComp.layer("CTRLS").transform.position');
    expect(referenceFor(useIde.getState(), ctrlsPos, "100:11:ADBE Transform Group/ADBE Scale")?.code).toBe("transform.position");
  });
});

describe("changes made in After Effects", () => {
  beforeEach(async () => {
    control.selectLayers([13]);
    await sync();
    await useIde.getState().openProperty(POSITION, true);
  });

  it("a clean tab follows AE", async () => {
    control.setExpressionInAE(POSITION, "[1, 1]");
    await useIde.getState().syncTabs();
    const t = useIde.getState().tabs[0]!;
    expect([t.code, t.original, t.external]).toEqual(["[1, 1]", "[1, 1]", undefined]);
    expect(useIde.getState().status?.text).toBe("Updated from After Effects: Title_Text › Position");
  });

  it("an edited tab gets a conflict; either version can win", async () => {
    const ide = useIde.getState();
    ide.updateCode(POSITION, "[9, 9]");
    control.setExpressionInAE(POSITION, "[1, 1]");
    await ide.syncTabs();
    expect(useIde.getState().tabs[0]!.external).toBe("[1, 1]");
    ide.resolveExternal(POSITION, "mine");
    let t = useIde.getState().tabs[0]!;
    expect([t.code, t.original, t.external]).toEqual(["[9, 9]", "[1, 1]", undefined]);

    control.setExpressionInAE(POSITION, "[2, 2]");
    await ide.syncTabs();
    ide.resolveExternal(POSITION, "ae");
    t = useIde.getState().tabs[0]!;
    expect([t.code, t.original, t.external]).toEqual(["[2, 2]", "[2, 2]", undefined]);
  });

  it("an apply landing between reads isn't mistaken for a conflict", async () => {
    const ide = useIde.getState();
    ide.updateCode(POSITION, "[3, 3]");
    control.setExpressionInAE(POSITION, "[3, 3]");
    await ide.syncTabs();
    const t = useIde.getState().tabs[0]!;
    expect([t.original, t.external, isDirty(t)]).toEqual(["[3, 3]", undefined, false]);
  });

  it("auto-apply never overwrites a change made in AE", async () => {
    const t = { ...useIde.getState().tabs[0]!, code: "[5, 5]", external: "[1, 1]" };
    expect(canAutoApply(t)).toBe(false);
  });
});

describe("renames", () => {
  async function fullSync() {
    await useIde.getState().setTree(await bridge.getCompTree(2));
    await useIde.getState().setSchema(await bridge.getCompSchema());
  }

  beforeEach(async () => {
    control.selectLayers([13]);
    await fullSync();
  });

  it("offers to update open tabs and the comp when a layer is renamed", async () => {
    await useIde.getState().openProperty(POSITION, true);
    useIde.getState().updateCode(POSITION, 'thisComp.layer("CTRLS").transform.position');
    control.renameLayer(11, "Controls");
    await fullSync();
    const offer = useIde.getState().renameOffer!;
    expect(offer.summary).toBe("Layer “CTRLS” → “Controls”");
    // The tab's edit, plus the comp's applied Position and Source Text expressions.
    expect([offer.tabCount, offer.compCount]).toEqual([1, 2]);

    await useIde.getState().applyRenames("all");
    expect(control.getExpression(POSITION)).toBe('wiggle(thisComp.layer("Controls").effect("Speed")("Slider"), 20)');
    expect(control.getExpression("100:13:ADBE Text Properties/ADBE Text Document")).toBe('thisComp.layer("Controls").name');
    expect(control.undoGroups()).toEqual(["Expression IDE: update references (Layer “CTRLS” → “Controls”)"]);
    expect(useIde.getState().tabs[0]!.code).toBe('thisComp.layer("Controls").transform.position');
    expect(useIde.getState().renameOffer).toBeNull();
  });

  it("handles effect renames, and only open tabs when asked", async () => {
    await useIde.getState().openProperty(POSITION, true);
    control.renameEffect(11, "Speed", "Pace");
    await fullSync();
    expect(useIde.getState().renameOffer).toMatchObject({ summary: "Effect “Speed” → “Pace” on CTRLS", tabCount: 1, compCount: 1 });
    await useIde.getState().applyRenames("tabs");
    expect(useIde.getState().tabs[0]!.code).toBe('wiggle(thisComp.layer("CTRLS").effect("Pace")("Slider"), 20)');
    expect(control.getExpression(POSITION)).toContain('effect("Speed")'); // AE untouched
  });

  it("offers nothing when no expression uses the old name", async () => {
    control.renameLayer(12, "Brand");
    await fullSync();
    expect(useIde.getState().renameOffer).toBeNull();
  });
});

describe("batch apply", () => {
  it("applies to the same property on every selected layer, in one undo step", async () => {
    control.selectLayers([11, 13, 15]);
    await sync();
    const ide = useIde.getState();
    await ide.openProperty(SCALE, true);
    expect(batchTargets(useIde.getState(), SCALE)).toEqual([
      "100:11:ADBE Transform Group/ADBE Scale",
      SCALE,
      "100:15:ADBE Transform Group/ADBE Scale",
    ]);
    ide.updateCode(SCALE, "[200, 200]");
    await ide.applyToSelected(SCALE);
    expect(control.getExpression("100:11:ADBE Transform Group/ADBE Scale")).toBe("[200, 200]");
    expect(control.getExpression(SCALE)).toBe("[200, 200]");
    expect(control.undoGroups()).toEqual(["Expression IDE: Scale on 3 layers"]);
    // The camera has no Scale.
    expect(useIde.getState().status?.text).toBe("Applied Scale to 2 layers, 1 without Scale.");
    expect(isDirty(useIde.getState().tabs[0]!)).toBe(false);
  });
});

describe("linked files", () => {
  beforeEach(async () => {
    getFiles(); // creates window.__mockFS
    control.selectLayers([13]);
    await sync();
    await useIde.getState().openProperty(SCALE, true);
  });
  afterEach(() => useIde.getState().unlinkFile(SCALE));

  it("writes the tab to the file and applies every save of it", async () => {
    window.__mockFS!.nextChoice("/work/scale.js");
    await useIde.getState().linkFile(SCALE);
    expect(useIde.getState().tabs[0]!.linkedFile).toBe("/work/scale.js");
    expect(window.__mockFS!.read("/work/scale.js")).toBe("");

    window.__mockFS!.save("/work/scale.js", "[25, 25]");
    await vi.waitFor(() => expect(control.getExpression(SCALE)).toBe("[25, 25]"));
    expect(useIde.getState().tabs[0]!.code).toBe("[25, 25]");
    expect(useIde.getState().status?.text).toBe("Applied from file: Title_Text › Scale");

    // Applying in the panel writes the file back.
    useIde.getState().updateCode(SCALE, "[30, 30]");
    await useIde.getState().apply(SCALE);
    await vi.waitFor(() => expect(window.__mockFS!.read("/work/scale.js")).toBe("[30, 30]"));

    useIde.getState().unlinkFile(SCALE);
    window.__mockFS!.save("/work/scale.js", "[1, 1]");
    await new Promise((r) => setTimeout(r, 30));
    expect(control.getExpression(SCALE)).toBe("[30, 30]");
  });

  it("can start from an existing file's code", async () => {
    window.__mockFS!.save("/work/existing.js", "value / 2");
    window.__mockFS!.nextChoice("/work/existing.js");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await useIde.getState().linkFile(SCALE);
    confirm.mockRestore();
    expect(control.getExpression(SCALE)).toBe("value / 2");
  });

  it("does nothing when the dialog is cancelled; names files after the tab", async () => {
    window.__mockFS!.nextChoice(null);
    await useIde.getState().linkFile(SCALE);
    expect(useIde.getState().tabs[0]!.linkedFile).toBeUndefined();
    expect(suggestFileName("Title: Main", "Position")).toBe("Title_ Main - Position.js");
  });
});

describe("linked files across sessions", () => {
  afterEach(() => localStorage.removeItem("expression-ide.links"));

  it("reopens and re-links tabs when the project is opened again", async () => {
    getFiles();
    control.selectLayers([13]);
    await sync();
    await useIde.getState().setProjectPath("/work/Main.aep");
    await useIde.getState().openProperty(SCALE, true);
    window.__mockFS!.nextChoice("/work/session-scale.js");
    await useIde.getState().linkFile(SCALE);
    window.__mockFS!.save("/work/session-scale.js", "[10, 10]");
    await vi.waitFor(() => expect(control.getExpression(SCALE)).toBe("[10, 10]"));

    // "Restart": a fresh panel state; meanwhile the file was edited in VS Code.
    useIde.getState().reset();
    useIde.setState({ projectPath: "" });
    window.__mockFS!.save("/work/session-scale.js", "[11, 11]");
    await sync();
    await useIde.getState().setProjectPath("/work/Main.aep");

    const tab = useIde.getState().tabs.find((t) => t.key === SCALE)!;
    expect(tab.linkedFile).toBe("/work/session-scale.js");
    expect([tab.code, tab.original]).toEqual(["[11, 11]", "[10, 10]"]); // loaded, not applied
    expect(control.getExpression(SCALE)).toBe("[10, 10]");
    expect(useIde.getState().status?.text).toMatch(/changed since it was last applied/);

    // And saves are followed again.
    window.__mockFS!.save("/work/session-scale.js", "[12, 12]");
    await vi.waitFor(() => expect(control.getExpression(SCALE)).toBe("[12, 12]"));
    useIde.getState().unlinkFile(SCALE);
    expect(storedLinksFor("/work/Main.aep")).toEqual({});
  });
});
