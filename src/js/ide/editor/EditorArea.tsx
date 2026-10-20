import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { layerKey, parentKey, parseKey } from "../../../shared/keys";
import { parseAeError } from "../aeError";
import { findNode, isDirty, useIde, type Tab } from "../store";
import { monaco } from "./monaco";
import { checkSyntax } from "./syntax";

/** One Monaco model per property; the URI must be a valid path, so the key is encoded. */
export const modelPath = (key: string) => `file:///ide/${encodeURIComponent(key)}.js`;


export function EditorArea() {
  const tabs = useIde((s) => s.tabs);
  const activeTab = useIde((s) => s.activeTab);
  const tab = tabs.find((t) => t.key === activeTab);

  // Drop Monaco's model (text, undo history, markers) for any tab that is gone: closed, reset, or a new project.
  useEffect(() => {
    const open = new Set(tabs.map((t) => monaco.Uri.parse(modelPath(t.key)).toString()));
    for (const model of monaco.editor.getModels()) {
      if (model.uri.path.startsWith("/ide/") && !open.has(model.uri.toString())) model.dispose();
    }
  }, [tabs]);

  return (
    <div className="editor-area">
      <TabBar tabs={tabs} activeTab={activeTab} />
      {tab ? (
        <>
          <Breadcrumb tabKey={tab.key} />
          <CodeEditor tab={tab} />
        </>
      ) : (
        <div className="empty editor-empty">
          <p>Select a property in the explorer to edit its expression.</p>
          <p className="hint">Click to preview, double-click to keep the tab open. Ctrl+S applies.</p>
        </div>
      )}
    </div>
  );
}

function TabBar({ tabs, activeTab }: { tabs: Tab[]; activeTab: string | null }) {
  const { setActiveTab, pinTab, closeTab } = useIde.getState();
  const close = (t: Tab) => {
    if (isDirty(t) && !window.confirm(`Discard unapplied changes to ${t.layerName} › ${t.propName}?`)) return;
    closeTab(t.key);
  };
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tab"
          aria-selected={t.key === activeTab}
          className={["tab", t.key === activeTab && "active", t.preview && "preview", t.error && "has-error"].filter(Boolean).join(" ")}
          onClick={() => setActiveTab(t.key)}
          onDoubleClick={() => pinTab(t.key)}
          onAuxClick={(e) => e.button === 1 && close(t)}
          title={t.error ?? `${t.layerName} › ${t.propName}`}
          data-key={t.key}
        >
          <span className="tab-title">
            {t.layerName} › {t.propName}
          </span>
          <button
            className={`tab-close ${isDirty(t) ? "dirty" : ""}`}
            aria-label={isDirty(t) ? "Unapplied changes; close" : "Close"}
            onClick={(e) => {
              e.stopPropagation();
              close(t);
            }}
          >
            {isDirty(t) ? "●" : "×"}
          </button>
        </div>
      ))}
      <AutoApplyToggle />
    </div>
  );
}

function AutoApplyToggle() {
  const autoApply = useIde((s) => s.autoApply);
  return (
    <label className="auto-apply" title="Apply automatically 1 s after you stop typing, when the code has no syntax errors">
      <input type="checkbox" checked={autoApply} onChange={(e) => useIde.getState().setAutoApply(e.target.checked)} />
      Auto-apply
    </label>
  );
}

function Breadcrumb({ tabKey }: { tabKey: string }) {
  const state = useIde();
  const parts: { key: string; name: string }[] = [];
  for (let k: string | null = tabKey; k; k = parentKey(k)) {
    const n = findNode(state, k);
    parts.unshift({ key: k, name: n?.name ?? "…" });
  }
  // Fill in the layer name even when the layer row was collapsed.
  const p = parseKey(tabKey);
  if (p && parts[0]) parts[0].name = findNode(state, layerKey(p.compId, p.layerId))?.name ?? parts[0].name;
  return (
    <div className="breadcrumb">
      <span>{state.tree?.comp.name ?? "Comp"}</span>
      {parts.map((part) => (
        <span key={part.key}>
          <span className="sep">›</span>
          <button className="crumb" onClick={() => state.select(part.key)}>
            {part.name}
          </button>
        </span>
      ))}
    </div>
  );
}

function CodeEditor({ tab }: { tab: Tab }) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const { updateCode } = useIde.getState();

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    // Commands read the active tab when they run, so one editor serves every model.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const key = useIde.getState().activeTab;
      if (key) useIde.getState().apply(key);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyS, () => {
      useIde.getState().applyAll();
    });
    editor.focus();
  };

  // A tab whose code changed outside the editor (apply of an older value, reload) pushes it into the model.
  useEffect(() => {
    const model = monaco.editor.getModel(monaco.Uri.parse(modelPath(tab.key)));
    if (model && model.getValue() !== tab.code) model.setValue(tab.code);
  }, [tab.key, tab.code]);

  // Instant syntax squiggle (acorn), 200 ms after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => {
      const model = monaco.editor.getModel(monaco.Uri.parse(modelPath(tab.key)));
      if (!model) return;
      const issue = checkSyntax(tab.code);
      const line = issue ? Math.min(issue.line, model.getLineCount()) : 1;
      monaco.editor.setModelMarkers(
        model,
        "syntax",
        issue
          ? [
              {
                severity: monaco.MarkerSeverity.Error,
                message: `SyntaxError: ${issue.message}`,
                startLineNumber: line,
                endLineNumber: line,
                startColumn: issue.column,
                endColumn: Math.max(issue.column + 1, model.getLineMaxColumn(line)),
              },
            ]
          : [],
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [tab.key, tab.code]);

  // AE's error from the last apply, on its line.
  useEffect(() => {
    const model = monaco.editor.getModel(monaco.Uri.parse(modelPath(tab.key)));
    if (!model) return;
    const shown = tab.error && tab.code === tab.original ? tab.error : null;
    const parsed = shown ? parseAeError(shown) : null;
    const line = Math.min(parsed?.line ?? 1, model.getLineCount());
    monaco.editor.setModelMarkers(
      model,
      "after-effects",
      shown
        ? [
            {
              severity: monaco.MarkerSeverity.Error,
              message: parsed!.disabled ? `${parsed!.message}\n(After Effects disabled the expression.)` : parsed!.message,
              startLineNumber: line,
              endLineNumber: line,
              startColumn: 1,
              endColumn: model.getLineMaxColumn(line),
            },
          ]
        : [],
    );
  }, [tab.key, tab.error, tab.code, tab.original]);

  return (
    <div className="code" data-testid="code-editor">
      <Editor
        path={modelPath(tab.key)}
        defaultLanguage="javascript"
        defaultValue={tab.code}
        theme="ae-dark"
        onMount={onMount}
        onChange={(value) => updateCode(tab.key, value ?? "")}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          tabSize: 2,
          scrollBeyondLastLine: false,
          renderLineHighlight: "line",
          fixedOverflowWidgets: true,
        }}
      />
    </div>
  );
}
