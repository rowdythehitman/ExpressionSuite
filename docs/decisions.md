# Decisions

Choices made where the spec ([`SPEC-expression-ide.md`](SPEC-expression-ide.md)) left room, or where building it
showed a better way. Newest at the bottom.

## Phase 1: bridge and tree

1. **One extension, a panel per tool.** The repo is "Expression Suite": a single CEP extension (`com.expressionsuite.cep`)
   whose panels are the Suite's tools. The IDE is the `ide` panel. Future tools (presets and so on) add panels and share
   the bridge and host script. ExpressionLab stays a separate project.
2. **AE 2025+ only.** The manifest requires AEFT 25.0 and CSXS 12 (Chromium 99), and the build targets `chrome99`. Layer
   `id` and `app.project.layerByID` (AE 22+) are therefore always available.
3. **Scaffold assembled from the bolt-cep 2.2.3 template** rather than `create-bolt-cep`, whose CLI needs an interactive
   terminal. It is React-only and AE-only, and the vendored `src/js/lib/cep` and `utils` keep bolt's MIT licence
   (`src/js/lib/LICENSE.bolt-cep`).
4. **Own transport instead of bolt's `evalTS`.** Every host call returns `{ok:true,data}` or `{ok:false,message,line}`.
   `evalTS` treats any result whose `name` contains "error" as a failure, so a layer named "Error" would have broken it.
   Host errors are thrown as `CODE: message` (`NOT_FOUND`, …) and become typed `BridgeError`s. Calls are queued one at a
   time, so a poll never interleaves with an apply.
5. **`HostApi` contract in `src/shared/host-api.ts`** replaces bolt's `@esTypes` alias. The host checks it implements the
   interface, and the panel types its calls from it. The panel therefore never type-checks against the AE DOM, whose
   globals (`File`, `Window`, …) clash with the browser's.
6. **Keys** are `compId:layerId:seg/seg/…`. A segment is a matchName, plus `[n]` for the n-th sibling with that matchName,
   because two Drop Shadows or two shape groups share a matchName. Renaming keeps the key. Reordering siblings of the same
   type changes it; open tabs then report "no longer exists" instead of editing the wrong property.
7. **`getCompTree` returns `{ comp, layers, selectedLayerKeys, activeKey }`** rather than a bare `TreeNode`, because the
   panel needs comp info and the timeline selection too. `depth` applies to selected layers only. Other layers come
   unloaded, with a `containsExpression` flag.
8. **No `reference` field on `TreeNode`.** References will be built in the panel from the loaded ancestry (phase 2), as a
   pure function with one unit test per row of the spec's table.
9. **Hiding empty groups needs a scan.** For each group, the host scans descendants (budget 400 properties for selected
   layers, 150 otherwise) for anything with `canSetExpression`. Out of budget, it assumes there is something. Skip-list:
   Material Options on 2D layers; Geometry Options on 2D layers or with the Classic 3D renderer; Layer Styles with no
   style applied, plus individual styles that aren't applied; Time Remap when off; Audio on layers without audio.
10. **Selection hash** = comp id, name and layer count, the selected layer ids, the active property key, every layer's
    `id=name`, and for selected layers a structure signature (group sizes, effect and mask names). Renames, reorders,
    and effects added to the selected layer all refresh the tree. It ignores changes on unselected layers.
11. **Tree: custom flatten plus `@tanstack/react-virtual`** instead of `react-arborist`. Arborist brings `react-dnd`, whose
    HTML5 backend would fight the native drag into Monaco that phase 2 needs. The flatten step is a pure function and
    unit-tested.
