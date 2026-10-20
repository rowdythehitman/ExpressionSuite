/** Seconds as AE shows them by default, h:mm:ss:ff at the comp's frame rate. */
export function timecode(seconds: number, fps: number): string {
  // The frame containing the time, as AE shows it (the epsilon absorbs float error such as 1.48 * 25).
  const totalFrames = Math.floor(seconds * fps + 1e-6);
  const rate = Math.round(fps);
  const ff = totalFrames % rate;
  const totalSeconds = Math.floor(totalFrames / rate);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(totalSeconds / 3600)}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}:${pad(ff)}`;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));

/** A short, one-line rendering of a value for inline hints: `2.5`, `[960, 540]`, `"Hello"`. */
export function formatValue(v: number | number[] | string | null): string {
  if (v === null) return "";
  if (typeof v === "number") return num(v);
  if (typeof v === "string") return JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v);
  return `[${v.map(num).join(", ")}]`;
}
