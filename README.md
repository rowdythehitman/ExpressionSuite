# Expression Suite

After Effects tools for working with expressions, shipped as one CEP extension with a panel per tool.

| Panel | Status | Spec |
| --- | --- | --- |
| **Expression IDE**: a VS Code-style editor for expressions | Phases 1–4 built (no node view); phase 4 needs an AE test pass | [`docs/SPEC-expression-ide.md`](docs/SPEC-expression-ide.md) |

Choices made along the way are in [`docs/decisions.md`](docs/decisions.md). Behaviour that can only be checked
inside After Effects is listed in [`docs/ae-verification.md`](docs/ae-verification.md).

Targets **After Effects 2025 (25.0) and later** (CEP 12).

## Expression IDE: what works now (phases 1–4)

- **Explorer:** the active comp's layers as folders. Groups are subfolders and expression-capable properties are files.
  Groups with nothing scriptable are hidden. Selected layers open automatically, with Transform and Effects expanded.
  Deeper groups (shape contents, text animators) load the first time you expand them.
- **Badges:** `{ }` has an expression, `⚠` the expression errors, dimmed means disabled, and a dot on a folder means
  something inside has an expression.
- **Filter** by substring or word prefix (`pos`, `opa`, `ap` → Anchor Point). The `{ }` toggle shows only properties
  with expressions.
- **Selection sync:** the panel polls a cheap hash every 300 ms (1 s after 30 s idle, paused while hidden) and refetches
  the tree only when the hash changes. Selecting a property in the timeline reveals it in the tree.
- **Editor:** Monaco with one tab per property, titled `Layer › Property`. Single click previews, double click keeps the
  tab. Unapplied tabs show a dot, and a breadcrumb sits above the code. `Ctrl/Cmd+B` hides the explorer, and the
  splitter resizes it.
- **Apply:** `Ctrl/Cmd+S` applies the active tab and `Ctrl/Cmd+Alt+S` applies every unapplied tab. Each apply is one undo
  step (`Expression IDE: Position`) and turns the expression back on if AE had disabled it. AE's error is read back:
  the status bar shows `Line 2: SyntaxError: …` (full text on hover), the line gets a squiggle, and the tree a `⚠`.
- **Reset (↺)** closes all tabs, clears errors and reloads the tree. Opening or creating a project does the same
  automatically.

- **Auto-apply** (toggle in the tab bar, on by default): 1 s after you stop typing, a changed tab whose code has no
  syntax error is applied, just like Ctrl+S. Syntax errors squiggle as you type.
- **References:** drag any row from the explorer into the code to insert a reference such as
  `thisComp.layer("CTRLS").effect("Speed")("Slider")`. Hold **Ctrl** (Cmd on Mac) while dropping to declare it
  as a const named after the layer and property (`const ctrlsSpeed = …;`, `titleTextPosition`) and use it where you
  drop. A reference that's already declared is reused. **Ctrl/Cmd+Shift+P** inserts a reference to the property selected in
  AE's timeline. References follow AE's own forms: `transform.position` on the same layer,
  `content("Rect 1").content("Fill 1").color`, `text.animator("Animator 1").property.position`, and `comp("…")` for
  other comps. When two layers share a name, the layer is referenced by index, with a warning.
- **Right-click** a row for Copy reference, Enable/Disable/Remove expression, and Reveal in timeline.
- **Completions** for the AE expression API (`thisComp.`, `wiggle`, `loopOut`, `linear`, …), with `value` typed for the
  open property, **and for the comp's real names**: `thisComp.layer("` lists the layers, `.effect("` that layer's
  effects, and `("` the effect's parameters, with the result typed (a slider is a number property).
- **Name check:** a reference to a layer, effect or parameter the comp doesn't have gets a yellow squiggle, and
  auto-apply waits until it's fixed. Ctrl+S still applies it anyway.
- **Value strip** under the editor: the property's value after its expression, at the playhead (vectors per
  component, colours with a swatch, Source Text as text). It follows the playhead and refreshes after every apply.
- **Problems list** (⚠ in the status bar): every expression error in the comp; click one to open it.
- **Pinned layers:** right-click a layer › Pin to top. It stays first, open with its effects, in every comp that has a
  layer of that name.
- **Split view:** ⫽ in the tab bar opens the active tab on the right, so two properties can be edited side by side.

- **Stays in step with AE:** about once a second, open tabs re-read their expressions. A clean tab follows changes
  made in AE. A tab with unapplied edits shows a banner instead: **Compare** (side-by-side diff), **Use After Effects'
  version** or **Keep mine**. Auto-apply never applies over such a change.
- **Rename-safe references:** after you rename a layer or effect, if any expression still uses the old name, a banner
  offers **Update open tabs** or **Update everywhere** (every expression in the comp, one undo step).
