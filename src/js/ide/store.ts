import { create } from "zustand";
import { type Bridge, BridgeError, type CompTree, getBridge, type TreeNode } from "../bridge";
import { layerKey, parentKey, parseKey } from "../../shared/keys";
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
}

export interface Status {
  text: string;
  kind: "info" | "ok" | "error";
}

export interface IdeState {
  tree: CompTree | null;
  loaded: Record<string, TreeNode[]>;
  expanded: Record<string, boolean>;
  loading: Record<string, boolean>;
  mode: Mode;
  filter: string;
  onlyExpressions: boolean;
  /** Tree row the user last clicked or the timeline selected. */
  selectedKey: string | null;
  tabs: Tab[];
  activeTab: string | null;
  status: Status | null;

  setTree(tree: CompTree | null): Promise<void>;
  toggle(key: string): Promise<void>;
  setMode(mode: Mode): void;
  setFilter(filter: string): void;
  setOnlyExpressions(on: boolean): void;
  select(key: string | null): void;
  openProperty(key: string, pin: boolean): Promise<void>;
  pinTab(key: string): void;
  closeTab(key: string): void;
  setActiveTab(key: string): void;
  updateCode(key: string, code: string): void;
  apply(key: string): Promise<void>;
  applyAll(): Promise<void>;
  setStatus(status: Status | null): void;
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
    };
  }

  return {
    tree: null,
    loaded: {},
    expanded: {},
    loading: {},
    mode: "selection",
    filter: "",
    onlyExpressions: false,
    selectedKey: null,
    tabs: [],
    activeTab: null,
    status: null,

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

    async toggle(key) {
      const open = !!get().expanded[key] || (get().expanded[key] === undefined && isFiltering(get()));
      set({ expanded: { ...get().expanded, [key]: !open } });
      autoExpanded = autoExpanded.filter((k) => k !== key);
      if (!open) await load(key);
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
      const tabs = get().tabs;
      const i = tabs.findIndex((t) => t.key === key);
      if (i < 0) return;
      const next = tabs.filter((t) => t.key !== key);
      const activeTab = get().activeTab === key ? (next[Math.min(i, next.length - 1)]?.key ?? null) : get().activeTab;
      set({ tabs: next, activeTab });
    },

    setActiveTab: (key) => set({ activeTab: key, selectedKey: key }),

    updateCode(key, code) {
      // Editing a preview tab keeps it, as in VS Code.
      set({ tabs: get().tabs.map((t) => (t.key === key ? { ...t, code, preview: t.preview && code === t.original } : t)) });
    },

    async apply(key) {
      const tab = get().tabs.find((t) => t.key === key);
      if (!tab) return;
      const code = tab.code;
      const label = `${tab.layerName} › ${tab.propName}`;
      try {
        const res = await bridge().setExpression(key, code);
        set({
          tabs: get().tabs.map((t) => (t.key === key ? { ...t, original: code, error: res.error } : t)),
          ...replaceNode(get(), res.node),
          status: res.error
            ? { kind: "error", text: `${label}: ${res.error}` }
            : { kind: "ok", text: code === "" ? `Removed expression: ${label}` : `Applied: ${label}` },
        });
      } catch (e) {
        set({ status: { kind: "error", text: `${label}: ${errorText(e)}` } });
      }
    },

    async applyAll() {
      for (const t of get().tabs.filter(isDirty)) await get().apply(t.key);
    },

    setStatus: (status) => set({ status }),
  };
});

export function isFiltering(s: Pick<IdeState, "filter" | "onlyExpressions">): boolean {
  return s.filter.trim() !== "" || s.onlyExpressions;
}
