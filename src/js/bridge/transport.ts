import { ns } from "../../shared/shared";
import { BridgeError, type BridgeErrorCode } from "./types";

// Pure halves of the CEP transport (no CEP globals), so they can be unit-tested.

type Envelope = { ok: true; data?: unknown } | { ok: false; message: string; line?: number };

/** JSON that is also a valid ES3 literal (ES3 treats U+2028/2029 as line breaks). */
export function es3Literal(value: unknown): string {
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** The ExtendScript that calls one host function and wraps its result or exception in an envelope. */
export function hostCall(fn: string, args: unknown[]): string {
  const argList = args.map(es3Literal).join(",");
  return (
    "(function(){try{" +
    "var host = typeof $ !== 'undefined' ? $ : window;" +
    `var res = host[${es3Literal(ns)}].${fn}(${argList});` +
    "return JSON.stringify({ok:true,data:res});" +
    "}catch(e){" +
    "return JSON.stringify({ok:false,message:String(e && e.message ? e.message : e),line:e && e.line});" +
    "}})()"
  );
}

const CODES: BridgeErrorCode[] = ["NO_COMP", "NOT_FOUND", "NO_EFFECTS"];

/** Turns a raw evalScript reply into data or a typed BridgeError. */
export function parseReply(raw: string): unknown {
  let env: Envelope;
  try {
    env = JSON.parse(raw) as Envelope;
  } catch {
    // evalScript answers "EvalScript error." when the host script isn't loaded or fails to parse.
    throw new BridgeError("TRANSPORT", `Unexpected reply from After Effects: ${raw}`);
  }
  if (env.ok) return env.data;
  const m = /^([A-Z_]+): ([\s\S]*)$/.exec(env.message);
  const code = m && (CODES as string[]).includes(m[1]!) ? (m[1] as BridgeErrorCode) : "HOST";
  throw new BridgeError(code, m && code !== "HOST" ? m[2]! : env.message, env.line);
}
