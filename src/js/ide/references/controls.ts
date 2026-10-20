// "Make control": turn a literal in the code into an expression control and a reference to it.
import { parse } from "acorn";

export type ControlKind = "slider" | "point" | "point3d" | "checkbox" | "layer";

export const CONTROL_SPECS: Record<ControlKind, { effect: string; param: string; label: string }> = {
  slider: { effect: "ADBE Slider Control", param: "Slider", label: "Slider" },
  point: { effect: "ADBE Point Control", param: "Point", label: "Point" },
  point3d: { effect: "ADBE Point3D Control", param: "3D Point", label: "3D Point" },
  checkbox: { effect: "ADBE Checkbox Control", param: "Checkbox", label: "Checkbox" },
  layer: { effect: "ADBE Layer Control", param: "Layer", label: "Layer" },
};

export interface Controllable {
  /** Offsets of the literal in the code (what gets replaced). */
  start: number;
  end: number;
  kind: ControlKind;
  value: number | number[] | boolean;
  /** Suggested effect name, from the variable or the function argument it sits in. */
  name: string;
}

interface Node {
  type: string;
  start: number;
  end: number;
  [k: string]: unknown;
}
const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && typeof (v as Node).type === "string";

/** A number literal, including a negative one (`-5`). */
function numberOf(n: Node): number | null {
  if (n.type === "Literal" && typeof n.value === "number") return n.value;
  if (n.type === "UnaryExpression" && n.operator === "-" && isNode(n.argument) && n.argument.type === "Literal" && typeof n.argument.value === "number") {
    return -n.argument.value;
  }
  return null;
}

function controllable(n: Node): Pick<Controllable, "kind" | "value"> | null {
  const num = numberOf(n);
  if (num !== null) return { kind: "slider", value: num };
  if (n.type === "Literal" && typeof n.value === "boolean") return { kind: "checkbox", value: n.value };
  if (n.type === "ArrayExpression") {
    const items = (n.elements as Node[]).map((e) => (isNode(e) ? numberOf(e) : null));
    if (items.every((x): x is number => x !== null)) {
      if (items.length === 2) return { kind: "point", value: items };
      if (items.length === 3) return { kind: "point3d", value: items };
    }
  }
  return null;
}

/** Parameter names of common expression functions, for naming a control after the argument it replaces. */
const ARGS: Record<string, string[]> = {
  wiggle: ["Frequency", "Amplitude", "Octaves", "Amplitude Multiplier", "Time"],
  posterizeTime: ["FPS"],
  loopOut: ["Type", "Keyframes"],
  loopIn: ["Type", "Keyframes"],
  linear: ["Input", "Input Min", "Input Max", "Output Min", "Output Max"],
  ease: ["Input", "Input Min", "Input Max", "Output Min", "Output Max"],
  easeIn: ["Input", "Input Min", "Input Max", "Output Min", "Output Max"],
  easeOut: ["Input", "Input Min", "Input Max", "Output Min", "Output Max"],
  clamp: ["Value", "Min", "Max"],
  random: ["Min", "Max"],
  gaussRandom: ["Min", "Max"],
  seedRandom: ["Seed", "Timeless"],
  valueAtTime: ["Time"],
  smooth: ["Width", "Samples", "Time"],
};

/** "wiggleAmp" → "Wiggle Amp", "speed" → "Speed". */
export function titleCase(identifier: string): string {
  return identifier
    .replace(/[_$]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The literal under the cursor (or exactly covered by the selection) that could become a control, with a name from
 * where it sits: `const speed = 5` → "Speed"; `wiggle(2, 50)` → "Wiggle Amplitude"; `x * 3` → the control's type.
 */
export function findControllable(code: string, from: number, to: number = from): Controllable | null {
  let ast: Node;
  try {
    ast = parse(code, { ecmaVersion: "latest", allowReturnOutsideFunction: true }) as unknown as Node;
  } catch {
    return null;
  }
  let best: { node: Node; c: Pick<Controllable, "kind" | "value">; parents: Node[] } | null = null;
  const visit = (n: unknown, parents: Node[]): void => {
    if (Array.isArray(n)) return n.forEach((x) => visit(x, parents));
    if (!isNode(n)) return;
    const covers = from === to ? n.start <= from && from <= n.end : n.start === from && n.end === to;
    const inside = n.start <= from && to <= n.end;
    if (!inside) return;
    const c = controllable(n);
    // The outermost match wins, so the cursor in `[1, 2]` makes a Point, not a slider for 1.
    if (c && covers && !best) best = { node: n, c, parents };
    for (const [k, v] of Object.entries(n)) if (k !== "loc" && typeof v === "object") visit(v, [...parents, n]);
  };
  visit(ast, []);
  if (!best) return null;
  const { node, c, parents } = best as { node: Node; c: Pick<Controllable, "kind" | "value">; parents: Node[] };
  const parent = parents[parents.length - 1];
  let name = CONTROL_SPECS[c.kind].label;
  if (parent?.type === "VariableDeclarator" && isNode(parent.id) && parent.id.type === "Identifier") name = titleCase(parent.id.name as string);
  else if (parent?.type === "CallExpression") {
    const callee = parent.callee as Node;
    const fn = callee.type === "Identifier" ? (callee.name as string) : isNode(callee.property) ? (callee.property.name as string) : "";
    const index = (parent.arguments as Node[]).indexOf(node);
    const arg = ARGS[fn]?.[index];
    if (fn && arg) name = `${titleCase(fn)} ${arg}`;
    else if (fn) name = `${titleCase(fn)} ${index + 1}`;
  }
  return { start: node.start, end: node.end, kind: c.kind, value: c.value, name };
}

/** Appends " 2", " 3"… until the name isn't one of `taken`. */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) if (!taken.includes(`${name} ${n}`)) return `${name} ${n}`;
}
