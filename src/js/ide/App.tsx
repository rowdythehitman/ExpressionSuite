import { useEffect, useRef, useState } from "react";
import { EditorArea } from "./editor/EditorArea";
import { Explorer } from "./tree/Explorer";
import { Problems } from "./Problems";
import { RenameBanner } from "./RenameBanner";
import { StatusBar } from "./StatusBar";
import { useSelectionSync } from "./useSelectionSync";

const MIN_SIDEBAR = 160;
const WIDTH_KEY = "expression-ide.sidebarWidth";

function storedWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return n >= MIN_SIDEBAR ? n : 280;
  } catch {
    return 280;
  }
}

export function App() {
  useSelectionSync();
  const [width, setWidth] = useState(storedWidth);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // Storage is a convenience; ignore when unavailable.
    }
  }, [width]);

  // Ctrl/Cmd+B toggles the sidebar, as in VS Code.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSplitterDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSplitterMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setWidth(Math.max(MIN_SIDEBAR, Math.min(window.innerWidth - 200, e.clientX)));
  };
  const onSplitterUp = () => {
    dragging.current = false;
  };

  return (
    <div className="ide">
      <div className="main">
        {!collapsed && (
          <>
            <div className="sidebar" style={{ width }}>
              <Explorer />
            </div>
            <div
              className="splitter"
              role="separator"
              aria-orientation="vertical"
              onPointerDown={onSplitterDown}
              onPointerMove={onSplitterMove}
              onPointerUp={onSplitterUp}
              onDoubleClick={() => setCollapsed(true)}
              title="Drag to resize; double-click or Ctrl+B to hide"
            />
          </>
        )}
        {collapsed && (
          <button className="sidebar-show" onClick={() => setCollapsed(false)} title="Show explorer (Ctrl+B)">
            ›
          </button>
        )}
        <div className="workspace">
          <RenameBanner />
          <EditorArea />
          <Problems />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
