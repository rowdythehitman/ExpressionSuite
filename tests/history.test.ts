import { describe, expect, it } from "vitest";
import { addEntry, MAX_ENTRIES } from "../src/js/ide/history";

describe("history entries", () => {
  it("skips a repeat of the latest version and keeps the newest MAX_ENTRIES", () => {
    let list = addEntry(undefined, { time: 1, code: "a", source: "apply" });
    list = addEntry(list, { time: 2, code: "a", source: "auto" });
    expect(list).toHaveLength(1);
    for (let i = 0; i < MAX_ENTRIES + 5; i++) list = addEntry(list, { time: 10 + i, code: `v${i}`, source: "apply" });
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[list.length - 1]!.code).toBe(`v${MAX_ENTRIES + 4}`);
  });
});
