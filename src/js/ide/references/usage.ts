// Where references point: find the references to a property in the comp's expressions, and resolve the reference
// under the cursor (go to definition).
import { parse } from "acorn";
import type { RefPath, RefSegment } from "../../bridge";
import { resolveReferenceNode } from "./resolve";

interface Node {
  type: string;
  start: number;
  end: number;
  loc: { start: { line: number; column: number } };
  [k: string]: unknown;
}
const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && typeof (v as Node).type === "string";

export interface Chain {
  path: RefPath;
  start: number;
  end: number;
  /** 1-based. */
  line: number;
}

/** Every plain reference in the code, longest form only (`a.b.c`, not also `a.b`). */
export function referenceChains(code: string): Chain[] {
  let ast: Node;
  try {
    ast = parse(code, { ecmaVersion: "latest", allowReturnOutsideFunction: true, locations: true }) as unknown as Node;
  } catch {
    return [];
  }
  const found: Chain[] = [];
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!isNode(n)) return;
    if (n.type === "MemberExpression" || n.type === "CallExpression") {
      const path = resolveReferenceNode(n);
      if (path) found.push({ path, start: n.start, end: n.end, line: n.loc.start.line });
    }
    for (const [k, v] of Object.entries(n)) if (k !== "loc" && typeof v === "object") visit(v);
  };
  visit(ast);
  // A chain's prefixes resolve too; keep the longest chain for each starting point.
  return found.filter((c) => !found.some((o) => o !== c && o.start === c.start && o.end > c.end));
}

/** The reference chain under an offset in the code (the innermost one that covers it). */
export function chainAt(code: string, offset: number): Chain | null {
  const hits = referenceChains(code).filter((c) => c.start <= offset && offset <= c.end);
  return hits.sort((a, b) => a.end - a.start - (b.end - b.start))[0] ?? null;
}

export interface UsageContext {
  compName: string;
  /** The layer the expression is on. */
  layerId: number;
  /** The comp's layers, for resolving `layer("Name")` and `layer(3)`. */
  layers: { id: number; index: number; name: string }[];
}

export interface UsageTarget {
  layerId: number;
  /** Segments below the layer (empty: the layer itself). */
  path: RefSegment[];
}

const stepMatches = (step: string | string[], seg: RefSegment) =>
  (Array.isArray(step) ? step : [step]).some((s) => s === seg.name || s === seg.matchName);

/** Does this reference point at the target, or at something inside it? */
export function usesTarget(path: RefPath, ctx: UsageContext, target: UsageTarget): boolean {
  if (path.comp && path.comp !== ctx.compName) return false;
  const l = path.layer as { self?: true; name?: string; index?: number };
  const layerId = l.self
    ? ctx.layerId
    : typeof l.index === "number"
      ? ctx.layers.find((x) => x.index === l.index)?.id
      : ctx.layers.find((x) => x.name === l.name)?.id;
  if (layerId !== target.layerId) return false;
  if (path.steps.length < target.path.length) return false;
  return target.path.every((seg, i) => stepMatches(path.steps[i]!, seg));
}
