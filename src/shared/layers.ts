/** Cameras and lights have no Effects group, so they can't hold expression controls. */
export function canHoldEffects(layerMatchName: string | undefined): boolean {
  return (
    layerMatchName !== "ADBE Camera Layer" &&
    layerMatchName !== "ADBE Light Layer"
  );
}
