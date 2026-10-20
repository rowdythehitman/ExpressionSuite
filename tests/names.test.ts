import { beforeAll, describe, expect, it } from "vitest";
import { fixtureComp } from "../src/js/bridge/fixture";
import { createMockBridge } from "../src/js/bridge/mock";
import type { CompSchema } from "../src/js/bridge/types";
import { checkNames } from "../src/js/ide/editor/names";

let schema: CompSchema;
beforeAll(async () => {
  schema = (await createMockBridge(fixtureComp()).bridge.getCompSchema())!;
});
const msgs = (code: string, layerId: number | null = 13) => checkNames(code, schema, layerId).map((i) => i.message);

describe("reference name check", () => {
  it("passes references that exist", () => {
    expect(msgs('thisComp.layer("CTRLS").effect("Speed")("Slider") * value')).toEqual([]);
    expect(msgs('effect("Drop Shadow")("Opacity")')).toEqual([]);
    expect(msgs('thisLayer.effect("Drop Shadow")("Distance")')).toEqual([]);
  });

  it("flags unknown layers, effects and parameters, at the string", () => {
    expect(msgs('thisComp.layer("")')).toEqual(['No layer named "" in Main_Title.']);
    expect(msgs('thisComp.layer("CTRLS").effect("Sped")')).toEqual(['CTRLS has no effect named "Sped".']);
    expect(msgs('thisComp.layer("CTRLS").effect("Speed")("Sliderr")')).toEqual(['Speed has no parameter named "Sliderr".']);
    expect(msgs('effect("Speed")', 13)).toEqual(['Title_Text has no effect named "Speed".']);
    const [issue] = checkNames('const a = 1;\nthisComp.layer("Nope")', schema, 13);
    expect(issue).toMatchObject({ line: 2, column: 16, endColumn: 22 });
  });

  it("leaves anything it can't follow alone", () => {
    expect(msgs('thisComp.layer(index - 1).effect("Whatever")("X")')).toEqual([]);
    expect(msgs('const n = "Nope"; thisComp.layer(n)')).toEqual([]);
    expect(msgs('comp("Other").layer("Nope")')).toEqual([]);
    expect(msgs("time *")).toEqual([]);
    expect(checkNames('thisComp.layer("Nope")', null, 13)).toEqual([]);
  });
});
