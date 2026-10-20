// AE expression typings for Monaco (spec: Completions › Static typings), built from expression-globals-typescript
// (MIT). That package declares the API as exported classes; Monaco needs ambient globals, so the module is turned
// into a script and every Layer and Property member is declared as a bare global, the way expressions see them.
import type { CompSchema, ValueType } from "../../bridge";

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

/** Names declared per tab or per comp (contextLib, compLib) rather than from the classes. */
const CONTEXT = new Set(["value", "effect"]);

export function buildAeLib(dts: string): string {
  const script = dts
    .replace(/^export \{\};?\s*$/m, "")
    .replace(/^export (declare |interface )/gm, (_m, kw: string) => (kw === "interface " ? "interface " : "declare "));
  const layer = classMembers(dts, "Layer").filter((n) => !CONTEXT.has(n));
  const property = classMembers(dts, "Property").filter((n) => !layer.includes(n) && !CONTEXT.has(n));
  return [
    script,
    "// Globals an expression sees: the layer's and the property's members, and the this* objects.",
    "// thisComp, thisLayer and effect come from compLib, typed for the active comp.",
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

const TS_VALUE: Record<ValueType, string> = {
  "1D": "number",
  "2D": "Vector2D",
  "3D": "Vector3D",
  COLOR: "Color",
  TEXT: "string",
  SHAPE: "PathValue",
  OTHER: "any",
};

/**
 * Types for the active comp (spec: Dynamic typings): `thisComp.layer("CTRLS")` returns a type whose
 * `effect("Speed")` returns one callable with `("Slider")`, so TypeScript completes real names inside the quotes all
 * the way down. `thisLayer` and the bare `effect` are the edited layer's. With no schema, the plain classes.
 */
export function compLib(schema: CompSchema | null, layerId: number | null): string {
  if (!schema) {
    return "declare const thisComp: Comp;\ndeclare const thisLayer: Layer;\ndeclare const effect: Layer[\"effect\"];\n";
  }
  const q = (s: string) => JSON.stringify(s);
  const out: string[] = [];
  for (const l of schema.layers) {
    const effects = l.effects.map((fx, j) => {
      const name = `$L${l.index}E${j + 1}`;
      const params = fx.params.map((p) => `  (name: ${q(p.name)}): Property<${TS_VALUE[p.valueType] ?? "any"}>;`);
      out.push(`/** ${fx.name} (${fx.matchName}) on ${l.name} */`, `interface ${name} extends Effect {`, ...params, "  (nameOrIndex: string | number): Property<any>;", "}");
      return `  effect(name: ${q(fx.name)}): ${name};`;
    });
    out.push(`/** Layer ${l.index}: ${l.name} */`, `interface $L${l.index} extends Layer {`, ...effects, "  effect(nameOrIndex: number | string): Effect;", "}");
  }
  out.push(
    `/** ${schema.compName} */`,
    "interface $Comp extends Comp {",
    ...schema.layers.map((l) => `  layer(name: ${q(l.name)}): $L${l.index};`),
    ...schema.layers.map((l) => `  layer(index: ${l.index}): $L${l.index};`),
    "  layer(index: number): Layer;",
    "  layer(name: string): Layer;",
    "  layer(otherLayer: Layer, relativeIndex: number): Layer;",
    "}",
    "declare const thisComp: $Comp;",
  );
  const own = schema.layers.find((l) => l.id === layerId);
  out.push(`declare const thisLayer: ${own ? `$L${own.index}` : "Layer"};`, 'declare const effect: typeof thisLayer["effect"];');
  return out.join("\n") + "\n";
}
