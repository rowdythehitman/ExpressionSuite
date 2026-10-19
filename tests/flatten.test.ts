import { describe, expect, it } from "vitest";
import type { TreeNode } from "../src/js/bridge/types";
import { createMockBridge } from "../src/js/bridge/mock";
import { fixtureComp } from "../src/js/bridge/fixture";
import { flatten, hasExpressionBelow, type FlattenInput } from "../src/js/ide/tree/flatten";
import { fuzzyMatch } from "../src/js/ide/tree/fuzzy";

async function fixtureTree(selected: number[]): Promise<TreeNode[]> {
  const { bridge, control } = createMockBridge(fixtureComp());
  control.selectLayers(selected);
  return (await bridge.getCompTree(2))!.layers;
}

const base = (layers: TreeNode[], over: Partial<FlattenInput> = {}): FlattenInput => ({
  layers,
  loaded: {},
  expanded: {},
  loading: {},
  filter: "",
  onlyExpressions: false,
  ...over,
});

const names = (input: FlattenInput) => flatten(input).map((r) => `${"  ".repeat(r.depth)}${r.node.name}`);

describe("fuzzy match", () => {
  it("matches subsequences, ignoring case", () => {
    expect(fuzzyMatch("pos", "Position")).toBe(true);
    expect(fuzzyMatch("opa", "Opacity")).toBe(true);
    expect(fuzzyMatch("SLIDER", "Slider")).toBe(true);
    expect(fuzzyMatch("xyz", "Position")).toBe(false);
    expect(fuzzyMatch("  ", "anything")).toBe(true);
  });
});

describe("explorer rows", () => {
  it("lists every layer collapsed, opening only expanded nodes", async () => {
    const layers = await fixtureTree([13]);
    expect(names(base(layers))).toEqual(["CTRLS", "Logo", "Title_Text", "BG_Shape", "Camera 1"]);
    const rows = names(base(layers, { expanded: { "100:13": true, "100:13:ADBE Transform Group": true } }));
    expect(rows.slice(2, 12)).toEqual([
      "Title_Text",
      "  Text",
      "  Transform",
      "    Anchor Point",
      "    Position",
      "    Scale",
      "    Rotation",
      "    Opacity",
      "  Effects",
      "BG_Shape",
    ]);
  });

  it("hides groups with nothing scriptable", async () => {
    const { bridge } = createMockBridge(fixtureComp());
    const kids = await bridge.getChildren("100:12");
    expect(kids.map((k) => k.name)).toEqual(["Masks", "Transform"]);
  });

  it("filters loaded properties and opens their groups", async () => {
    const layers = await fixtureTree([13]);
    expect(names(base(layers, { filter: "rot" }))).toEqual(["Title_Text", "  Transform", "    Rotation"]);
  });

  it("an explicitly collapsed group stays collapsed while filtering", async () => {
    const layers = await fixtureTree([13]);
    expect(names(base(layers, { filter: "rot", expanded: { "100:13:ADBE Transform Group": false } }))).toEqual([
      "Title_Text",
      "  Transform",
    ]);
  });

  it("only-expressions keeps unloaded layers that contain expressions", async () => {
    const layers = await fixtureTree([13]);
    expect(names(base(layers, { onlyExpressions: true }))).toEqual([
      "Title_Text",
      "  Text",
      "    Source Text",
      "  Transform",
      "    Position",
      "    Rotation",
      "    Opacity",
    ]);
    const ctrls = layers[0]!;
    expect(ctrls.containsExpression).toBe(false);
  });

  it("dots folders from loaded children first, then the host's flag", async () => {
    const layers = await fixtureTree([13]);
    const title = layers[2]!;
    const effectsGroup = title.children!.find((c) => c.name === "Effects")!;
    expect(hasExpressionBelow(title, {})).toBe(true);
    expect(hasExpressionBelow(effectsGroup, {})).toBe(false);
    expect(hasExpressionBelow(layers[4]!, {})).toBe(false);
  });
});

describe("fuzzy match on word prefixes", () => {
  it("matches across words but not inside them", () => {
    expect(fuzzyMatch("ap", "Anchor Point")).toBe(true);
    expect(fuzzyMatch("accol", "Accent Colour")).toBe(true);
    expect(fuzzyMatch("rot", "Anchor Point")).toBe(false);
    expect(fuzzyMatch("xrot", "X Rotation")).toBe(true);
    expect(fuzzyMatch("rot", "X Rotation")).toBe(true);
  });
});
