import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { DiffEditor, type OnMount } from "@monaco-editor/react";
import { layerKey, parentKey, parseKey } from "../../../shared/keys";
import { parseAeError } from "../aeError";
import { batchTargets, findNode, isDirty, namesContext, themeOf, referenceFor, refTargetFor, useIde, type Tab } from "../store";
import { DRAG_MIME, getDraggingKey, insertDeclaration, insertReference, insertText, setDraggingKey, wantsDeclaration } from "./insert";
import { monaco, setCompSchema, setValueType } from "./monaco";
import { checkNames } from "./names";
import { checkSyntax } from "./syntax";
import { ValueStrip } from "./ValueStrip";

/** One Monaco model per property; the URI must be a valid path, so the key is encoded. */
export const modelPath = (key: string) => `file:///ide/${encodeURIComponent(key)}.js`;


export function EditorArea() {
  const tabs = useIde((s) => s.tabs);
  const activeTab = useIde((s) => s.activeTab);
  const splitKey = useIde((s) => s.splitTab);
  const tab = tabs.find((t) => t.key === activeTab);
  const split = tabs.find((t) => t.key === splitKey);

  // Drop Monaco's model (text, undo history, markers) for any tab that is gone: closed, reset, or a new project.
  useEffect(() => {
    const open = new Set(tabs.map((t) => monaco.Uri.parse(modelPath(t.key)).toString()));
    for (const model of monaco.editor.getModels()) {
      if (model.uri.path.startsWith("/ide/") && !open.has(model.uri.toString())) model.dispose();
    }
  }, [tabs]);

  return (
    <div className="editor-area">
      <div className="editor-group">
        <TabBar tabs={tabs} activeTab={activeTab} />
        {tab ? (
          <>
            <Breadcrumb tabKey={tab.key} />
            <EditorWithConflict tab={tab} />
            <ValueStrip tabKey={tab.key} valueType={tab.valueType} />
          </>
        ) : (
          <div className="empty editor-empty">
            <p>Select a property in the explorer to edit its expression.</p>
            <p className="hint">Click to preview, double-click to keep the tab open. Ctrl+S applies.</p>
            <p className="hint">Drag properties from the explorer into the code for a reference; hold Ctrl (Cmd on Mac) while dropping to declare it as a const named after the layer and property. Ctrl+Shift+P inserts the property selected in the timeline.</p>
          </div>
        )}
      </div>
      {split && (
        <div className="editor-group split" aria-label="Split editor">
          <div className="split-header">
            <span className="tab-title" title={split.error ?? undefined}>
              {split.layerName} › {split.propName}
              {isDirty(split) && " ●"}
            </span>
            <button className="tab-close" aria-label="Close split" onClick={() => useIde.getState().closeSplit()}>
              ×
            </button>
          </div>
          <EditorWithConflict tab={split} />
        </div>
      )}
    </div>
  );
}

/** The editor, or, when AE changed the expression under unapplied edits, a banner and an optional diff. */
function EditorWithConflict({ tab }: { tab: Tab }) {
  const [comparing, setComparing] = useState(false);
  const theme = useIde(themeOf);
  if (tab.external === undefined) return <CodeEditor tab={tab} />;
  const { resolveExternal } = useIde.getState();
  const pick = (keep: "ae" | "mine") => {
    setComparing(false);
    resolveExternal(tab.key, keep);
  };
  return (
    <>
      <div className="conflict" role="alert">
        <span>This expression changed in After Effects while you had unapplied edits.</span>
        <button onClick={() => setComparing(!comparing)}>{comparing ? "Back to editing" : "Compare"}</button>
        <button onClick={() => pick("ae")}>Use After Effects&apos; version</button>
        <button onClick={() => pick("mine")}>Keep mine</button>
      </div>
      {comparing ? (
        <div className="code" data-testid="conflict-diff">
          <DiffEditor
            original={tab.external}
            modified={tab.code}
            language="javascript"
            theme={theme === "light" ? "ae-light" : "ae-dark"}
            options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, automaticLayout: true }}
          />
        </div>
      ) : (
        <CodeEditor tab={tab} />
      )}
    </>
  );
}

