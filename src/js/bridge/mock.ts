// In-memory bridge over a fixture comp, so the panel runs in a plain browser (dev and Playwright).
// It follows the host's rules: same keys, groups with nothing scriptable hidden, selected layers preloaded.
import { parse } from "acorn";
import { layerKey, parseKey, propKey, segment, parseSegment } from "../../shared/keys";
import type { MockComp, MockLayer, MockProp } from "./fixture";
import { type ApplyResult, type Bridge, BridgeError, type CompTree, type RefTarget, type TreeNode } from "./types";

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
  /** Switch to a new project (File › New Project); defaults to a one-solid comp reusing the fixture's ids. */
  newProject(comp?: MockComp): void;
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

export interface ErrorContext {
  property: string;
  layerIndex: number;
  layerName: string;
  compName: string;
}

/** AE 2025's expressionError wording (from a real report); syntax errors only, runtime errors aren't simulated. */
export function aeErrorText(line: number, error: string, at: ErrorContext): string {
  return (
    "Expression Disabled\n" +
    `Error at line ${line} in property '${at.property}' of layer ${at.layerIndex} ('${at.layerName}') in comp '${at.compName}'.\n` +
    error
  );
}

export function mockEvaluate(code: string, at: ErrorContext): string | undefined {
  try {
    parse(code, { ecmaVersion: 2020, allowReturnOutsideFunction: true });
    return undefined;
  } catch (e) {
    const err = e as SyntaxError & { loc?: { line: number } };
    const msg = err.message.replace(/\s*\(\d+:\d+\)$/, "");
    return aeErrorText(err.loc?.line ?? 1, `SyntaxError: ${msg}`, at);
  }
}

/** What a brand-new project looks like to the panel: a comp with the same id as the fixture's, to catch stale keys. */
export function emptyProjectComp(): MockComp {
  return { id: 100, name: "Comp 1", width: 1920, height: 1080, frameRate: 25, layers: [
    { id: 11, name: "Dark Yellow Solid 1", matchName: "ADBE AV Layer", children: [
      { name: "Transform", matchName: "ADBE Transform Group", children: [
        { name: "Anchor Point", matchName: "ADBE Anchor Point", valueType: "2D", value: [960, 540] },
        { name: "Position", matchName: "ADBE Position", valueType: "2D", value: [960, 540] },
      ] },
    ] },
  ] };
}

export function createMockBridge(initialComp: MockComp, opts: { latencyMs?: number } = {}): { bridge: Bridge; control: MockControl } {
  let comp = initialComp;
  let project = 0;
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
        () => ({
          project,
          hash: [comp.id, comp.name, selected.join(","), activeKey ?? "", version, comp.layers.map((l) => `${l.id}=${l.name}`).join(",")].join("|"),
        }),
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
        const { layer } = find(key);
        const at = { property: p.name, layerIndex: comp.layers.indexOf(layer) + 1, layerName: layer.name, compName: comp.name };
        p.expressionError = code === "" ? undefined : mockEvaluate(code, at);
        // Like AE: an erroring expression is switched off; a good apply switches it back on.
        p.expressionEnabled = !p.expressionError;
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

    getSelectedRef: () =>
      delay((): RefTarget | null => {
        const layerId = activeKey ? parseKey(activeKey)!.layerId : selected[0];
        const layer = comp.layers.find((l) => l.id === layerId);
        if (!layer) return null;
        const path: RefTarget["path"] = [];
        let children = layer.children;
        for (const seg of activeKey ? parseKey(activeKey)!.segments : []) {
          const want = parseSegment(seg);
          const p = children.filter((c) => c.matchName === want.matchName)[want.occurrence - 1]!;
          path.push({ name: p.name, matchName: p.matchName });
          children = p.children ?? [];
        }
        return {
          compId: comp.id,
          compName: comp.name,
          layerId: layer.id,
          layerIndex: comp.layers.indexOf(layer) + 1,
          layerName: layer.name,
          layerMatchName: layer.matchName,
          path,
        };
      }, "getSelectedRef"),

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
    newProject(next) {
      comp = next ?? emptyProjectComp();
      project++;
      selected = [];
      activeKey = null;
    },
    getExpression: (key) => findProperty(key).expression ?? "",
    undoGroups: () => [...undo],
    calls: () => ({ ...calls }),
  };

  return { bridge, control };
}
