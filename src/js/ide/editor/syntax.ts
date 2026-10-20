import { parse } from "acorn";

export interface SyntaxIssue {
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  message: string;
}

/**
 * The instant syntax check (spec: Diagnostics). AE 2025's JavaScript engine is V8, so modern syntax is accepted.
 * A top-level `return` isn't flagged here; AE itself reports it if it objects.
 */
export function checkSyntax(code: string): SyntaxIssue | null {
  try {
    parse(code, { ecmaVersion: "latest", allowReturnOutsideFunction: true });
    return null;
  } catch (e) {
    const err = e as SyntaxError & { loc?: { line: number; column: number } };
    return {
      line: err.loc?.line ?? 1,
      column: (err.loc?.column ?? 0) + 1,
      message: err.message.replace(/\s*\(\d+:\d+\)$/, ""),
    };
  }
}
