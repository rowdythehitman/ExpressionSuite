// AE expression typings for Monaco (spec: Completions › Static typings), built from expression-globals-typescript
// (MIT). That package declares the API as exported classes; Monaco needs ambient globals, so the module is turned
// into a script and every Layer and Property member is declared as a bare global, the way expressions see them.
import type { ValueType } from "../../bridge";

/** Members of `declare class Name { … }` at the class's top indentation (4 spaces), e.g. ["time", "wiggle"]. */
export function classMembers(dts: string, className: string): string[] {
  const start = dts.search(new RegExp(`declare class ${className}\\b`));
  if (start < 0) return [];
  const end = dts.indexOf("\n}", start);
  const body = dts.slice(start, end);
  const names = new Set<string>();
  for (const m of body.matchAll(/^ {4}(?:readonly )?([A-Za-z_$][\w$]*)\??\s*[(:<]/gm)) names.add(m[1]!);
  return [...names];
}

/** Context names typed per property (see contextLib), not taken from the Property class. */
const CONTEXT = new Set(["value"]);

export function buildAeLib(dts: string): string {
  const script = dts
    .replace(/^export \{\};?\s*$/m, "")
    .replace(/^export (declare |interface )/gm, (_m, kw: string) => (kw === "interface " ? "interface " : "declare "));
  const layer = classMembers(dts, "Layer");
  const property = classMembers(dts, "Property").filter((n) => !layer.includes(n) && !CONTEXT.has(n));
  return [
    script,
    "// Globals an expression sees: the layer's and the property's members, and the this* objects.",
    "declare const thisLayer: Layer;",
    "declare const thisComp: Comp;",
    "declare const thisProject: Project;",
    "declare const thisProperty: Property<any>;",
    ...layer.map((n) => `declare const ${n}: Layer["${n}"];`),
    ...property.map((n) => `declare const ${n}: Property<any>["${n}"];`),
  ].join("\n");
}

const VALUE_TYPES: Record<ValueType, string> = {
  "1D": "number",
  "2D": "[number, number]",
  "3D": "[number, number, number]",
  COLOR: "[number, number, number, number]",
  TEXT: "string",
  SHAPE: "PathValue",
  OTHER: "any",
};

/** `value` (and thisProperty) typed for the property being edited. */
export function contextLib(valueType: ValueType | undefined): string {
  const t = VALUE_TYPES[valueType ?? "OTHER"];
  return `/** The property's value at the current time, before this expression. */\ndeclare const value: ${t};\n`;
}
