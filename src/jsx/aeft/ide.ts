// Expression IDE host functions. Everything here runs in ExtendScript (ES3): no Array.map/forEach/indexOf,
// no Object.keys, no JSON (json2 is included by index.ts), no String.trim. Use plain loops.
// Errors are thrown as "CODE: message" and turned into typed BridgeErrors by src/js/bridge/cep.ts.

import { layerKey, parseKey, propKey, segment, parseSegment } from "../../shared/keys";
import type { ApplyResult, BatchResult, CompSchema, RefPath, ValueSamples, CompTree, ExpressionEntry, ExpressionScan, RefSegment, RefTarget, SchemaEffect, SchemaLayer, SelectionHash, TreeNode, ValueReading, ValueType } from "../../shared/types";

/** How many properties a group scan may visit before it gives up and assumes "scriptable, no expression". */
const SCAN_BUDGET_SELECTED = 400;
const SCAN_BUDGET_OTHER = 150;
const CLASSIC_3D = "ADBE Advanced 3d";

// The comp the panel last showed. activeItem is null (or a footage item) whenever focus is on the Project panel,
// so we keep showing the last comp rather than blanking the tree.
let lastCompId = 0;

// New-project detection. AE has no project id, so a new or opened project is recognised when the root folder held
// from the previous one has gone invalid, or when the revision counter (which only rises within a project, undo
// included) drops. Save As keeps both, so it doesn't count. (Not an item probe: deleting that item would look like
// a new project.)
let projectGen = 0;
let rootProbe: any = null;
let lastRevision = -1;

function isInvalid(o: any): boolean {
  try {
    return o.name === undefined;
  } catch (_e) {
    return true;
  }
}

function checkProject(): number {
  const project = app.project as any;
  const revision = typeof project.revision === "number" ? project.revision : -1;
  if (rootProbe && (revision < lastRevision || isInvalid(rootProbe))) {
    projectGen++;
    lastCompId = 0;
    rootProbe = null;
  }
  if (!rootProbe) rootProbe = project.rootFolder;
  lastRevision = revision;
  return projectGen;
}

function fail(code: string, message: string): never {
  throw new Error(code + ": " + message);
}

function activeComp(): CompItem | null {
  const item = app.project.activeItem;
  if (item && item instanceof CompItem) {
    lastCompId = item.id;
    return item;
  }
  if (lastCompId) {
    const last = app.project.itemByID(lastCompId);
    if (last && last instanceof CompItem) return last;
  }
  return null;
}

function compById(id: number): CompItem {
  const item = app.project.itemByID(id);
  if (!(item && item instanceof CompItem)) fail("NOT_FOUND", "Comp " + id + " no longer exists.");
  return item as CompItem;
}

function valueTypeOf(p: Property): ValueType {
  switch (p.propertyValueType) {
    case PropertyValueType.OneD:
      return "1D";
    case PropertyValueType.TwoD:
    case PropertyValueType.TwoD_SPATIAL:
      return "2D";
    case PropertyValueType.ThreeD:
    case PropertyValueType.ThreeD_SPATIAL:
      return "3D";
    case PropertyValueType.COLOR:
      return "COLOR";
    case PropertyValueType.TEXT_DOCUMENT:
      return "TEXT";
    case PropertyValueType.SHAPE:
      return "SHAPE";
    default:
      return "OTHER";
  }
}

function isProperty(p: _PropertyClasses): boolean {
  return p.propertyType === PropertyType.PROPERTY;
}

function hasEnabledLayerStyle(group: PropertyGroup): boolean {
  for (let i = 1; i <= group.numProperties; i++) {
    const s = group.property(i);
    if (s.matchName !== "ADBE Blend Options Group" && s.enabled) return true;
  }
  return false;
}

/** Branches AE hides in the timeline, or that are heavy and useless for this layer. */
function skip(layer: Layer, comp: CompItem, parent: PropertyGroup | Layer, p: _PropertyClasses): boolean {
  const anyLayer = layer as any;
  switch (p.matchName) {
    case "ADBE Material Options Group":
      return !anyLayer.threeDLayer;
    case "ADBE Plane Options Group":
    case "ADBE Extrsn Options Group":
      return !anyLayer.threeDLayer || comp.renderer === CLASSIC_3D;
    case "ADBE Layer Styles":
      return !hasEnabledLayerStyle(p as PropertyGroup);
    case "ADBE Time Remapping":
      return !anyLayer.timeRemapEnabled;
    case "ADBE Audio Group":
      return !anyLayer.hasAudio;
  }
  // Individual styles exist (hidden) on every layer; only applied ones are enabled.
  if (parent.matchName === "ADBE Layer Styles" && p.matchName !== "ADBE Blend Options Group") return !p.enabled;
  return false;
}

