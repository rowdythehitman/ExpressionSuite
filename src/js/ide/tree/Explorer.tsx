import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { parentKey } from "../../../shared/keys";
import { useIde } from "../store";
import { flatten, hasExpressionBelow, type Row } from "./flatten";

const ROW_HEIGHT = 22;
const INDENT = 12;

export function Explorer() {
  const tree = useIde((s) => s.tree);
  const loaded = useIde((s) => s.loaded);
  const expanded = useIde((s) => s.expanded);
  const loading = useIde((s) => s.loading);
  const filter = useIde((s) => s.filter);
  const onlyExpressions = useIde((s) => s.onlyExpressions);
  const selectedKey = useIde((s) => s.selectedKey);
  const activeTab = useIde((s) => s.activeTab);
  const mode = useIde((s) => s.mode);
  const { toggle, openProperty, select, setFilter, setOnlyExpressions, setMode } = useIde.getState();

  const rows = useMemo(
    () => flatten({ layers: tree?.layers ?? [], loaded, expanded, loading, filter, onlyExpressions }),
    [tree, loaded, expanded, loading, filter, onlyExpressions],
  );
  const selectedLayers = useMemo(() => new Set(tree?.selectedLayerKeys ?? []), [tree]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Not memoised by the React Compiler; the component re-renders on every store change it reads anyway.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Keep the selected row (from a click, the keyboard or the timeline) in view.
  const selectedIndex = rows.findIndex((r) => r.node.key === selectedKey);
  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
  }, [selectedIndex, virtualizer]);

  const activate = (row: Row, pin: boolean) => {
    if (row.node.kind === "property") openProperty(row.node.key, pin);
    else {
      select(row.node.key);
      toggle(row.node.key);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = selectedIndex;
    const row = rows[i];
    const go = (j: number) => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, j))];
      if (r) select(r.node.key);
    };
    switch (e.key) {
      case "ArrowDown":
        go(i < 0 ? 0 : i + 1);
        break;
      case "ArrowUp":
        go(i < 0 ? 0 : i - 1);
        break;
      case "ArrowRight":
        if (row && row.node.kind !== "property" && !row.open) toggle(row.node.key);
        else go(i + 1);
        break;
      case "ArrowLeft":
        if (row && row.node.kind !== "property" && row.open) toggle(row.node.key);
        else if (row) {
          const p = parentKey(row.node.key);
          if (p) select(p);
        }
        break;
      case "Enter":
        if (row) activate(row, true);
        break;
      case " ":
        if (row) activate(row, false);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span className="explorer-title" title={tree ? `${tree.comp.width}×${tree.comp.height}, ${tree.comp.frameRate}fps` : ""}>
          {tree ? `COMP: ${tree.comp.name}` : "NO COMP"}
        </span>
        <div className="segmented" role="group" aria-label="Explorer mode">
          <button className={mode === "selection" ? "on" : ""} onClick={() => setMode("selection")} title="Expand the layers selected in the timeline">
            Selection
          </button>
          <button className={mode === "comp" ? "on" : ""} onClick={() => setMode("comp")} title="Every layer, collapsed">
            Comp
          </button>
        </div>
      </div>
      <div className="explorer-filter">
        <input
          type="search"
          placeholder="Filter properties (pos, opa, slider)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter properties"
        />
        <button
          className={`icon-toggle ${onlyExpressions ? "on" : ""}`}
          aria-pressed={onlyExpressions}
          onClick={() => setOnlyExpressions(!onlyExpressions)}
          title="Only show properties with expressions"
        >
          {"{ }"}
        </button>
      </div>
      <div className="explorer-rows" ref={scrollRef} tabIndex={0} role="tree" aria-label="Properties" onKeyDown={onKeyDown}>
        {!tree && <div className="empty">Open a composition in After Effects.</div>}
        {tree && rows.length === 0 && <div className="empty">{filter || onlyExpressions ? "Nothing matches." : "This comp has no layers."}</div>}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index]!;
            return (
              <TreeRow
                key={row.node.key}
                row={row}
                top={v.start}
                selected={row.node.key === selectedKey}
                active={row.node.key === activeTab}
                timelineSelected={selectedLayers.has(row.node.key)}
                dot={row.node.kind !== "property" && hasExpressionBelow(row.node, loaded)}
                onClick={() => activate(row, false)}
                onDoubleClick={() => row.node.kind === "property" && openProperty(row.node.key, true)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TreeRowProps {
  row: Row;
  top: number;
  selected: boolean;
  active: boolean;
  timelineSelected: boolean;
  dot: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

function TreeRow({ row, top, selected, active, timelineSelected, dot, onClick, onDoubleClick }: TreeRowProps) {
  const { node, depth, open } = row;
  const isProp = node.kind === "property";
  const hasExpr = isProp && !!node.expression;
  const disabled = hasExpr && node.expressionEnabled === false;
  const classes = ["row", node.kind, selected && "selected", active && "active", disabled && "disabled"].filter(Boolean).join(" ");
  return (
    <div
      className={classes}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={isProp ? undefined : open}
      aria-selected={selected}
      data-key={node.key}
      style={{ top, height: ROW_HEIGHT, paddingLeft: 4 + depth * INDENT }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={node.expressionError ?? (disabled ? "Expression disabled" : undefined)}
    >
      <span className="twisty">{isProp ? "" : row.loading ? "…" : open ? "▾" : "▸"}</span>
      {node.kind === "layer" && <span className="layer-index">{node.index}</span>}
      {isProp && <span className="fx">ƒ</span>}
      <span className="label">{node.name}</span>
      {node.kind === "layer" && timelineSelected && <span className="badge sel" title="Selected in the timeline">●</span>}
      {dot && <span className="badge dot" title="Contains expressions" />}
      {hasExpr && !node.expressionError && <span className="badge expr" title={disabled ? "Expression disabled" : "Has expression"}>{"{ }"}</span>}
      {hasExpr && node.expressionError && <span className="badge err" title={node.expressionError}>⚠</span>}
    </div>
  );
}
