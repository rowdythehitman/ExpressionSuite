// Reference strings for a property, as AE's pick whip writes them (spec: Reference string generation).
// One generator serves drag-from-tree, pick-from-timeline and Copy reference.

import type { RefSegment, RefTarget } from "../../../shared/types";

export type { RefSegment, RefTarget };

export interface RefContext {
  /** Where the expression being edited lives. */
  compId: number;
  layerId: number;
  /** Another layer in the target's comp has the same name, so the layer is referenced by index. */
  duplicateLayerName?: boolean;
  /** Settings: "Reference by matchName" for language-independent rigs. */
  byMatchName?: boolean;
}

export interface Reference {
  code: string;
  warning?: string;
}

type Names = Record<string, string>;

const TRANSFORM: Names = {
  "ADBE Anchor Point": "anchorPoint",
  "ADBE Position": "position",
  "ADBE Position_0": "xPosition",
  "ADBE Position_1": "yPosition",
  "ADBE Position_2": "zPosition",
  "ADBE Scale": "scale",
  "ADBE Orientation": "orientation",
  "ADBE Rotate X": "xRotation",
  "ADBE Rotate Y": "yRotation",
  "ADBE Rotate Z": "rotation",
  "ADBE Opacity": "opacity",
};

const MASK: Names = {
  "ADBE Mask Shape": "maskPath",
  "ADBE Mask Feather": "maskFeather",
  "ADBE Mask Opacity": "maskOpacity",
  "ADBE Mask Offset": "maskExpansion",
};

const SHAPE_TRANSFORM: Names = {
  "ADBE Vector Anchor": "anchorPoint",
  "ADBE Vector Position": "position",
  "ADBE Vector Scale": "scale",
  "ADBE Vector Skew": "skew",
  "ADBE Vector Skew Axis": "skewAxis",
  "ADBE Vector Rotation": "rotation",
  "ADBE Vector Group Opacity": "opacity",
};

const SHAPE_PROPS: Names = {
  "ADBE Vector Rect Size": "size",
  "ADBE Vector Rect Position": "position",
  "ADBE Vector Rect Roundness": "roundness",
  "ADBE Vector Ellipse Size": "size",
  "ADBE Vector Ellipse Position": "position",
  "ADBE Vector Shape": "path",
  "ADBE Vector Fill Color": "color",
  "ADBE Vector Fill Opacity": "opacity",
  "ADBE Vector Stroke Color": "color",
  "ADBE Vector Stroke Opacity": "opacity",
  "ADBE Vector Stroke Width": "strokeWidth",
  "ADBE Vector Trim Start": "start",
  "ADBE Vector Trim End": "end",
  "ADBE Vector Trim Offset": "offset",
};

const TEXT_ANIMATOR_PROPS: Names = {
  "ADBE Text Anchor Point 3D": "anchorPoint",
  "ADBE Text Position 3D": "position",
  "ADBE Text Scale 3D": "scale",
  "ADBE Text Skew": "skew",
  "ADBE Text Skew Axis": "skewAxis",
  "ADBE Text Rotation": "rotation",
  "ADBE Text Rotation X": "xRotation",
  "ADBE Text Rotation Y": "yRotation",
  "ADBE Text Opacity": "opacity",
  "ADBE Text Fill Color": "fillColor",
  "ADBE Text Stroke Color": "strokeColor",
  "ADBE Text Stroke Width": "strokeWidth",
  "ADBE Text Tracking Amount": "trackingAmount",
  "ADBE Text Line Spacing": "lineSpacing",
  "ADBE Text Character Offset": "characterOffset",
  "ADBE Text Blur": "blur",
};

const TEXT_SELECTOR: Names = {
  "ADBE Text Percent Start": "start",
  "ADBE Text Percent End": "end",
  "ADBE Text Percent Offset": "offset",
};

const CAMERA: Names = {
  "ADBE Camera Zoom": "zoom",
  "ADBE Camera Depth of Field": "depthOfField",
  "ADBE Camera Focus Distance": "focusDistance",
  "ADBE Camera Aperture": "aperture",
  "ADBE Camera Blur Level": "blurLevel",
};

const LIGHT: Names = {
  "ADBE Light Intensity": "intensity",
  "ADBE Light Color": "color",
  "ADBE Light Cone Angle": "coneAngle",
  "ADBE Light Cone Feather 2": "coneFeather",
  "ADBE Light Shadow Darkness": "shadowDarkness",
  "ADBE Light Shadow Diffusion": "shadowDiffusion",
};

/** Top-level groups AE addresses by a short attribute, with the map for their direct children. */
const TOP_GROUPS: Record<string, { attr: string; children: Names }> = {
  "ADBE Transform Group": { attr: "transform", children: TRANSFORM },
  "ADBE Camera Options Group": { attr: "cameraOption", children: CAMERA },
  "ADBE Light Options Group": { attr: "lightOption", children: LIGHT },
  "ADBE Material Options Group": { attr: "materialOption", children: {} },
  "ADBE Audio Group": { attr: "audio", children: { "ADBE Audio Levels": "audioLevels" } },
};

const q = (s: string) => JSON.stringify(s);

