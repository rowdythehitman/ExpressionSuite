import type { ApplyResult, BatchResult, CompSchema, RefPath, ValueSamples, CompTree, ExpressionScan, RefTarget, SelectionHash, TreeNode, ValueReading } from "./types";

/**
 * The functions src/jsx exposes on the extension namespace. src/jsx/index.ts checks the host implements it, and
 * the panel's CEP bridge calls through it, so the panel never type-checks against the After Effects DOM.
 */
export interface HostApi {
  getSelectionHash(): SelectionHash;
  getCompTree(depth: number): CompTree | null;
  getChildren(key: string): TreeNode[];
  getProperty(key: string): TreeNode;
  setExpression(key: string, code: string): ApplyResult;
  setExpressions(items: { key: string; code: string }[], undoName: string): BatchResult[];
  getProperties(keys: string[]): (TreeNode | null)[];
  setExpressionEnabled(key: string, on: boolean): TreeNode;
  revealInTimeline(key: string): void;
  getSelectedRef(): RefTarget | null;
  getCompSchema(): CompSchema | null;
  getValueAtTime(key: string, time?: number): ValueReading;
  readReferences(compId: number, layerId: number, paths: RefPath[]): (ValueReading | null)[];
  sampleValues(key: string, count: number): ValueSamples;
  addControl(layerId: number, matchName: string, name: string, value: number | number[]): string;
  addControls(layerId: number, items: { matchName: string; name: string; value: number | number[] }[], undoName: string): string[];
  findAllExpressions(): ExpressionScan | null;
}
