import { useEffect } from "react";
import { BridgeError, getBridge } from "../bridge";
import { isDirty, useIde } from "./store";

const FAST_MS = 300;
const IDLE_MS = 1000;
const IDLE_AFTER_MS = 30_000;
/** Levels loaded below each selected layer: its groups and their direct children. */
export const TREE_DEPTH = 2;

/**
 * CEP gets no selection events from AE, so poll a cheap hash and fetch the tree only when it changes.
 * Polls pause while the panel is hidden and slow to 1 s after 30 s without changes.
 */
export function useSelectionSync(): void {
  useEffect(() => {
    const bridge = getBridge();
    let lastHash: string | null = null;
    let lastProject: number | null = null;
    let lastTime: number | null = null;
    let ticks = 0;
    let lastNonce = useIde.getState().refreshNonce;
    let lastChange = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const schedule = (ms: number) => {
      if (!stopped) timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (document.hidden) return schedule(IDLE_MS);
      try {
        const { project, hash, time, projectPath } = await bridge.getSelectionHash();
        const ide = useIde.getState();
        if (lastProject !== null && project !== lastProject) {
          // A new or different project: every open tab and cached node belonged to the old one.
          const dirty = ide.tabs.filter(isDirty).length;
          ide.reset({
            kind: "info",
            text: dirty ? `New project: closed the editor (${dirty} tab${dirty > 1 ? "s" : ""} had unapplied changes).` : "New project: editor reset.",
          });
        }
        lastProject = project;
        const nonce = useIde.getState().refreshNonce;
        const treeChanged = hash !== lastHash || nonce !== lastNonce;
        if (treeChanged) {
          lastNonce = nonce;
          lastHash = hash;
          lastChange = Date.now();
          await useIde.getState().setTree(await bridge.getCompTree(TREE_DEPTH));
          await useIde.getState().setSchema(await bridge.getCompSchema());
          void useIde.getState().refreshProblems();
        }
        // Linked tabs from last session come back once the tree (and so layer names) is there.
        if (projectPath !== useIde.getState().projectPath) void useIde.getState().setProjectPath(projectPath);
        // Open tabs follow changes made in AE (timeline edits, AE's own rename updates): on tree changes and every
        // third tick (about once a second).
        if (treeChanged || ++ticks % 3 === 0) void useIde.getState().syncTabs();
        // The playhead moved (or the tree changed): re-read the value strip. Scrubbing counts as activity.
        if (time !== lastTime || treeChanged) {
          if (time !== lastTime) lastChange = Date.now();
          lastTime = time;
          void useIde.getState().refreshValue();
        }
      } catch (e) {
        lastHash = null; // retry the full fetch next time
        const text = e instanceof BridgeError && e.code === "TRANSPORT" ? `After Effects isn't answering: ${e.message}` : String((e as Error).message ?? e);
        useIde.getState().setStatus({ kind: "error", text });
      }
      schedule(Date.now() - lastChange > IDLE_AFTER_MS ? IDLE_MS : FAST_MS);
    }

    const onVisible = () => {
      if (!document.hidden) {
        lastChange = Date.now();
        clearTimeout(timer);
        tick();
      }
    };
    // Any interaction with the panel goes back to fast polling.
    const onActivity = () => {
      lastChange = Date.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onActivity);
    window.addEventListener("pointerdown", onActivity);
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onActivity);
      window.removeEventListener("pointerdown", onActivity);
    };
  }, []);
}
