import { useEffect, useRef, useState } from "react";
import { onHostBackground } from "../bridge/panel";
import { EditorArea } from "./editor/EditorArea";
import { setEditorTheme } from "./editor/monaco";
import { themeOf, useIde } from "./store";
import { Explorer } from "./tree/Explorer";
import { Problems } from "./Problems";
import { References } from "./References";
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

/** Puts the resolved theme on <html> (CSS variables) and in Monaco, and AE's own grey behind the panel. */
function useTheme(): void {
  const theme = useIde(themeOf);
  const choice = useIde((s) => s.settings.theme);
  const bg = useIde((s) => s.hostBackground);
  useEffect(() => onHostBackground((rgb) => useIde.getState().setHostBackground(rgb)), []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (choice === "ae") root.style.setProperty("--bg", `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`);
    else root.style.removeProperty("--bg");
    setEditorTheme(theme);
  }, [theme, choice, bg]);
}

export function App() {
  useSelectionSync();
  useTheme();
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
          <References />
          <Problems />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
