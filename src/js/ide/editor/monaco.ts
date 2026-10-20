// Monaco bundled locally (CEP panels are offline; @monaco-editor/react would otherwise load it from a CDN).
// Workers are inlined as blob URLs because CEP serves the panel from file://.
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker&inline";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker.js?worker&inline";
import aeDts from "expression-globals-typescript/dist/index.d.ts?raw";
import { buildAeLib, contextLib } from "./typings";
import type { ValueType } from "../../bridge";

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

monaco.editor.defineTheme("ae-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#1e1e1e",
  },
});

loader.config({ monaco });

export { monaco };
