import { parseAeError } from "./aeError";
import { useIde } from "./store";

/** Collapsible list of every erroring expression in the comp; click one to open it (spec: Problems list). */
export function Problems() {
  const open = useIde((s) => s.problemsOpen);
  const scan = useIde((s) => s.problems);
  if (!open) return null;
  const errors = (scan?.entries ?? []).filter((e) => e.error);
  const { setProblemsOpen, refreshProblems, openProperty, revealInTree } = useIde.getState();
  return (
    <div className="problems" role="region" aria-label="Problems">
      <div className="problems-header">
        <span>
          PROBLEMS {scan ? `· ${errors.length} error${errors.length === 1 ? "" : "s"} in ${scan.entries.length} expression${scan.entries.length === 1 ? "" : "s"}` : "· scanning…"}
          {scan?.truncated && " (comp too large: stopped early)"}
        </span>
        <button onClick={() => refreshProblems(true)} title="Scan again" aria-label="Rescan problems">
          ↺
        </button>
        <button onClick={() => setProblemsOpen(false)} title="Close" aria-label="Close problems">
          ×
        </button>
      </div>
      <div className="problems-rows">
        {scan && errors.length === 0 && <div className="empty">No expression errors in this comp.</div>}
        {errors.map((e) => {
          const parsed = parseAeError(e.error!);
          return (
            <button
              key={e.key}
              className="problem"
              title={e.error}
              onClick={() => {
                void revealInTree(e.key);
                void openProperty(e.key, true);
              }}
            >
              <span className="badge err">⚠</span>
              <span className="where">
                {e.layerIndex} {e.layerName} › {e.path.join(" › ")}
              </span>
              <span className="what">{parsed.summary}</span>
              {!e.enabled && <span className="off">disabled</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
