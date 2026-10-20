import { useIde } from "./store";

/** Offered after a layer or effect is renamed while expressions still use the old name (spec: Rename safety). */
export function RenameBanner() {
  const offer = useIde((s) => s.renameOffer);
  if (!offer) return null;
  const { applyRenames, dismissRenames } = useIde.getState();
  const n = (k: number) => `${k} reference${k === 1 ? "" : "s"}`;
  return (
    <div className="rename-banner" role="status" aria-label="Renamed">
      <span>
        {offer.summary}. Still using the old name: {n(offer.tabCount)} in open tabs, {n(offer.compCount)} in this comp.
      </span>
      {offer.tabCount > 0 && <button onClick={() => applyRenames("tabs")}>Update open tabs</button>}
      {offer.compCount > 0 && <button onClick={() => applyRenames("all")}>Update everywhere</button>}
      <button onClick={dismissRenames}>Dismiss</button>
    </div>
  );
}
