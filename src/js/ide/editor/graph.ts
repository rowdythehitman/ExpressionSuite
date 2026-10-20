import type { ValueSamples } from "../../bridge";

export interface GraphPaths {
  /** One SVG path per component (x, y, z… or r, g, b, a), in a 0..width × 0..height box. */
  paths: string[];
  min: number;
  max: number;
}

/** Scales every component into one shared range and draws it as polylines; gaps where a sample is missing. */
export function graphPaths(s: ValueSamples, width: number, height: number): GraphPaths {
  const comps = Math.max(0, ...s.values.map((v) => (v === null ? 0 : typeof v === "number" ? 1 : v.length)));
  const nums = s.values.flatMap((v) => (v === null ? [] : typeof v === "number" ? [v] : v)).filter(Number.isFinite);
  if (comps === 0 || nums.length === 0) return { paths: [], min: 0, max: 0 };
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    // A flat line sits in the middle.
    min -= 1;
    max += 1;
  }
  const span = s.end - s.start || 1;
  const x = (t: number) => ((t - s.start) / span) * width;
  const y = (v: number) => height - ((v - min) / (max - min)) * height;
  const paths: string[] = [];
  for (let c = 0; c < comps; c++) {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      const n = v === null ? NaN : typeof v === "number" ? (c === 0 ? v : NaN) : (v[c] ?? NaN);
      if (!Number.isFinite(n)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(s.times[i]!).toFixed(1)},${y(n).toFixed(1)}`;
      pen = true;
    });
    paths.push(d);
  }
  return { paths, min: Math.min(...nums), max: Math.max(...nums) };
}
