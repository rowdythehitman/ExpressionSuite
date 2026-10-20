// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, isLightBackground, loadSettings, resolvedTheme } from "../src/js/ide/settings";

describe("settings", () => {
  beforeEach(() => localStorage.clear());

  it("loads defaults, and sanitises what's stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem("expression-ide.settings", JSON.stringify({ theme: "neon", fontSize: 99, tabSize: 3, byMatchName: 1 }));
    expect(loadSettings()).toEqual({ theme: "ae", fontSize: 24, tabSize: 2, byMatchName: true });
    localStorage.setItem("expression-ide.settings", "not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("follows AE's brightness", () => {
    expect(isLightBackground({ r: 35, g: 35, b: 35 })).toBe(false);
    expect(isLightBackground({ r: 200, g: 200, b: 200 })).toBe(true);
    expect(resolvedTheme("ae", { r: 200, g: 200, b: 200 })).toBe("light");
    expect(resolvedTheme("dark", { r: 200, g: 200, b: 200 })).toBe("dark");
  });
});
