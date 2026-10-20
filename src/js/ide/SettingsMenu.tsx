import { useEffect, useRef, useState } from "react";
import type { ThemeChoice } from "./settings";
import { useIde } from "./store";

/** ⚙ in the explorer header: theme, font size, tab width, reference by matchName. Saved per machine. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const settings = useIde((s) => s.settings);
  const set = useIde.getState().setSettings;
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

  return (
    <div className="settings" ref={ref}>
      <button className="icon-button" aria-label="Settings" aria-expanded={open} title="Settings" onClick={() => setOpen(!open)}>
        ⚙
      </button>
      {open && (
        <div className="settings-popover" role="dialog" aria-label="Settings">
          <label>
            Theme
            <select value={settings.theme} onChange={(e) => set({ theme: e.target.value as ThemeChoice })}>
              <option value="ae">Follow After Effects</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label>
            Font size
            <input
              type="number"
              min={9}
              max={24}
              value={settings.fontSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 9 && n <= 24) set({ fontSize: n });
              }}
            />
          </label>
          <label>
            Tab width
            <select value={settings.tabSize} onChange={(e) => set({ tabSize: e.target.value === "4" ? 4 : 2 })}>
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
            </select>
          </label>
          <label className="check" title='effect("ADBE Slider Control")("ADBE Slider Control-0001"): keeps working in other AE languages'>
            <input type="checkbox" checked={settings.byMatchName} onChange={(e) => set({ byMatchName: e.target.checked })} />
            Reference effects by matchName
          </label>
        </div>
      )}
    </div>
  );
}
