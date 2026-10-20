import { describe, expect, it } from "vitest";
import { chainAt, referenceChains, usesTarget } from "../src/js/ide/references/usage";

const ctx = { compName: "Main", layerId: 13, layers: [{ id: 11, index: 1, name: "CTRLS" }, { id: 13, index: 3, name: "Title" }] };
const slider = {
  layerId: 11,
  path: [
    { name: "Effects", matchName: "ADBE Effect Parade" },
    { name: "Speed", matchName: "ADBE Slider Control" },
    { name: "Slider", matchName: "ADBE Slider Control-0001" },
  ],
};

describe("reference chains", () => {
  it("finds each reference once, at its line", () => {
    const code = 'const s = thisComp.layer("CTRLS").effect("Speed")("Slider");\nwiggle(s, transform.position[0])';
    expect(referenceChains(code).map((c) => [code.slice(c.start, c.end), c.line])).toEqual([
      ['thisComp.layer("CTRLS").effect("Speed")("Slider")', 1],
      ["transform.position", 2],
    ]);
    expect(chainAt(code, code.indexOf("Speed"))?.line).toBe(1);
    expect(chainAt(code, code.indexOf("wiggle"))).toBeNull();
  });
});

describe("usesTarget", () => {
  const chain = (code: string) => referenceChains(code)[0]!.path;
  it("matches by name, index, matchName and thisLayer", () => {
    expect(usesTarget(chain('thisComp.layer("CTRLS").effect("Speed")("Slider")'), ctx, slider)).toBe(true);
    expect(usesTarget(chain('thisComp.layer(1).effect("ADBE Slider Control")("ADBE Slider Control-0001")'), ctx, slider)).toBe(true);
    expect(usesTarget(chain('effect("Speed")("Slider")'), { ...ctx, layerId: 11 }, slider)).toBe(true);
    expect(usesTarget(chain('effect("Speed")("Slider")'), ctx, slider)).toBe(false); // on Title, not CTRLS
  });

  it("an effect's references include its parameters; a deeper target isn't matched by a shallower one", () => {
    const effect = { layerId: 11, path: slider.path.slice(0, 2) };
    expect(usesTarget(chain('thisComp.layer("CTRLS").effect("Speed")("Slider")'), ctx, effect)).toBe(true);
    expect(usesTarget(chain('thisComp.layer("CTRLS").effect("Speed")'), ctx, slider)).toBe(false);
    expect(usesTarget(chain('comp("Other").layer("CTRLS").effect("Speed")("Slider")'), ctx, slider)).toBe(false);
  });
});
