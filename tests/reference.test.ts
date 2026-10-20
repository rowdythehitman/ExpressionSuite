import { describe, expect, it } from "vitest";
import { camelCase, generateReference, type RefSegment, type RefTarget, suggestConstName } from "../src/js/ide/references/reference";

const seg = (name: string, matchName: string): RefSegment => ({ name, matchName });
const TRANSFORM = seg("Transform", "ADBE Transform Group");
const EFFECTS = seg("Effects", "ADBE Effect Parade");
const SPEED_SLIDER = [EFFECTS, seg("Speed", "ADBE Slider Control"), seg("Slider", "ADBE Slider Control-0001")];

function target(over: Partial<RefTarget> & { path: RefSegment[] }): RefTarget {
  return { compId: 100, compName: "Main_Title", layerId: 11, layerIndex: 1, layerName: "CTRLS", layerMatchName: "ADBE AV Layer", ...over };
}
const onCtrls = { compId: 100, layerId: 11 };
const onTitle = { compId: 100, layerId: 13 };
const inOtherComp = { compId: 200, layerId: 5 };
const ref = (t: RefTarget, ctx: Parameters<typeof generateReference>[1]) => generateReference(t, ctx).code;

describe("reference strings (spec table)", () => {
  it("same layer, transform", () => {
    expect(ref(target({ path: [TRANSFORM, seg("Position", "ADBE Position")] }), onCtrls)).toBe("transform.position");
  });

  it("same layer, effect param", () => {
    expect(ref(target({ path: SPEED_SLIDER }), onCtrls)).toBe('effect("Speed")("Slider")');
  });

  it("other layer, same comp", () => {
    expect(ref(target({ path: SPEED_SLIDER }), onTitle)).toBe('thisComp.layer("CTRLS").effect("Speed")("Slider")');
  });

  it("other comp", () => {
    expect(ref(target({ compId: 300, compName: "Controls", path: SPEED_SLIDER }), inOtherComp)).toBe(
      'comp("Controls").layer("CTRLS").effect("Speed")("Slider")',
    );
  });

  it("shape content", () => {
    const path = [
      seg("Contents", "ADBE Root Vectors Group"),
      seg("Rect 1", "ADBE Vector Group"),
      seg("Contents", "ADBE Vectors Group"),
      seg("Fill 1", "ADBE Vector Graphic - Fill"),
      seg("Color", "ADBE Vector Fill Color"),
    ];
    expect(ref(target({ path }), onCtrls)).toBe('content("Rect 1").content("Fill 1").color');
  });

  it("text animator", () => {
    const path = [
      seg("Text", "ADBE Text Properties"),
      seg("Animators", "ADBE Text Animators"),
      seg("Animator 1", "ADBE Text Animator"),
      seg("Properties", "ADBE Text Animator Properties"),
      seg("Position", "ADBE Text Position 3D"),
    ];
    expect(ref(target({ path }), onCtrls)).toBe('text.animator("Animator 1").property.position');
  });
});

