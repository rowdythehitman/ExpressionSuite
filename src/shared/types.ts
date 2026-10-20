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

export interface ApplyResult {
  /** AE's expressionError after the apply, if the expression failed. */
  error?: string;
  /** The property as it is now (expression, enabled, error). */
  node: TreeNode;
}

export interface SelectionHash {
  /** Bumped when After Effects switches to a new or different project. */
  project: number;
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
