// A fixture comp for the mock bridge, mirroring the spec's explorer example. Match names are AE's real ones so
// keys and references built from it look like the ones the host produces.
import type { ValueType } from "./types";

export interface MockProp {
  name: string;
  matchName: string;
  /** Present on properties; groups have children instead. */
  valueType?: ValueType;
  value?: unknown;
  expression?: string;
  expressionEnabled?: boolean;
  /** Seeded AE error, cleared on the next apply. */
  expressionError?: string;
  children?: MockProp[];
}

export interface MockLayer {
  id: number;
  name: string;
  matchName: string;
  children: MockProp[];
}

export interface MockComp {
  id: number;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  layers: MockLayer[];
}

const prop = (name: string, matchName: string, valueType: ValueType, value: unknown, extra: Partial<MockProp> = {}): MockProp => ({
  name,
  matchName,
  valueType,
  value,
  ...extra,
});

const group = (name: string, matchName: string, children: MockProp[]): MockProp => ({ name, matchName, children });

type Overrides = { [matchName: string]: Partial<MockProp> };

function transform2D(o: Overrides = {}): MockProp {
  return group("Transform", "ADBE Transform Group", [
    prop("Anchor Point", "ADBE Anchor Point", "2D", [0, 0], o["ADBE Anchor Point"]),
    prop("Position", "ADBE Position", "2D", [960, 540], o["ADBE Position"]),
    prop("Scale", "ADBE Scale", "2D", [100, 100], o["ADBE Scale"]),
    prop("Rotation", "ADBE Rotate Z", "1D", 0, o["ADBE Rotate Z"]),
    prop("Opacity", "ADBE Opacity", "1D", 100, o["ADBE Opacity"]),
  ]);
}

const effects = (...fx: MockProp[]): MockProp => group("Effects", "ADBE Effect Parade", fx);

const slider = (name: string, value: number, extra: Partial<MockProp> = {}): MockProp =>
  group(name, "ADBE Slider Control", [prop("Slider", "ADBE Slider Control-0001", "1D", value, extra)]);

const colorControl = (name: string, value: number[]): MockProp =>
  group(name, "ADBE Color Control", [prop("Color", "ADBE Color Control-0001", "COLOR", value)]);