interface Scan {
  scriptable: boolean;
  hasExpr: boolean;
  budget: number;
}

/** Does the group have any expression-capable descendant, and does any of them have an expression? */
function scan(layer: Layer, comp: CompItem, group: PropertyGroup | Layer, state: Scan): void {
  const g = group as PropertyGroup;
  for (let i = 1; i <= g.numProperties; i++) {
    if (state.budget <= 0) {
      // Out of budget: assume there is something in here so the folder is still offered.
      state.scriptable = true;
      return;
    }
    state.budget--;
    const p = g.property(i);
    if (skip(layer, comp, g, p)) continue;
    if (isProperty(p)) {
      const prop = p as Property;
      if (!prop.canSetExpression) continue;
      state.scriptable = true;
      if (prop.expression !== "") {
        state.hasExpr = true;
        return;
      }
    } else {
      scan(layer, comp, p as PropertyGroup, state);
      if (state.hasExpr) return;
    }
  }
}

function propertyNode(key: string, p: Property): TreeNode {
  const node: TreeNode = {
    key: key,
    kind: "property",
    name: p.name,
    matchName: p.matchName,
    hasChildren: false,
    valueType: valueTypeOf(p),
    expression: p.expression,
    expressionEnabled: p.expressionEnabled,
  };
  if (p.expression !== "" && p.expressionError) node.expressionError = p.expressionError;
  return node;
}

/** Child nodes of a layer or group, `depth` levels deep (depth 1 = just the children). */
function childNodes(
  comp: CompItem,
  layer: Layer,
  group: PropertyGroup | Layer,
  segments: string[],
  depth: number,
  budget: number,
): TreeNode[] {
  const out: TreeNode[] = [];
  const seen: { [matchName: string]: number } = {};
  const g = group as PropertyGroup;
  for (let i = 1; i <= g.numProperties; i++) {
    const p = g.property(i);
    const mn = p.matchName;
    seen[mn] = (seen[mn] || 0) + 1;
    if (skip(layer, comp, g, p)) continue;
    const segs = segments.concat([segment(mn, seen[mn] as number)]);
    const key = propKey(comp.id, layer.id, segs);
    if (isProperty(p)) {
      if ((p as Property).canSetExpression) out.push(propertyNode(key, p as Property));
      continue;
    }
    const state: Scan = { scriptable: false, hasExpr: false, budget: budget };
    scan(layer, comp, p as PropertyGroup, state);
    if (!state.scriptable) continue;
    const node: TreeNode = {
      key: key,
      kind: "group",
      name: p.name,
      matchName: mn,
      hasChildren: true,
      containsExpression: state.hasExpr,
    };
    if (depth > 1) node.children = childNodes(comp, layer, p as PropertyGroup, segs, depth - 1, budget);
    out.push(node);
  }
  return out;
}

function layerNode(comp: CompItem, layer: Layer, depth: number): TreeNode {
  const budget = depth > 0 ? SCAN_BUDGET_SELECTED : SCAN_BUDGET_OTHER;
  const state: Scan = { scriptable: false, hasExpr: false, budget: budget };
  scan(layer, comp, layer, state);
  const node: TreeNode = {
    key: layerKey(comp.id, layer.id),
    kind: "layer",
    name: layer.name,
    matchName: layer.matchName,
    index: layer.index,
    hasChildren: true,
    containsExpression: state.hasExpr,
  };
  if (depth > 0) node.children = childNodes(comp, layer, layer, [], depth, budget);
  return node;
}

/** The key of a property found through the AE DOM (e.g. from selectedProperties). */
function keyOf(comp: CompItem, p: _PropertyClasses): string {
  const segs: string[] = [];
  let cur: any = p;
  while (cur.propertyDepth > 0) {
    const parent = cur.parentProperty as PropertyGroup;
    let occurrence = 0;
    for (let j = 1; j <= cur.propertyIndex; j++) {
      if (parent.property(j).matchName === cur.matchName) occurrence++;
    }
    segs.unshift(segment(cur.matchName, occurrence));
    cur = parent;
  }
  return propKey(comp.id, (cur as Layer).id, segs);
}

