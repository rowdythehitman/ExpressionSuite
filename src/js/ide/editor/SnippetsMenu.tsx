import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SNIPPETS } from "../snippets";
import { useIde } from "../store";

/** "Snippets ▾" in the tab bar: inserts a snippet at the cursor, creating the controls it uses on the layer. */
export function SnippetsMenu({ activeTab }: { activeTab: string | null }) {
  // Where the list opens, under the button's right edge. It's portalled to <body> and fixed: the tab bar clips
  // what overflows it, and Monaco would cover it.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    setAt(at || !r ? null : { top: r.bottom + 2, right: Math.max(4, window.innerWidth - r.right) });
  };
  const open = at !== null;
  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    const away = (e: Event) => !ref.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  if (!activeTab) return null;
  return (
    <div className="snippets" ref={ref}>
      <button className="snippets-button" aria-expanded={open} onClick={toggle} title="Insert a snippet; it creates the controls it uses">
        Snippets ▾
      </button>
      {at &&
        createPortal(
          <div className="snippets-popover" role="menu" aria-label="Snippets" ref={list} style={{ top: at.top, right: at.right }}>
            {SNIPPETS.map((s) => (
              <button
                key={s.id}
                role="menuitem"
                onClick={() => {
                  setAt(null);
                  void useIde.getState().insertSnippet(activeTab, s.id);
                }}
              >
                <span className="snippet-label">{s.label}</span>
                <span className="snippet-desc">
                  {s.description}
                  {s.controls.length > 0 && ` · adds ${s.controls.map((c) => c.name).join(", ")}`}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
