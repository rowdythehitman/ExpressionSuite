// The reverse of reference.ts: from a reference in the code (`thisComp.layer("CTRLS").effect("Speed")("Slider")`) to
// a path the host can follow with property(), for showing values inline. Only literal, plain references resolve;
// anything else (variables, maths, method calls such as valueAtTime) returns null.
import { parse } from "acorn";
import { CAMERA, LIGHT, MASK, SHAPE_PROPS, SHAPE_TRANSFORM, TEXT_ANIMATOR_PROPS, TEXT_SELECTOR, TRANSFORM } from "./reference";

import type { RefPath } from "../../../shared/types";

export type { RefPath };

interface Node {
  type: string;
  start: number;
  end: number;
  [k: string]: unknown;
}
const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && typeof (v as Node).type === "string";

type Op = { kind: "member"; name: string } | { kind: "method"; name: string; arg: string | number } | { kind: "call"; arg: string | number };

/** Inverts a short-name map: attribute → matchName(s). */
function invert(map: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [mn, attr] of Object.entries(map)) (out[attr] ??= []).push(mn);
  return out;
}
const INV = {
  transform: invert(TRANSFORM),
  mask: invert(MASK),
  shape: invert(SHAPE_PROPS),
  shapeTransform: invert(SHAPE_TRANSFORM),
  textAnimator: invert(TEXT_ANIMATOR_PROPS),
  textSelector: invert(TEXT_SELECTOR),
  camera: invert(CAMERA),
  light: invert(LIGHT),
};
INV.transform.pointOfInterest = ["ADBE Anchor Point"];
INV.transform.zRotation = ["ADBE Rotate Z"];

const literal = (n: unknown): string | number | null =>
  isNode(n) && n.type === "Literal" && (typeof n.value === "string" || typeof n.value === "number") ? (n.value as string | number) : null;

/** Flattens a member/call chain into its root identifier and the operations after it. */
function linearize(n: unknown): { root: string; rootArg?: string | number; ops: Op[] } | null {
  if (!isNode(n)) return null;
  if (n.type === "Identifier") return { root: n.name as string, ops: [] };
  if (n.type === "MemberExpression" && !n.computed && isNode(n.property) && n.property.type === "Identifier") {
    const inner = linearize(n.object);
    return inner && { ...inner, ops: [...inner.ops, { kind: "member", name: n.property.name as string }] };
  }
  if (n.type === "CallExpression") {
    const args = n.arguments as unknown[];
    if (args.length !== 1) return null;
    const arg = literal(args[0]);
    if (arg === null) return null;
    const callee = n.callee as Node;
    if (callee.type === "Identifier") return { root: callee.name as string, rootArg: arg, ops: [] };
    if (callee.type === "MemberExpression" && !callee.computed && isNode(callee.property) && callee.property.type === "Identifier") {
      const inner = linearize(callee.object);
      return inner && { ...inner, ops: [...inner.ops, { kind: "method", name: callee.property.name as string, arg }] };
    }
    const inner = linearize(callee);
    return inner && { ...inner, ops: [...inner.ops, { kind: "call", arg }] };
  }
  return null;
}

/** Layer-scope names that start a chain on the expression's own layer when used bare (`transform.position`). */
const LAYER_ATTRS = new Set(["transform", "effect", "mask", "content", "text", "timeRemap", "cameraOption", "lightOption", "audio"]);

