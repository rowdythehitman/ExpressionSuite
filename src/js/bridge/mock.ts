// In-memory bridge over a fixture comp, so the panel runs in a plain browser (dev and Playwright).
// It follows the host's rules: same keys, groups with nothing scriptable hidden, selected layers preloaded.
import { parse } from "acorn";
import { layerKey, parseKey, propKey, segment, parseSegment } from "../../shared/keys";
import type { MockComp, MockLayer, MockProp } from "./fixture";
import { type ApplyResult, type Bridge, BridgeError, type CompTree, type TreeNode } from "./types";

export interface MockControl {
  /** Select layers by id, as if clicked in the timeline. */
  selectLayers(ids: number[]): void;
  /** Select one property in the timeline (null clears it). */
  selectProperty(key: string | null): void;
  /** Rename a layer, as if done in AE. */
  renameLayer(id: number, name: string): void;
  /** Change an expression behind the panel's back, as if typed in the timeline. */
  setExpressionInAE(key: string, code: string): void;
  getExpression(key: string): string;
  /** Undo-group names opened so far, oldest first. */
  undoGroups(): string[];
  /** Calls made, by function name. */
  calls(): { [fn: string]: number };
}

interface Found {
  layer: MockLayer;
  /** Undefined for a layer key. */
  prop?: MockProp;
  segments: string[];
}

const isProperty = (p: MockProp) => p.children === undefined;

function containsScriptable(p: MockProp): boolean {
  return isProperty(p) || (p.children ?? []).some(containsScriptable);
}

function containsExpression(children: MockProp[]): boolean {
  return children.some((c) => (isProperty(c) ? !!c.expression : containsExpression(c.children ?? [])));
}

/** Mimics AE's expressionError for syntax errors (runtime errors aren't simulated). */
export function mockEvaluate(code: string): string | undefined {
  try {
    parse(code, { ecmaVersion: 2020, allowReturnOutsideFunction: true });
    return undefined;
  } catch (e) {
    const err = e as SyntaxError & { loc?: { line: number } };
    const msg = err.message.replace(/\s*\(\d+:\d+\)$/, "");
    return `SyntaxError: ${msg} (line ${err.loc?.line ?? 1})`;
  }
}

