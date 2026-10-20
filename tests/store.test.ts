// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { fixtureComp } from "../src/js/bridge/fixture";
import { createMockBridge, type MockControl } from "../src/js/bridge/mock";
import type { Bridge } from "../src/js/bridge/types";
import { findNode, isDirty, setStoreBridge, useIde } from "../src/js/ide/store";

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
