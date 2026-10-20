// Panel settings (⚙ in the explorer header), kept in local storage per machine.
import type { Rgb } from "../bridge/panel";

export type ThemeChoice = "ae" | "dark" | "light";

export interface Settings {
  /** Reference effects and parameters by matchName, for rigs that must survive other AE languages. */
  byMatchName: boolean;
  /** "ae" follows After Effects' Appearance › Brightness. */
  theme: ThemeChoice;
  fontSize: number;
  tabSize: 2 | 4;
}

export const DEFAULT_SETTINGS: Settings = { byMatchName: false, theme: "ae", fontSize: 13, tabSize: 2 };

const KEY = "expression-ide.settings";

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    const s = { ...DEFAULT_SETTINGS, ...raw };
    return {
      byMatchName: !!s.byMatchName,
      theme: (["ae", "dark", "light"] as const).includes(s.theme) ? s.theme : "ae",
      fontSize: Math.min(24, Math.max(9, Number(s.fontSize) || 13)),
      tabSize: s.tabSize === 4 ? 4 : 2,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // A convenience only.
  }
}

/** Light or dark for a background colour (relative luminance, as AE's brightness slider moves through grey). */
export function isLightBackground(rgb: Rgb): boolean {
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255 > 0.5;
}

export function resolvedTheme(choice: ThemeChoice, hostBg: Rgb): "dark" | "light" {
  return choice === "ae" ? (isLightBackground(hostBg) ? "light" : "dark") : choice;
}
