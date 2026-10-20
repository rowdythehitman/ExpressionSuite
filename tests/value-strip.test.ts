import { describe, expect, it } from "vitest";
import { timecode } from "../src/js/ide/editor/format";

describe("timecode", () => {
  it("formats like AE's timeline", () => {
    expect(timecode(0, 25)).toBe("0:00:00:00");
    expect(timecode(1.48, 25)).toBe("0:00:01:12");
    expect(timecode(3725.5, 25)).toBe("1:02:05:12");
    expect(timecode(1, 29.97)).toBe("0:00:00:29"); // 1 s is inside frame 29 at 29.97 fps
  });
});