interface Resolved {
  comp: CompItem;
  layer: Layer;
  /** The layer itself for a layer key. */
  target: PropertyGroup | Property | Layer;
}

function resolve(key: string): Resolved {
  const parsed = parseKey(key);
  if (!parsed) return fail("NOT_FOUND", "Bad key " + key);
  const comp = compById(parsed.compId);
  const layer = app.project.layerByID(parsed.layerId);
  if (!layer || layer.containingComp.id !== comp.id) return fail("NOT_FOUND", "The layer no longer exists.");
  let cur: any = layer;
  for (let s = 0; s < parsed.segments.length; s++) {
    const want = parseSegment(parsed.segments[s] as string);
    let count = 0;
    let next: any = null;
    for (let i = 1; i <= cur.numProperties; i++) {
      const child = cur.property(i);
      if (child.matchName === want.matchName && ++count === want.occurrence) {
        next = child;
        break;
      }
    }
    if (!next) return fail("NOT_FOUND", "The property no longer exists.");
    cur = next;
  }
  return { comp: comp, layer: layer, target: cur };
}

function resolveProperty(key: string): Resolved & { prop: Property } {
  const r = resolve(key);
  const t = r.target as any;
  if (t.propertyType !== PropertyType.PROPERTY) return fail("NOT_FOUND", "Not a property: " + key);
  return { comp: r.comp, layer: r.layer, target: r.target, prop: t as Property };
}

/** The last expression-capable property selected in the timeline. */
function activeProperty(comp: CompItem): Property | null {
  const props = comp.selectedProperties;
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i] as any;
    if (p.propertyType === PropertyType.PROPERTY && p.canSetExpression) return p as Property;
  }
  return null;
}

/** A per-layer signature that changes when effects, masks or shape contents are added, removed or renamed. */
function layerSignature(layer: Layer): string {
  const parts: string[] = [layer.id + "=" + layer.name];
  const anyLayer = layer as any;
  for (let i = 1; i <= anyLayer.numProperties; i++) {
    const g = anyLayer.property(i);
    if (g.propertyType === PropertyType.PROPERTY) continue;
    parts.push(String(g.numProperties));
    if (g.matchName === "ADBE Effect Parade" || g.matchName === "ADBE Mask Parade") {
      for (let j = 1; j <= g.numProperties; j++) parts.push(g.property(j).name);
    }
  }
  return parts.join(",");
}

export const getSelectionHash = (): SelectionHash => {
  const project = checkProject();
  const comp = activeComp();
  const file = app.project.file;
  return { project: project, time: comp ? comp.time : 0, projectPath: file ? file.fsName : "", hash: selectionHash() };
};

function selectionHash(): string {
  const comp = activeComp();
  if (!comp) return "none";
  const parts: string[] = [String(comp.id), comp.name, String(comp.numLayers)];
  const selected = comp.selectedLayers;
  const ids: string[] = [];
  for (let i = 0; i < selected.length; i++) ids.push(String((selected[i] as Layer).id));
  parts.push(ids.join(","));
  const active = activeProperty(comp);
  parts.push(active ? keyOf(comp, active) : "");
  // Layer names and ids catch renames and reorders; selected layers also report their structure.
  for (let i = 1; i <= comp.numLayers; i++) {
    const layer = comp.layer(i);
    parts.push(layer.selected ? layerSignature(layer) : layer.id + "=" + layer.name);
  }
  return parts.join("|");
}

export const getCompTree = (depth: number): CompTree | null => {
  checkProject();
  const comp = activeComp();
  if (!comp) return null;
  const selectedKeys: string[] = [];
  const layers: TreeNode[] = [];
  for (let i = 1; i <= comp.numLayers; i++) {
    const layer = comp.layer(i);
    if (layer.selected) selectedKeys.push(layerKey(comp.id, layer.id));
    layers.push(layerNode(comp, layer, layer.selected ? depth : 0));
  }
  const tree: CompTree = {
    comp: {
      id: comp.id,
      name: comp.name,
      width: comp.width,
      height: comp.height,
      frameRate: comp.frameRate,
    },
    layers: layers,
    selectedLayerKeys: selectedKeys,
  };
  const active = activeProperty(comp);
  if (active) tree.activeKey = keyOf(comp, active);
  return tree;
};

