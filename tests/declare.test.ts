import { describe, expect, it } from "vitest";
import { layerConstName, planDeclaration } from "../src/js/ide/references/declare";
import type { RefTarget } from "../src/js/ide/references/reference";

const t = (layerName: string, path: [string, string][]): RefTarget => ({
  compId: 1,
  compName: "C",
  layerId: 2,
  layerIndex: 1,
  layerName,
  layerMatchName: "ADBE AV Layer",
  path: path.map(([name, matchName]) => ({ name, matchName })),
});

describe("layer + property names (Ctrl-drop)", () => {
  it("joins the layer and the property", () => {
    expect(layerConstName(t("Title_Text", [["Transform", "ADBE Transform Group"], ["Position", "ADBE Position"]]), "")).toBe("titleTextPosition");
    expect(
      layerConstName(t("CTRLS", [["Effects", "ADBE Effect Parade"], ["Speed", "ADBE Slider Control"], ["Slider", "ADBE Slider Control-0001"]]), ""),
    ).toBe("ctrlsSpeed");
    expect(
      layerConstName(t("Title_Text", [["Effects", "ADBE Effect Parade"], ["Drop Shadow", "ADBE Drop Shadow"], ["Opacity", "ADBE Drop Shadow-0002"]]), ""),
    ).toBe("titleTextDropShadowOpacity");
    expect(layerConstName(t("BG Shape", []), "")).toBe("bgShape");
  });

  it("numbers a taken name", () => {
    const target = t("CTRLS", [["Transform", "ADBE Transform Group"], ["Position", "ADBE Position"]]);
    expect(layerConstName(target, "const ctrlsPosition = 1;")).toBe("ctrlsPosition2");
  });
});

describe("planDeclaration", () => {
  it("goes below the declarations at the top", () => {
    const code = 'const a = 1;\nlet b = 2; // note\nvalue + a';
    expect(planDeclaration(code, "x.y", "c")).toEqual({ name: "c", line: 3, text: "const c = x.y;\n" });
    expect(planDeclaration("value", "x.y", "c").line).toBe(1);
    expect(planDeclaration("", "x.y", "c").line).toBe(1);
  });

  it("reuses an existing declaration of the same reference", () => {
    const code = 'const speed = thisComp.layer("CTRLS").effect("Speed")("Slider");\nvalue * speed';
    expect(planDeclaration(code, 'thisComp.layer("CTRLS").effect("Speed")("Slider")', "ctrlsSpeed")).toEqual({
      name: "speed",
      line: null,
      text: null,
    });
  });
});

describe("which drops declare", () => {
  it("is Ctrl on Windows and Cmd on macOS, nothing else", async () => {
    const { wantsDeclaration } = await import("../src/js/ide/editor/insert");
    expect(wantsDeclaration({ ctrlKey: true, metaKey: false }, false)).toBe(true);
    expect(wantsDeclaration({ ctrlKey: false, metaKey: true }, false)).toBe(false); // the Windows key
    expect(wantsDeclaration({ ctrlKey: false, metaKey: true }, true)).toBe(true);
    expect(wantsDeclaration({ ctrlKey: true, metaKey: false }, true)).toBe(false);
  });
});