export function resolveReferenceNode(node: unknown): RefPath | null {
  const lin = linearize(node);
  if (!lin) return null;
  let ops = lin.ops;
  let path: RefPath;
  const layerOf = (arg: string | number) => (typeof arg === "number" ? { index: arg } : { name: arg });
  if (lin.root === "thisComp" && lin.rootArg === undefined) {
    const first = ops[0];
    if (!first || first.kind !== "method" || first.name !== "layer") return null;
    path = { layer: layerOf(first.arg), steps: [] };
    ops = ops.slice(1);
  } else if (lin.root === "comp" && typeof lin.rootArg === "string") {
    const first = ops[0];
    if (!first || first.kind !== "method" || first.name !== "layer") return null;
    path = { comp: lin.rootArg, layer: layerOf(first.arg), steps: [] };
    ops = ops.slice(1);
  } else if (lin.root === "thisLayer" && lin.rootArg === undefined) {
    path = { layer: { self: true }, steps: [] };
  } else if (LAYER_ATTRS.has(lin.root)) {
    path = { layer: { self: true }, steps: [] };
    // A bare `effect("X")` or `transform` is the first op on thisLayer.
    ops = [lin.rootArg === undefined ? { kind: "member", name: lin.root } : { kind: "method", name: lin.root, arg: lin.rootArg }, ...ops];
  } else return null;

  type Ctx = "layer" | "effect" | "transform" | "mask" | "shape" | "shapeTransform" | "text" | "animator" | "animProps" | "selector" | "camera" | "light" | "audio" | "generic";
  let ctx: Ctx = "layer";
  const steps = path.steps;
  const str = (a: string | number) => (typeof a === "string" ? a : null);
  for (const op of ops) {
    if (op.kind === "member" && op.name === "value") continue; // `.value` reads the same thing
    if (op.kind === "call") {
      steps.push(String(op.arg));
      ctx = "generic";
      continue;
    }
    const name = op.name;
    if (op.kind === "method") {
      const arg = str(op.arg);
      if (arg === null) return null;
      // Methods that address a named item: [the group (if any), the item] and the context they lead to.
      const methods: [Ctx, string, string | null, Ctx][] = [
        ["layer", "effect", "ADBE Effect Parade", "effect"],
        ["layer", "mask", "ADBE Mask Parade", "mask"],
        ["layer", "content", "ADBE Root Vectors Group", "shape"],
        ["shape", "content", "ADBE Vectors Group", "shape"],
        ["text", "animator", "ADBE Text Animators", "animator"],
        ["animator", "selector", "ADBE Text Selectors", "selector"],
      ];
      const m = methods.find(([from, method]) => from === ctx && method === name);
      if (!m) return null; // valueAtTime(), wiggle(), …: not a plain reference
      if (m[2]) steps.push(m[2]);
      steps.push(arg);
      ctx = m[3];
      continue;
    }
    const pick = (map: Record<string, string[]>) => map[name] ?? null;
    let found: string[] | null = null;
    if (ctx === "layer") {
      const groups: Record<string, [string, Ctx]> = {
        transform: ["ADBE Transform Group", "transform"],
        text: ["ADBE Text Properties", "text"],
        cameraOption: ["ADBE Camera Options Group", "camera"],
        lightOption: ["ADBE Light Options Group", "light"],
        audio: ["ADBE Audio Group", "audio"],
      };
      if (name === "timeRemap") found = ["ADBE Time Remapping"];
      else if (groups[name]) {
        steps.push(groups[name][0]);
        ctx = groups[name][1];
        continue;
      }
    } else if (ctx === "transform") found = pick(INV.transform);
    else if (ctx === "mask") found = pick(INV.mask);
    else if (ctx === "shape") {
      if (name === "transform") {
        steps.push("ADBE Vector Transform Group");
        ctx = "shapeTransform";
        continue;
      }
      found = pick(INV.shape);
    } else if (ctx === "shapeTransform") found = pick(INV.shapeTransform);
    else if (ctx === "text") {
      if (name === "sourceText") found = ["ADBE Text Document"];
    } else if (ctx === "animator" && name === "property") {
      steps.push("ADBE Text Animator Properties");
      ctx = "animProps";
      continue;
    } else if (ctx === "animProps") found = pick(INV.textAnimator);
    else if (ctx === "selector") found = pick(INV.textSelector);
    else if (ctx === "camera") found = pick(INV.camera);
    else if (ctx === "light") found = pick(INV.light);
    else if (ctx === "audio" && name === "audioLevels") found = ["ADBE Audio Levels"];
    if (!found) return null;
    steps.push(found.length === 1 ? found[0]! : found);
    ctx = "generic";
  }
  return steps.length ? path : null;
}

export interface Declared {
  name: string;
  /** 1-based line where the declaration ends (the inline value goes there). */
  line: number;
  path: RefPath;
}

/** Top-level `const/let/var x = <plain reference>;` declarations that can be read from AE. */
export function declaredReferences(code: string): Declared[] {
  let ast: Node;
  try {
    ast = parse(code, { ecmaVersion: "latest", allowReturnOutsideFunction: true, locations: true }) as unknown as Node;
  } catch {
    return [];
  }
  const out: Declared[] = [];
  for (const stmt of ast.body as Node[]) {
    if (stmt.type !== "VariableDeclaration") continue;
    for (const d of stmt.declarations as Node[]) {
      const id = d.id as Node;
      if (id.type !== "Identifier" || !d.init) continue;
      const path = resolveReferenceNode(d.init);
      const loc = stmt.loc as { end: { line: number } };
      if (path) out.push({ name: id.name as string, line: loc.end.line, path });
    }
  }
  return out;
}
