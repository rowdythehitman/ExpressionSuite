# Expression IDE for After Effects — Spec

Oct 19, 2026 · @Edward Piper

## Overview and goals

A dockable CEP (ZXP) panel that turns After Effects expression writing into a VS Code-style workflow. Select a layer and its scriptable properties appear as a folder tree. Click one to open its expression in a full-size Monaco editor. Drag any property from any layer into the code to reference it.

**Goals**

1. Browse every expression-capable property of the selected layer as a collapsible tree, like files under folders in VS Code.
2. Reference other layers easily: drag from the tree, pick from the timeline, and get completions for real layer and effect names.
3. Edit in a real code editor: syntax highlighting, autocomplete, multi-tab, find/replace, error squiggles on the right line.
4. Apply safely: Ctrl+S applies, one undo step per apply, errors read back from AE.

**Non-goals for v1**

- Replacing AE's native pick whip (a panel cannot hook it).
- Editing ExtendScript (.jsx) scripts; this is for expressions only.
- UXP support; designed for, not built (see Platform).

## Platform and stack

Build on CEP now; keep every AE call behind one bridge module so a UXP port later only swaps that module. Adobe plans an After Effects UXP public beta by November 2026, guarantees at least two years before CEP leaves an app, and drops CEP entirely from December 2029. ExtendScript is unaffected ([Adobe, Sept 2026](https://blog.developer.adobe.com/en/publish/2026/09/investing-in-the-future-of-creative-cloud-extensibility-uxp-comes-to-our-flagship-applications)).

| Layer | Choice | Notes |
| --- | --- | --- |
| Scaffold | [bolt-cep](https://github.com/hyperbrew/bolt-cep) (React + TypeScript + Vite) | Same tooling family as ExpressionLab; hot reload in AE |
| Editor | Monaco (`@monaco-editor/react`) | Needs full Chromium, which CEP provides |
| Tree | Custom React tree, virtualised (`react-arborist` or similar) | Large shape layers can have thousands of properties |
| Host side | ExtendScript `.jsx` | All AE DOM access; returns JSON strings |
| Bridge | `src/bridge/` TypeScript module | The only code that calls `evalScript`/`evalTS` |
| Node.js | Enabled in CEP manifest | File watch mode, settings file |
| Packaging | ZXPSignCmd, self-signed for personal use | `PlayerDebugMode` for dev builds |

Reference implementations to read before starting: [motiondeveloper/editor](https://github.com/motiondeveloper/editor) (MIT, bolt-cep + web split) and [ExprOne](https://sheenapizza.gumroad.com/l/expronebeta) (Monaco + property tree, closed source, install to compare).

## Panel layout

One dockable panel, VS Code-shaped: explorer on the left, tabbed editor on the right, value strip under the code, status bar along the bottom. The sidebar is resizable and collapsible so the editor can go full width.

&#91;embedded content: panel layout · explorer, editor, value strip, status bar\]

The selected property is highlighted in the tree and open in the active tab; the dashed arrow is a drag from another layer's slider straight into the code.

## Explorer tree

The sidebar works like VS Code's file explorer: layers are top-level folders, property groups are subfolders, and expression-capable properties are the files. Only properties where `canSetExpression` is true appear as leaves; groups with no scriptable descendants are hidden.

```
COMP: Main_Title (1920×1080, 25fps)
▾ ★ 1  CTRLS                    (pinned: controls null)
   ▾ Effects
      ▾ Speed
           ƒ Slider              = 2.5
      ▾ Accent Colour
           ƒ Color
   ▸ Transform
▾ ● 3  Title_Text               (selected)
   ▸ Text
      ▸ Animators
           ƒ Source Text         { } has expression
   ▾ Transform
        ƒ Anchor Point
        ƒ Position              { } has expression
        ƒ Scale
        ƒ Rotation              ⚠ expression error
        ƒ Opacity
   ▾ Effects
      ▾ Drop Shadow
           ƒ Opacity …
▸   4  BG_Shape
▸   5  Camera 1
```

### Modes

- **Selection** (default): shows the layers selected in the timeline, expanded. Other layers stay collapsed underneath so they are always available to reference.
- **Whole comp**: every layer in the active comp, collapsed.
- **Pinned**: layers you pin (for example `CTRLS`) always sit at the top, whatever the mode.

### Tree behaviour

- Click a property: opens its expression in a new editor tab (single click previews, double click pins the tab, as in VS Code).
- Badges: `{ }` has an expression, `⚠` expression error, dimmed when the expression is disabled. A folder shows a dot if anything inside it has an expression.
- Filter box at the top: fuzzy match on property names (`pos`, `opa`, `slider`).
- Toggle "Only show properties with expressions".
- Right-click a property: Copy reference, Copy value, Enable/disable expression, Remove expression, Reveal in timeline.
- Right-click a layer: Pin, Reveal in timeline, Copy `thisComp.layer("…")`.
- Shape layers and text animators load lazily: a folder's children are fetched from AE the first time it is expanded.
- Expanded state is remembered per layer for the session.

### Selection sync

CEP gets no layer-selection event from AE, so the panel polls. Every 300 ms the bridge calls `getSelectionHash()`, which returns comp id, selected layer indices and the active property path as a short string. Only when the hash changes does the panel request the full tree. Polling pauses when the panel is hidden or AE is rendering.

The reverse also works: selecting a property in the timeline (one click in AE) highlights and scrolls to it in the tree.

## Referencing other layers

Three routes give a pick-whip feel without hooking AE's native pick whip. All three produce the same reference string from one generator.

1. **Drag from the tree.** Drag any property (from any layer, including collapsed ones) into Monaco; the reference drops at the cursor. Hold Alt while dropping to insert it as a `const` on a new line at the top, named after the property (`const speed = …;`).
2. **Pick from the timeline.** Select a property in AE's timeline, then press the panel hotkey (default Ctrl+Shift+P while the editor has focus). The bridge reads `selectedProperties` and inserts the reference.
3. **Autocomplete.** Typing `thisComp.layer("` lists real layer names; `.effect("` lists that layer's real effects; `("` after an effect lists its parameters. See Editor.

### Reference string generation

| Target | Generated reference |
| --- | --- |
| Same layer, transform | `transform.position` |
| Same layer, effect param | `effect("Speed")("Slider")` |
| Other layer, same comp | `thisComp.layer("CTRLS").effect("Speed")("Slider")` |
| Other comp | `comp("Controls").layer("CTRLS").effect("Speed")("Slider")` |
| Shape content | `content("Rect 1").content("Fill 1").color` |
| Text animator | `text.animator("Animator 1").property.position` |

Rules:

- Use `thisLayer`-relative paths when the target is the layer being edited.
- Prefer display names (readable, matches how people write expressions). Fall back to `layer(index)` only when two layers share a name, and show a warning.
- Use the short forms AE itself writes for transform properties; use `("Name")` for everything else.
- Settings toggle: "Reference by matchName" (`effect("ADBE Slider Control")…`) for language-independent rigs.

### Rename safety

When a layer or effect referenced in open tabs is renamed, the tree refreshes and the panel offers "Update 3 references in open expressions". A project-wide version (scan every expression in the comp) lands in phase 4.

## Editor

Monaco in JavaScript mode, with AE-aware typings and live data from the open comp.

### Tabs and layout

- One tab per property, titled `Layer › Property` (for example `Title_Text › Position`). Unsaved tabs show a dot, as in VS Code.
- Breadcrumb bar above the code: `Comp › Layer › Group › Property`; each segment clickable to reveal it in the tree.
- Split view: two properties side by side.
- Theme follows AE's UI brightness; font, size and tab width in settings.

### Completions

- **Static typings:** an AE expressions `.d.ts` loaded via `addExtraLib` covering globals (`thisComp`, `thisLayer`, `time`, `value`, `wiggle`, `loopOut`, `valueAtTime`, `sourceRectAtTime`, `linear`, `ease` …). Start from motiondeveloper's expression-globals-typescript and extend.
- **Dynamic typings:** regenerated whenever the tree hash changes. A generated `.d.ts` declares overloads so `thisComp.layer("CTRLS")` returns a type with that layer's actual effects and parameters. This gives real completions all the way down a reference chain.
- **Context variables:** `value` is typed by the property (number, `[x,y]`, `[x,y,z]`, colour `[r,g,b,a]`, text).
- **Snippets:** loop, wiggle with sliders, inertial bounce, `sourceRectAtTime` box, `posterizeTime`.

### Diagnostics

- **Instant:** acorn parse on every edit (debounced 200 ms) for syntax errors, reusing ExpressionLab's setup.
- **From AE:** after apply, read `expressionError`, parse the line number from AE's message and show a squiggle plus a status bar message. Errors on properties not currently open show as the `⚠` badge in the tree.
- **Problems list:** a collapsible panel listing every expression error in the comp, click to open.

### Apply and undo

- Ctrl+S applies the current tab; Ctrl+Alt+S applies all dirty tabs.
- Each apply is wrapped in `app.beginUndoGroup("Expression IDE: <Property>")` so Ctrl+Z in AE reverts one apply.
- Optional "Apply on pause" (off by default): apply 1 s after typing stops, only when acorn reports no syntax error.
- External change detection: if the expression changed in AE while a tab is dirty, show a diff and ask which to keep.

### Value strip

Under the editor, show the evaluated value at the comp's current time (`valueAtTime(comp.time, false)` via the bridge), refreshed on apply and when the CTI moves. Arrays show per component; colours show a swatch.

## Host bridge and ExtendScript

The UI talks only to `src/bridge/index.ts`. The bridge serialises calls to ExtendScript, parses JSON replies and turns ExtendScript exceptions into typed errors. A mock bridge with a fixture comp lets the whole UI run in a browser for development and Playwright tests.

### Data model

```ts
type PropPath = string[];          // matchName path from the layer, e.g. ["ADBE Transform Group","ADBE Position"]

interface TreeNode {
  key: string;                      // compId:layerId:matchName-path, stable across renames
  kind: "layer" | "group" | "property";
  name: string;                     // display name
  matchName: string;
  index?: number;                   // layer index
  hasChildren: boolean;             // for lazy loading
  children?: TreeNode[];
  // property-only fields
  valueType?: "1D" | "2D" | "3D" | "COLOR" | "TEXT" | "SHAPE" | "OTHER";
  expression?: string;
  expressionEnabled?: boolean;
  expressionError?: string;
  reference?: string;               // pre-built thisComp.layer("…")… string
}
```

Key the tree on layer `id` (AE 22+) plus matchName path, so renames and reorders don't break open tabs.

### Bridge functions

| Function | Returns | Notes |
| --- | --- | --- |
| `getSelectionHash()` | string | Cheap; called every 300 ms |
| `getCompTree(depth)` | `TreeNode` | Layers + first level of groups |
| `getChildren(key)` | `TreeNode[]` | Lazy expand |
| `getProperty(key)` | `TreeNode` | Fresh expression, error, value |
| `setExpression(key, code)` | `{ error?: string }` | Inside an undo group |
| `setExpressionEnabled(key, on)` | void |  |
| `getValueAtTime(key, t?)` | value | `t` defaults to comp time |
| `getSelectedPropertyRef()` | `TreeNode` | For pick-from-timeline |
| `revealInTimeline(key)` | void | Selects layer and property |
| `getCompSchema()` | JSON | Layers, effects, params for dynamic `.d.ts` |
| `findAllExpressions()` | `TreeNode[]` | Problems list and rename scan |

### ExtendScript notes

- Walk with `numProperties` / `property(i)`; keep a leaf when `canSetExpression` is true.
- Skip known heavy or useless branches (Material Options on 2D layers, Layer Styles when disabled) to keep the tree small.
- Bundle a JSON polyfill; ExtendScript has no native `JSON`.
- Never send the whole comp tree at once on large projects; depth-limit and lazy load.

## Build plan

Four phases; each ends with something usable in AE. Phase 1 alone already beats the timeline field.

1. **Bridge and tree**
   - bolt-cep scaffold, mock bridge with fixture comp, Playwright smoke test.
   - Selection polling, explorer tree with lazy loading, badges, filter.
   - Click a property to open it in Monaco; Ctrl+S applies inside an undo group.
   - *Done when:* selecting a layer in AE shows its scriptable properties within 0.5 s, and editing Position then Ctrl+S changes it in AE with one undo step.
2. **Referencing and diagnostics**
   - Reference generator (table above) with unit tests for every row.
   - Drag from tree to editor, pick-from-timeline hotkey, right-click Copy reference.
   - Acorn syntax squiggles, AE `expressionError` read-back mapped to lines.
   - Static AE `.d.ts` completions.
   - *Done when:* dragging `CTRLS › Speed › Slider` into a tab on another layer inserts a working reference, and a deliberate error on line 3 squiggles line 3.
3. **Context-aware editing**
   - Dynamic `.d.ts` from `getCompSchema()`: real layer, effect and parameter completions.
   - Value strip, multi-tab, split view, pinned layers, Problems list.
   - *Done when:* typing `thisComp.layer("` lists the comp's layers and completing through to a slider needs no typing of names.
4. **Power features**
   - Rename-safe reference updates across the comp.
   - Batch apply to the same property on all selected layers.
   - File watch mode: link a tab to a `.js` file on disk, apply on save from VS Code.
   - ExpressionLab node view as a second tab (see below).

## ExpressionLab, risks and open questions

### ExpressionLab integration

ExpressionLab's compiler (`src/core`) is pure TypeScript and already round-trips code and graph through paste-back. Both panels need the same bridge, so build the bridge once as a shared package. In phase 4, a tab gets a Code/Nodes toggle: "Open in nodes" parses the expression's embedded graph, and the node view's output writes back through the same `setExpression`.

### Risks

| Risk | Mitigation |
| --- | --- |
| Polling makes AE feel sluggish on big comps | Hash-only polls; pause when hidden; back off to 1 s after 30 s idle |
| Huge shape layers flood the tree | Lazy children, virtualised list, skip-lists for heavy groups |
| AE error messages vary by version and language | Regex for line number with a fallback to a status-bar-only error |
| CEP removal | Bridge abstraction; revisit once the AE UXP beta ships and check whether Monaco can run in a UXP WebView |
| Two editors fighting (panel and timeline) | External change detection with a diff prompt |

### Open questions

- Should the panel also edit expressions on several selected properties at once (one tab, many targets)?
- Personal tool only, or packaged for colleagues (signing, installer, docs)?
- Keep a separate Code panel and ExpressionLab panel, or ship one combined panel from the start?

### Sources

- [Adobe: UXP comes to flagship applications (Sept 2026)](https://blog.developer.adobe.com/en/publish/2026/09/investing-in-the-future-of-creative-cloud-extensibility-uxp-comes-to-our-flagship-applications)
- [motiondeveloper/editor](https://github.com/motiondeveloper/editor)
- [ExprOne beta](https://sheenapizza.gumroad.com/l/expronebeta)
- [ExpressionLab](https://github.com/rowdythehitman/ExpressionLab)
