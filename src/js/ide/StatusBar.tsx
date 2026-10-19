import { isDirty, useIde } from "./store";

export function StatusBar() {
  const tree = useIde((s) => s.tree);
  const status = useIde((s) => s.status);
  const dirty = useIde((s) => s.tabs.filter(isDirty).length);
  const selected = tree?.selectedLayerKeys.length ?? 0;
  return (
    <div className="statusbar" role="status">
      {!window.cep && <span className="mock" title="Running in a browser against the fixture comp">MOCK AE</span>}
      <span>{tree ? `${tree.comp.name} · ${selected} selected` : "No comp"}</span>
      {dirty > 0 && <span>{dirty} unapplied</span>}
      {status && <span className={`message ${status.kind}`} data-testid="status-message">{status.text}</span>}
    </div>
  );
}
