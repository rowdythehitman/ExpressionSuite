// Runs TypeScript's language service over the generated typings, the same engine Monaco's worker uses.
import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { fixtureComp } from "../src/js/bridge/fixture";
import { createMockBridge } from "../src/js/bridge/mock";
import type { CompSchema } from "../src/js/bridge/types";
import { buildAeLib, compLib, contextLib } from "../src/js/ide/editor/typings";

const dts = readFileSync("node_modules/expression-globals-typescript/dist/index.d.ts", "utf-8");
const tsLib = path.dirname(createRequire(import.meta.url).resolve("typescript"));
let schema: CompSchema;

beforeAll(async () => {
  schema = (await createMockBridge(fixtureComp()).bridge.getCompSchema())!;
});

/** Completions and diagnostics for `code` (cursor at `|`) as if editing a property on `layerId`. */
function service(code: string, layerId: number | null, withSchema = true) {
  const files: Record<string, string> = {
    "ae.d.ts": buildAeLib(dts),
    "comp.d.ts": compLib(withSchema ? schema : null, layerId),
    "ctx.d.ts": contextLib("1D"),
    "expr.js": code.replace("|", ""),
  };
  const options: ts.CompilerOptions = { allowJs: true, checkJs: true, target: ts.ScriptTarget.ES2020, lib: ["lib.es2020.d.ts"], noEmit: true };
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => "1",
    getScriptSnapshot: (f) => {
      const text = files[f] ?? (ts.sys.fileExists(f) ? ts.sys.readFile(f) : undefined);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => "",
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => path.join(tsLib, ts.getDefaultLibFileName(o)),
    fileExists: (f) => f in files || ts.sys.fileExists(f),
    readFile: (f) => files[f] ?? ts.sys.readFile(f),
  };
  const ls = ts.createLanguageService(host);
  const names = () => ls.getCompletionsAtPosition("expr.js", code.indexOf("|"), {})?.entries.map((e) => e.name) ?? [];
  const typeAt = (word: string) => {
    const pos = code.replace("|", "").lastIndexOf(word);
    return ts.displayPartsToString(ls.getQuickInfoAtPosition("expr.js", pos)?.displayParts);
  };
  return { names, typeAt, ls };
}

describe("comp typings", () => {
  it("lists the comp's layers inside thisComp.layer(", () => {
    expect(service('thisComp.layer("|', 13).names()).toEqual(expect.arrayContaining(["CTRLS", "Logo", "Title_Text", "BG_Shape", "Camera 1"]));
  });

  it("lists that layer's effects, then the effect's parameters", () => {
    expect(service('thisComp.layer("CTRLS").effect("|', 13).names()).toEqual(expect.arrayContaining(["Speed", "Accent Colour"]));
    expect(service('thisComp.layer("CTRLS").effect("Speed")("|', 13).names()).toEqual(["Slider"]);
    expect(service('thisComp.layer("Title_Text").effect("Drop Shadow")("|', 13).names()).toEqual(
      expect.arrayContaining(["Shadow Color", "Opacity", "Distance"]),
    );
  });

  it("types the result: a slider is a number property, a colour control a Color", () => {
    const s = service('const s = thisComp.layer("CTRLS").effect("Speed")("Slider");\nconst c = thisComp.layer("CTRLS").effect("Accent Colour")("Color");', 13);
    expect(s.typeAt("s =")).toContain("Property<number>");
    expect(s.typeAt("c =")).toContain("Property<Color>");
  });

  it("types thisLayer and bare effect() as the edited layer", () => {
    expect(service('effect("|', 11).names()).toEqual(expect.arrayContaining(["Speed", "Accent Colour"]));
    expect(service('thisLayer.effect("|', 13).names()).toEqual(["Drop Shadow"]);
  });

  it("still accepts any name, and works with no comp", () => {
    const { ls } = service('thisComp.layer("Nope").effect("X")("Y");\nthisComp.layer(1);', 13);
    expect(ls.getSemanticDiagnostics("expr.js").map((d) => d.messageText)).toEqual([]);
    expect(service("thisComp.|", null, false).names()).toEqual(expect.arrayContaining(["layer", "numLayers"]));
  });
});
