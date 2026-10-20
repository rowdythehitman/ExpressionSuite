import { useEffect, useState } from "react";
import type { ValueReading, ValueSamples } from "../../bridge";
import { graphPaths } from "./graph";
import { parseAeError } from "../aeError";
import { useIde } from "../store";
import { timecode } from "./format";

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));

function Value({ reading, color }: { reading: ValueReading; color: boolean }) {
  const v = reading.value;
  if (reading.error) return <span className="value-error" title={reading.error}>{parseAeError(reading.error).summary}</span>;
  if (v === null) return <span className="value-none">(no preview for this property)</span>;
  if (typeof v === "string") return <span className="value-text" title={v}>{JSON.stringify(v)}</span>;
  if (typeof v === "number") return <span className="value-part">{num(v)}</span>;
  const [r = 0, g = 0, b = 0, a = 1] = v;
  return (
    <>
      {color && (
        <span
          className="swatch"
          title={`rgba ${v.map(num).join(", ")}`}
          style={{ background: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})` }}
        />
      )}
      {v.map((n, i) => (
        <span className="value-part" key={i}>
          {num(n)}
        </span>
      ))}
    </>
  );
}

/** Under the editor: the evaluated value at the playhead (spec: Value strip). */
const GRAPH_KEY = "expression-ide.graphOpen";
const storedGraphOpen = () => {
  try {
    return localStorage.getItem(GRAPH_KEY) === "1";
  } catch {
    return false;
  }
};

export function ValueStrip({ tabKey, valueType, original }: { tabKey: string; valueType?: string; original: string }) {
  const entry = useIde((s) => s.reading);
  const fps = useIde((s) => s.tree?.comp.frameRate ?? 25);
  const [graphOpen, setGraphOpen] = useState(storedGraphOpen);
  useEffect(() => {
    void useIde.getState().refreshValue();
  }, [tabKey]);
  const reading = entry?.key === tabKey ? entry.reading : null;
  const graphable = valueType !== "TEXT" && valueType !== "SHAPE";
  const toggle = () => {
    setGraphOpen(!graphOpen);
    try {
      localStorage.setItem(GRAPH_KEY, graphOpen ? "0" : "1");
    } catch {
      // A convenience only.
    }
  };
  return (
    <>
      <div className="value-strip" data-testid="value-strip">
        <span className="value-label">{reading ? `Value at ${timecode(reading.time, fps)}` : "Value"}</span>
        {reading && <Value reading={reading} color={valueType === "COLOR"} />}
        {graphable && (
          <button className={`graph-toggle ${graphOpen ? "on" : ""}`} aria-pressed={graphOpen} onClick={toggle} title="Graph the value across the work area">
            Graph
          </button>
        )}
      </div>
      {graphable && graphOpen && <ValueGraph tabKey={tabKey} original={original} time={reading?.time ?? null} color={valueType === "COLOR"} />}
    </>
  );
}

const W = 1000;
const H = 80;
const AXIS_COLOURS = ["#e5534b", "#57ab5a", "#539bf5", "#c69026"]; // x/r, y/g, z/b, a: AE's axis colours

/** The value over the work area, one line per component, with the playhead (spec idea: value graph). */
function ValueGraph({ tabKey, original, time, color }: { tabKey: string; original: string; time: number | null; color: boolean }) {
  const [samples, setSamples] = useState<ValueSamples | null>(null);
  // Re-sampled when the tab or its applied expression changes, not on every playhead move.
  useEffect(() => {
    let live = true;
    useIde
      .getState()
      .sampleValues(tabKey)
      .then((s) => live && setSamples(s));
    return () => {
      live = false;
    };
  }, [tabKey, original]);
  if (!samples) return <div className="value-graph empty">Sampling…</div>;
  const g = graphPaths(samples, W, H);
  if (g.paths.length === 0) return <div className="value-graph empty">Nothing to graph for this property.</div>;
  const playhead = time !== null && time >= samples.start && time <= samples.end ? ((time - samples.start) / (samples.end - samples.start || 1)) * W : null;
  // Both labels use the same precision, chosen from the range.
  const digits = g.max - g.min >= 10 ? 0 : g.max - g.min >= 1 ? 1 : 3;
  const num = (n: number) => n.toFixed(digits);
  return (
    <div className="value-graph" data-testid="value-graph">
      <span className="graph-max">{num(g.max)}</span>
      <span className="graph-min">{num(g.min)}</span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Value over the work area">
        {g.paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color ? AXIS_COLOURS[i] : (AXIS_COLOURS[i] ?? "currentColor")} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
        {playhead !== null && <line className="graph-playhead" x1={playhead} x2={playhead} y1={0} y2={H} vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}