12. **Selection mode** lists every layer in index order. Selected layers expand, along with their Transform and Effects
    groups (the first time only; after that the user's choice sticks). They collapse again when deselected, unless the
    user expanded them by hand. Comp mode does no auto-expansion. Pinned layers are phase 3.
13. **Filter = substring or word prefixes.** A plain subsequence was too loose: `rot` matched "AnchoR pOinT". Word
    prefixes keep `ap` → Anchor Point and `accol` → Accent Colour. Only loaded nodes can match, and a group whose name
    matches shows all its loaded children.
14. **Monaco is bundled locally, with workers inlined as blob URLs**, because CEP is offline and serves the panel from
    `file://`. (Since #51 each worker is its own lazily loaded chunk.)
15. **Shortcuts:** the panel calls `registerKeyEventsInterest` for Ctrl/Cmd plus S, Z, Y, F, H, A, C, V, X, D, P and /, with
    the Shift and Alt variants, so AE doesn't take them (Ctrl+S would save the project).
16. **Error line** is a placeholder regex (`line N`) until real AE 2025 error strings are collected (phase 2). The
    squiggle shows only while the code still equals what was applied.
17. **Apply reads errors after evaluating** (`valueAtTime(comp.time)`), so `expressionError` reflects this apply. If
    setting `expression` throws, that message is the error.
18. **The mock simulates syntax errors only**, using acorn, in AE-like wording with `(line N)`.
19. **Testing:** Vitest for units (happy-dom for the store), and Playwright against the mock with the same fixture.
    `vitest.config.ts` is separate because `vite.config.ts` starts the CEP and ExtendScript builds as a side effect.
    `BROWSER_ONLY=true` skips them for the Playwright dev server.
20. **Install = sign CI's panel folder yourself.** CI uploads the unsigned `dist/cep` as `expression-suite-panel`, and
    you sign it with `ZXPSignCmd.exe` and your own certificate, then install with the ZXP/UXP Installer (no Node or
    `regedit` on the work machine). The same certificate every time lets updates install over the old version. The
    optional `zxp.yml` workflow (manual or on tags) signs with a throwaway certificate on Windows. Its `org` has no
    spaces because vite-cep-plugin passes it to ZXPSignCmd unquoted.

## Phase 1 feedback (first AE run)

21. **AE's error text** (AE 2025) reads `Expression Disabled` / `Error at line N in property '…' of layer N ('…') in comp
    '…'.` / `SyntaxError: …`. `parseAeError` pulls out the line, the JS error and whether AE disabled the expression.
    The status bar shows `Line N: SyntaxError: …`, with the full text in its tooltip, and the squiggle carries the JS error.
    The mock now produces exactly this wording, and like AE it switches an erroring expression off.
22. **Apply re-enables.** Because AE switches an erroring expression off, each apply turns it back on in the same undo
    group. If it still fails, AE switches it off again.
23. **New project resets the editor.** The selection hash carries a project generation. The host bumps it when the root
    folder it holds from the previous project goes invalid, or when `app.project.revision` drops (it only rises within a
    project, undo included). On a new generation, the panel closes every tab, drops cached nodes and Monaco models, and
    says so in the status bar. Save As keeps the same root folder and a rising revision, so it doesn't reset. It's
    detected from the project, not from comp ids: a new project reuses ids, so old keys would otherwise point at new
    layers.
24. **Reset button (↺)** in the explorer header closes all tabs (asking first if any have unapplied changes), clears
    errors, cached children and expansion, disposes the Monaco models, and refetches from AE. Status messages also get
    a × to dismiss them.
25. **Racing opens:** a double click fires several opens before AE answers. The store checks again after the fetch, so
    only one tab is created.

## Phase 2: referencing and diagnostics

26. **Auto-apply** (the spec's "Apply on pause") is **on by default**, as asked after the first AE run, with a tab-bar
    toggle remembered per machine. It fires 1 s after the last keystroke, only for a changed, non-empty tab that acorn
    parses. Emptying a field never auto-removes an expression; Ctrl+S still can. Each auto-apply is its own undo step.
27. **One source of syntax errors:** acorn (`ecmaVersion: "latest"`, top-level `return` allowed), checked 200 ms after
    typing stops. Monaco's TypeScript syntax diagnostics are off so errors aren't reported twice. The same check gates
    auto-apply.
28. **References are built in the panel** from the tree's loaded ancestry (`refTargetFor`), relative to the **active
    tab's** layer: same layer → `transform.position` (or `thisLayer(…)` for generic chains), same comp →
    `thisComp.layer("…")`, else `comp("…").layer("…")`. A drag carries the node key, so the reference is computed for
    the tab it lands in. Pick-from-timeline gets the same `RefTarget` from the host (`getSelectedRef`).
29. **Short forms** cover transform, camera and light options, masks, shape contents (the inner "Contents" group is
    implied, as AE writes it), shape transform, text source/animators/selectors, time remap and audio levels. Anything
    else is `("Name")`. A camera's anchor point is `pointOfInterest`.
30. **Alt-drop** only declares the const on line 1, as the spec says, and doesn't also insert the name at the drop
    point. Names: an expression control's single parameter takes the effect's name (`speed`); otherwise the property's
    name, prefixed with the layer if it would shadow an AE name (`ctrlsAnchorPoint`), numbered if already declared.
31. **Ctrl/Cmd+Shift+P** is taken from Monaco's command palette for pick-from-timeline (the spec's default). F1 still
    opens the palette.
32. **Copy** falls back to `execCommand("copy")`, since CEP serves the panel from `file://`, where the async clipboard
    API may be refused.
33. **AE typings** come from `expression-globals-typescript` (MIT, by Tim Haywood): its module is turned into an ambient
    script, and every `Layer` and `Property` member becomes a bare global (`time`, `wiggle`, `loopOut`, `linear`, …),
    plus `thisLayer`, `thisComp`, `thisProject` and `thisProperty`. `value` is declared per tab from the property's
    value type (number, `[x, y]`, `[x, y, z]`, colour, text, path).
34. **The panel owns every drop into the editor.** Monaco's drop-into-editor inserted the dragged text as a snippet,
    which in CEP left a literal `$0` after the reference. It's switched off. The dragged row's key is kept in memory
    from `dragstart` (CEP's browser may drop the custom MIME type), and any other dropped text goes in as plain text.

## Phase 3: context-aware editing

35. **Comp-name completions come from generated typings, not a custom completion provider.** `getCompSchema()` lists
    layers, effects and parameters. `compLib` declares a type per layer whose `effect("Speed")` overload returns a type
    per effect, callable with `("Slider")` and typed by value. TypeScript then lists the names inside the quotes and
    types the result. Generic overloads (`layer(name: string)`) remain, so other names are never an error. `thisLayer`
    and bare `effect` are the edited layer's. Tests run the real TypeScript language service.
36. **The schema is fetched with the tree** (on each selection-hash change), so effects added to an unselected layer
    show up after the next selection change, not instantly.
37. **Value strip** reads `valueAtTime(comp.time, false)` (after the expression). The selection hash now includes the
    comp time, so a moving playhead re-reads the value without refetching the tree, and scrubbing counts as activity
    for the polling rate. The split pane has no strip of its own.
38. **Problems list** scans the whole comp (`findAllExpressions`, at most 20,000 properties), but only while the panel
    is open: on open, on tree changes and after applies. The status bar count is from the last scan.
39. **Pinned layers are remembered by name** in local storage, so a pinned `CTRLS` is pinned in every comp that has
    one. They open with their Effects the first time a comp shows them.
40. **Split view** is one extra pane showing any open tab. Commands, drops and Ctrl+Shift+P act on the editor's own
    tab, and completions follow whichever editor has focus. Both editors share the tab's Monaco model.
41. **"Safe" for auto-apply now includes names.** `checkNames` follows literal references (`thisComp.layer("…")`,
    `.effect("…")`, `("param")`, bare `effect("…")`, `thisLayer`) against the active comp's schema. Unknown names get a
    warning squiggle and block auto-apply. Dynamic references (variables, indices, other comps) aren't checked.

## Phase 4: power features (without the node view)

42. **External change detection** (from the spec's Apply section, built here because rename safety needs it): open
    tabs are re-read with `getProperties` on tree changes and every third poll (about 1 s). If AE's expression equals
    the tab's code, it's adopted silently (this covers an apply landing between reads). A clean tab follows AE. An
    edited tab keeps its edits and gets `external`, a banner with a diff, and no auto-apply until resolved. "Keep mine"
    makes AE's version the baseline, so the edits stay unapplied.
43. **Renames are detected from the comp schema** (layers by id; effects by layer, position and matchName), so mask and
    shape-group renames aren't covered. The offer appears only if references to the old name remain in open tabs or
    in the comp's applied expressions. If AE has already rewritten them itself, nothing is shown. "Update everywhere"
    rewrites the comp's expressions in one undo group, then the open tabs. The rewrite walks the syntax tree, so only
    `layer("…")` and `effect("…")` names in reference positions change, and comments and other strings don't.
44. **One batch host call** (`setExpressions`, one undo group, per-item results) serves both batch apply and reference
    updates. Batch targets are the active tab's matchName path on each selected layer. Layers without that property
    are reported, not errors.
45. **Linked files** go through `bridge/files.ts`: Node's fs in CEP, in-memory with `window.__mockFS` in the browser.
    The file is watched with `fs.watchFile` (250 ms stat polling) rather than `fs.watch`, because editors that save by
    replacing the file break `fs.watch`. A save applies straight away, whatever the auto-apply setting (that's the
    point of the link). An apply in the panel writes the file back. Links last for the session only.
46. **Linking to a file that already has different code** asks whether to load it into the tab (and apply), or
    overwrite it with the tab's code.

## IDE improvements

47. **Ctrl/Cmd-drop** declares `const <layer><property>` and inserts the name at the drop point. Expression controls
    use the effect name for the property (`ctrlsSpeed`); other effect parameters keep both (`titleTextDropShadowOpacity`).
    Alt-drop still names after the property alone and only declares. Both reuse an existing `const x = <same ref>;`, and
    both add new declarations below the single-line declarations already at the top, so they stay in the order added.
48. **Settings** are per machine, in local storage, and sanitised on load. "Follow After Effects" reads
    `appSkinInfo.panelBackgroundColor` and listens for `ThemeColorChanged`. Luminance above 0.5 means light, and AE's own
    grey becomes the panel background. Tab width is pushed to every open model, because it's a per-model option in
    Monaco.
49. **The light theme** uses CSS variables on `:root[data-theme]`; no colours are hard-coded in components, apart from
    the status bar's blue and red, which read in both themes.
50. **Linked files persist per saved project file** (`{ projectPath: { key: file } }`), because keys are made of item and
    layer ids, which are only stable within a project. Unsaved projects keep links for the session; saving carries them
    over. A reopened link never auto-applies a file that changed while AE was closed.
51. **Workers load lazily:** `getWorker` returns a Promise that imports the inline worker chunk on first use. The main
    chunk went from 11.5 MB to 4.3 MB (the 7 MB TypeScript worker loads when the editor first needs it), and the
    production build from about 2 minutes to about 1.
52. **Two drops only:** plain inserts the reference, and Ctrl (Cmd on macOS, and only that key) declares a const named
    after layer + property. Alt-drop (named after the property alone) is gone, as asked after 0.5.0. A drop never
    fails silently: any error inserts the plain reference and reports it in the status bar, and a drop that arrives
    without the dragged row says so. The dragged key is cleared 500 ms after `dragend` rather than at once, in case
    `dragend` is reported before `drop`. When the const and the name land on the same spot (an empty editor), they
    go in as one edit, because Monaco kept only one of two edits at the same point.

