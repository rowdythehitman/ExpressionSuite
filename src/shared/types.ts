// Data that crosses the bridge. Shared by the panel (src/js) and the host script (src/jsx), so keep it type-only.

export type ValueType = "1D" | "2D" | "3D" | "COLOR" | "TEXT" | "SHAPE" | "OTHER";

export type NodeKind = "layer" | "group" | "property";

export interface TreeNode {
  /** compId:layerId:segment/segment/…, stable across renames and reorders (see shared/keys.ts). */
  key: string;
  kind: NodeKind;
  /** Display name. */
  name: string;
  matchName: string;
  /** Layer index (layers only). */
  index?: number;
  /** True when the node has (or may have) children; false means a leaf or an empty group. */
  hasChildren: boolean;
  /** Present when loaded; absent means "fetch with getChildren(key) on expand". */
  children?: TreeNode[];
  /** Groups and layers: some loaded or unloaded descendant has an expression. */
  containsExpression?: boolean;
  // property-only fields
  valueType?: ValueType;
  expression?: string;
  expressionEnabled?: boolean;
  expressionError?: string;
}

export interface CompInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  frameRate: number;
}

export interface CompTree {
  comp: CompInfo;
  /** Every layer in index order; selected layers come with their first levels loaded. */
  layers: TreeNode[];
  selectedLayerKeys: string[];
  /** The expression-capable property selected in the timeline, if any. */
  activeKey?: string;
}

/** One item of a batch apply: the result, or why the property couldn't be set (e.g. a layer without it). */
export interface BatchResult {
  key: string;
  result?: ApplyResult;
  error?: string;
}

export interface ApplyResult {
  /** AE's expressionError after the apply, if the expression failed. */
  error?: string;
  /** The property as it is now (expression, enabled, error). */
  node: TreeNode;
}

export interface SelectionHash {
  /** Bumped when After Effects switches to a new or different project. */
  project: number;
  /** The active comp's current time (the playhead), so the value strip can follow it without refetching the tree. */
  time: number;
  /** Changes when the comp, selection, active property or layer list changes. */
  hash: string;
}

/** One step below a layer, for building references. */
export interface RefSegment {
  name: string;
  matchName: string;
}

/** Everything the reference generator needs to address a layer, group or property. */
export interface RefTarget {
  compId: number;
  compName: string;
  layerId: number;
  layerIndex: number;
  layerName: string;
  layerMatchName: string;
  /** Groups then the property, from just below the layer. Empty for the layer itself. */
  path: RefSegment[];
}

/** Names the editor can complete for the active comp (spec: Dynamic typings). */
export interface CompSchema {
  compId: number;
  compName: string;
  layers: SchemaLayer[];
}

export interface SchemaLayer {
  id: number;
  index: number;
  name: string;
  effects: SchemaEffect[];
}

export interface SchemaEffect {
  name: string;
  matchName: string;
  params: { name: string; valueType: ValueType }[];
}

/** A property's evaluated value (after its expression) at a time. */
export interface ValueReading {
  time: number;
  /** Numbers, arrays (vectors, colours), text for Source Text, a summary for paths; null when it can't be shown. */
  value: number | number[] | string | null;
  /** Evaluation failed (usually the expression's own error). */
  error?: string;
}

/** One expression in the comp (Problems list; the rename scan in phase 4). */
export interface ExpressionEntry {
  key: string;
  layerIndex: number;
  layerName: string;
  /** Group and property names below the layer. */
  path: string[];
  expression: string;
  enabled: boolean;
  error?: string;
}

export interface ExpressionScan {
  entries: ExpressionEntry[];
  /** The walk stopped early on a very large comp. */
  truncated: boolean;
}
