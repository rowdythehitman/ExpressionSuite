// Monaco bundled locally (CEP panels are offline; @monaco-editor/react would otherwise load it from a CDN).
// Workers are inlined as blob URLs because CEP serves the panel from file://.
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker&inline";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker.js?worker&inline";

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    return label === "typescript" || label === "javascript" ? new TsWorker() : new EditorWorker();
  },
};

// Expressions aren't browser code: no DOM in completions, and no semantic errors until AE typings arrive (phase 2).
monaco.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  lib: ["es2020"],
  allowNonTsExtensions: true,
  noLib: false,
});
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

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
