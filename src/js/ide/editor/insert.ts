import type { editor } from "monaco-editor";
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

/** Alt-drop: declares the reference as a `const` on a new first line, named after the property. Returns the name. */
export function insertConst(ed: Editor, ref: Reference, target: RefTarget): string {
  const model = ed.getModel();
  const name = suggestConstName(target, model?.getValue() ?? "");
  ed.executeEdits("expression-ide", [
    { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: `const ${name} = ${ref.code};\n`, forceMoveMarkers: true },
  ]);
  ed.pushUndoStop();
  ed.focus();
  return name;
}