- **Batch apply:** with several layers selected, **Apply to N selected layers** in the tab bar sets the same property
  on each of them, as one undo step.
- **Linked files:** **Link file…** (right of the breadcrumb) writes the tab to a `.js` file. Edit it in VS Code and
  every save applies it in AE; applying in the panel writes the file back. Links are remembered per saved project:
  reopening the project reopens the linked tabs. A file edited in the meantime is loaded as an unapplied change.
- **Make control:** right-click a number, `[x, y]`, `[x, y, z]` or `true/false` in the code › *Make control on this
  layer* (or *on pinned layer*). It becomes a Slider, Point, 3D Point or Checkbox, named from where it sits
  (`const speed = 5` → Speed, `wiggle(2, 50)` → Wiggle Amplitude), set to that value, and the code now references it.
- **Snippets ▾** (tab bar): wiggle with sliders, inertial bounce, posterize time, text box (`sourceRectAtTime`),
  loops. Inserting one creates the controls it uses and wires them in.
- **Inline values:** `const x = <reference>;` lines show the reference's current value (`// = 2.5`).
- **Value graph:** *Graph* on the value strip plots the property across the work area, with the playhead.
- **Find references** (right-click a tree row) lists every expression that uses it; **Ctrl/Cmd-click** a reference in
  the code (or F12) jumps to what it points at.
- **Friendlier errors:** errors and name warnings come with a plain-language hint, and a 💡 quick fix (Ctrl+.) where
  one is clear: "Did you mean CTRLS?", wrapping a 1D result for a 2D property, and so on.
- **History** (breadcrumb): every version of the expression the panel applied or saw change in AE; compare any one
  with the tab and restore it.
- **Settings (⚙):** theme (follows AE's brightness, or dark or light), font size, tab width, and references by
  matchName for rigs that must work in other AE languages.

The spec's ExpressionLab node view is left out; ExpressionLab stays a separate project for now.

## Development

```sh
npm install
npm run dev        # http://localhost:3000/ide/index.html: the panel in a browser, against a mock After Effects
npm test           # unit tests (Vitest)
npm run e2e        # Playwright smoke tests against the mock
npm run typecheck && npm run lint
```

Opened in a plain browser, the panel uses the **mock bridge** (`src/js/bridge/mock.ts`) over a fixture comp shaped like the
spec's example. The status bar shows `MOCK AE`. You can drive it from the devtools console:

```js
__mockAE.selectLayers([11])                     // select CTRLS
__mockAE.selectProperty("100:13:ADBE Transform Group/ADBE Position")
__mockAE.undoGroups()                           // what Ctrl+Z would undo
```

### In After Effects

**Locked-down machine (no admin, no Node):** download CI's `expression-suite-panel` artifact, sign it with
`ZXPSignCmd.exe` and your own certificate, and install the `.zxp` with the ZXP/UXP Installer. See
[`docs/INSTALL.md`](docs/INSTALL.md).

**Development machine (hot reload):**

1. Allow unsigned extensions (once per machine):
   - Windows: in `regedit`, under `HKEY_CURRENT_USER\Software\Adobe\CSXS.12`, add the string value `PlayerDebugMode` = `1`.
   - macOS: `defaults write com.adobe.CSXS.12 PlayerDebugMode 1`, then log out and back in (or `killall cfprefsd`).
2. `npm run build`. This builds `dist/cep` and symlinks it into your user CEP extensions folder.
3. Restart After Effects and open **Window › Extensions › Expression IDE**.
4. For hot reload while developing, run `npm run dev` after one build. The panel in AE then loads from the dev server.
   ExtendScript changes (`src/jsx`) rebuild too.
5. Debug the panel at `http://localhost:8860` in Chrome. Run `npm run delsymlink` to remove the extension again.

`npm run zxp` builds a self-signed ZXP in `dist/zxp` locally (Windows or macOS only; the signing tool has no Linux build).

## Layout

```
cep.config.ts            the extension: id, hosts, panels
src/shared/              types and key helpers used by both sides (keep ES3-safe)
src/jsx/                 ExtendScript host (ES3): all After Effects DOM access
src/js/bridge/           the only code that talks to AE: real (cep.ts), mock (mock.ts), panel plumbing
src/js/ide/              the Expression IDE panel (React)
src/js/lib/              vendored bolt-cep runtime (MIT, see LICENSE.bolt-cep)
tests/                   Vitest unit tests      e2e/   Playwright tests
docs/                    spec, decisions, AE verification checklist
```

Future Suite tools add a panel to `cep.config.ts`, a folder under `src/js/`, and their host functions under `src/jsx/`,
and reuse the bridge.
