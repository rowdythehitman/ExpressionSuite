import { useEffect } from "react";
import type { ValueReading } from "../../bridge";
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
export function ValueStrip({ tabKey, valueType }: { tabKey: string; valueType?: string }) {
  const entry = useIde((s) => s.reading);
  const fps = useIde((s) => s.tree?.comp.frameRate ?? 25);
  useEffect(() => {
    void useIde.getState().refreshValue();
  }, [tabKey]);
  const reading = entry?.key === tabKey ? entry.reading : null;
  return (
    <div className="value-strip" data-testid="value-strip">
      <span className="value-label">{reading ? `Value at ${timecode(reading.time, fps)}` : "Value"}</span>
      {reading && <Value reading={reading} color={valueType === "COLOR"} />}
    </div>
  );
}
