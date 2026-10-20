import type { HostApi } from "../../shared/host-api";
import { csi } from "../lib/utils/bolt";
import { hostCall, parseReply } from "./transport";
import type { Bridge } from "./types";

type Fn = keyof HostApi;
type Args<K extends Fn> = Parameters<HostApi[K]>;
type Ret<K extends Fn> = ReturnType<HostApi[K]>;

/** Real bridge: one host call at a time, so polls never interleave with an apply. */
export function createCepBridge(): Bridge {
  let queue: Promise<unknown> = Promise.resolve();

  function call<K extends Fn>(fn: K, ...args: Args<K>): Promise<Ret<K>> {
    const run = () =>
      new Promise<Ret<K>>((resolve, reject) => {
        csi.evalScript(hostCall(fn, args), (raw: string) => {
          try {
            resolve(parseReply(raw) as Ret<K>);
          } catch (e) {
            reject(e);
          }
        });
      });
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    getSelectionHash: () => call("getSelectionHash"),
    getCompTree: (depth) => call("getCompTree", depth),
    getChildren: (key) => call("getChildren", key),
    getProperty: (key) => call("getProperty", key),
    setExpression: (key, code) => call("setExpression", key, code),
    setExpressionEnabled: (key, on) => call("setExpressionEnabled", key, on),
    setExpressions: (items, undoName) => call("setExpressions", items, undoName),
    getProperties: (keys) => call("getProperties", keys),
    revealInTimeline: (key) => call("revealInTimeline", key),
    getSelectedRef: () => call("getSelectedRef"),
    getCompSchema: () => call("getCompSchema"),
    findAllExpressions: () => call("findAllExpressions"),
    readReferences: (compId, layerId, paths) => call("readReferences", compId, layerId, paths),
    resolveReferenceKey: (compId, layerId, path) => call("resolveReferenceKey", compId, layerId, path),
    sampleValues: (key, count) => call("sampleValues", key, count),
    addControl: (layerId, matchName, name, value) => call("addControl", layerId, matchName, name, value),
    addControls: (layerId, items, undoName) => call("addControls", layerId, items, undoName),
    // ExtendScript can't take `undefined` through JSON; omit the argument instead.
    getValueAtTime: (key, time) => (time === undefined ? call("getValueAtTime", key) : call("getValueAtTime", key, time)),
  };
}
