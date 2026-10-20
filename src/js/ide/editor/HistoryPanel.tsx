import { useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { SOURCE_LABEL, type HistoryEntry } from "../history";
import { themeOf, useIde, type Tab } from "../store";

const EMPTY: HistoryEntry[] = [];

function when(time: number): string {
  const d = new Date(time);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString() : d.toLocaleString();
}

/** Every version of the tab's expression, newest first; pick one to compare with the tab and restore it. */
export function HistoryPanel({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const entries = useIde((s) => s.history[tab.key] ?? EMPTY);
  const theme = useIde(themeOf);
  const [picked, setPicked] = useState<number | null>(null);
  const list = [...entries].reverse();
  const entry = picked === null ? null : list[picked];

  return (
    <div className="history" role="region" aria-label="History">
      <div className="history-header">
        <span>
          HISTORY · {tab.layerName} › {tab.propName}
        </span>
        {entry && (
          <button
            onClick={() => {
              useIde.getState().updateCode(tab.key, entry.code);
              onClose();
            }}
          >
            Restore this version
          </button>
        )}
        <button aria-label="Close history" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="history-body">
        <div className="history-list">
          {list.length === 0 && <div className="empty">No history yet: versions are recorded each time this property is applied.</div>}
          {list.map((e, i) => (
            <button key={`${e.time}-${i}`} className={`history-entry ${i === picked ? "picked" : ""}`} onClick={() => setPicked(i)}>
              <span className="history-when">{when(e.time)}</span>
              <span className="history-source">{SOURCE_LABEL[e.source]}</span>
              <span className="history-preview">{e.code.split("\n")[0] || "(no expression)"}</span>
            </button>
          ))}
        </div>
        {entry && (
          <div className="history-diff" data-testid="history-diff">
            <DiffEditor
              original={entry.code}
              modified={tab.code}
              language="javascript"
              theme={theme === "light" ? "ae-light" : "ae-dark"}
              options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, automaticLayout: true }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
