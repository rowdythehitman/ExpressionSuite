// Monaco bundled locally (CEP panels are offline; @monaco-editor/react would otherwise load it from a CDN).
// Workers are inlined as blob URLs because CEP serves the panel from file://.
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker&inline";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker.js?worker&inline";
import aeDts from "expression-globals-typescript/dist/index.d.ts?raw";
import { buildAeLib, compLib, contextLib } from "./typings";
import type { CompSchema, ValueType } from "../../bridge";

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    return label === "typescript" || label === "javascript" ? new TsWorker() : new EditorWorker();
  },
};

// Expressions aren't browser code: no DOM in completions. Syntax errors come from acorn (syntax.ts), so the
// TypeScript worker's own diagnostics are off; it only powers completions and hovers.
monaco.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  lib: ["es2020"],
  allowNonTsExtensions: true,
  noLib: false,
});
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

// AE's expression API as globals (thisComp, wiggle, loopOut, linear, …) for completions and hovers.
monaco.typescript.javascriptDefaults.addExtraLib(buildAeLib(aeDts), "file:///typings/ae-expressions.d.ts");

/** Types `value` for the property in the active tab; the same path replaces the previous one. */
export function setValueType(valueType: ValueType | undefined): void {
  monaco.typescript.javascriptDefaults.addExtraLib(contextLib(valueType), "file:///typings/ae-context.d.ts");
}
setValueType(undefined);

/** thisComp / thisLayer / effect typed for the active comp and the edited layer (null schema: plain classes). */
export function setCompSchema(schema: CompSchema | null, layerId: number | null): void {
  monaco.typescript.javascriptDefaults.addExtraLib(compLib(schema, layerId), "file:///typings/ae-comp.d.ts");
}
setCompSchema(null, null);

monaco.editor.defineTheme("ae-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#1e1e1e",
  },
});

monaco.editor.defineTheme("ae-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#ffffff",
  },
});

export function setEditorTheme(theme: "dark" | "light"): void {
  monaco.editor.setTheme(theme === "light" ? "ae-light" : "ae-dark");
}

loader.config({ monaco });

export { monaco };
