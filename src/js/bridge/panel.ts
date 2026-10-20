// CEP panel plumbing that isn't an After Effects call: loading the host script, claiming shortcuts, and AE's UI
// colour (for "theme follows After Effects").
import { csi, getAppBackgroundColor, initBolt } from "../lib/utils/bolt";

// Keys the editor needs that AE would otherwise take while the panel has focus (Ctrl/Cmd+S saves the project).
// Windows uses DOM key codes; macOS CEP uses virtual key codes.
const KEYS = {
  win: { S: 83, Z: 90, Y: 89, F: 70, H: 72, A: 65, C: 67, V: 86, X: 88, D: 68, P: 80, SLASH: 191 },
  mac: { S: 1, Z: 6, Y: 16, F: 3, H: 4, A: 0, C: 8, V: 9, X: 7, D: 2, P: 35, SLASH: 44 },
};

function registerEditorKeys(): void {
  const isMac = navigator.platform.startsWith("Mac");
  const codes = Object.values(isMac ? KEYS.mac : KEYS.win);
  const combos: object[] = [];
  for (const keyCode of codes) {
    for (const shiftKey of [false, true]) {
      for (const altKey of [false, true]) {
        combos.push(isMac ? { keyCode, metaKey: true, shiftKey, altKey } : { keyCode, ctrlKey: true, shiftKey, altKey });
      }
    }
  }
  csi.registerKeyEventsInterest(JSON.stringify(combos));
}

/** Call once at startup. No-op outside CEP. */
export function initPanel(): void {
  if (!window.cep) return;
  initBolt();
  registerEditorKeys();
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

declare global {
  interface Window {
    /** Browser only: simulates AE's Appearance › Brightness changing. */
    __setHostBackground?: (rgb: Rgb) => void;
  }
}

/** AE's default dark UI, used outside CEP. */
const DEFAULT_BG: Rgb = { r: 35, g: 35, b: 35 };

/** Calls `cb` with AE's panel background now and whenever the user changes AE's brightness; returns an unsubscribe. */
export function onHostBackground(cb: (rgb: Rgb) => void): () => void {
  if (!window.cep) {
    window.__setHostBackground = cb;
    cb(DEFAULT_BG);
    return () => {
      if (window.__setHostBackground === cb) delete window.__setHostBackground;
    };
  }
  const read = () => {
    try {
      cb(getAppBackgroundColor().rgb);
    } catch {
      cb(DEFAULT_BG);
    }
  };
  read();
  const event = "com.adobe.csxs.events.ThemeColorChanged";
  csi.addEventListener(event, read);
  return () => csi.removeEventListener(event, read);
}
