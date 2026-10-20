import type { TreeNode } from "../../bridge";
import { fuzzyMatch } from "./fuzzy";

export interface Row {
  node: TreeNode;
  depth: number;
  open: boolean;
  /** A pinned layer (sits at the top). */
  pinned?: boolean;
  /** Children are being fetched. */
  loading: boolean;
}

export interface FlattenInput {
  layers: TreeNode[];
  /** Lazily loaded children, by parent key. A node's own `children` wins. */
  loaded: Record<string, TreeNode[]>;
  expanded: Record<string, boolean>;
  loading: Record<string, boolean>;
  filter: string;
  onlyExpressions: boolean;
  /** Names of pinned layers; they come first, whatever the mode. */
  pinned?: string[];
}

export function childrenOf(node: TreeNode, loaded: Record<string, TreeNode[]>): TreeNode[] | undefined {
  return node.children ?? loaded[node.key];
}

/** Whether anything below has an expression: loaded children are authoritative, otherwise the host's flag. */
export function hasExpressionBelow(node: TreeNode, loaded: Record<string, TreeNode[]>): boolean {
  const kids = childrenOf(node, loaded);
  if (!kids) return !!node.containsExpression;
  return kids.some((c) => (c.kind === "property" ? !!c.expression : hasExpressionBelow(c, loaded)));
}

/**
 * The visible rows of the explorer, top to bottom. With a filter or "only expressions", only loaded nodes can
 * match; groups holding a match open automatically, and an unloaded group is kept (collapsed) when the host says
 * it contains an expression.
 */
export function flatten(input: FlattenInput): Row[] {
  const { loaded, expanded, loading, filter, onlyExpressions } = input;
  const filtering = filter.trim() !== "" || onlyExpressions;
  const rows: Row[] = [];

  // Returns the rows for `node` and below, or null when the filter hides it.
  function visit(node: TreeNode, depth: number, ancestorNameMatched: boolean): Row[] | null {
    if (node.kind === "property") {
      const exprOk = !onlyExpressions || !!node.expression;
      const nameOk = ancestorNameMatched || fuzzyMatch(filter, node.name);
      return !filtering || (exprOk && nameOk) ? [{ node, depth, open: false, loading: false }] : null;
    }
    const kids = childrenOf(node, loaded);
    const nameMatched = ancestorNameMatched || (filter.trim() !== "" && fuzzyMatch(filter, node.name));
    if (!filtering) {
      const open = !!expanded[node.key];
      const out: Row[] = [{ node, depth, open, loading: open && !kids && !!loading[node.key] }];
      if (open && kids) for (const k of kids) out.push(...visit(k, depth + 1, false)!);
      return out;
    }
    if (!kids) {
      const keep = onlyExpressions ? !!node.containsExpression && (filter.trim() === "" || nameMatched) : nameMatched;
      return keep ? [{ node, depth, open: false, loading: false }] : null;
    }
    const below: Row[] = [];
    for (const k of kids) {
      const r = visit(k, depth + 1, nameMatched);
      if (r) below.push(...r);
    }
    if (below.length === 0 && !(nameMatched && !onlyExpressions)) return null;
    // Groups holding a match open, unless the user explicitly collapsed them (expanded === false).
    const open = expanded[node.key] !== false && below.length > 0;
    return [{ node, depth, open, loading: false }, ...(open ? below : [])];
  }

  const pinned = new Set(input.pinned ?? []);
  const ordered = [...input.layers.filter((l) => pinned.has(l.name)), ...input.layers.filter((l) => !pinned.has(l.name))];
  for (const layer of ordered) {
    const r = visit(layer, 0, false);
    if (r && pinned.has(layer.name)) r[0] = { ...r[0]!, pinned: true };
    if (r) rows.push(...r);
  }
  return rows;
}
