import { create } from "zustand";
import { type Bridge, BridgeError, type CompSchema, type CompTree, type ExpressionScan, getBridge, type TreeNode, type ValueReading, type ValueType } from "../bridge";
import { layerKey, parentKey, parseKey } from "../../shared/keys";
import { parseAeError } from "./aeError";
import { checkNames } from "./editor/names";
import { checkSyntax } from "./editor/syntax";
import { describeRenames, detectRenames, renameInCode, type Rename } from "./references/rename";
import { generateReference, type RefContext, type RefTarget, type Reference } from "./references/reference";
import { childrenOf } from "./tree/flatten";

export type Mode = "selection" | "comp";

export interface Tab {
  key: string;
  layerName: string;
  propName: string;
  /** The expression as last read from or applied to AE. */
  original: string;
  code: string;
  /** Preview tabs (single click) are replaced by the next preview, as in VS Code. */
  preview: boolean;
  /** AE's error from the last apply or read. */
  error?: string;
  /** Shapes `value` in completions. */
  valueType?: ValueType;
  /** AE's expression when it changed in After Effects while this tab had unapplied edits (spec: external change
   * detection). The tab shows a banner and a diff until the user picks a version. */
  external?: string;
}

export interface RenameOffer {
  renames: Rename[];
  summary: string;
  /** References to old names in open tabs, and in the comp's applied expressions. */
  tabCount: number;
  compCount: number;
}

export interface Status {
  text: string;
  kind: "info" | "ok" | "error";
  /** Full text for the tooltip when `text` is a summary. */
  detail?: string;
}

export interface IdeState {
  tree: CompTree | null;
  /** Layers or effects just renamed while expressions still use the old names (spec: Rename safety). */
  renameOffer: RenameOffer | null;
  /** Every expression in the comp, from the last scan (spec: Problems list). Null until scanned. */
  problems: ExpressionScan | null;
  problemsOpen: boolean;
  /** The active tab's evaluated value at the playhead (spec: Value strip). */
  reading: { key: string; reading: ValueReading } | null;
  /** Layer, effect and parameter names of the active comp, for completions. */
  schema: CompSchema | null;
  loaded: Record<string, TreeNode[]>;
  expanded: Record<string, boolean>;
  loading: Record<string, boolean>;
  mode: Mode;
  /** Pinned layer names, kept across sessions and comps (a CTRLS null is usually called the same everywhere). */
  pinned: string[];
  filter: string;
  onlyExpressions: boolean;
  /** Tree row the user last clicked or the timeline selected. */
  selectedKey: string | null;
  tabs: Tab[];
  activeTab: string | null;
  /** The tab shown in the right-hand pane of a split view, if any. */
  splitTab: string | null;
  status: Status | null;
  /** Apply automatically once typing pauses and the code parses (spec: "Apply on pause"). */
  autoApply: boolean;
  /** Bumped to make the selection poller refetch the tree even though AE's hash hasn't changed. */
  refreshNonce: number;

  setTree(tree: CompTree | null): Promise<void>;
  setSchema(schema: CompSchema | null): Promise<void>;
  /** Rewrites old names: in open tabs only, or also in every expression in the comp (one undo step). */
  applyRenames(scope: "tabs" | "all"): Promise<void>;
  dismissRenames(): void;
  setProblemsOpen(open: boolean): void;
  /** Rescans the comp's expressions; a no-op while the Problems panel is closed, unless forced. */
  refreshProblems(force?: boolean): Promise<void>;
  /** Expands the tree down to `key`, loading groups as needed, and selects it. */
  revealInTree(key: string): Promise<void>;
  /** Re-reads the active tab's value; called on tab change, after apply and when the playhead moves. */
  refreshValue(): Promise<void>;
  toggle(key: string): Promise<void>;
  setMode(mode: Mode): void;
  togglePin(layerName: string): void;
  setFilter(filter: string): void;
  setOnlyExpressions(on: boolean): void;
  select(key: string | null): void;
  openProperty(key: string, pin: boolean): Promise<void>;
  pinTab(key: string): void;
  closeTab(key: string): void;
  /** Shows a tab in the right-hand pane (split view); the tab is kept open (not a preview). */
  openToSide(key: string): void;
  closeSplit(): void;
  setActiveTab(key: string): void;
  updateCode(key: string, code: string): void;
  apply(key: string, auto?: boolean): Promise<void>;
  setAutoApply(on: boolean): void;
  /** Re-reads every open tab's expression from AE: clean tabs follow it, edited ones get a conflict to resolve. */
  syncTabs(): Promise<void>;
  /** Settles a conflict: "ae" takes After Effects' version, "mine" keeps the tab's edits (to apply over AE's). */
  resolveExternal(key: string, keep: "ae" | "mine"): void;
  /** Removes the expression (one undo step) and empties its open tab. */
  removeExpression(key: string): Promise<void>;
  setExpressionEnabled(key: string, on: boolean): Promise<void>;
  revealInTimeline(key: string): Promise<void>;
  /** The reference to whatever is selected in AE's timeline, relative to the active tab (pick-from-timeline). */
  pickFromTimeline(fromKey?: string): Promise<(Reference & { target: RefTarget }) | null>;
  applyAll(): Promise<void>;
  setStatus(status: Status | null): void;
  /** Closes every tab, forgets cached children, errors and expansion, and refetches from AE. */
  reset(status?: Status | null): void;
}

