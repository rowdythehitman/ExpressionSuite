// The only way the panels reach After Effects. Inside CEP this is the ExtendScript bridge; in a plain browser
// (vite dev, Playwright) it is the mock over the fixture comp, driven through window.__mockAE.
import { createCepBridge } from "./cep";
import { fixtureComp } from "./fixture";
import { createMockBridge, type MockControl } from "./mock";
import type { Bridge } from "./types";

export * from "./types";
export type { MockControl } from "./mock";

declare global {
  interface Window {
    __mockAE?: MockControl;
  }
}

let instance: Bridge | null = null;

export function getBridge(): Bridge {
  if (instance) return instance;
  if (window.cep) {
    instance = createCepBridge();
  } else {
    const { bridge, control } = createMockBridge(fixtureComp(), { latencyMs: 5 });
    // Start with the spec's example selection: Title_Text.
    control.selectLayers([13]);
    window.__mockAE = control;
    instance = bridge;
  }
  return instance;
}
