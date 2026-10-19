// Stable node keys: `compId:layerId:seg/seg/…`, one segment per property group below the layer.
// A segment is the property's matchName, plus `[n]` when it is the n-th sibling (n > 1) with that matchName,
// so two Drop Shadows or two shape groups get distinct keys. Renames keep the key; reordering same-type siblings
// changes it.
// Used by the ExtendScript host too: ES3-safe code only (no Array methods beyond push/join/split, no JSON).

export const SEP = "/";

export function segment(matchName: string, occurrence: number): string {
  return occurrence > 1 ? matchName + "[" + occurrence + "]" : matchName;
}

export function parseSegment(seg: string): { matchName: string; occurrence: number } {
  const m = /^(.*)\[(\d+)\]$/.exec(seg);
  if (m) return { matchName: m[1] as string, occurrence: parseInt(m[2] as string, 10) };
  return { matchName: seg, occurrence: 1 };
}

export function layerKey(compId: number, layerId: number): string {
  return compId + ":" + layerId;
}

export function propKey(compId: number, layerId: number, segments: string[]): string {
  return layerKey(compId, layerId) + ":" + segments.join(SEP);
}

export interface ParsedKey {
  compId: number;
  layerId: number;
  /** Empty for a layer key. */
  segments: string[];
}

export function parseKey(key: string): ParsedKey | null {
  const first = key.indexOf(":");
  if (first < 0) return null;
  const second = key.indexOf(":", first + 1);
  const compId = parseInt(key.substring(0, first), 10);
  const layerId = parseInt(second < 0 ? key.substring(first + 1) : key.substring(first + 1, second), 10);
  if (isNaN(compId) || isNaN(layerId)) return null;
  const rest = second < 0 ? "" : key.substring(second + 1);
  return { compId, layerId, segments: rest === "" ? [] : rest.split(SEP) };
}

/** The key of the node's parent (the layer key for a top-level group); null for a layer. */
export function parentKey(key: string): string | null {
  const p = parseKey(key);
  if (!p || p.segments.length === 0) return null;
  if (p.segments.length === 1) return layerKey(p.compId, p.layerId);
  return propKey(p.compId, p.layerId, p.segments.slice(0, p.segments.length - 1));
}
