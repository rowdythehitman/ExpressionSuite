import type { editor } from "monaco-editor";
import { layerConstName, planDeclaration } from "../references/declare";
import type { Reference, RefTarget } from "../references/reference";

/** MIME type the explorer puts on a drag, carrying the node key. */
export const DRAG_MIME = "application/x-expression-ide-key";

// The key of the explorer row being dragged. CEP's browser can drop custom MIME types from a drag, so the drop
// handler reads this first and falls back to DRAG_MIME.
let draggingKey: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | undefined;
export function setDraggingKey(key: string | null): void {
  clearTimeout(clearTimer);
  draggingKey = key;
}
/** At dragend. Delayed, in case a browser reports the end of the drag before the drop itself. */
export function endDrag(): void {
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    draggingKey = null;
  }, 500);
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
 * Ctrl/Cmd-drop: declares the reference as `const <layer><property> = …;` below the declarations at the top of the
 * expression and puts the name at the drop point (an existing declaration of the same reference is reused).
 * Returns the name and whether a const was added.
 */
export function insertDeclaration(
  ed: Editor,
  ref: Reference,
  target: RefTarget,
  at?: { lineNumber: number; column: number },
): { name: string; added: boolean } {
  const code = ed.getModel()?.getValue() ?? "";
  const plan = planDeclaration(code, ref.code, layerConstName(target, code));
  const pos = at ?? ed.getPosition() ?? { lineNumber: 1, column: 1 };
  const point = (line: number, column: number) => ({ startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column });
  const edits: editor.IIdentifiedSingleEditOperation[] = [];
  if (plan.text && plan.line && pos.lineNumber === plan.line && pos.column === 1) {
    // Both land on the same spot: one edit, or Monaco keeps only one of them.
    edits.push({ range: point(pos.lineNumber, 1), text: plan.text + plan.name, forceMoveMarkers: true });
  } else {
    if (plan.text && plan.line) edits.push({ range: point(plan.line, 1), text: plan.text, forceMoveMarkers: true });
    // Ranges are in the original model's coordinates, so both edits go in one call.
    edits.push({ range: point(pos.lineNumber, pos.column), text: plan.name, forceMoveMarkers: true });
  }
  ed.executeEdits("expression-ide", edits);
  ed.pushUndoStop();
  ed.focus();
  return { name: plan.name, added: !!plan.text };
}

/** The "declare a const" modifier: Ctrl on Windows, Cmd on macOS (Ctrl-click there is a right-click). Only that key
 * counts, so a stray Alt or Windows-key state reported during a drag can't change what a plain drag does. */
export function wantsDeclaration(e: { ctrlKey: boolean; metaKey: boolean }, isMac = navigator.platform.startsWith("Mac")): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}
