import { isDirty, useIde } from "./store";

export function StatusBar() {
  const tree = useIde((s) => s.tree);
  const status = useIde((s) => s.status);
  const dirty = useIde((s) => s.tabs.filter(isDirty).length);
  const selected = tree?.selectedLayerKeys.length ?? 0;
  const problemsOpen = useIde((s) => s.problemsOpen);
  const errorCount = useIde((s) => s.problems?.entries.filter((e) => e.error).length);
  return (
    <div className="statusbar" role="status">
      {!window.cep && <span className="mock" title="Running in a browser against the fixture comp">MOCK AE</span>}
      <span>{tree ? `${tree.comp.name} · ${selected} selected` : "No comp"}</span>
      <button
        className={`problems-toggle ${errorCount ? "has-errors" : ""}`}
        onClick={() => useIde.getState().setProblemsOpen(!problemsOpen)}
        title="Show every expression error in the comp"
      >
        ⚠ {errorCount ?? "Problems"}
      </button>
      {dirty > 0 && <span>{dirty} unapplied</span>}
      {status && (
        <span className={`message ${status.kind}`} title={status.detail ?? status.text}>
          <span data-testid="status-message">{status.text}</span>
          <button className="dismiss" aria-label="Dismiss message" onClick={() => useIde.getState().setStatus(null)}>
            ×
          </button>
        </span>
      )}
    </div>
  );
}