describe("reference strings (more)", () => {
  it("uses AE's short forms and falls back to (\"Name\")", () => {
    const t = (path: RefSegment[], layerMatchName = "ADBE AV Layer") => ref(target({ path, layerMatchName }), onTitle);
    expect(t([TRANSFORM, seg("Rotation", "ADBE Rotate Z")])).toBe('thisComp.layer("CTRLS").transform.rotation');
    expect(t([TRANSFORM, seg("Point of Interest", "ADBE Anchor Point")], "ADBE Camera Layer")).toBe(
      'thisComp.layer("CTRLS").transform.pointOfInterest',
    );
    expect(t([seg("Masks", "ADBE Mask Parade"), seg("Mask 1", "ADBE Mask Atom"), seg("Mask Path", "ADBE Mask Shape")])).toBe(
      'thisComp.layer("CTRLS").mask("Mask 1").maskPath',
    );
    expect(t([seg("Text", "ADBE Text Properties"), seg("Source Text", "ADBE Text Document")])).toBe('thisComp.layer("CTRLS").text.sourceText');
    expect(
      t([
        seg("Text", "ADBE Text Properties"),
        seg("Animators", "ADBE Text Animators"),
        seg("Animator 1", "ADBE Text Animator"),
        seg("Selectors", "ADBE Text Selectors"),
        seg("Range Selector 1", "ADBE Text Selector"),
        seg("Start", "ADBE Text Percent Start"),
      ]),
    ).toBe('thisComp.layer("CTRLS").text.animator("Animator 1").selector("Range Selector 1").start');
    expect(
      t([
        seg("Contents", "ADBE Root Vectors Group"),
        seg("Rect 1", "ADBE Vector Group"),
        seg("Transform", "ADBE Vector Transform Group"),
        seg("Position", "ADBE Vector Position"),
      ]),
    ).toBe('thisComp.layer("CTRLS").content("Rect 1").transform.position');
    expect(t([seg("Camera Options", "ADBE Camera Options Group"), seg("Zoom", "ADBE Camera Zoom")])).toBe(
      'thisComp.layer("CTRLS").cameraOption.zoom',
    );
    expect(t([seg("Time Remap", "ADBE Time Remapping")])).toBe('thisComp.layer("CTRLS").timeRemap');
    expect(t([seg("Layer Styles", "ADBE Layer Styles"), seg("Drop Shadow", "dropShadow/enabled"), seg("Opacity", "dropShadow/opacity")])).toBe(
      'thisComp.layer("CTRLS")("Layer Styles")("Drop Shadow")("Opacity")',
    );
  });

  it("puts thisLayer in front of a generic chain on the same layer", () => {
    expect(ref(target({ path: [seg("Layer Styles", "ADBE Layer Styles"), seg("Opacity", "x")] }), onCtrls)).toBe(
      'thisLayer("Layer Styles")("Opacity")',
    );
    expect(ref(target({ path: [] }), onCtrls)).toBe("thisLayer");
    expect(ref(target({ path: [] }), onTitle)).toBe('thisComp.layer("CTRLS")');
  });

  it("falls back to the layer index when names clash, with a warning", () => {
    const r = generateReference(target({ layerIndex: 4, path: SPEED_SLIDER }), { ...onTitle, duplicateLayerName: true });
    expect(r.code).toBe('thisComp.layer(4).effect("Speed")("Slider")');
    expect(r.warning).toMatch(/by index/);
  });

  it("references by matchName when asked", () => {
    expect(ref(target({ path: SPEED_SLIDER }), { ...onTitle, byMatchName: true })).toBe(
      'thisComp.layer("CTRLS").effect("ADBE Slider Control")("ADBE Slider Control-0001")',
    );
  });

  it("escapes quotes and backslashes in names", () => {
    expect(ref(target({ layerName: 'Say "hi" \\o/', path: [] }), onTitle)).toBe('thisComp.layer("Say \\"hi\\" \\\\o/")');
  });
});

describe("const names for Alt-drop", () => {
  it("names controls after the effect and other properties after themselves", () => {
    expect(suggestConstName(target({ path: SPEED_SLIDER }), "")).toBe("speed");
    expect(suggestConstName(target({ path: [EFFECTS, seg("Accent Colour", "ADBE Color Control"), seg("Color", "ADBE Color Control-0001")] }), "")).toBe(
      "accentColour",
    );
    expect(suggestConstName(target({ path: [TRANSFORM, seg("Anchor Point", "ADBE Anchor Point")] }), "")).toBe("ctrlsAnchorPoint");
    expect(suggestConstName(target({ path: [EFFECTS, seg("Drop Shadow", "ADBE Drop Shadow"), seg("Distance", "ADBE Drop Shadow-0004")] }), "")).toBe(
      "distance",
    );
  });

  it("numbers a name already declared", () => {
    expect(suggestConstName(target({ path: SPEED_SLIDER }), "const speed = 1;\nlet speed2 = 2;")).toBe("speed3");
  });

  it("makes identifiers out of anything", () => {
    expect(camelCase("3D Point")).toBe("_3dPoint");
    expect(camelCase("Speed (fast)")).toBe("speedFast");
    expect(camelCase("--")).toBe("ref");
  });
});