/** Builds the accessor chain below the layer, e.g. [".effect(\"Speed\")", "(\"Slider\")"]. */
function chain(path: RefSegment[], layerMatchName: string, byMatchName: boolean): string[] {
  const id = (s: RefSegment) => q(byMatchName ? s.matchName : s.name);
  const generic = (s: RefSegment) => `(${id(s)})`;
  const short = (map: Names, s: RefSegment) => (map[s.matchName] ? `.${map[s.matchName]}` : generic(s));
  // Segments from `from` on: the first may have a short form in `map`, deeper ones are addressed by name.
  const below = (from: number, map: Names = {}) => path.slice(from).map((s, k) => (k === 0 ? short(map, s) : generic(s)));

  const top = path[0];
  if (!top) return [];
  switch (top.matchName) {
    case "ADBE Effect Parade":
      return path[1] ? [`.effect(${id(path[1])})`, ...below(2)] : [".effect"];
    case "ADBE Mask Parade":
      return path[1] ? [`.mask(${id(path[1])})`, ...below(2, MASK)] : [".mask"];
    case "ADBE Root Vectors Group":
      return shapeChain(path.slice(1), id, short);
    case "ADBE Text Properties":
      return [".text", ...textChain(path.slice(1), id, generic, short)];
    case "ADBE Time Remapping":
      return [".timeRemap"];
  }
  const known = TOP_GROUPS[top.matchName];
  if (!known) return path.map(generic);
  // A camera's anchor point is its Point of Interest.
  const children =
    layerMatchName === "ADBE Camera Layer" && top.matchName === "ADBE Transform Group"
      ? { ...known.children, "ADBE Anchor Point": "pointOfInterest" }
      : known.children;
  return [`.${known.attr}`, ...below(1, children)];
}

type Fmt = (s: RefSegment) => string;
type Short = (map: Names, s: RefSegment) => string;

/** Shape contents: `content("Rect 1").content("Fill 1").color`; the "Contents" group inside a group is implied. */
function shapeChain(path: RefSegment[], id: Fmt, short: Short): string[] {
  const parts: string[] = [];
  let expectItem = true; // directly below a Contents group, the next segment is a shape item
  for (let i = 0; i < path.length; i++) {
    const s = path[i]!;
    if (expectItem) {
      parts.push(`.content(${id(s)})`);
      expectItem = false;
    } else if (s.matchName === "ADBE Vectors Group") {
      expectItem = true;
    } else if (s.matchName === "ADBE Vector Transform Group") {
      parts.push(".transform");
      const leaf = path[i + 1];
      if (leaf) {
        parts.push(short(SHAPE_TRANSFORM, leaf));
        i++;
      }
    } else {
      parts.push(short(SHAPE_PROPS, s));
    }
  }
  return parts;
}

/** Text: `text.sourceText`, `text.animator("Animator 1").property.position`, `….selector("Range Selector 1").start`. */
function textChain(path: RefSegment[], id: Fmt, generic: Fmt, short: Short): string[] {
  const parts: string[] = [];
  let map: Names = {};
  for (let i = 0; i < path.length; i++) {
    const s = path[i]!;
    switch (s.matchName) {
      case "ADBE Text Document":
        parts.push(".sourceText");
        break;
      case "ADBE Text Path Options":
        parts.push(".pathOption");
        break;
      case "ADBE Text More Options":
        parts.push(".moreOption");
        break;
      case "ADBE Text Animators":
      case "ADBE Text Selectors":
        break; // implied by .animator() / .selector()
      case "ADBE Text Animator":
        parts.push(`.animator(${id(s)})`);
        break;
      case "ADBE Text Animator Properties":
        parts.push(".property");
        map = TEXT_ANIMATOR_PROPS;
        break;
      case "ADBE Text Selector":
        parts.push(`.selector(${id(s)})`);
        map = TEXT_SELECTOR;
        break;
      default:
        parts.push(i === path.length - 1 ? short(map, s) : generic(s));
    }
  }
  return parts;
}

export function generateReference(target: RefTarget, ctx: RefContext): Reference {
  const parts = chain(target.path, target.layerMatchName, !!ctx.byMatchName);
  const sameComp = target.compId === ctx.compId;
  if (sameComp && target.layerId === ctx.layerId) {
    if (parts.length === 0) return { code: "thisLayer" };
    const [first, ...rest] = parts;
    // `transform.position` reads naturally; a bare `("Name")` needs thisLayer in front.
    return { code: first!.startsWith(".") ? first!.slice(1) + rest.join("") : `thisLayer${parts.join("")}` };
  }
  const compPart = sameComp ? "thisComp" : `comp(${q(target.compName)})`;
  const layerPart = ctx.duplicateLayerName ? `.layer(${target.layerIndex})` : `.layer(${q(target.layerName)})`;
  const warning = ctx.duplicateLayerName
    ? `More than one layer is named ${q(target.layerName)}, so this refers to layer ${target.layerIndex} by index; it breaks if layers are reordered.`
    : undefined;
  return { code: compPart + layerPart + parts.join(""), ...(warning ? { warning } : {}) };
}

export function camelCase(s: string): string {
  const words = s.replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  // An all-caps first word (CTRLS) is lowered whole; otherwise just its first letter.
  const first = (w: string) => (w === w.toUpperCase() ? w.toLowerCase() : w.charAt(0).toLowerCase() + w.slice(1));
  const out = words.map((w, i) => (i === 0 ? first(w) : w.charAt(0).toUpperCase() + w.slice(1))).join("");
  return /^[0-9]/.test(out) ? `_${out}` : out || "ref";
}
