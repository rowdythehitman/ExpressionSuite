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
