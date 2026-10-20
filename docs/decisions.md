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
    `file://`. The cost is an 11.5 MB main chunk and a ~2 minute production build. Revisit if load time in AE is noticeable
    (try file-URL workers in CEP).
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

