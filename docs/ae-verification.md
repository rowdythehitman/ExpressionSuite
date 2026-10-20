# After Effects verification checklist

Claude Code can't run After Effects, so these need checking by hand in AE 2025. The mock and the tests cover the logic.
These items cover what only AE can answer. Tick each one off, or note what happened.

## Phase 1

### Loading
- [ ] After installing the ZXP ([INSTALL.md](INSTALL.md)) and restarting AE, **Window › Extensions › Expression IDE** opens the panel.
- [ ] The status bar shows no "After Effects isn't answering" message, which means the host script loaded.
- [ ] Typing in the editor feels instant and autocomplete pops up (Monaco's workers started under `file://`). Optional, on a dev
      machine only: the devtools console (`http://localhost:8860`) shows no "Could not create web worker" warning.

### Explorer
- [ ] Selecting a layer in the timeline shows its properties in the panel within about 0.5 s.
- [ ] With the panel focused (clicked into), the tree keeps showing the comp instead of going blank (`activeItem` fallback).
- [ ] Only properties AE lets you add expressions to appear. Nothing hidden shows up, such as Material Options on a 2D
      layer, Layer Styles with none applied, Time Remap when it's off, or Audio on a solid.
- [ ] Layer Styles: after you apply a Drop Shadow style, the Layer Styles folder appears with Blending Options and Drop
      Shadow only.
- [ ] Shape layer: Contents › group › Contents › Fill expands lazily, and a large shape layer (hundreds of groups)
      doesn't stall AE.
- [ ] Selecting a property in the timeline (one click on Position) highlights and scrolls to it in the tree.
- [ ] Renaming a layer, or adding an effect to the selected layer, updates the tree.
- [ ] The badges match AE: `{ }` for expressions, `⚠` for one with an error, dimmed for a disabled one.

### Editor and apply
- [ ] Typing in Monaco works normally: arrows, Home/End, Cmd/Ctrl+Z inside the editor, copy and paste.
- [ ] `Ctrl/Cmd+S` applies the expression and does **not** trigger AE's File › Save.
- [ ] After an apply, **Edit › Undo** names "Expression IDE: Position" and reverts exactly that one apply.
- [x] Applying `time *` shows AE's error in the status bar and `⚠` in the tree. AE 2025's text:
      ```
      Expression Disabled
      Error at line 2 in property 'Anchor Point' of layer 1 ('Dark Yellow Solid 1') in comp 'Comp 1'.
      SyntaxError: Unexpected token ')'
      ```
- [ ] A runtime error (`thisComp.layer("Nope")`) also comes back as an error after apply.
- [ ] Clearing the code and applying removes the expression.

## Phase 1 feedback build

- [ ] A broken expression shows `Line N: SyntaxError: …` in the status bar, with the full AE text on hover, and the
      squiggle is on line N.
- [ ] Fixing it and applying again turns the expression back on (the tree row is no longer dimmed, and AE's switch is on).
- [ ] **File › New Project** closes every tab and shows "New project: editor reset." The tree shows the new project.
- [ ] **File › Open Project** (another .aep) does the same.
- [ ] These must **not** reset the editor: **Save**, **Save As**, **Undo/Redo**, deleting a project item, switching comps.
- [ ] The ↺ button closes all tabs, clears errors and reloads the tree. With unapplied changes it asks first.
- [ ] The × on a status message dismisses it.

## Phase 2

- [ ] Auto-apply: typing a valid expression applies it about 1 s after you stop. A broken one squiggles and isn't
      applied. Unticking **Auto-apply** stops it, and the setting survives a restart of AE.
- [ ] Auto-applies don't make AE feel sluggish while typing (each one is a separate undo step).
- [ ] Dragging **CTRLS › Effects › Speed › Slider** into a tab on another layer inserts
      `thisComp.layer("CTRLS").effect("Speed")("Slider")` where you drop it, and the expression works.
- [ ] Alt while dropping adds `const speed = …;` on line 1. Check that Alt-drag doesn't trigger something in AE.
- [ ] Select a property in the timeline, click into the editor, then **Ctrl+Shift+P** inserts its reference. AE doesn't
      grab the shortcut.
- [ ] Right-click › **Copy reference** puts the text on the clipboard (paste it somewhere to check).
- [ ] Right-click › Disable / Enable / Remove expression each work and undo in one step. Reveal in timeline selects
      the property.
- [ ] References AE accepts as written: shape `content("Rect 1").content("Fill 1").color`, text animator
      `text.animator("Animator 1").property.position`, camera `transform.pointOfInterest`, mask
      `mask("Mask 1").maskPath`.
- [ ] Completions: `thisComp.` lists `layer`, `numLayers` and so on; typing `wigg` offers `wiggle`. The first popup may take
      a second.

## Phase 3

- [ ] `thisComp.layer("` lists this comp's layers, then `.effect("` that layer's effects, then `("` the parameters.
      Completing a slider takes no typing of names.
- [ ] After adding an effect to a layer, it shows up in completions once you reselect a layer.
- [ ] A misspelled name (`effect("Sped")`) gets a yellow squiggle, and auto-apply doesn't apply it. Ctrl+S does.
- [ ] The value strip under the editor matches what AE shows for the property: scrub the playhead and it follows.
      Colours show a swatch and Source Text shows the text.
- [ ] The ⚠ Problems panel lists every erroring expression in the comp; clicking one opens it and shows it in the tree.
      Opening it on a big comp doesn't stall AE.
- [ ] Right-click a layer › Pin to top: it moves to the top with a ★, stays pinned after restarting AE, and is pinned
      in another comp with a layer of the same name.
- [ ] ⫽ opens the tab on the right. Ctrl+S in the right-hand editor applies that property, not the active tab.

## Phase 4

- [ ] Edit an expression in the timeline while its tab is open with no edits: the tab updates within a second or so.
- [ ] Same, but with unapplied edits in the tab: the banner appears. Compare shows both versions, and each button does
      what it says.
- [ ] Rename CTRLS (with expressions referencing it). **Does AE itself update the references?** Either way, the banner
      should appear only for references still using the old name, and "Update everywhere" fixes them in one undo
      step.
- [ ] Rename an effect (Speed → Pace): same as above.
- [ ] Select three layers, open one's Opacity, and click **Apply to 3 selected layers**: all three get it, and one
      Undo reverts all three.
- [ ] **Link file…** opens a save dialog. Open that file in VS Code and save a change: AE applies it within about a
      second. Applying in the panel updates the file.
- [ ] A link survives VS Code's save (including "save as", which replaces the file).

## IDE improvements (0.5.0)

- [ ] The panel opens noticeably faster than 0.4.0. Completions still appear (the TypeScript worker now loads on first
      use, under `file://`).
- [ ] Ctrl-drag (Cmd on Mac) CTRLS › Speed › Slider into the code: `const ctrlsSpeed = …;` appears at the top and
      `ctrlsSpeed` where you dropped. AE doesn't react to Ctrl during the drag.
- [ ] ⚙ › Theme › Follow After Effects: change AE's Preferences › Appearance › Brightness, and the panel follows,
      switching to light past halfway. Dark and Light override it.
- [ ] Font size and tab width change the editor; all four settings survive a restart.
- [ ] Reference effects by matchName: dragging the slider gives
      `thisComp.layer("CTRLS").effect("ADBE Slider Control")("ADBE Slider Control-0001")`, and it evaluates in AE.
- [ ] Link a tab to a file in a **saved** project, then restart AE and reopen the project: the tab reopens, linked.
      Edit the file while AE is closed: it's loaded as an unapplied change.
