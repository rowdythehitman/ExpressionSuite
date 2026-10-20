import { describe, expect, it } from "vitest";
import { findControllable, titleCase, uniqueName } from "../src/js/ide/references/controls";

const at = (code: string, marker = "|") => {
  const i = code.indexOf(marker);
  return findControllable(code.replace(marker, ""), i);
};

describe("make control from a value", () => {
  it("names controls after the variable or the function argument", () => {
    expect(at("const speed = |2.5;\nvalue * speed")).toEqual({ start: 14, end: 17, kind: "slider", value: 2.5, name: "Speed" });
    expect(at("wiggle(2, |50)")).toMatchObject({ kind: "slider", value: 50, name: "Wiggle Amplitude" });
    expect(at("wiggle(|2, 50)")?.name).toBe("Wiggle Frequency");
    expect(at("posterizeTime(|12); wiggle(1, 2)")?.name).toBe("Posterize Time FPS");
    expect(at("value * |3")?.name).toBe("Slider");
    expect(at("const offsetX = -|20;")).toMatchObject({ value: -20, name: "Offset X" });
  });

  it("makes points from arrays and checkboxes from booleans", () => {
    expect(at("const target = [|960, 540];")).toMatchObject({ kind: "point", value: [960, 540], name: "Target" });
    expect(at("[1, 2, |3]")).toMatchObject({ kind: "point3d", value: [1, 2, 3] });
    expect(at("const on = |true;")).toMatchObject({ kind: "checkbox", value: true, name: "On" });
  });

  it("uses an exact selection, and finds nothing elsewhere", () => {
    const code = "[960, 540]";
    expect(findControllable(code, 1, 4)).toMatchObject({ kind: "slider", value: 960 }); // just the first number
    expect(at("thisComp.layer(|\"A\")")).toBeNull();
    expect(at("value |* 2")).toBeNull();
    expect(at("broken(|")).toBeNull();
  });

  it("titles and dedupes names", () => {
    expect(titleCase("wiggleAmp")).toBe("Wiggle Amp");
    expect(titleCase("speed_2")).toBe("Speed 2");
    expect(uniqueName("Speed", ["Speed", "Speed 2"])).toBe("Speed 3");
    expect(uniqueName("Pace", ["Speed"])).toBe("Pace");
  });
});
