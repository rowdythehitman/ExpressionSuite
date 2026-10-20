import { describe, expect, it } from "vitest";
import { parseAeError } from "../src/js/ide/aeError";

describe("AE error text", () => {
  it("parses AE 2025's syntax error report", () => {
    const text =
      "Expression Disabled\nError at line 2 in property 'Anchor Point' of layer 1 ('Dark Yellow Solid 1') in comp 'Comp 1'.\nSyntaxError: Unexpected token ')'";
    expect(parseAeError(text)).toEqual({
      line: 2,
      message: "SyntaxError: Unexpected token ')'",
      disabled: true,
      summary: "Line 2: SyntaxError: Unexpected token ')'",
    });
  });

  it("copes with it on one line and with names containing dots and quotes", () => {
    const e = parseAeError("Error at line 14 in property 'Position' of layer 3 ('v1.2 \"hero\"') in comp 'Main.v2'. ReferenceError: foo is not defined");
    expect(e.line).toBe(14);
    expect(e.message).toBe("ReferenceError: foo is not defined");
    expect(e.disabled).toBe(false);
  });

  it("falls back to the whole text when the shape is unknown", () => {
    expect(parseAeError("Something odd happened")).toEqual({
      line: null,
      message: "Something odd happened",
      disabled: false,
      summary: "Something odd happened",
    });
  });
});
