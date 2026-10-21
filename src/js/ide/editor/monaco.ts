// Monaco bundled locally (CEP panels are offline; @monaco-editor/react would otherwise load it from a CDN).
// Workers are inlined as blob URLs because CEP serves the panel from file://. Each sits in its own chunk, loaded
// the first time Monaco asks for it: the TypeScript worker alone is most of the bundle, and the panel shouldn't
// have to parse it before the explorer appears.
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import aeDts from "expression-globals-typescript/dist/index.d.ts?raw";
import { buildAeLib, compLib, contextLib } from "./typings";
import type { CompSchema, ValueType } from "../../bridge";

self.MonacoEnvironment = {
  async getWorker(_id: string, label: string) {
    const W =
      label === "typescript" || label === "javascript"
        ? (await import("monaco-editor/esm/vs/language/typescript/ts.worker.js?worker&inline")).default
        : (await import("monaco-editor/esm/vs/editor/editor.worker.js?worker&inline")).default;
    return new W();
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
// Quick fixes are ours (setQuickFixes). TypeScript's ("ignore this error", …) don't apply to expressions, and its
// slow worker held up Ctrl+. long enough for the cursor's auto request to cancel it: "No code actions available".
monaco.typescript.javascriptDefaults.setModeConfiguration({ ...monaco.typescript.javascriptDefaults.modeConfiguration, codeActions: false });

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

// Quick fixes (💡, Ctrl+.) for the markers the panel sets: each marker's fixes are registered per model.
export interface RegisteredFix {
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  title: string;
  edits: { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }[];
}
const fixesByModel = new Map<string, Map<string, RegisteredFix[]>>();

/** Replaces the fixes one marker owner ("names", "after-effects", …) offers for a model. */
export function setQuickFixes(model: monaco.editor.ITextModel, owner: string, fixes: RegisteredFix[]): void {
  const byOwner = fixesByModel.get(model.uri.toString()) ?? new Map<string, RegisteredFix[]>();
  byOwner.set(owner, fixes);
  fixesByModel.set(model.uri.toString(), byOwner);
}

monaco.languages.registerCodeActionProvider("javascript", {
  provideCodeActions(model, range) {
    const all = [...(fixesByModel.get(model.uri.toString())?.values() ?? [])].flat();
    const hits = all.filter((f) => monaco.Range.areIntersectingOrTouching(f.range, range));
    return {
      actions: hits.map((f) => ({
        title: f.title,
        kind: "quickfix",
        isPreferred: true,
        edit: { edits: f.edits.map((e) => ({ resource: model.uri, textEdit: e, versionId: model.getVersionId() })) },
      })),
      dispose() {},
    };
  },
});

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
