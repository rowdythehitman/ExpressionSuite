import { describe, expect, it } from "vitest";
import { checkSyntax } from "../src/js/ide/editor/syntax";

describe("instant syntax check", () => {
  it("accepts typical expressions", () => {
    expect(checkSyntax("wiggle(2, 50)")).toBeNull();
    expect(checkSyntax('const s = thisComp.layer("CTRLS").effect("Speed")("Slider");\nvalue * s')).toBeNull();
    expect(checkSyntax("if (time > 1) { 100 } else { 0 }")).toBeNull();
    expect(checkSyntax("")).toBeNull();
  });

  it("reports the line and column of the first error", () => {
    expect(checkSyntax("const a = 1;\nconst b = ;")).toEqual({ line: 2, column: 11, message: "Unexpected token" });
    expect(checkSyntax("time *")?.line).toBe(1);
  });
});
