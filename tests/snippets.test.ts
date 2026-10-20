import { describe, expect, it } from "vitest";
import { checkSyntax } from "../src/js/ide/editor/syntax";
import { fillSnippet, SNIPPETS } from "../src/js/ide/snippets";

describe("snippets", () => {
  it.each(SNIPPETS.map((s) => [s.id, s] as const))("%s: placeholders match its controls, and it parses", (_id, s) => {
    const placeholders = [...s.body.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
    expect(new Set(placeholders)).toEqual(new Set(s.controls.map((c) => c.name)));
    const filled = fillSnippet(s.body, Object.fromEntries(s.controls.map((c) => [c.name, 'effect("X")("Y")'])));
    expect(checkSyntax(filled)).toBeNull();
  });

  it("fills placeholders and leaves unknown ones", () => {
    expect(fillSnippet("wiggle({{A}}, {{B}})", { A: "a" })).toBe("wiggle(a, {{B}})");
  });
});