export function createMockBridge(comp: MockComp, opts: { latencyMs?: number } = {}): { bridge: Bridge; control: MockControl } {
  let selected: number[] = [];
  let activeKey: string | null = null;
  let version = 0; // bumped on structural or expression edits made "in AE"
  const undo: string[] = [];
  const calls: { [fn: string]: number } = {};

  const delay = <T>(fn: () => T, name: string): Promise<T> => {
    calls[name] = (calls[name] ?? 0) + 1;
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(fn());
        } catch (e) {
          reject(e);
        }
      }, opts.latencyMs ?? 0);
    });
  };

  function find(key: string): Found {
    const parsed = parseKey(key);
    if (!parsed || parsed.compId !== comp.id) throw new BridgeError("NOT_FOUND", `Bad key ${key}`);
    const layer = comp.layers.find((l) => l.id === parsed.layerId);
    if (!layer) throw new BridgeError("NOT_FOUND", "The layer no longer exists.");
    let children = layer.children;
    let prop: MockProp | undefined;
    for (const seg of parsed.segments) {
      const want = parseSegment(seg);
      prop = children.filter((c) => c.matchName === want.matchName)[want.occurrence - 1];
      if (!prop) throw new BridgeError("NOT_FOUND", "The property no longer exists.");
      children = prop.children ?? [];
    }
    return { layer, prop, segments: parsed.segments };
  }

  function findProperty(key: string): MockProp {
    const { prop } = find(key);
    if (!prop || !isProperty(prop)) throw new BridgeError("NOT_FOUND", `Not a property: ${key}`);
    return prop;
  }

  function propertyNode(key: string, p: MockProp): TreeNode {
    const node: TreeNode = {
      key,
      kind: "property",
      name: p.name,
      matchName: p.matchName,
      hasChildren: false,
      valueType: p.valueType,
      expression: p.expression ?? "",
      expressionEnabled: p.expressionEnabled ?? true,
    };
    if (p.expression && p.expressionError) node.expressionError = p.expressionError;
    return node;
  }

  function childNodes(layer: MockLayer, children: MockProp[], segments: string[], depth: number): TreeNode[] {
    const seen: { [mn: string]: number } = {};
    const out: TreeNode[] = [];
    for (const p of children) {
      seen[p.matchName] = (seen[p.matchName] ?? 0) + 1;
      const segs = [...segments, segment(p.matchName, seen[p.matchName]!)];
      const key = propKey(comp.id, layer.id, segs);
      if (isProperty(p)) {
        out.push(propertyNode(key, p));
        continue;
      }
      if (!containsScriptable(p)) continue;
      const node: TreeNode = {
        key,
        kind: "group",
        name: p.name,
        matchName: p.matchName,
        hasChildren: true,
        containsExpression: containsExpression(p.children!),
      };
      if (depth > 1) node.children = childNodes(layer, p.children!, segs, depth - 1);
      out.push(node);
    }
    return out;
  }

  function layerNode(layer: MockLayer, index: number, depth: number): TreeNode {
    const node: TreeNode = {
      key: layerKey(comp.id, layer.id),
      kind: "layer",
      name: layer.name,
      matchName: layer.matchName,
      index,
      hasChildren: true,
      containsExpression: containsExpression(layer.children),
    };
    if (depth > 0) node.children = childNodes(layer, layer.children, [], depth);
    return node;
  }

  const bridge: Bridge = {
    getSelectionHash: () =>
      delay(
        () =>
          [comp.id, comp.name, selected.join(","), activeKey ?? "", version, comp.layers.map((l) => `${l.id}=${l.name}`).join(",")].join("|"),
        "getSelectionHash",
      ),

    getCompTree: (depth) =>
      delay((): CompTree => {
        const tree: CompTree = {
          comp: { id: comp.id, name: comp.name, width: comp.width, height: comp.height, frameRate: comp.frameRate },
          layers: comp.layers.map((l, i) => layerNode(l, i + 1, selected.includes(l.id) ? depth : 0)),
          selectedLayerKeys: selected.map((id) => layerKey(comp.id, id)),
        };
        if (activeKey) tree.activeKey = activeKey;
        return tree;
      }, "getCompTree"),

    getChildren: (key) =>
      delay(() => {
        const { layer, prop, segments } = find(key);
        return childNodes(layer, prop ? (prop.children ?? []) : layer.children, segments, 1);
      }, "getChildren"),

    getProperty: (key) => delay(() => propertyNode(key, findProperty(key)), "getProperty"),

    setExpression: (key, code) =>
      delay((): ApplyResult => {
        const p = findProperty(key);
        undo.push(`Expression IDE: ${p.name}`);
        p.expression = code;
        p.expressionEnabled = true;
        p.expressionError = code === "" ? undefined : mockEvaluate(code);
        const node = propertyNode(key, p);
        return node.expressionError ? { node, error: node.expressionError } : { node };
      }, "setExpression"),

    setExpressionEnabled: (key, on) =>
      delay(() => {
        const p = findProperty(key);
        undo.push(`${on ? "Enable" : "Disable"} expression: ${p.name}`);
        p.expressionEnabled = on;
        return propertyNode(key, p);
      }, "setExpressionEnabled"),

    revealInTimeline: (key) =>
      delay(() => {
        const { layer, prop } = find(key);
        selected = [layer.id];
        activeKey = prop && isProperty(prop) ? key : null;
      }, "revealInTimeline"),
  };

  const control: MockControl = {
    selectLayers(ids) {
      selected = [...ids];
      if (activeKey && !ids.includes(parseKey(activeKey)!.layerId)) activeKey = null;
    },
    selectProperty(key) {
      activeKey = key;
      if (key) {
        const id = parseKey(key)!.layerId;
        if (!selected.includes(id)) selected = [id];
      }
    },
    renameLayer(id, name) {
      const layer = comp.layers.find((l) => l.id === id);
      if (layer) layer.name = name;
    },
    setExpressionInAE(key, code) {
      findProperty(key).expression = code;
      version++;
    },
    getExpression: (key) => findProperty(key).expression ?? "",
    undoGroups: () => [...undo],
    calls: () => ({ ...calls }),
  };

  return { bridge, control };
}
