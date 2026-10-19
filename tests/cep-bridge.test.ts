import { describe, expect, it } from "vitest";
import { BridgeError } from "../src/js/bridge/types";
import { es3Literal, hostCall, parseReply } from "../src/js/bridge/transport";

describe("CEP transport", () => {
  it("escapes line and paragraph separators for ES3", () => {
    expect(es3Literal("a b c")).toBe('"a\\u2028b\\u2029c"');
    expect(es3Literal({ k: 'say "hi"\n' })).toBe('{"k":"say \\"hi\\"\\n"}');
  });

  it("wraps the call so exceptions come back as data", () => {
    const script = hostCall("setExpression", ["1:2:ADBE Transform Group/ADBE Position", "wiggle(2, 50)"]);
    expect(script).toContain('host["com.expressionsuite.cep"].setExpression("1:2:ADBE Transform Group/ADBE Position","wiggle(2, 50)")');
    expect(script).toContain("catch(e)");
  });

  it("parses data, typed host errors and garbage", () => {
    expect(parseReply('{"ok":true,"data":{"a":1}}')).toEqual({ a: 1 });
    expect(parseReply('{"ok":true}')).toBeUndefined();
    // A layer named "Error" must not be mistaken for a failure (bolt's evalTS checks parsed.name).
    expect(parseReply('{"ok":true,"data":{"name":"Error"}}')).toEqual({ name: "Error" });
    const nf = (() => {
      try {
        parseReply('{"ok":false,"message":"NOT_FOUND: The layer no longer exists.","line":12}');
      } catch (e) {
        return e as BridgeError;
      }
    })()!;
    expect(nf.code).toBe("NOT_FOUND");
    expect(nf.message).toBe("The layer no longer exists.");
    expect(() => parseReply('{"ok":false,"message":"Object is invalid"}')).toThrow(/Object is invalid/);
    expect(() => parseReply("EvalScript error.")).toThrow(BridgeError);
  });
});
