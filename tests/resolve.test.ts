import { describe, expect, it } from "vitest";
import { parse } from "acorn";
import { declaredReferences, resolveReferenceNode } from "../src/js/ide/references/resolve";

const r = (code: string) => resolveReferenceNode((parse(code, { ecmaVersion: "latest" }) as never as { body: { expression: unknown }[] }).body[0]!.expression);

describe("reference → property path", () => {
  it("follows the spec's reference forms", () => {
    expect(r('thisComp.layer("CTRLS").effect("Speed")("Slider")')).toEqual({ layer: { name: "CTRLS" }, steps: ["ADBE Effect Parade", "Speed", "Slider"] });
    expect(r("transform.position")).toEqual({ layer: { self: true }, steps: ["ADBE Transform Group", "ADBE Position"] });
    expect(r('effect("Speed")("Slider")')).toEqual({ layer: { self: true }, steps: ["ADBE Effect Parade", "Speed", "Slider"] });
    expect(r('comp("Controls").layer("CTRLS").effect("Speed")("Slider")')).toMatchObject({ comp: "Controls", layer: { name: "CTRLS" } });
    expect(r('content("Rect 1").content("Fill 1").color')).toEqual({
      layer: { self: true },
      steps: ["ADBE Root Vectors Group", "Rect 1", "ADBE Vectors Group", "Fill 1", ["ADBE Vector Fill Color", "ADBE Vector Stroke Color"]],
    });
    expect(r('text.animator("Animator 1").property.position')).toEqual({
      layer: { self: true },
      steps: ["ADBE Text Properties", "ADBE Text Animators", "Animator 1", "ADBE Text Animator Properties", "ADBE Text Position 3D"],
    });
    expect(r("thisComp.layer(3).transform.opacity.value")).toEqual({ layer: { index: 3 }, steps: ["ADBE Transform Group", "ADBE Opacity"] });
    expect(r('thisLayer.mask("Mask 1").maskPath')).toEqual({ layer: { self: true }, steps: ["ADBE Mask Parade", "Mask 1", "ADBE Mask Shape"] });
  });

  it("refuses anything that isn't a plain reference", () => {
    for (const code of ["value * 2", 'thisComp.layer(n).effect("X")("Y")', "transform.position.valueAtTime(0)", "time", 'thisComp.layer("A")', "wiggle(2, 3)"]) {
      expect(r(code)).toBeNull();
    }
  });
});

describe("declaredReferences", () => {
  it("lists top-level declarations of plain references with their last line", () => {
    const code = 'const speed = thisComp.layer("CTRLS").effect("Speed")("Slider");\nlet p =\n  transform.position;\nconst k = speed * 2;\nvalue';
    expect(declaredReferences(code).map((d) => [d.name, d.line])).toEqual([
      ["speed", 1],
      ["p", 3],
    ]);
    expect(declaredReferences("const a = ;")).toEqual([]);
  });
});
