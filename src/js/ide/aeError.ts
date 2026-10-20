// AE's expressionError text, e.g. (AE 2025):
//   Expression Disabled
//   Error at line 2 in property 'Anchor Point' of layer 1 ('Dark Yellow Solid 1') in comp 'Comp 1'.
//   SyntaxError: Unexpected token ')'
// The exact line breaks may vary, so everything is matched loosely and falls back to the whole text.

export interface AeError {
  /** 1-based line AE blames, if it names one. */
  line: number | null;
  /** The JavaScript error itself, e.g. "SyntaxError: Unexpected token ')'". */
  message: string;
  /** AE switched the expression off because of the error. */
  disabled: boolean;
  /** Short form for the status bar: "Line 2: SyntaxError: Unexpected token ')'". */
  summary: string;
}

export function parseAeError(text: string): AeError {
  const flat = text.replace(/\s+/g, " ").trim();
  const disabled = /^Expression Disabled\b/i.test(flat);
  const lineMatch = /\bline (\d+)\b/i.exec(flat);
  const line = lineMatch ? parseInt(lineMatch[1]!, 10) : null;
  // The JS error follows the "… in comp 'Name'." location sentence.
  const after = /\bin comp '.*?'\.\s*(.+)$/i.exec(flat);
  let message = after ? after[1]!.trim() : flat.replace(/^Expression Disabled\s*/i, "");
  if (!message) message = flat;
  const summary = line !== null ? `Line ${line}: ${message}` : message;
  return { line, message, disabled, summary };
}
