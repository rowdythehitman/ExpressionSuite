// Expression IDE host functions. Everything here runs in ExtendScript (ES3): no Array.map/forEach/indexOf,
// no Object.keys, no JSON (json2 is included by index.ts), no String.trim. Use plain loops.
// Errors are thrown as "CODE: message" and turned into typed BridgeErrors by src/js/bridge/cep.ts.

import { layerKey, parseKey, propKey, segment, parseSegment } from "../../shared/keys";
import type { ApplyResult, CompTree, SelectionHash, TreeNode, ValueType } from "../../shared/types";

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
  return { project: project, hash: selectionHash() };
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

export const setExpression = (key: string, code: string): ApplyResult => {
  const r = resolveProperty(key);
  const prop = r.prop;
  let thrown = "";
  app.beginUndoGroup("Expression IDE: " + prop.name);
  try {
    prop.expression = code;
    // AE disables an expression that errored; a new apply turns it back on (AE disables it again if it still fails).
    if (code !== "" && !prop.expressionEnabled) prop.expressionEnabled = true;
  } catch (e) {
    thrown = String((e as any).message || e);
  } finally {
    app.endUndoGroup();
  }
  // Evaluating the property makes AE fill in expressionError for this apply.
  try {
    prop.valueAtTime(r.comp.time, false);
  } catch (_e) {
    // The error, if any, is read back below.
  }
  const node = propertyNode(key, prop);
  const result: ApplyResult = { node: node };
  if (thrown) result.error = thrown;
  else if (node.expressionError) result.error = node.expressionError;
  return result;
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