/** Pause after the last keystroke before an automatic apply. */
export const AUTO_APPLY_MS = 1000;
const AUTO_APPLY_KEY = "expression-ide.autoApply";
const PINNED_KEY = "expression-ide.pinned";

function storedPinned(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PINNED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function storedAutoApply(): boolean {
  try {
    return localStorage.getItem(AUTO_APPLY_KEY) !== "off";
  } catch {
    return true;
  }
}

/** The schema when it describes the tab's comp, and the tab's layer id, for checkNames. */
export function namesContext(schema: CompSchema | null, key: string): [CompSchema | null, number | null] {
  const p = parseKey(key);
  return schema && p && schema.compId === p.compId ? [schema, p.layerId] : [null, null];
}

/** Auto-apply is "safe" when the code changed, isn't empty (clearing a field mid-edit mustn't remove the
 * expression; Ctrl+S still can), parses, and every literal layer/effect/parameter name it uses exists. */
export function canAutoApply(tab: Tab, schema: CompSchema | null = null): boolean {
  return (
    isDirty(tab) &&
    tab.external === undefined && // never silently overwrite a change made in AE

    tab.code.trim() !== "" &&
    checkSyntax(tab.code) === null &&
    checkNames(tab.code, ...namesContext(schema, tab.key)).length === 0
  );
}

const autoTimers = new Map<string, ReturnType<typeof setTimeout>>();
function cancelAutoApply(key?: string): void {
  for (const [k, t] of autoTimers) {
    if (key === undefined || k === key) {
      clearTimeout(t);
      autoTimers.delete(k);
    }
  }
}

let bridgeOverride: Bridge | null = null;
/** Tests inject a bridge; the panel uses getBridge(). */
export function setStoreBridge(b: Bridge | null): void {
  bridgeOverride = b;
}
const bridge = (): Bridge => bridgeOverride ?? getBridge();

export const isDirty = (t: Tab) => t.code !== t.original;

/** True when `key` is `ancestor` or lies below it. */
export function isWithin(key: string, ancestor: string): boolean {
  return key === ancestor || key.startsWith(ancestor + ":") || key.startsWith(ancestor + "/");
}

/** Finds a loaded node by key anywhere in the tree. */
export function findNode(state: Pick<IdeState, "tree" | "loaded">, key: string): TreeNode | undefined {
  const search = (nodes: TreeNode[] | undefined): TreeNode | undefined => {
    if (!nodes) return undefined;
    for (const n of nodes) {
      if (n.key === key) return n;
      if (isWithin(key, n.key)) {
        const hit = search(childrenOf(n, state.loaded));
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return search(state.tree?.layers);
}

/** Replaces a node (matched by key) in the tree and the loaded cache, returning new containers. */
function replaceNode(state: Pick<IdeState, "tree" | "loaded">, node: TreeNode): Pick<IdeState, "tree" | "loaded"> {
  const swap = (nodes: TreeNode[]): TreeNode[] =>
    nodes.map((n) => {
      if (n.key === node.key) return { ...n, ...node, children: n.children };
      if (n.children && isWithin(node.key, n.key)) return { ...n, children: swap(n.children) };
      return n;
    });
  const tree = state.tree ? { ...state.tree, layers: swap(state.tree.layers) } : null;
  const loaded: Record<string, TreeNode[]> = {};
  for (const k of Object.keys(state.loaded)) loaded[k] = isWithin(node.key, k) ? swap(state.loaded[k]!) : state.loaded[k]!;
  return { tree, loaded };
}

function errorText(e: unknown): string {
  if (e instanceof BridgeError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Keys of the layer and every group between it and `key`, outermost first. */
function ancestors(key: string): string[] {
  const out: string[] = [];
  for (let k = parentKey(key); k; k = parentKey(k)) out.unshift(k);
  return out;
}

/** Groups opened the first time their layer is selected (spec: Transform and Effects show expanded). */
const AUTO_OPEN_GROUPS = ["ADBE Transform Group", "ADBE Effect Parade"];

// Layers expanded because they were selected (not by the user), so they collapse again when deselected.
let autoExpanded: string[] = [];

export const useIde = create<IdeState>((set, get) => {
  /** Fetches children of `key` unless loaded or in flight. */
  async function load(key: string): Promise<void> {
    const s = get();
    const node = findNode(s, key);
    if (!node || !node.hasChildren || childrenOf(node, s.loaded) || s.loading[key]) return;
    set({ loading: { ...get().loading, [key]: true } });
    try {
      const kids = await bridge().getChildren(key);
      set({ loaded: { ...get().loaded, [key]: kids } });
    } catch (e) {
      set({ status: { kind: "error", text: errorText(e) } });
    } finally {
      const { [key]: _done, ...rest } = get().loading;
      set({ loading: rest });
    }
  }

  /** Fetches children again for nodes whose cached children may be stale; drops the ones that no longer exist. */
  async function refetch(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        try {
          const kids = await bridge().getChildren(key);
          set({ loaded: { ...get().loaded, [key]: kids } });
        } catch {
          const { [key]: _gone, ...rest } = get().loaded;
          set({ loaded: rest });
        }
      }),
    );
  }

  /** Loads every expanded node whose children are missing, level by level (a fresh tree drops deep caches). */
  async function loadExpanded(): Promise<void> {
    for (let pass = 0; pass < 12; pass++) {
      const s = get();
      const missing = Object.keys(s.expanded).filter((k) => {
        if (!s.expanded[k]) return false;
        const n = findNode(s, k);
        return !!n && n.hasChildren && !childrenOf(n, s.loaded);
      });
      if (missing.length === 0) return;
      await Promise.all(missing.map(load));
    }
  }

  /** Open tabs (in the schema's comp) whose code still uses old names, with the rewritten code. */
  function tabRenames(state: IdeState, renames: Rename[]): { key: string; code: string; count: number }[] {
    const schema = state.schema;
    if (!schema) return [];
    const out: { key: string; code: string; count: number }[] = [];
    for (const t of state.tabs) {
      const p = parseKey(t.key);
      if (!p || p.compId !== schema.compId) continue;
      const r = renameInCode(t.code, renames, { compName: schema.compName, layerId: p.layerId });
      if (r.count) out.push({ key: t.key, ...r });
    }
    return out;
  }

  /** The comp's applied expressions that still use old names, with the rewritten code. */
  async function compRenames(renames: Rename[]): Promise<{ key: string; code: string; count: number }[]> {
    const schema = get().schema;
    if (!schema) return [];
    let scan: ExpressionScan | null;
    try {
      scan = await bridge().findAllExpressions();
    } catch {
      return [];
    }
    const out: { key: string; code: string; count: number }[] = [];
    for (const e of scan?.entries ?? []) {
      const r = renameInCode(e.expression, renames, { compName: schema.compName, layerId: parseKey(e.key)?.layerId ?? null });
      if (r.count) out.push({ key: e.key, ...r });
    }
    return out;
  }

  function tabFor(key: string, node: TreeNode): Tab {
    const p = parseKey(key);
    const layer = p ? findNode(get(), layerKey(p.compId, p.layerId)) : undefined;
    return {
      key,
      layerName: layer?.name ?? "?",
      propName: node.name,
      original: node.expression ?? "",
      code: node.expression ?? "",
      preview: true,
      error: node.expressionError,
      valueType: node.valueType,
    };
  }

  return {
    tree: null,
    schema: null,
    reading: null,
    problems: null,
    problemsOpen: false,
    renameOffer: null,
    loaded: {},
    expanded: {},
    loading: {},
    mode: "selection",
    pinned: storedPinned(),
    filter: "",
    onlyExpressions: false,
    selectedKey: null,
    tabs: [],
    activeTab: null,
    splitTab: null,
    status: null,
    autoApply: storedAutoApply(),
    refreshNonce: 0,

    async setTree(tree) {
      const prev = get().tree;
      const sameComp = !!prev && !!tree && prev.comp.id === tree.comp.id;
      let expanded = sameComp ? { ...get().expanded } : {};
      if (!sameComp) autoExpanded = [];
      if (get().mode === "selection" && tree) {
        const now = tree.selectedLayerKeys;
        for (const k of autoExpanded) if (!now.includes(k)) delete expanded[k];
        const nextAuto = autoExpanded.filter((k) => now.includes(k));
        for (const k of now) {
          if (!expanded[k]) {
            expanded[k] = true;
            nextAuto.push(k);
          }
        }
        autoExpanded = nextAuto;
        for (const layer of tree.layers) {
          if (!now.includes(layer.key)) continue;
          for (const g of layer.children ?? []) {
            if (AUTO_OPEN_GROUPS.includes(g.matchName) && expanded[g.key] === undefined) expanded[g.key] = true;
          }
        }
      }
      // Pinned layers open (with Effects) the first time they appear.
      for (const layer of tree?.layers ?? []) {
        if (get().pinned.includes(layer.name) && expanded[layer.key] === undefined) {
          expanded[layer.key] = true;
          if (expanded[`${layer.key}:ADBE Effect Parade`] === undefined) expanded[`${layer.key}:ADBE Effect Parade`] = true;
        }
      }
      let selectedKey = get().selectedKey;
      if (tree?.activeKey && tree.activeKey !== prev?.activeKey) {
        selectedKey = tree.activeKey;
        for (const k of ancestors(tree.activeKey)) expanded[k] = true;
      }
      if (!tree) expanded = {};
      // Keep showing previously loaded groups that are still open while they are refetched, so a refresh
      // doesn't collapse deep folders for a moment.
      const stale: Record<string, TreeNode[]> = {};
      if (sameComp) for (const [k, kids] of Object.entries(get().loaded)) if (expanded[k]) stale[k] = kids;
      const tabs = get().tabs.map((t) => {
        const p = parseKey(t.key);
        const layer = tree && p ? tree.layers.find((l) => l.key === layerKey(p.compId, p.layerId)) : undefined;
        return layer && layer.name !== t.layerName ? { ...t, layerName: layer.name } : t;
      });
      set({ tree, loaded: stale, expanded, selectedKey, tabs });
      await refetch(Object.keys(stale));
      await loadExpanded();
    },

    async setSchema(schema) {
      const prev = get().schema;
      set({ schema });
      if (!prev || !schema) return;
      const renames = detectRenames(prev, schema);
      if (renames.length === 0) return;
      // Merge with an offer still showing, so two quick renames are handled together.
      const all = [...(get().renameOffer?.renames ?? []), ...renames];
      const tabCount = tabRenames(get(), all).reduce((n, r) => n + r.count, 0);
      const compCount = (await compRenames(all)).reduce((n, r) => n + r.count, 0);
      // AE may already have rewritten everything itself; then there's nothing to offer.
      set({ renameOffer: tabCount + compCount > 0 ? { renames: all, summary: describeRenames(all), tabCount, compCount } : null });
    },

    async applyRenames(scope) {
      const offer = get().renameOffer;
      if (!offer) return;
      set({ renameOffer: null });
      let compDone = 0;
      if (scope === "all") {
        const edits = await compRenames(offer.renames);
        if (edits.length) {
          try {
            await bridge().setExpressions(
              edits.map((e) => ({ key: e.key, code: e.code })),
              `Expression IDE: update references (${offer.summary})`,
            );
            compDone = edits.reduce((n, e) => n + e.count, 0);
          } catch (e) {
            set({ status: { kind: "error", text: errorText(e) } });
            return;
          }
          await get().syncTabs(); // clean tabs pick up the rewritten expressions
        }
      }
      const tabEdits = tabRenames(get(), offer.renames);
      for (const e of tabEdits) get().updateCode(e.key, e.code);
      const tabDone = tabEdits.reduce((n, e) => n + e.count, 0);
      set({
        status: {
          kind: "ok",
          text: `Updated ${tabDone} reference${tabDone === 1 ? "" : "s"} in open tabs${scope === "all" ? ` and ${compDone} in the comp` : ""}.`,
        },
      });
      void get().refreshProblems();
    },

    dismissRenames: () => set({ renameOffer: null }),

    setProblemsOpen(open) {
      set({ problemsOpen: open });
      if (open) void get().refreshProblems();
    },

    async refreshProblems(force = false) {
      if (!get().problemsOpen && !force) return;
      try {
        set({ problems: await bridge().findAllExpressions() });
      } catch (e) {
        set({ status: { kind: "error", text: errorText(e) } });
      }
    },

    async revealInTree(key) {
      const expanded = { ...get().expanded };
      for (const k of ancestors(key)) expanded[k] = true;
      set({ expanded, selectedKey: key, filter: "", onlyExpressions: false });
      await loadExpanded();
    },

    async refreshValue() {
      const key = get().activeTab;
      if (!key) {
        if (get().reading) set({ reading: null });
        return;
      }
      try {
        const reading = await bridge().getValueAtTime(key);
        if (get().activeTab === key) set({ reading: { key, reading } });
      } catch {
        // The tab's property is gone (deleted layer, new project); the strip just goes blank.
        if (get().activeTab === key) set({ reading: null });
      }
    },

    async toggle(key) {
      const open = !!get().expanded[key] || (get().expanded[key] === undefined && isFiltering(get()));
      set({ expanded: { ...get().expanded, [key]: !open } });
      autoExpanded = autoExpanded.filter((k) => k !== key);
      if (!open) await load(key);
    },

    togglePin(layerName) {
      const on = !get().pinned.includes(layerName);
      const pinned = on ? [...get().pinned, layerName] : get().pinned.filter((n) => n !== layerName);
      try {
        localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
      } catch {
        // A convenience only.
      }
      set({ pinned });
      if (on) {
        // Open it with its effects, where controls live.
        const layer = get().tree?.layers.find((l) => l.name === layerName);
        if (layer) {
          set({ expanded: { ...get().expanded, [layer.key]: true, [`${layer.key}:ADBE Effect Parade`]: true } });
          void loadExpanded();
        }
      }
    },

    setMode(mode) {
      set({ mode });
      if (mode === "comp") autoExpanded = [];
    },
    setFilter: (filter) => set({ filter }),
    setOnlyExpressions: (onlyExpressions) => set({ onlyExpressions }),
    select: (selectedKey) => set({ selectedKey }),

    async openProperty(key, pin) {
      set({ selectedKey: key });
      const existing = get().tabs.find((t) => t.key === key);
      if (existing) {
        set({ activeTab: key, tabs: get().tabs.map((t) => (t.key === key && pin ? { ...t, preview: false } : t)) });
        return;
      }
      let node: TreeNode;
      try {
        node = await bridge().getProperty(key);
      } catch (e) {
        set({ status: { kind: "error", text: errorText(e) } });
        return;
      }
      // A double click starts several opens at once; the first to return creates the tab, the rest just focus it.
      if (get().tabs.some((t) => t.key === key)) {
        set({ activeTab: key, tabs: get().tabs.map((t) => (t.key === key && pin ? { ...t, preview: false } : t)) });
        return;
      }
      const tab = { ...tabFor(key, node), preview: !pin };
      // The new tab replaces a clean preview tab in place.
      const tabs = get().tabs;
      const previewAt = tabs.findIndex((t) => t.preview && !isDirty(t));
      const next = [...tabs];
      if (!pin && previewAt >= 0) next.splice(previewAt, 1, tab);
      else next.push(tab);
      set({ tabs: next, activeTab: key, ...replaceNode(get(), node) });
    },

    pinTab: (key) => set({ tabs: get().tabs.map((t) => (t.key === key ? { ...t, preview: false } : t)) }),

    closeTab(key) {
      cancelAutoApply(key);
      const tabs = get().tabs;
      const i = tabs.findIndex((t) => t.key === key);
      if (i < 0) return;
      const next = tabs.filter((t) => t.key !== key);
      const activeTab = get().activeTab === key ? (next[Math.min(i, next.length - 1)]?.key ?? null) : get().activeTab;
      set({ tabs: next, activeTab, splitTab: get().splitTab === key ? null : get().splitTab });
    },

    openToSide(key) {
      if (!get().tabs.some((t) => t.key === key)) return;
      set({ splitTab: key, tabs: get().tabs.map((t) => (t.key === key ? { ...t, preview: false } : t)) });
    },

    closeSplit: () => set({ splitTab: null }),

    setActiveTab: (key) => set({ activeTab: key, selectedKey: key }),

    updateCode(key, code) {
      // Editing a preview tab keeps it, as in VS Code.
      set({ tabs: get().tabs.map((t) => (t.key === key ? { ...t, code, preview: t.preview && code === t.original } : t)) });
      cancelAutoApply(key);
      const tab = get().tabs.find((t) => t.key === key);
      if (!get().autoApply || !tab || !canAutoApply(tab, get().schema)) return;
      autoTimers.set(
        key,
        setTimeout(() => {
          autoTimers.delete(key);
          const now = get().tabs.find((t) => t.key === key);
          if (get().autoApply && now && now.code === code && canAutoApply(now, get().schema)) get().apply(key, true);
        }, AUTO_APPLY_MS),
      );
    },

    async syncTabs() {
      const keys = get().tabs.map((t) => t.key);
      if (keys.length === 0) return;
      let nodes: (TreeNode | null)[];
      try {
        nodes = await bridge().getProperties(keys);
      } catch {
        return; // the poller reports AE being unreachable
      }
      const updated: string[] = [];
      let containers: Pick<IdeState, "tree" | "loaded"> = get();
      const tabs = get().tabs.map((t) => {
        const node = nodes[keys.indexOf(t.key)];
        if (!node) return t;
        containers = replaceNode(containers, node);
        const ae = node.expression ?? "";
        const error = node.expressionError;
        if (ae === t.original) return t.error === error ? t : { ...t, error };
        // AE now holds exactly what the tab shows (e.g. an apply just landed): nothing to resolve.
        if (ae === t.code) return { ...t, original: ae, error, external: undefined };
        if (!isDirty(t)) {
          updated.push(`${t.layerName} › ${t.propName}`);
          return { ...t, code: ae, original: ae, error, external: undefined };
        }
        return t.external === ae ? t : { ...t, external: ae };
      });
      set({
        tabs,
        ...containers,
        ...(updated.length ? { status: { kind: "info", text: `Updated from After Effects: ${updated.join(", ")}` } as Status } : {}),
      });
    },

    resolveExternal(key, keep) {
      set({
        tabs: get().tabs.map((t) => {
          if (t.key !== key || t.external === undefined) return t;
          // Either way AE's version becomes the baseline; "mine" leaves the edits to apply over it.
          return keep === "ae" ? { ...t, code: t.external, original: t.external, external: undefined } : { ...t, original: t.external, external: undefined };
        }),
      });
    },

    setAutoApply(on) {
      try {
        localStorage.setItem(AUTO_APPLY_KEY, on ? "on" : "off");
      } catch {
        // A convenience only.
      }
      if (!on) cancelAutoApply();
      set({ autoApply: on });
    },

    async apply(key, auto = false) {
      cancelAutoApply(key);
      const tab = get().tabs.find((t) => t.key === key);
      if (!tab) return;
      const code = tab.code;
      const label = `${tab.layerName} › ${tab.propName}`;
      try {
        const res = await bridge().setExpression(key, code);
        set({
          tabs: get().tabs.map((t) => (t.key === key ? { ...t, original: code, error: res.error, external: undefined } : t)),
          ...replaceNode(get(), res.node),
          status: res.error
            ? { kind: "error", text: `${label}: ${parseAeError(res.error).summary}`, detail: res.error }
            : { kind: "ok", text: code === "" ? `Removed expression: ${label}` : `${auto ? "Auto-applied" : "Applied"}: ${label}` },
        });
        if (get().activeTab === key) get().refreshValue();
        void get().refreshProblems();
      } catch (e) {
        set({ status: { kind: "error", text: `${label}: ${errorText(e)}` } });
      }
    },

    async applyAll() {
      for (const t of get().tabs.filter(isDirty)) await get().apply(t.key);
    },

    setStatus: (status) => set({ status }),

    async removeExpression(key) {
      cancelAutoApply(key);
      try {
        const res = await bridge().setExpression(key, "");
        set({
          tabs: get().tabs.map((t) => (t.key === key ? { ...t, code: "", original: "", error: undefined } : t)),
          ...replaceNode(get(), res.node),
          status: { kind: "ok", text: `Removed expression: ${res.node.name}` },
        });
      } catch (e) {
        set({ status: { kind: "error", text: errorText(e) } });
      }
    },

    async setExpressionEnabled(key, on) {
      try {
        const node = await bridge().setExpressionEnabled(key, on);
        set({ ...replaceNode(get(), node), status: { kind: "ok", text: `${on ? "Enabled" : "Disabled"} expression: ${node.name}` } });
      } catch (e) {
        set({ status: { kind: "error", text: errorText(e) } });
      }
    },

    async pickFromTimeline(fromKey) {
      try {
        const target = await bridge().getSelectedRef();
        if (!target) {
          set({ status: { kind: "info", text: "Select a property in the timeline first, then press Ctrl+Shift+P." } });
          return null;
        }
        return { ...generateReference(target, referenceContext(get(), target, fromKey)), target };
      } catch (e) {
        set({ status: { kind: "error", text: errorText(e) } });
        return null;
      }
    },

    async revealInTimeline(key) {
      try {
        await bridge().revealInTimeline(key);
      } catch (e) {
        set({ status: { kind: "error", text: errorText(e) } });
      }
    },

    reset(status = null) {
      autoExpanded = [];
      cancelAutoApply();
      set({
        tree: null,
        schema: null,
        reading: null,
        problems: null,
        renameOffer: null,
        loaded: {},
        expanded: {},
        loading: {},
        selectedKey: null,
        tabs: [],
        activeTab: null,
        splitTab: null,
        status,
        refreshNonce: get().refreshNonce + 1,
      });
    },
  };
});

/** Builds a reference target for a loaded node from its ancestry in the tree. */
export function refTargetFor(state: Pick<IdeState, "tree" | "loaded">, key: string): RefTarget | null {
  const p = parseKey(key);
  const tree = state.tree;
  if (!p || !tree || tree.comp.id !== p.compId) return null;
  const layer = findNode(state, layerKey(p.compId, p.layerId));
  if (!layer) return null;
  const path: RefTarget["path"] = [];
  for (const k of [...ancestors(key), key].slice(1)) {
    const n = findNode(state, k);
    if (!n) return null;
    path.push({ name: n.name, matchName: n.matchName });
  }
  return {
    compId: tree.comp.id,
    compName: tree.comp.name,
    layerId: p.layerId,
    layerIndex: layer.index ?? 0,
    layerName: layer.name,
    layerMatchName: layer.matchName,
    path,
  };
}

/** References are written relative to the tab being edited (default: the active one); with none, as from another layer. */
export function referenceContext(
  state: Pick<IdeState, "tree" | "activeTab">,
  target: RefTarget,
  fromKey: string | null = state.activeTab,
): RefContext {
  const tab = fromKey ? parseKey(fromKey) : null;
  const sameNamed = state.tree && state.tree.comp.id === target.compId
    ? state.tree.layers.filter((l) => l.name === target.layerName).length
    : 1;
  return {
    compId: tab?.compId ?? target.compId,
    layerId: tab?.layerId ?? -1,
    duplicateLayerName: sameNamed > 1,
  };
}

export function referenceFor(
  state: Pick<IdeState, "tree" | "loaded" | "activeTab">,
  key: string,
  fromKey?: string | null,
): Reference | null {
  const target = refTargetFor(state, key);
  return target ? generateReference(target, referenceContext(state, target, fromKey)) : null;
}

export function isFiltering(s: Pick<IdeState, "filter" | "onlyExpressions">): boolean {
  return s.filter.trim() !== "" || s.onlyExpressions;
}
