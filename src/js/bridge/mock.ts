// In-memory bridge over a fixture comp, so the panel runs in a plain browser (dev and Playwright).
// It follows the host's rules: same keys, groups with nothing scriptable hidden, selected layers preloaded.
import { parse } from "acorn";
import { layerKey, parseKey, propKey, segment, parseSegment } from "../../shared/keys";
import type { MockComp, MockLayer, MockProp } from "./fixture";
import { type ApplyResult, type Bridge, BridgeError, type CompSchema, type CompTree, type ExpressionScan, type RefTarget, type TreeNode } from "./types";

export interface MockControl {
  /** Select layers by id, as if clicked in the timeline. */
  selectLayers(ids: number[]): void;
  /** Select one property in the timeline (null clears it). */
  selectProperty(key: string | null): void;
  /** Rename a layer, as if done in AE. */
  renameLayer(id: number, name: string): void;
  /** Rename an effect on a layer, as if done in AE. */
  renameEffect(layerId: number, from: string, to: string): void;
  /** Change an expression behind the panel's back, as if typed in the timeline. */
  setExpressionInAE(key: string, code: string): void;
  getExpression(key: string): string;
  /** Undo-group names opened so far, oldest first. */
  undoGroups(): string[];
  /** Move the playhead (seconds). */
  setTime(t: number): void;
  /** Set a property's value, as if keyframed or typed in AE. */
  setValue(key: string, value: unknown): void;
  /** Makes a property's value change over time (seconds → value), for the value graph. */
  animate(key: string, fn: (t: number) => unknown): void;
  /** Pretend the project is saved at `path` ("" = unsaved). */
  setProjectPath(path: string): void;
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
  let time = 0;
  let projectPath = "/mock/Main.aep";
  const animations = new Map<string, (t: number) => unknown>();
  const WORK_AREA = { start: 0, end: 5 };
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

