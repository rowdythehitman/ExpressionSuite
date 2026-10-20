import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { buildAeLib, classMembers, contextLib } from "../src/js/ide/editor/typings";

const dts = readFileSync("node_modules/expression-globals-typescript/dist/index.d.ts", "utf-8");

describe("AE typings for Monaco", () => {
  it("finds the layer-scope and property members", () => {
    const layer = classMembers(dts, "Layer");
    expect(layer).toEqual(expect.arrayContaining(["time", "comp", "linear", "ease", "clamp", "effect", "transform", "index"]));
    expect(classMembers(dts, "Property")).toEqual(expect.arrayContaining(["value", "wiggle", "loopOut", "valueAtTime"]));
  });

  it("becomes an ambient script with bare globals", () => {
    const lib = buildAeLib(dts);
    expect(lib).not.toMatch(/^export /m);
    expect(lib).toContain("declare class Layer");
    expect(lib).toContain('declare const wiggle: Property<any>["wiggle"];');
    expect(lib).toContain('declare const time: Layer["time"];');
    expect(lib).toContain("declare const thisProject: Project;");
    // Typed per tab (value) and per comp (thisComp, thisLayer, effect) instead.
    expect(lib).not.toContain("declare const value:");
    expect(lib).not.toContain("declare const thisComp:");
    expect(lib).not.toContain("declare const effect:");
  });

  it("types value by the property", () => {
    expect(contextLib("2D")).toContain("declare const value: [number, number];");
    expect(contextLib(undefined)).toContain("declare const value: any;");
  });
});