export function fixtureComp(): MockComp {
  return {
    id: 100,
    name: "Main_Title",
    width: 1920,
    height: 1080,
    frameRate: 25,
    layers: [
      {
        id: 11,
        name: "CTRLS",
        matchName: "ADBE AV Layer",
        children: [effects(slider("Speed", 2.5), colorControl("Accent Colour", [1, 0.4, 0.1, 1])), transform2D()],
      },
      {
        id: 12,
        name: "Logo",
        matchName: "ADBE AV Layer",
        children: [
          group("Masks", "ADBE Mask Parade", [
            group("Mask 1", "ADBE Mask Atom", [
              prop("Mask Path", "ADBE Mask Shape", "SHAPE", null),
              prop("Mask Feather", "ADBE Mask Feather", "2D", [0, 0]),
              prop("Mask Opacity", "ADBE Mask Opacity", "1D", 100),
              prop("Mask Expansion", "ADBE Mask Offset", "1D", 0),
            ]),
          ]),
          // An empty Effects group: hidden, like the host does for groups with nothing scriptable.
          effects(),
          transform2D(),
        ],
      },
      {
        id: 13,
        name: "Title_Text",
        matchName: "ADBE Text Layer",
        children: [
          group("Text", "ADBE Text Properties", [
            prop("Source Text", "ADBE Text Document", "TEXT", "Hello", {
              expression: 'thisComp.layer("CTRLS").name',
            }),
            group("Animators", "ADBE Text Animators", [
              group("Animator 1", "ADBE Text Animator", [
                group("Selectors", "ADBE Text Selectors", [
                  group("Range Selector 1", "ADBE Text Selector", [
                    prop("Start", "ADBE Text Percent Start", "1D", 0),
                    prop("End", "ADBE Text Percent End", "1D", 100),
                    prop("Offset", "ADBE Text Percent Offset", "1D", 0),
                  ]),
                ]),
                group("Properties", "ADBE Text Animator Properties", [
                  prop("Position", "ADBE Text Position 3D", "3D", [0, 0, 0]),
                  prop("Opacity", "ADBE Text Opacity", "1D", 100),
                ]),
              ]),
            ]),
          ]),
          transform2D({
            "ADBE Position": { expression: 'wiggle(thisComp.layer("CTRLS").effect("Speed")("Slider"), 20)' },
            "ADBE Rotate Z": {
              expression: "time * 360 +",
              expressionError: "SyntaxError: Unexpected end of input (line 1)",
            },
            "ADBE Opacity": { expression: "50", expressionEnabled: false },
          }),
          effects(
            group("Drop Shadow", "ADBE Drop Shadow", [
              prop("Shadow Color", "ADBE Drop Shadow-0001", "COLOR", [0, 0, 0, 1]),
              prop("Opacity", "ADBE Drop Shadow-0002", "1D", 50),
              prop("Direction", "ADBE Drop Shadow-0003", "1D", 135),
              prop("Distance", "ADBE Drop Shadow-0004", "1D", 5),
              prop("Softness", "ADBE Drop Shadow-0005", "1D", 0),
            ]),
          ),
        ],
      },
      {
        id: 14,
        name: "BG_Shape",
        matchName: "ADBE Vector Layer",
        children: [
          group("Contents", "ADBE Root Vectors Group", [
            group("Rect 1", "ADBE Vector Group", [
              group("Contents", "ADBE Vectors Group", [
                group("Rectangle Path 1", "ADBE Vector Shape - Rect", [
                  prop("Size", "ADBE Vector Rect Size", "2D", [400, 200]),
                  prop("Position", "ADBE Vector Rect Position", "2D", [0, 0]),
                  prop("Roundness", "ADBE Vector Rect Roundness", "1D", 0),
                ]),
                group("Fill 1", "ADBE Vector Graphic - Fill", [
                  prop("Color", "ADBE Vector Fill Color", "COLOR", [0.2, 0.2, 0.2, 1]),
                  prop("Opacity", "ADBE Vector Fill Opacity", "1D", 100),
                ]),
              ]),
              group("Transform", "ADBE Vector Transform Group", [
                prop("Anchor Point", "ADBE Vector Anchor", "2D", [0, 0]),
                prop("Position", "ADBE Vector Position", "2D", [0, 0]),
                prop("Scale", "ADBE Vector Scale", "2D", [100, 100]),
                prop("Rotation", "ADBE Vector Rotation", "1D", 0),
                prop("Opacity", "ADBE Vector Group Opacity", "1D", 100),
              ]),
            ]),
          ]),
          transform2D(),
        ],
      },
      {
        id: 15,
        name: "Camera 1",
        matchName: "ADBE Camera Layer",
        children: [
          group("Transform", "ADBE Transform Group", [
            prop("Point of Interest", "ADBE Anchor Point", "3D", [960, 540, 0]),
            prop("Position", "ADBE Position", "3D", [960, 540, -2666]),
            prop("Orientation", "ADBE Orientation", "3D", [0, 0, 0]),
            prop("X Rotation", "ADBE Rotate X", "1D", 0),
            prop("Y Rotation", "ADBE Rotate Y", "1D", 0),
            prop("Z Rotation", "ADBE Rotate Z", "1D", 0),
          ]),
          group("Camera Options", "ADBE Camera Options Group", [
            prop("Zoom", "ADBE Camera Zoom", "1D", 2666.7),
            prop("Focus Distance", "ADBE Camera Focus Distance", "1D", 2666.7),
            prop("Aperture", "ADBE Camera Aperture", "1D", 25.3),
          ]),
        ],
      },
    ],
  };
}
