import { parse } from "acorn";
import type { CompSchema } from "../../bridge";

export type Rename =
  | { kind: "layer"; layerId: number; from: string; to: string }
  | { kind: "effect"; layerId: number; layerName: string; from: string; to: string };

/** Layers (by id) and effects (by layer id, position and matchName) whose names changed between two schemas. */
export function detectRenames(prev: CompSchema, next: CompSchema): Rename[] {
  if (prev.compId !== next.compId) return [];
  const out: Rename[] = [];
  for (const layer of next.layers) {
    const old = prev.layers.find((l) => l.id === layer.id);
    if (!old) continue;
    if (old.name !== layer.name) out.push({ kind: "layer", layerId: layer.id, from: old.name, to: layer.name });
    layer.effects.forEach((fx, i) => {
      const was = old.effects[i];
      if (was && was.matchName === fx.matchName && was.name !== fx.name) {
        out.push({ kind: "effect", layerId: layer.id, layerName: layer.name, from: was.name, to: fx.name });
      }
    });
  }
  return out;
}

interface Node {
  type: string;
  start: number;
  end: number;
  [k: string]: unknown;
}
const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && typeof (v as Node).type === "string";
const isIdent = (n: unknown, name: string) => isNode(n) && n.type === "Identifier" && n.name === name;
const stringArg = (call: Node): Node | null => {
  const a = (call.arguments as Node[])[0];
  return a && a.type === "Literal" && typeof a.value === "string" ? a : null;
};
const memberObject = (callee: unknown, name: string): Node | null =>
  isNode(callee) && callee.type === "MemberExpression" && !callee.computed && isIdent(callee.property, name) ? (callee.object as Node) : null;

export interface RenameContext {
  compName: string;
  /** The layer the expression lives on (for thisLayer and bare effect()). */
  layerId: number | null;
}

/**
 * Rewrites references to renamed layers and effects: `thisComp.layer("Old")` (and `comp("<this comp>").layer("Old")`),
 * and `.effect("Old")` on that layer (by its old or new name, `thisLayer`, or bare `effect()` on the layer itself).
 * Only string literals in those positions change; quotes are kept. Returns the new code and how many were changed.
 */
export function renameInCode(code: string, renames: Rename[], ctx: RenameContext): { code: string; count: number } {
  if (renames.length === 0) return { code, count: 0 };
  let ast: Node;
  try {
    ast = parse(code, { ecmaVersion: "latest", allowReturnOutsideFunction: true }) as unknown as Node;
  } catch {
    return { code, count: 0 }; // can't parse: leave it alone
  }
  const edits: { start: number; end: number; text: string }[] = [];
  const replace = (lit: Node, to: string) => {
    const raw = code.slice(lit.start, lit.end);
    const quote = raw[0] === "'" ? "'" : '"';
    const body = JSON.stringify(to).slice(1, -1);
    edits.push({ start: lit.start, end: lit.end, text: quote === '"' ? `"${body}"` : `'${body.replace(/\\"/g, '"').replace(/'/g, "\\'")}'` });
  };
  const layerRenames = renames.filter((r) => r.kind === "layer");
  const effectRenames = renames.filter((r): r is Extract<Rename, { kind: "effect" }> => r.kind === "effect");
  const isThisComp = (n: unknown) =>
    isIdent(n, "thisComp") ||
    (isNode(n) && n.type === "CallExpression" && isIdent(n.callee, "comp") && stringArg(n)?.value === ctx.compName);

  /** The layer id a node refers to, if we can tell. */
  const layerIdOf = (n: unknown): number | null => {
    if (isIdent(n, "thisLayer")) return ctx.layerId;
    if (!isNode(n) || n.type !== "CallExpression") return null;
    const obj = memberObject(n.callee, "layer");
    const lit = stringArg(n);
    if (!obj || !isThisComp(obj) || !lit) return null;
    const hit = layerRenames.find((r) => r.from === lit.value || r.to === lit.value) ?? null;
    if (hit) return hit.layerId;
    const fx = effectRenames.find((r) => r.layerName === lit.value);
    return fx ? fx.layerId : null;
  };

  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!isNode(n)) return;
    if (n.type === "CallExpression") {
      const lit = stringArg(n);
      if (lit) {
        const layerObj = memberObject(n.callee, "layer");
        const effectObj = memberObject(n.callee, "effect");
        if (layerObj && isThisComp(layerObj)) {
          const r = layerRenames.find((x) => x.from === lit.value);
          if (r) replace(lit, r.to);
        } else if (effectObj || isIdent(n.callee, "effect")) {
          const layerId = effectObj ? layerIdOf(effectObj) : ctx.layerId;
          const r = effectRenames.find((x) => x.layerId === layerId && x.from === lit.value);
          if (r) replace(lit, r.to);
        }
      }
    }
    for (const v of Object.values(n)) if (typeof v === "object") visit(v);
  };
  visit(ast);
  if (edits.length === 0) return { code, count: 0 };
  let out = code;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { code: out, count: edits.length };
}

export function describeRenames(renames: Rename[]): string {
  return renames
    .map((r) => (r.kind === "layer" ? `Layer “${r.from}” → “${r.to}”` : `Effect “${r.from}” → “${r.to}” on ${r.layerName}`))
    .join(", ");
}
