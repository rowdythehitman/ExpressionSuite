// Turning a dropped reference into a `const` (Ctrl/Cmd-drop).
import { camelCase, type RefTarget } from "./reference";

const CONTROLS = new Set([
  "ADBE Slider Control",
  "ADBE Angle Control",
  "ADBE Checkbox Control",
  "ADBE Color Control",
  "ADBE Point Control",
  "ADBE Point3D Control",
  "ADBE Layer Control",
  "ADBE Dropdown Control",
]);

const declared = (code: string, name: string) => new RegExp(`\\b(?:const|let|var)\\s+${name.replace(/\$/g, "\\$")}\\b`).test(code);

function unique(base: string, code: string): string {
  if (!declared(code, base)) return base;
  for (let n = 2; ; n++) if (!declared(code, `${base}${n}`)) return `${base}${n}`;
}

/**
 * Ctrl/Cmd-drop names: the layer name plus the property, e.g. `titleTextPosition`. For an expression control the
 * effect stands for the property (CTRLS › Speed › Slider → `ctrlsSpeed`); other effect parameters keep both
 * (Drop Shadow › Opacity → `titleTextDropShadowOpacity`). A layer alone is just its name.
 */
export function layerConstName(target: RefTarget, code: string): string {
  const leaf = target.path[target.path.length - 1];
  const fx = target.path[0]?.matchName === "ADBE Effect Parade" ? target.path[1] : undefined;
  let words: string;
  if (!leaf) words = target.layerName;
  else if (fx && fx !== leaf && CONTROLS.has(fx.matchName)) words = `${target.layerName} ${fx.name}`;
  else if (fx && fx !== leaf) words = `${target.layerName} ${fx.name} ${leaf.name}`;
  else words = `${target.layerName} ${leaf.name}`;
  return unique(camelCase(words), code);
}

export interface Declaration {
  name: string;
  /** 1-based line the `const` goes on (pushing that line down); null when an existing declaration is reused. */
  line: number | null;
  text: string | null;
}

/**
 * Where a new `const` goes: below the declarations already at the top (single-line const/let/var statements), so
 * variables stay in the order they were added. If the same reference is already declared, that name is reused.
 */
export function planDeclaration(code: string, refCode: string, name: string): Declaration {
  const escaped = refCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escaped}\\s*;`).exec(code);
  if (existing) return { name: existing[1]!, line: null, text: null };
  const lines = code.split("\n");
  let line = 0;
  while (line < lines.length && /^\s*(?:const|let|var)\s.*;\s*(?:\/\/.*)?$/.test(lines[line]!)) line++;
  return { name, line: line + 1, text: `const ${name} = ${refCode};\n` };
}

