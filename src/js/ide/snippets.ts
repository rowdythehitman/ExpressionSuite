// Snippets that bring their own controls (spec: Completions › Snippets): inserting one creates the sliders it uses
// on the layer and wires references to them into the code.
import type { ControlKind } from "./references/controls";

export interface SnippetControl {
  /** Effect name; also the `{{Name}}` placeholder in the body. */
  name: string;
  kind: ControlKind;
  value: number | number[];
}

export interface Snippet {
  id: string;
  label: string;
  description: string;
  controls: SnippetControl[];
  /** Code with `{{Control Name}}` where each control's reference goes. */
  body: string;
}

export const SNIPPETS: Snippet[] = [
  {
    id: "wiggle-sliders",
    label: "Wiggle with sliders",
    description: "wiggle() driven by Frequency and Amplitude sliders",
    controls: [
      { name: "Frequency", kind: "slider", value: 2 },
      { name: "Amplitude", kind: "slider", value: 50 },
    ],
    body: "wiggle({{Frequency}}, {{Amplitude}})",
  },
  {
    id: "inertial-bounce",
    label: "Inertial bounce",
    description: "Overshoot and settle after each keyframe",
    controls: [
      { name: "Bounce Amplitude", kind: "slider", value: 0.05 },
      { name: "Bounce Frequency", kind: "slider", value: 4 },
      { name: "Bounce Decay", kind: "slider", value: 8 },
    ],
    body: [
      "const amp = {{Bounce Amplitude}};",
      "const freq = {{Bounce Frequency}};",
      "const decay = {{Bounce Decay}};",
      "let n = 0;",
      "if (numKeys > 0) {",
      "  n = nearestKey(time).index;",
      "  if (key(n).time > time) n--;",
      "}",
      "const t = n === 0 ? 0 : time - key(n).time;",
      "if (n > 0 && t < 1) {",
      "  const v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);",
      "  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);",
      "} else {",
      "  value;",
      "}",
    ].join("\n"),
  },
  {
    id: "posterize",
    label: "Posterize time",
    description: "Step the value at a slider-controlled frame rate",
    controls: [{ name: "Posterize FPS", kind: "slider", value: 12 }],
    body: "posterizeTime({{Posterize FPS}});\nvalue",
  },
  {
    id: "text-box",
    label: "Text box (sourceRectAtTime)",
    description: "For a rectangle's Size: fit a text layer, plus padding",
    controls: [
      { name: "Text Layer", kind: "layer", value: 0 },
      { name: "Padding", kind: "point", value: [20, 10] },
    ],
    body: [
      "const target = {{Text Layer}};",
      "const pad = {{Padding}};",
      "const r = target.sourceRectAtTime(time, false);",
      "[r.width + pad[0] * 2, r.height + pad[1] * 2]",
    ].join("\n"),
  },
  {
    id: "loop-cycle",
    label: "Loop (cycle)",
    description: 'loopOut("cycle"): repeat the keyframes',
    controls: [],
    body: 'loopOut("cycle")',
  },
  {
    id: "loop-pingpong",
    label: "Loop (ping-pong)",
    description: 'loopOut("pingpong"): back and forth',
    controls: [],
    body: 'loopOut("pingpong")',
  },
];

/** The snippet's code with each `{{Name}}` replaced by its control's reference. */
export function fillSnippet(body: string, refs: Record<string, string>): string {
  return body.replace(/\{\{([^}]+)\}\}/g, (m, name: string) => refs[name] ?? m);
}