export const getChildren = (key: string): TreeNode[] => {
  const r = resolve(key);
  const parsed = parseKey(key);
  const segs = parsed ? parsed.segments : [];
  return childNodes(r.comp, r.layer, r.target as PropertyGroup | Layer, segs, 1, SCAN_BUDGET_SELECTED);
};

export const getProperty = (key: string): TreeNode => {
  return propertyNode(key, resolveProperty(key).prop);
};

/** Sets the expression without an undo group; returns what was thrown, if anything. */
function assign(prop: Property, code: string): string {
  try {
    prop.expression = code;
    // AE disables an expression that errored; a new apply turns it back on (AE disables it again if it still fails).
    if (code !== "" && !prop.expressionEnabled) prop.expressionEnabled = true;
    return "";
  } catch (e) {
    return String((e as any).message || e);
  }
}

/** Evaluates the property (so AE fills in expressionError for this apply) and reports the result. */
function readBack(key: string, r: Resolved & { prop: Property }, thrown: string): ApplyResult {
  try {
    r.prop.valueAtTime(r.comp.time, false);
  } catch (_e) {
    // The error, if any, is read back below.
  }
  const node = propertyNode(key, r.prop);
  const result: ApplyResult = { node: node };
  if (thrown) result.error = thrown;
  else if (node.expressionError) result.error = node.expressionError;
  return result;
}

export const setExpression = (key: string, code: string): ApplyResult => {
  const r = resolveProperty(key);
  app.beginUndoGroup("Expression IDE: " + r.prop.name);
  const thrown = assign(r.prop, code); // never throws
  app.endUndoGroup();
  return readBack(key, r, thrown);
};

/** Several applies as one undo step (batch apply, reference updates). Missing properties are reported, not thrown. */
export const setExpressions = (items: { key: string; code: string }[], undoName: string): BatchResult[] => {
  const resolved: any[] = [];
  const thrown: string[] = [];
  app.beginUndoGroup(undoName);
  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as { key: string; code: string };
      try {
        const r = resolveProperty(item.key);
        resolved.push(r);
        thrown.push(assign(r.prop, item.code));
      } catch (e) {
        resolved.push(null);
        thrown.push(String((e as any).message || e));
      }
    }
  } finally {
    app.endUndoGroup();
  }
  const out: BatchResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const key = (items[i] as { key: string }).key;
    if (resolved[i]) out.push({ key: key, result: readBack(key, resolved[i], thrown[i] as string) });
    else out.push({ key: key, error: thrown[i] as string });
  }
  return out;
};

/** Fresh reads of several properties; null for any that no longer exist. */
export const getProperties = (keys: string[]): (TreeNode | null)[] => {
  const out: (TreeNode | null)[] = [];
  for (let i = 0; i < keys.length; i++) {
    try {
      out.push(propertyNode(keys[i] as string, resolveProperty(keys[i] as string).prop));
    } catch (_e) {
      out.push(null);
    }
  }
  return out;
};

export const setExpressionEnabled = (key: string, on: boolean): TreeNode => {
  const r = resolveProperty(key);
  app.beginUndoGroup((on ? "Enable" : "Disable") + " expression: " + r.prop.name);
  try {
    r.prop.expressionEnabled = on;
  } finally {
    app.endUndoGroup();
  }
  return propertyNode(key, r.prop);
};

export const revealInTimeline = (key: string): void => {
  const r = resolve(key);
  const selected = r.comp.selectedLayers;
  for (let i = 0; i < selected.length; i++) (selected[i] as Layer).selected = false;
  r.layer.selected = true;
  if (r.target !== r.layer) (r.target as any).selected = true;
  r.comp.openInViewer();
};

