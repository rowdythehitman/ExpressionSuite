import { parse } from "acorn";
import type { CompSchema, SchemaLayer } from "../../bridge";

export interface NameIssue {
  /** 1-based. */
  line: number;
  /** 1-based, start of the string literal. */
  column: number;
  endColumn: number;
  message: string;
  /** Offsets of the string literal (quotes included), for quick fixes. */
  start: number;
  end: number;
  /** The names that do exist there, for "Did you mean …?". */
  candidates: string[];
}

// Minimal ESTree shapes for the parts walked here.
interface Node {
  type: string;
  [k: string]: unknown;
}
interface Literal extends Node {
  value: unknown;
  start: number;
  end: number;
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
}

const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && typeof (v as Node).type === "string";
const stringArg = (call: Node): Literal | null => {
  const a = (call.arguments as Node[])[0];
  return a && a.type === "Literal" && typeof (a as Literal).value === "string" ? (a as Literal) : null;
};
const member = (callee: unknown, name: string): Node | null =>
  isNode(callee) && callee.type === "MemberExpression" && isNode(callee.property) && callee.property.name === name && !callee.computed
    ? (callee.object as Node)
    : null;
const isIdent = (n: unknown, name: string) => isNode(n) && n.type === "Identifier" && n.name === name;

/**
 * Names in references that don't exist in the comp: `thisComp.layer("Nope")`, `.effect("Nope")` on a known layer, and
 * `("Nope")` on a known effect. Only literal names are checked, and only in the active comp, so anything dynamic
 * passes. These are warnings (AE would error), and they hold back auto-apply.
 */
export function checkNames(code: string, schema: CompSchema | null, layerId: number | null): NameIssue[] {
  if (!schema) return [];
  let ast: Node;
  try {
    ast = parse(code, { ecmaVersion: "latest", allowReturnOutsideFunction: true, locations: true }) as unknown as Node;
  } catch {
    return []; // syntax errors are reported separately
  }
  const issues: NameIssue[] = [];
  const flag = (lit: Literal, message: string, candidates: string[]) =>
    issues.push({
      line: lit.loc.start.line,
      column: lit.loc.start.column + 1,
      endColumn: lit.loc.end.column + 1,
      message,
      start: lit.start,
      end: lit.end,
      candidates,
    });
  const own = schema.layers.find((l) => l.id === layerId) ?? null;

  /** The schema layer a node evaluates to, if it's a literal reference we can follow. */
  const layerOf = (n: unknown): SchemaLayer | null => {
    if (isIdent(n, "thisLayer")) return own;
    if (!isNode(n) || n.type !== "CallExpression") return null;
    const obj = member(n.callee, "layer");
    if (!obj || !isIdent(obj, "thisComp")) return null;
    const lit = stringArg(n);
    return lit ? (schema.layers.find((l) => l.name === lit.value) ?? null) : null;
  };
  /** The effect (and its layer) a node evaluates to: `<layer>.effect("X")` or bare `effect("X")`. */
  const effectOf = (n: unknown) => {
    if (!isNode(n) || n.type !== "CallExpression") return null;
    const lit = stringArg(n);
    if (!lit) return null;
    const obj = member(n.callee, "effect");
    const layer = obj ? layerOf(obj) : isIdent(n.callee, "effect") ? own : null;
    const fx = layer?.effects.find((e) => e.name === lit.value);
    return fx ?? null;
  };

  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!isNode(n)) return;
    if (n.type === "CallExpression") {
      const lit = stringArg(n);
      if (lit) {
        const layerObj = member(n.callee, "layer");
        const effectObj = member(n.callee, "effect");
        if (layerObj && isIdent(layerObj, "thisComp") && !schema.layers.some((l) => l.name === lit.value)) {
          flag(lit, `No layer named ${JSON.stringify(lit.value)} in ${schema.compName}.`, schema.layers.map((l) => l.name));
        } else if (effectObj || isIdent(n.callee, "effect")) {
          const layer = effectObj ? layerOf(effectObj) : own;
          if (layer && !layer.effects.some((e) => e.name === lit.value)) {
            flag(lit, `${layer.name} has no effect named ${JSON.stringify(lit.value)}.`, layer.effects.map((e) => e.name));
          }
        } else {
          const fx = effectOf(n.callee);
          if (fx && !fx.params.some((p) => p.name === lit.value)) {
            flag(lit, `${fx.name} has no parameter named ${JSON.stringify(lit.value)}.`, fx.params.map((p) => p.name));
          }
        }
      }
    }
    for (const [k, v] of Object.entries(n)) if (k !== "loc" && typeof v === "object") visit(v);
  };
  visit(ast);
  return issues;
}
