# Expression Suite

After Effects tools for working with expressions, shipped as one CEP extension with a panel per tool.

| Panel | Status | Spec |
| --- | --- | --- |
| **Expression IDE**: a VS Code-style editor for expressions | Phase 1 built; needs an AE test pass | [`docs/SPEC-expression-ide.md`](docs/SPEC-expression-ide.md) |

Choices made along the way are in [`docs/decisions.md`](docs/decisions.md). Behaviour that can only be checked
inside After Effects is listed in [`docs/ae-verification.md`](docs/ae-verification.md).

Targets **After Effects 2025 (25.0) and later** (CEP 12).

## Expression IDE: what works now (phase 1)

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
  step (`Expression IDE: Position`). AE's error is read back to the status bar, the tab and the tree, and squiggles
  the line when AE names one.

The next phase brings referencing (drag from the tree, pick from the timeline, the reference generator), AE typings for
completions, and error line mapping from real AE messages.

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

**Locked-down machine (no admin, no Node):** install the signed ZXP that CI builds. See
[`docs/INSTALL.md`](docs/INSTALL.md). It's a manual copy into your user extensions folder, with no `regedit`.

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
