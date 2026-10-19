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
- [ ] Applying `time *` shows AE's error in the status bar and `⚠` in the tree. **Paste the exact error text here**; it
      drives the line mapping in phase 2:
      ```
      (error text)
      ```
- [ ] A runtime error (`thisComp.layer("Nope")`) also comes back as an error after apply.
- [ ] Clearing the code and applying removes the expression.
