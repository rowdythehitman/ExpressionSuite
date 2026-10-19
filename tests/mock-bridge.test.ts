import { describe, expect, it } from "vitest";
import { BridgeError } from "../src/js/bridge/types";
import { fixtureComp } from "../src/js/bridge/fixture";
import { createMockBridge, mockEvaluate } from "../src/js/bridge/mock";

const POSITION = "100:13:ADBE Transform Group/ADBE Position";

describe("mock bridge", () => {
  it("preloads selected layers to the requested depth", async () => {
    const { bridge, control } = createMockBridge(fixtureComp());
    control.selectLayers([13]);
    const tree = (await bridge.getCompTree(2))!;
    expect(tree.selectedLayerKeys).toEqual(["100:13"]);
    const title = tree.layers[2]!;
    expect(title.children!.map((c) => c.name)).toEqual(["Text", "Transform", "Effects"]);
    expect(title.children![1]!.children!.map((c) => c.name)).toContain("Position");
    expect(tree.layers[0]!.children).toBeUndefined();
  });

  it("applies inside one undo group and reports syntax errors with a line", async () => {
    const { bridge, control } = createMockBridge(fixtureComp());
    const ok = await bridge.setExpression(POSITION, "[100, 200]");
    expect(ok.error).toBeUndefined();
    expect(control.getExpression(POSITION)).toBe("[100, 200]");
    const bad = await bridge.setExpression(POSITION, "const a = 1;\nconst b = 2;\nfoo(");
    expect(bad.error).toMatch(/line 3/);
    expect(bad.node.expressionError).toBe(bad.error);
    expect(control.undoGroups()).toEqual(["Expression IDE: Position", "Expression IDE: Position"]);
  });

  it("changes the selection hash on selection and renames", async () => {
    const { bridge, control } = createMockBridge(fixtureComp());
    const h1 = await bridge.getSelectionHash();
    control.selectLayers([11]);
    const h2 = await bridge.getSelectionHash();
    control.renameLayer(11, "Controls");
    const h3 = await bridge.getSelectionHash();
    expect(new Set([h1, h2, h3]).size).toBe(3);
    expect(await bridge.getSelectionHash()).toBe(h3);
  });

  it("raises NOT_FOUND for keys that no longer resolve", async () => {
    const { bridge } = createMockBridge(fixtureComp());
    await expect(bridge.getProperty("100:99:ADBE Transform Group/ADBE Position")).rejects.toBeInstanceOf(BridgeError);
    await expect(bridge.getProperty("100:13:ADBE Transform Group")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("numbers repeated effects in keys", async () => {
    const comp = fixtureComp();
    const fx = comp.layers[0]!.children[0]!;
    fx.children!.push({ ...fx.children![0]!, name: "Speed 2" });
    const { bridge } = createMockBridge(comp);
    const kids = await bridge.getChildren("100:11:ADBE Effect Parade");
    expect(kids.map((k) => k.key)).toEqual([
      "100:11:ADBE Effect Parade/ADBE Slider Control",
      "100:11:ADBE Effect Parade/ADBE Color Control",
      "100:11:ADBE Effect Parade/ADBE Slider Control[2]",
    ]);
  });

  it("evaluates like AE for syntax only", () => {
    expect(mockEvaluate("wiggle(2, 50)")).toBeUndefined();
    expect(mockEvaluate("time *")).toMatch(/^SyntaxError: .* \(line 1\)$/);
  });
});
