import type { ApplyResult, CompTree, TreeNode } from "./types";

/**
 * The functions src/jsx exposes on the extension namespace. src/jsx/index.ts checks the host implements it, and
 * the panel's CEP bridge calls through it, so the panel never type-checks against the After Effects DOM.
 */
export interface HostApi {
  getSelectionHash(): string;
  getCompTree(depth: number): CompTree | null;
  getChildren(key: string): TreeNode[];
  getProperty(key: string): TreeNode;
  setExpression(key: string, code: string): ApplyResult;
  setExpressionEnabled(key: string, on: boolean): TreeNode;
  revealInTimeline(key: string): void;
}
