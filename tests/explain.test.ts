import { describe, expect, it } from "vitest";
import { closest, explainError, fixName } from "../src/js/ide/editor/explain";
import type { NameIssue } from "../src/js/ide/editor/names";

const apply = (code: string, edits: { start: number; end: number; text: string }[]) =>
  [...edits].sort((a, b) => b.start - a.start).reduce((c, e) => c.slice(0, e.start) + e.text + c.slice(e.end), code);

const ctx = { layerNames: ["CTRLS", "Title_Text"], effectNames: ["Speed", "Accent Colour"], identifiers: ["speed", "offset"] };

describe("closest names", () => {
  it("suggests typos and near names, not unrelated ones", () => {
    expect(closest("CTLRS", ["CTRLS", "Logo", "Title_Text"])).toEqual(["CTRLS"]);
    expect(closest("Sped", ["Speed", "Accent Colour"])).toEqual(["Speed"]);
    expect(closest("Background", ["CTRLS"])).toEqual([]);
  });
});

describe("quick fixes", () => {
  it("fixes a name the comp doesn't have", () => {
    const code = 'thisComp.layer("CTLRS").transform.position';
    const issue: NameIssue = { line: 1, column: 16, endColumn: 23, message: "", start: 15, end: 22, candidates: ["CTRLS", "Logo"] };
    const [fix] = fixName(code, issue);
    expect(fix!.title).toBe("Did you mean “CTRLS”?");
    expect(apply(code, fix!.edits)).toBe('thisComp.layer("CTRLS").transform.position');
  });

  it("explains a dimension mismatch and wraps the result", () => {
    const e = explainError("Error at line 2 in property 'Position' of layer 1 ('A') in comp 'C'.\nExpression result must be of dimension 2, not 1", "const s = 5;\ns * 10", ctx)!;
    expect(e.hint).toBe("The result has 1 value but this property needs 2.");
    expect(apply("const s = 5;\ns * 10", e.fixes[0]!.edits)).toBe("const s = 5;\n(v => [v, v])(s * 10)");
    expect(apply("const s = 5;\ns * 10", e.fixes[1]!.edits)).toBe("const s = 5;\n[s * 10, value[1]]");
  });

  it("offers the closest layer for a missing layer", () => {
    const code = 'thisComp.layer("CTLRS").effect("Speed")("Slider")';
    const e = explainError("Error: Layer named 'CTLRS' is missing or does not exist.", code, ctx)!;
    expect(e.hint).toMatch(/no layer called “CTLRS”/);
    expect(apply(code, e.fixes[0]!.edits)).toBe('thisComp.layer("CTRLS").effect("Speed")("Slider")');
  });

  it("explains common syntax and reference errors", () => {
    expect(explainError("ReferenceError: sped is not defined", "", ctx)?.hint).toMatch(/Close: speed/);
    expect(explainError("SyntaxError: Unexpected end of input", "", ctx)?.hint).toMatch(/isn't closed/);
    expect(explainError("Something unusual", "", ctx)).toBeNull();
  });
});
