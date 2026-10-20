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