/** "Apply to N selected layers" when other layers are selected in the timeline (spec: Batch apply). */
function BatchButton({ activeTab }: { activeTab: string | null }) {
  // A number, not the array: a zustand selector must return a stable value.
  const count = useIde((s) => (activeTab ? batchTargets(s, activeTab).length : 0));
  if (!activeTab || count < 2) return null;
  return (
    <button
      className="batch-button"
      title="Apply this tab's code to the same property on every layer selected in the timeline, as one undo step"
      onClick={() => useIde.getState().applyToSelected(activeTab)}
    >
      Apply to {count} selected layers
    </button>
  );
}

function SplitButton({ activeTab }: { activeTab: string | null }) {
  if (!activeTab) return null;
  return (
    <button
      className="split-button"
      title="Open this tab to the side (split view)"
      aria-label="Open to the side"
      onClick={() => useIde.getState().openToSide(activeTab)}
    >
      ⫽
    </button>
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
      <BatchButton activeTab={activeTab} />
      <AutoApplyToggle />
      <SplitButton activeTab={activeTab} />
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
  const tab = state.tabs.find((t) => t.key === tabKey);
  return (
    <div className="breadcrumb">
      <FileLink tab={tab} />
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

/** Link the tab to a .js file to edit it in another editor; shows the file once linked. */
function FileLink({ tab }: { tab?: Tab }) {
  if (!tab) return null;
  const { linkFile, unlinkFile } = useIde.getState();
  if (!tab.linkedFile) {
    return (
      <button className="file-link" onClick={() => linkFile(tab.key)} title="Link this tab to a .js file: edit it in VS Code, and every save applies it here">
        Link file…
      </button>
    );
  }
  const name = tab.linkedFile.split(/[\\/]/).pop();
  return (
    <span className="file-link linked" title={tab.linkedFile}>
      ⇄ {name}
      <button aria-label="Unlink file" title="Stop following the file" onClick={() => unlinkFile(tab.key)}>
        ×
      </button>
    </span>
  );
}

/** Value type and comp names in completions follow the tab whose editor has focus. */
function useTypingContext(tab: Tab): () => void {
  const schema = useIde((s) => s.schema);
  const apply = useCallback(() => {
    setValueType(tab.valueType);
    const p = parseKey(tab.key);
    const matches = !!schema && !!p && schema.compId === p.compId;
    setCompSchema(matches ? schema : null, matches ? p!.layerId : null);
  }, [schema, tab.key, tab.valueType]);
  return apply;
}

function CodeEditor({ tab }: { tab: Tab }) {
  const { updateCode } = useIde.getState();
  // The tab this editor shows now; commands and drops read it when they run, as the editor outlives tab switches.
  const keyRef = useRef(tab.key);
  const typingContext = useTypingContext(tab);
  const contextRef = useRef(typingContext);
  useEffect(() => {
    keyRef.current = tab.key;
    contextRef.current = typingContext;
  }, [tab.key, typingContext]);

  const onMount: OnMount = (editor) => {
    editor.onDidFocusEditorText(() => contextRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      useIde.getState().apply(keyRef.current);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyS, () => {
      useIde.getState().applyAll();
    });
    // Pick from timeline: insert a reference to the property selected in AE (replaces Monaco's command palette key).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, async () => {
      const ref = await useIde.getState().pickFromTimeline(keyRef.current);
      if (!ref) return;
      insertReference(editor, ref);
      if (ref.warning) useIde.getState().setStatus({ kind: "info", text: ref.warning });
    });

    // Every drop goes through here; Monaco's own drop-into-editor is off (it inserts text as a snippet, which showed
    // a literal `$0` in CEP). Explorer rows insert a reference at the drop point, or with Alt a `const` on line 1;
    // other text is inserted as is.
    const dom = editor.getDomNode();
    const pointAt = (e: DragEvent) => editor.getTargetAtClientPoint(e.clientX, e.clientY)?.position ?? undefined;
    dom?.addEventListener(
      "dragover",
      (e) => {
        if (!getDraggingKey() && !e.dataTransfer?.types.includes("text/plain")) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        const at = pointAt(e);
        if (at) editor.setPosition(at); // the caret shows where the drop lands
      },
      true,
    );
    dom?.addEventListener(
      "drop",
      (e) => {
        const key = getDraggingKey() ?? (e.dataTransfer?.getData(DRAG_MIME) || null);
        const text = e.dataTransfer?.getData("text/plain") ?? "";
        const state = useIde.getState();
        if (!key && !text) {
          // Tells us (and the user) when CEP delivers a drop without the dragged row.
          state.setStatus({ kind: "info", text: "Nothing to insert from that drop. Try dragging the row again." });
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setDraggingKey(null);
        const at = pointAt(e);
        const ref = key ? referenceFor(state, key, keyRef.current) : null;
        const target = key ? refTargetFor(state, key) : null;
        try {
          if (!ref || !target) {
            if (text) insertText(editor, text, at);
          } else if (wantsDeclaration(e)) {
            const { name, added } = insertDeclaration(editor, ref, target, at);
            state.setStatus({ kind: "info", text: ref.warning ?? (added ? `Added const ${name}.` : `Using the existing const ${name}.`) });
          } else {
            insertReference(editor, ref, at);
            if (ref.warning) state.setStatus({ kind: "info", text: ref.warning });
          }
        } catch (err) {
          // Never lose a drop: fall back to the plain text and say what went wrong.
          insertText(editor, ref?.code ?? text, at);
          state.setStatus({ kind: "error", text: `Drop: ${(err as Error).message ?? err} (inserted the plain reference instead)` });
        }
      },
      true,
    );
    editor.focus();
  };

  // A tab whose code changed outside the editor (apply of an older value, reload) pushes it into the model.
  useEffect(() => {
    const model = monaco.editor.getModel(monaco.Uri.parse(modelPath(tab.key)));
    if (model && model.getValue() !== tab.code) model.setValue(tab.code);
  }, [tab.key, tab.code]);

  // The main editor sets the completion context whenever its tab or the comp changes; the split one on focus.
  const isMain = useIde((s) => s.activeTab === tab.key);
  useEffect(() => {
    if (isMain) typingContext();
  }, [isMain, typingContext]);

  // Instant syntax squiggle (acorn), 200 ms after typing stops, and warnings for names the comp doesn't have.
  const schema = useIde((s) => s.schema);
  useEffect(() => {
    const timer = setTimeout(() => {
      const model = monaco.editor.getModel(monaco.Uri.parse(modelPath(tab.key)));
      if (!model) return;
      monaco.editor.setModelMarkers(
        model,
        "names",
        checkNames(tab.code, ...namesContext(schema, tab.key)).map((n) => ({
          severity: monaco.MarkerSeverity.Warning,
          message: `${n.message} Auto-apply waits until this is fixed; Ctrl+S applies anyway.`,
          startLineNumber: n.line,
          endLineNumber: n.line,
          startColumn: n.column,
          endColumn: n.endColumn,
        })),
      );
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
  }, [tab.key, tab.code, schema]);

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

  const settings = useIde((s) => s.settings);
  const theme = useIde(themeOf) === "light" ? "ae-light" : "ae-dark";
  // Tab width lives on each model, so it's pushed to all of them.
  useEffect(() => {
    for (const m of monaco.editor.getModels()) if (m.uri.path.startsWith("/ide/")) m.updateOptions({ tabSize: settings.tabSize, indentSize: settings.tabSize });
  }, [settings.tabSize, tab.key]);

  return (
    <div className="code" data-testid="code-editor">
      <Editor
        path={modelPath(tab.key)}
        defaultLanguage="javascript"
        defaultValue={tab.code}
        theme={theme}
        onMount={onMount}
        keepCurrentModel
        onChange={(value) => updateCode(tab.key, value ?? "")}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: settings.fontSize,
          tabSize: settings.tabSize,
          detectIndentation: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: "line",
          fixedOverflowWidgets: true,
          dropIntoEditor: { enabled: false },
        }}
      />
    </div>
  );
}
