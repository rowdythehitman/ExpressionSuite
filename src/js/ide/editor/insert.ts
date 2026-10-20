import type { editor } from "monaco-editor";
import { layerConstName, planDeclaration } from "../references/declare";
import { suggestConstName, type Reference, type RefTarget } from "../references/reference";

/** MIME type the explorer puts on a drag, carrying the node key. */
export const DRAG_MIME = "application/x-expression-ide-key";

// The key of the explorer row being dragged. CEP's browser can drop custom MIME types from a drag, so the drop
// handler reads this first and falls back to DRAG_MIME.
let draggingKey: string | null = null;
export function setDraggingKey(key: string | null): void {
  draggingKey = key;
}
export function getDraggingKey(): string | null {
  return draggingKey;
}

type Editor = editor.IStandaloneCodeEditor;

/** Inserts a reference at a position (default: the cursor), replacing the selection when inserting at the cursor. */
export function insertReference(ed: Editor, ref: Reference, at?: { lineNumber: number; column: number }): void {
  const sel = ed.getSelection();
  const range = at
    ? { startLineNumber: at.lineNumber, startColumn: at.column, endLineNumber: at.lineNumber, endColumn: at.column }
    : sel ?? { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
  ed.executeEdits("expression-ide", [{ range, text: ref.code, forceMoveMarkers: true }]);
  ed.pushUndoStop();
  ed.focus();
}

/** Inserts plain text (a drop from outside the panel) at a position, as typed text, never as a snippet. */
export function insertText(ed: Editor, text: string, at?: { lineNumber: number; column: number }): void {
  insertReference(ed, { code: text }, at);
}

/**
 * Declares a dropped reference as a `const` below the declarations at the top of the expression.
 * - "property" (Alt-drop): named after the property (`speed`); only the declaration is added.
 * - "layer" (Ctrl/Cmd-drop): named after layer + property (`ctrlsSpeed`), and the name goes in at the drop point.
 * An existing declaration of the same reference is reused. Returns the name and whether a const was added.
 */
export function insertDeclaration(
  ed: Editor,
  ref: Reference,
  target: RefTarget,
  mode: "property" | "layer",
  at?: { lineNumber: number; column: number },
): { name: string; added: boolean } {
  const code = ed.getModel()?.getValue() ?? "";
  const plan = planDeclaration(code, ref.code, mode === "layer" ? layerConstName(target, code) : suggestConstName(target, code));
  const edits: editor.IIdentifiedSingleEditOperation[] = [];
  if (plan.text && plan.line) {
    edits.push({
      range: { startLineNumber: plan.line, startColumn: 1, endLineNumber: plan.line, endColumn: 1 },
      text: plan.text,
      forceMoveMarkers: true,
    });
  }
  if (mode === "layer") {
    const pos = at ?? ed.getPosition() ?? { lineNumber: 1, column: 1 };
    // Ranges are in the original model's coordinates, so both edits can go in one call.
    edits.push({
      range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
      text: plan.name,
      forceMoveMarkers: true,
    });
  }
  ed.executeEdits("expression-ide", edits);
  ed.pushUndoStop();
  ed.focus();
  return { name: plan.name, added: !!plan.text };
}
