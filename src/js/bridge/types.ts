import type { ApplyResult, CompTree, RefTarget, SelectionHash, TreeNode } from "../../shared/types";

export type { ApplyResult, CompInfo, CompTree, NodeKind, RefSegment, RefTarget, SelectionHash, TreeNode, ValueType } from "../../shared/types";

/** Everything the panels need from After Effects. The only implementations are cep.ts (real) and mock.ts. */
export interface Bridge {
  /** Cheap fingerprint of project, comp, selection, active property and layer list; polled every 300 ms. */
  getSelectionHash(): Promise<SelectionHash>;
  /** The active comp's layers, or null when no comp is active. `depth` levels below selected layers are loaded. */
  getCompTree(depth: number): Promise<CompTree | null>;
  /** Children of a layer or group, for lazy expansion. */
  getChildren(key: string): Promise<TreeNode[]>;
  /** A fresh read of one property (expression, enabled, error). */
  getProperty(key: string): Promise<TreeNode>;
  /** Sets the expression inside one undo group and reads AE's error back. */
  setExpression(key: string, code: string): Promise<ApplyResult>;
  setExpressionEnabled(key: string, on: boolean): Promise<TreeNode>;
  /** Selects the layer and property in the timeline. */
  revealInTimeline(key: string): Promise<void>;
  /** The property (or group, or layer) selected in AE's timeline, for pick-from-timeline. */
  getSelectedRef(): Promise<RefTarget | null>;
}

export type BridgeErrorCode = "NO_COMP" | "NOT_FOUND" | "HOST" | "TRANSPORT";

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly line?: number;
  constructor(code: BridgeErrorCode, message: string, line?: number) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.line = line;
  }
}