export const getSelectedRef = (): RefTarget | null => {
  const comp = activeComp();
  if (!comp) return null;
  // Prefer the last selected property; else the last selected group; else the first selected layer.
  const props = comp.selectedProperties;
  let picked: any = null;
  for (let i = props.length - 1; i >= 0 && !picked; i--) {
    if ((props[i] as any).propertyType === PropertyType.PROPERTY) picked = props[i];
  }
  if (!picked && props.length > 0) picked = props[props.length - 1];
  const path: RefSegment[] = [];
  let layer: any;
  if (picked) {
    let cur: any = picked;
    while (cur.propertyDepth > 0) {
      path.unshift({ name: cur.name, matchName: cur.matchName });
      cur = cur.parentProperty;
    }
    layer = cur;
  } else {
    const layers = comp.selectedLayers;
    if (layers.length === 0) return null;
    layer = layers[0];
  }
  return {
    compId: comp.id,
    compName: comp.name,
    layerId: layer.id,
    layerIndex: layer.index,
    layerName: layer.name,
    layerMatchName: layer.matchName,
    path: path,
  };
};

export const getCompSchema = (): CompSchema | null => {
  const comp = activeComp();
  if (!comp) return null;
  const layers: SchemaLayer[] = [];
  for (let i = 1; i <= comp.numLayers; i++) {
    const layer = comp.layer(i) as any;
    const effects: SchemaEffect[] = [];
    const parade = layer.property("ADBE Effect Parade");
    for (let e = 1; parade && e <= parade.numProperties; e++) {
      const fx = parade.property(e);
      const params: { name: string; valueType: ValueType }[] = [];
      for (let k = 1; k <= fx.numProperties; k++) {
        const p = fx.property(k);
        if (p.propertyType === PropertyType.PROPERTY && p.canSetExpression) params.push({ name: p.name, valueType: valueTypeOf(p) });
      }
      effects.push({ name: fx.name, matchName: fx.matchName, params: params });
    }
    layers.push({ id: layer.id, index: layer.index, name: layer.name, effects: effects });
  }
  return { compId: comp.id, compName: comp.name, layers: layers };
};

/** A value AE can send over JSON: numbers, arrays, Source Text as text, paths as a summary; else null. */
function serialise(prop: Property, v: any): number | number[] | string | null {
  if (typeof v === "number" || typeof v === "string") return v;
  if (v instanceof Array) return v;
  if (prop.propertyValueType === PropertyValueType.TEXT_DOCUMENT && v) return String(v.text);
  if (prop.propertyValueType === PropertyValueType.SHAPE && v) return "Path (" + v.vertices.length + " points" + (v.closed ? ", closed" : "") + ")";
  return null;
}

function readAt(prop: Property, t: number): ValueReading {
  try {
    return { time: t, value: serialise(prop, prop.valueAtTime(t, false)) };
  } catch (e) {
    return { time: t, value: null, error: String((e as any).message || e) };
  }
}

export const getValueAtTime = (key: string, time?: number): ValueReading => {
  const r = resolveProperty(key);
  return readAt(r.prop, typeof time === "number" ? time : r.comp.time);
};

/** Values of references written in code (see src/js/ide/references/resolve.ts), at the comp's current time. Null
 * for any that don't resolve (a typo, a layer that isn't there). */
/** Follows a reference path (see src/js/ide/references/resolve.ts) to its property or group, or null. */
function follow(home: CompItem, layerId: number, path: RefPath): { comp: CompItem; target: any } | null {
  let comp: CompItem = home;
  if (path.comp) {
    let found: CompItem | null = null;
    for (let j = 1; j <= app.project.numItems && !found; j++) {
      const item = app.project.item(j);
      if (item instanceof CompItem && item.name === path.comp) found = item;
    }
    if (!found) return null;
    comp = found;
  }
  const l: any = path.layer;
  let cur: any = l.self ? app.project.layerByID(layerId) : typeof l.index === "number" ? comp.layer(l.index) : comp.layer(l.name);
  for (let s = 0; s < path.steps.length && cur; s++) {
    const step: any = path.steps[s];
    const options: string[] = step instanceof Array ? step : [step];
    let next: any = null;
    for (let k = 0; k < options.length && !next; k++) next = cur.property(options[k]);
    cur = next;
  }
  return cur ? { comp: comp, target: cur } : null;
}

/** Values of references written in code, at the comp's current time. Null for any that don't resolve. */
export const readReferences = (compId: number, layerId: number, paths: RefPath[]): (ValueReading | null)[] => {
  const home = compById(compId);
  const out: (ValueReading | null)[] = [];
  for (let i = 0; i < paths.length; i++) {
    try {
      const hit = follow(home, layerId, paths[i] as RefPath);
      out.push(hit && hit.target.propertyType === PropertyType.PROPERTY ? readAt(hit.target as Property, hit.comp.time) : null);
    } catch (_e) {
      out.push(null);
    }
  }
  return out;
};

