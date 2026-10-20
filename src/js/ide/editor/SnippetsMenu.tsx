import { useEffect, useRef, useState } from "react";
import { SNIPPETS } from "../snippets";
import { useIde } from "../store";

/** "Snippets ▾" in the tab bar: inserts a snippet at the cursor, creating the controls it uses on the layer. */
export function SnippetsMenu({ activeTab }: { activeTab: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  if (!activeTab) return null;
  return (
    <div className="snippets" ref={ref}>
      <button className="snippets-button" aria-expanded={open} onClick={() => setOpen(!open)} title="Insert a snippet; it creates the controls it uses">
        Snippets ▾
      </button>
      {open && (
        <div className="snippets-popover" role="menu" aria-label="Snippets">
          {SNIPPETS.map((s) => (
            <button
              key={s.id}
              role="menuitem"
              onClick={() => {
                setOpen(false);
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
        </div>
      )}
    </div>
  );
}
