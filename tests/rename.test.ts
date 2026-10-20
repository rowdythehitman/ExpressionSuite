import { describe, expect, it } from "vitest";
import type { CompSchema } from "../src/js/bridge/types";
import { detectRenames, renameInCode, type Rename } from "../src/js/ide/references/rename";

const schema = (ctrls: string, speed: string): CompSchema => ({
  compId: 100,
  compName: "Main",
  layers: [
    { id: 11, index: 1, name: ctrls, effects: [{ name: speed, matchName: "ADBE Slider Control", params: [] }] },
    { id: 13, index: 2, name: "Title", effects: [] },
  ],
});

const layerRename: Rename = { kind: "layer", layerId: 11, from: "CTRLS", to: "Controls" };
const fxRename: Rename = { kind: "effect", layerId: 11, layerName: "CTRLS", from: "Speed", to: "Pace" };
const onTitle = { compName: "Main", layerId: 13 };
const onCtrls = { compName: "Main", layerId: 11 };

describe("detectRenames", () => {
  it("finds renamed layers and effects", () => {
    expect(detectRenames(schema("CTRLS", "Speed"), schema("Controls", "Speed"))).toEqual([layerRename]);
    expect(detectRenames(schema("CTRLS", "Speed"), schema("CTRLS", "Pace"))).toEqual([fxRename]);
    expect(detectRenames(schema("CTRLS", "Speed"), schema("CTRLS", "Speed"))).toEqual([]);
    expect(detectRenames(schema("CTRLS", "Speed"), { ...schema("X", "Y"), compId: 200 })).toEqual([]);
  });
});

describe("renameInCode", () => {
  it("rewrites layer references, keeping quotes", () => {
    expect(renameInCode('thisComp.layer("CTRLS").effect("Speed")("Slider")', [layerRename], onTitle)).toEqual({
      code: 'thisComp.layer("Controls").effect("Speed")("Slider")',
      count: 1,
    });
    expect(renameInCode("thisComp.layer('CTRLS').transform.position", [layerRename], onTitle).code).toBe(
      "thisComp.layer('Controls').transform.position",
    );
    expect(renameInCode('comp("Main").layer("CTRLS")', [layerRename], onTitle).code).toBe('comp("Main").layer("Controls")');
  });

  it("rewrites effect references on the renamed layer only", () => {
    expect(renameInCode('thisComp.layer("CTRLS").effect("Speed")("Slider")', [fxRename], onTitle).code).toBe(
      'thisComp.layer("CTRLS").effect("Pace")("Slider")',
    );
    expect(renameInCode('effect("Speed")("Slider") + thisLayer.effect("Speed")("Slider")', [fxRename], onCtrls)).toEqual({
      code: 'effect("Pace")("Slider") + thisLayer.effect("Pace")("Slider")',
      count: 2,
    });
    expect(renameInCode('effect("Speed")("Slider")', [fxRename], onTitle).count).toBe(0);
    expect(renameInCode('thisComp.layer("Title").effect("Speed")', [fxRename], onTitle).count).toBe(0);
  });

  it("handles a layer and its effect renamed together", () => {
    const fx: Rename = { ...fxRename, layerName: "Controls" };
    expect(renameInCode('thisComp.layer("CTRLS").effect("Speed")', [layerRename, fx], onTitle).code).toBe(
      'thisComp.layer("Controls").effect("Pace")',
    );
  });

  it("leaves strings, comments, other comps and unparsable code alone", () => {
    for (const code of ['const s = "CTRLS"; // layer("CTRLS")', 'comp("Other").layer("CTRLS")', 'thisComp.layer("CTRLS"']) {
      expect(renameInCode(code, [layerRename], onTitle)).toEqual({ code, count: 0 });
    }
  });

  it("escapes the new name", () => {
    const r: Rename = { kind: "layer", layerId: 11, from: "CTRLS", to: 'Ctl "A"' };
    expect(renameInCode('thisComp.layer("CTRLS")', [r], onTitle).code).toBe('thisComp.layer("Ctl \\"A\\"")');
    expect(renameInCode("thisComp.layer('CTRLS')", [{ ...r, to: "it's" }], onTitle).code).toBe("thisComp.layer('it\\'s')");
  });
});