/** The tree key of what a reference points at (go to definition); null if it doesn't resolve. */
export const resolveReferenceKey = (compId: number, layerId: number, path: RefPath): string | null => {
  try {
    const hit = follow(compById(compId), layerId, path);
    return hit ? keyOf(hit.comp, hit.target) : null;
  } catch (_e) {
    return null;
  }
};

/** How many properties findAllExpressions visits before giving up on a huge comp. */
const SCAN_ALL_BUDGET = 20000;

export const findAllExpressions = (): ExpressionScan | null => {
  const comp = activeComp();
  if (!comp) return null;
  const entries: ExpressionEntry[] = [];
  const state = { budget: SCAN_ALL_BUDGET };
  function walk(layer: Layer, group: any, segs: string[], names: string[]): void {
    const seen: { [mn: string]: number } = {};
    for (let i = 1; i <= group.numProperties; i++) {
      if (state.budget-- <= 0) return;
      const p = group.property(i);
      seen[p.matchName] = (seen[p.matchName] || 0) + 1;
      if (skip(layer, comp as CompItem, group, p)) continue;
      const s = segs.concat([segment(p.matchName, seen[p.matchName] as number)]);
      const n = names.concat([p.name]);
      if (p.propertyType === PropertyType.PROPERTY) {
        if (p.canSetExpression && p.expression !== "") {
          const entry: ExpressionEntry = {
            key: propKey((comp as CompItem).id, layer.id, s),
            layerIndex: layer.index,
            layerName: layer.name,
            path: n,
            expression: p.expression,
            enabled: p.expressionEnabled,
          };
          if (p.expressionError) entry.error = p.expressionError;
          entries.push(entry);
        }
      } else {
        walk(layer, p, s, n);
      }
    }
  }
  for (let i = 1; i <= comp.numLayers; i++) {
    const layer = comp.layer(i);
    walk(layer, layer, [], []);
  }
  return { entries: entries, truncated: state.budget <= 0 };
};

export const sampleValues = (key: string, count: number): ValueSamples => {
  const r = resolveProperty(key);
  const start = r.comp.workAreaStart;
  const end = start + r.comp.workAreaDuration;
  const n = Math.max(2, Math.min(400, count));
  const times: number[] = [];
  const values: (number | number[] | null)[] = [];
  for (let i = 0; i < n; i++) {
    const t = start + ((end - start) * i) / (n - 1);
    times.push(t);
    let v: any;
    try {
      v = r.prop.valueAtTime(t, false);
    } catch (_e) {
      v = null; // an expression error at this time: a gap in the graph
    }
    values.push(typeof v === "number" || v instanceof Array ? v : null);
  }
  return { start: start, end: end, times: times, values: values };
};

/** Adds an expression control (Slider, Point, 3D Point, Checkbox) to a layer and sets its value, as one undo step.
 * Returns the effect's name as AE has it. */
export const addControl = (layerId: number, matchName: string, name: string, value: number | number[]): string => {
  const layer: any = app.project.layerByID(layerId);
  if (!layer) fail("NOT_FOUND", "The layer no longer exists.");
  app.beginUndoGroup("Expression IDE: add " + name);
  try {
    const fx = layer.property("ADBE Effect Parade").addProperty(matchName);
    fx.name = name;
    fx.property(1).setValue(value);
    return fx.name;
  } finally {
    app.endUndoGroup();
  }
};

/** Several controls on one layer as one undo step (snippets). Returns each effect's name as AE has it. */
export const addControls = (layerId: number, items: { matchName: string; name: string; value: number | number[] }[], undoName: string): string[] => {
  const layer: any = app.project.layerByID(layerId);
  if (!layer) fail("NOT_FOUND", "The layer no longer exists.");
  const names: string[] = [];
  app.beginUndoGroup(undoName);
  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as { matchName: string; name: string; value: number | number[] };
      const fx = layer.property("ADBE Effect Parade").addProperty(item.matchName);
      fx.name = item.name;
      fx.property(1).setValue(item.value);
      names.push(fx.name);
    }
  } finally {
    app.endUndoGroup();
  }
  return names;
};