  function assign(key: string, p: MockProp, code: string): ApplyResult {
    const { layer } = find(key);
    const at = { property: p.name, layerIndex: comp.layers.indexOf(layer) + 1, layerName: layer.name, compName: comp.name };
    p.expression = code;
    p.expressionError = code === "" ? undefined : mockEvaluate(code, at);
    // Like AE: an erroring expression is switched off; a good apply switches it back on.
    p.expressionEnabled = !p.expressionError;
    const node = propertyNode(key, p);
    return node.expressionError ? { node, error: node.expressionError } : { node };
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
          time,
          projectPath,
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
        return assign(key, p, code);
      }, "setExpression"),

    setExpressions: (items, undoName) =>
      delay(() => {
        undo.push(undoName);
        return items.map((item) => {
          try {
            return { key: item.key, result: assign(item.key, findProperty(item.key), item.code) };
          } catch (e) {
            return { key: item.key, error: (e as Error).message };
          }
        });
      }, "setExpressions"),

    getProperties: (keys) =>
      delay(
        () =>
          keys.map((k) => {
            try {
              return propertyNode(k, findProperty(k));
            } catch {
              return null;
            }
          }),
        "getProperties",
      ),

    setExpressionEnabled: (key, on) =>
      delay(() => {
        const p = findProperty(key);
        undo.push(`${on ? "Enable" : "Disable"} expression: ${p.name}`);
        p.expressionEnabled = on;
        return propertyNode(key, p);
      }, "setExpressionEnabled"),

    getValueAtTime: (key, at) =>
      delay(() => {
        const p = findProperty(key);
        const t = at ?? time;
        // The mock doesn't run expressions: an erroring one reports its error, otherwise the static value.
        if (p.expression && p.expressionError && p.expressionEnabled !== false) return { time: t, value: null, error: p.expressionError };
        const v = animations.get(key)?.(t) ?? p.value;
        return { time: t, value: typeof v === "number" || typeof v === "string" || Array.isArray(v) ? (v as number | number[] | string) : null };
      }, "getValueAtTime"),

    sampleValues: (key, count) =>
      delay(() => {
        const p = findProperty(key);
        const n = Math.max(2, Math.min(400, count));
        const times = Array.from({ length: n }, (_, i) => WORK_AREA.start + ((WORK_AREA.end - WORK_AREA.start) * i) / (n - 1));
        const values = times.map((t) => {
          const v = animations.get(key)?.(t) ?? p.value;
          return typeof v === "number" || Array.isArray(v) ? (v as number | number[]) : null;
        });
        return { start: WORK_AREA.start, end: WORK_AREA.end, times, values };
      }, "sampleValues"),

    readReferences: (_compId, layerId, paths) =>
      delay(
        () =>
          paths.map((path) => {
            if (path.comp && path.comp !== comp.name) return null;
            const l = path.layer as { self?: true; name?: string; index?: number };
            const layer = l.self
              ? comp.layers.find((x) => x.id === layerId)
              : typeof l.index === "number"
                ? comp.layers[l.index - 1]
                : comp.layers.find((x) => x.name === l.name);
            let children = layer?.children;
            let hit: MockProp | undefined;
            for (const step of path.steps) {
              const options = Array.isArray(step) ? step : [step];
              hit = children?.find((c) => options.includes(c.name) || options.includes(c.matchName));
              if (!hit) return null;
              children = hit.children;
            }
            if (!hit || !isProperty(hit)) return null;
            const v = hit.value;
            return { time, value: typeof v === "number" || typeof v === "string" || Array.isArray(v) ? (v as number | number[] | string) : null };
          }),
        "readReferences",
      ),

    findAllExpressions: () =>
      delay(() => {
        const entries: ExpressionScan["entries"] = [];
        const walk = (layer: MockLayer, index: number, children: MockProp[], segs: string[], names: string[]) => {
          const seen: { [mn: string]: number } = {};
          for (const p of children) {
            seen[p.matchName] = (seen[p.matchName] ?? 0) + 1;
            const s = [...segs, segment(p.matchName, seen[p.matchName]!)];
            const n = [...names, p.name];
            if (!isProperty(p)) walk(layer, index, p.children!, s, n);
            else if (p.expression) {
              entries.push({
                key: propKey(comp.id, layer.id, s),
                layerIndex: index,
                layerName: layer.name,
                path: n,
                expression: p.expression,
                enabled: p.expressionEnabled ?? true,
                ...(p.expressionError ? { error: p.expressionError } : {}),
              });
            }
          }
        };
        comp.layers.forEach((l, i) => walk(l, i + 1, l.children, [], []));
        return { entries, truncated: false };
      }, "findAllExpressions"),

    getCompSchema: () =>
      delay(
        (): CompSchema => ({
          compId: comp.id,
          compName: comp.name,
          layers: comp.layers.map((l, i) => ({
            id: l.id,
            index: i + 1,
            name: l.name,
            effects: (l.children.find((c) => c.matchName === "ADBE Effect Parade")?.children ?? []).map((fx) => ({
              name: fx.name,
              matchName: fx.matchName,
              params: (fx.children ?? []).filter(isProperty).map((p) => ({ name: p.name, valueType: p.valueType ?? "OTHER" })),
            })),
          })),
        }),
        "getCompSchema",
      ),

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
    renameEffect(layerId, from, to) {
      const layer = comp.layers.find((l) => l.id === layerId);
      const fx = layer?.children.find((c) => c.matchName === "ADBE Effect Parade")?.children?.find((c) => c.name === from);
      if (fx) fx.name = to;
      version++;
    },
    setExpressionInAE(key, code) {
      findProperty(key).expression = code;
      version++;
    },
    animate(key, fn) {
      animations.set(key, fn);
    },
    setProjectPath(path) {
      projectPath = path;
    },
    setTime(t) {
      time = t;
    },
    setValue(key, value) {
      findProperty(key).value = value;
    },
    newProject(next) {
      comp = next ?? emptyProjectComp();
      projectPath = "";
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
