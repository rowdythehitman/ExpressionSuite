import { describe, expect, it } from "vitest";
import { graphPaths } from "../src/js/ide/editor/graph";

describe("value graph", () => {
  it("draws one line per component across a shared range", () => {
    const g = graphPaths({ start: 0, end: 2, times: [0, 1, 2], values: [[0, 10], [5, 10], [10, 10]] }, 100, 50);
    expect(g.paths).toEqual(["M0.0,50.0L50.0,25.0L100.0,0.0", "M0.0,0.0L50.0,0.0L100.0,0.0"]);
    expect([g.min, g.max]).toEqual([0, 10]);
  });

  it("centres a flat line and breaks around missing samples", () => {
    const g = graphPaths({ start: 0, end: 2, times: [0, 1, 2], values: [3, null, 3] }, 100, 50);
    expect(g.paths).toEqual(["M0.0,25.0M100.0,25.0"]);
    expect(graphPaths({ start: 0, end: 1, times: [0], values: [null] }, 10, 10).paths).toEqual([]);
  });
});
