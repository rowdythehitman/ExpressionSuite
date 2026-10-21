import type { ApplyResult, BatchResult, CompSchema, RefPath, ValueSamples, CompTree, ExpressionScan, RefTarget, SelectionHash, TreeNode, ValueReading } from "../../shared/types";

export type { ApplyResult, BatchResult, CompInfo, RefPath, ValueSamples, CompSchema, SchemaEffect, SchemaLayer, CompTree, ExpressionEntry, ExpressionScan, NodeKind, RefSegment, RefTarget, SelectionHash, TreeNode, ValueReading, ValueType } from "../../shared/types";

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
  /** Several applies as one undo step named `undoName`; per-item results, missing properties reported not thrown. */
  setExpressions(items: { key: string; code: string }[], undoName: string): Promise<BatchResult[]>;
  /** Fresh reads of several properties (null where one no longer exists), for keeping open tabs in sync. */
  getProperties(keys: string[]): Promise<(TreeNode | null)[]>;
  /** Selects the layer and property in the timeline. */
  revealInTimeline(key: string): Promise<void>;
  /** The property (or group, or layer) selected in AE's timeline, for pick-from-timeline. */
  getSelectedRef(): Promise<RefTarget | null>;
  /** Layers, effects and parameters of the active comp, for name completions. */
  getCompSchema(): Promise<CompSchema | null>;
  /** The property's value after its expression, at `time` (default: the comp's current time). */
  getValueAtTime(key: string, time?: number): Promise<ValueReading>;
  /** Values of references written in code, for showing them inline; null where one doesn't resolve. */
  readReferences(compId: number, layerId: number, paths: RefPath[]): Promise<(ValueReading | null)[]>;
  /** The tree key of what a reference in code points at (go to definition); null if it doesn't resolve. */
  resolveReferenceKey(compId: number, layerId: number, path: RefPath): Promise<string | null>;
  /** The property's value at `count` times across the comp's work area (value graph). */
  sampleValues(key: string, count: number): Promise<ValueSamples>;
  /** Adds an expression control to a layer, set to `value`, as one undo step; resolves to the effect's name. */
  addControl(layerId: number, matchName: string, name: string, value: number | number[]): Promise<string>;
  /** Several controls on one layer as one undo step; resolves to their names. */
  addControls(layerId: number, items: { matchName: string; name: string; value: number | number[] }[], undoName: string): Promise<string[]>;
  /** Every expression in the active comp, with AE's error for each (Problems list). */
  findAllExpressions(): Promise<ExpressionScan | null>;
}

export type BridgeErrorCode = "NO_COMP" | "NOT_FOUND" | "NO_EFFECTS" | "HOST" | "TRANSPORT";

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
