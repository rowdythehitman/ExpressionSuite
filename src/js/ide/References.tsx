import { useIde } from "./store";

/** Find references results: every expression that uses the property, by line; click one to open it there. */
export function References() {
  const refs = useIde((s) => s.references);
  if (!refs) return null;
  const { closeReferences, openAtLine } = useIde.getState();
  const exprs = new Set(refs.results.map((r) => r.key)).size;
  return (
    <div className="problems references" role="region" aria-label="References">
      <div className="problems-header">
        <span>
          REFERENCES to {refs.label} · {refs.results.length} in {exprs} expression{exprs === 1 ? "" : "s"}
          {refs.truncated && " (comp too large: stopped early)"}
        </span>
        <button onClick={closeReferences} aria-label="Close references">
          ×
        </button>
      </div>
      <div className="problems-rows">
        {refs.results.length === 0 && <div className="empty">No expression in this comp uses it.</div>}
        {refs.results.map((r, i) => (
          <button key={`${r.key}-${r.line}-${i}`} className="problem" onClick={() => void openAtLine(r.key, r.line)} title={r.text}>
            <span className="where">
              {r.layerIndex} {r.layerName} › {r.path.join(" › ")}
            </span>
            <span className="what">
              line {r.line}: {r.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
