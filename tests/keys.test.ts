import { describe, expect, it } from "vitest";
import { layerKey, parentKey, parseKey, parseSegment, propKey, segment } from "../src/shared/keys";

describe("node keys", () => {
  it("numbers repeated match names from the second occurrence", () => {
    expect(segment("ADBE Drop Shadow", 1)).toBe("ADBE Drop Shadow");
    expect(segment("ADBE Drop Shadow", 2)).toBe("ADBE Drop Shadow[2]");
    expect(parseSegment("ADBE Drop Shadow[2]")).toEqual({ matchName: "ADBE Drop Shadow", occurrence: 2 });
    expect(parseSegment("ADBE Position")).toEqual({ matchName: "ADBE Position", occurrence: 1 });
  });

  it("round-trips layer and property keys", () => {
    const k = propKey(100, 13, ["ADBE Transform Group", "ADBE Position"]);
    expect(k).toBe("100:13:ADBE Transform Group/ADBE Position");
    expect(parseKey(k)).toEqual({ compId: 100, layerId: 13, segments: ["ADBE Transform Group", "ADBE Position"] });
    expect(parseKey(layerKey(100, 13))).toEqual({ compId: 100, layerId: 13, segments: [] });
    expect(parseKey("nonsense")).toBeNull();
  });

  it("walks up to the layer", () => {
    const k = propKey(1, 2, ["A", "B", "C"]);
    expect(parentKey(k)).toBe("1:2:A/B");
    expect(parentKey("1:2:A")).toBe("1:2");
    expect(parentKey("1:2")).toBeNull();
  });
});
