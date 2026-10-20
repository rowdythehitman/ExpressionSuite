// Friendlier errors with quick fixes: plain-language hints for common AE and syntax errors, and edits that fix them.
import { parse } from "acorn";
import { parseAeError } from "../aeError";
import type { NameIssue } from "./names";

export interface QuickFix {
  title: string;
  /** Offsets into the code. */
  edits: { start: number; end: number; text: string }[];
}

export interface Explanation {
  /** One sentence on what's wrong, in plain words. */
  hint: string;
  fixes: QuickFix[];
}

/** Edit distance, for "Did you mean …?". */
export function distance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) row.push(Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1)));
    prev = row;
  }
  return prev[y.length]!;
}

/** The closest candidates to `name` (up to three), close enough to be a typo or a stale name. */
export function closest(name: string, candidates: string[]): string[] {
  const limit = Math.max(2, Math.ceil(name.length / 2));
  return [...new Set(candidates)]
    .map((c) => ({ c, d: c.toLowerCase().includes(name.toLowerCase()) && name ? 1 : distance(name, c) }))
    .filter(({ c, d }) => c !== name && d <= limit)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ c }) => c);
}

/** Replaces a string literal's content, keeping its quotes. */
function retype(code: string, start: number, end: number, name: string): QuickFix["edits"][number] {
  const quote = code[start] === "'" ? "'" : '"';
  const body = JSON.stringify(name).slice(1, -1);
  return { start, end, text: quote === '"' ? `"${body}"` : `'${body.replace(/\\"/g, '"').replace(/'/g, "\\'")}'` };
}

/** Quick fixes for a name the comp doesn't have (from checkNames). */
export function fixName(code: string, issue: NameIssue): QuickFix[] {
  const wrong = code.slice(issue.start + 1, issue.end - 1);
  return closest(wrong, issue.candidates).map((c) => ({ title: `Did you mean “${c}”?`, edits: [retype(code, issue.start, issue.end, c)] }));
}

interface Node {
  type: string;
  start: number;
  end: number;
  [k: string]: unknown;
}

function parseOrNull(code: string): Node | null {
  try {
    return parse(code, { ecmaVersion: "latest", allowReturnOutsideFunction: true }) as unknown as Node;
  } catch {
    return null;
  }
}

/** The string literals in the code whose value is `value`. */
function literalsOf(code: string, value: string): Node[] {
  const ast = parseOrNull(code);
  const out: Node[] = [];
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const node = n as Node;
    if (node.type === "Literal" && node.value === value) out.push(node);
    for (const v of Object.values(node)) if (typeof v === "object") visit(v);
  };
  if (ast) visit(ast);
  return out;
}

/** The expression whose value AE uses (the last expression statement), for dimension fixes. */
function lastExpression(code: string): Node | null {
  const ast = parseOrNull(code);
  const body = (ast?.body as Node[] | undefined) ?? [];
  const last = body[body.length - 1];
  return last?.type === "ExpressionStatement" ? (last.expression as Node) : null;
}

export interface ExplainContext {
  /** Names that exist, for "Did you mean": layers, effects and declared variables. */
  layerNames: string[];
  effectNames: string[];
  identifiers: string[];
}

/** A plain-language hint for an AE error (or acorn syntax message), with fixes where they're clear. */
export function explainError(text: string, code: string, ctx: ExplainContext): Explanation | null {
  const { message } = parseAeError(text);
  let m: RegExpExecArray | null;

  if ((m = /dimension (\d+),? not (\d+)/i.exec(message))) {
    const want = Number(m[1]);
    const got = Number(m[2]);
    const expr = lastExpression(code);
    const fixes: QuickFix[] = [];
    if (expr) {
      const src = code.slice(expr.start, expr.end);
      if (got === 1 && want > 1) {
        fixes.push({ title: `Use it for every dimension: [${Array(want).fill("v").join(", ")}]`, edits: [{ start: expr.start, end: expr.end, text: `(v => [${Array(want).fill("v").join(", ")}])(${src})` }] });
        if (want === 2 || want === 3) fixes.push({ title: "Keep the other dimensions as they are: [v, value[1]…]", edits: [{ start: expr.start, end: expr.end, text: `[${src}, ${Array.from({ length: want - 1 }, (_, i) => `value[${i + 1}]`).join(", ")}]` }] });
      } else if (want === 1 && got > 1) {
        fixes.push({ title: "Use the first dimension: …[0]", edits: [{ start: expr.start, end: expr.end, text: `(${src})[0]` }] });
      }
    }
    return { hint: `The result has ${got} value${got === 1 ? "" : "s"} but this property needs ${want}.`, fixes };
  }

  if ((m = /layer (?:named |with name )?['"](.+?)['"]/i.exec(message)) || (m = /couldn'?t find layer ['"](.+?)['"]/i.exec(message))) {
    const name = m[1]!;
    const fixes = literalsOf(code, name).flatMap((lit) =>
      closest(name, ctx.layerNames).map((c) => ({ title: `Did you mean layer “${c}”?`, edits: [retype(code, lit.start, lit.end, c)] })),
    );
    return { hint: `There's no layer called “${name}” in this comp (renamed or deleted?).`, fixes };
  }

  if ((m = /(?:effect|property)(?: or effect)? (?:named |with name )?['"](.+?)['"]/i.exec(message))) {
    const name = m[1]!;
    const fixes = literalsOf(code, name).flatMap((lit) =>
      closest(name, ctx.effectNames).map((c) => ({ title: `Did you mean “${c}”?`, edits: [retype(code, lit.start, lit.end, c)] })),
    );
    return { hint: `Nothing called “${name}” there: check the effect or parameter name.`, fixes };
  }

  if ((m = /ReferenceError: (\S+) is not defined/i.exec(message))) {
    const name = m[1]!;
    const suggestions = closest(name, ctx.identifiers);
    return {
      hint: `“${name}” isn't defined: a typo, or used before its const?${suggestions.length ? ` Close: ${suggestions.join(", ")}.` : ""}`,
      fixes: [],
    };
  }

  if (/TypeError: .* is not a function/i.test(message)) {
    return { hint: "Something is called like a function but isn't one: check the brackets and the property name.", fixes: [] };
  }
  if (/Unexpected end of input/i.test(message)) {
    return { hint: "The code stops too early: a bracket, quote or brace isn't closed.", fixes: [] };
  }
  if (/Unterminated string/i.test(message)) {
    return { hint: "A string's closing quote is missing.", fixes: [] };
  }
  if (/Unexpected token/i.test(message)) {
    return { hint: "Something's in the wrong place: often a missing comma or operator, or an extra bracket.", fixes: [] };
  }
  return null;
}

/** The variables a piece of code declares, for "Did you mean" on undefined names. */
export function declaredNames(code: string): string[] {
  return [...code.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!);
}
