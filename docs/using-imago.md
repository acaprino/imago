# Using Imago in an app

How an app of the suite depends on Imago, what it imports and what it wires. The rules are in
[design-file.md](design-file.md); the window techniques are in [desktop-shell.md](desktop-shell.md). The names that are gone
are the table [Moving from 0.4.1](#7-moving-from-041) at the end.

## 1. Depend on it

The npm package is `@acaprino/imago` and the Rust crate is `imago-shell`. Both come from the repository `acaprino/imago`, and
an app pins both to the same tag or the same commit (`imago-check` reports pins that differ: rule `pin-mismatch`).

`package.json` of the app, with the two peers of the package beside it:

```json
"dependencies": {
  "@acaprino/imago": "github:acaprino/imago#v<x>",
  "@acaprino/sigrid": "https://github.com/acaprino/sigrid/releases/download/v<y>/acaprino-sigrid-<y>.tgz",
  "react": "19.3.1",
  "react-dom": "19.3.1"
}
```

`Cargo.toml` of the app's Tauri crate:

```toml
[dependencies]
imago-shell = { git = "https://github.com/acaprino/imago", tag = "v<x>" }
```

- A release of an app, the merge into its `main`, pins a **tag** of Imago: `v<x>`. The app's `develop` may pin a
  **commit** of Imago's `develop`: `github:acaprino/imago#<commit>` in npm, and `rev = "<commit>"` in Cargo.
- Sigrid 6 (`^6.0.0`) and React 19 are peers: the app has one copy of each.
- **The app's `tauri` must resolve to exactly 2.12.5.** The crate pins `tauri = "=2.12.5"`, and with it `serde = "=1.0.229"`,
  `serde_json = "=1.0.154"`, `webview2-com = "=0.39.1"`, `windows-core = "=0.62.2"` and `windows-sys = "=0.61.2"`, so that
  the apps of the suite link one copy of each. The app's own `tauri` requirement must allow 2.12.5 (`"2"` and `"2.12"` do,
  `"2.13"` does not). A newer Tauri waits for a release of Imago that raises the pins.
- A git install runs the package's prepare script, which compiles its TypeScript. The package carries `lib/`, its documents
  under `docs/`, its check under `scripts/check/`, and `icons/`. The demo app (`examples/demo/`) and the tests are in the
  repository only.

## 2. What the package has

| Import | What it is |
|---|---|
| `@acaprino/imago` | The identity of an app: `defineApp` and its type `AppDefinition` |
| `@acaprino/imago/icons/<app>/<file>` | The icons of the executables (section 5) |

Everything that draws is imported from Sigrid: `@acaprino/sigrid/primitives`, `/components`, `/layout`, `/assemblies`, and
`@acaprino/sigrid/tauri` for the window.

## 3. The page

```tsx
import { colorTheme } from '@acaprino/sigrid'
import { applyKeptScheme } from '@acaprino/sigrid/assemblies'
import { defineApp } from '@acaprino/imago'
import '@acaprino/sigrid/styles.css'

const MURO = defineApp({
  id: 'muro',
  name: 'Muro',
  accent: ACCENT,
  storage: { scheme: 'muro.theme', zoom: 'muro.zoom' },
})
const LOOK = {
  theme: colorTheme({ id: MURO.id, label: MURO.name, color: MURO.accent, spot: 'balanced' }),
  storageKey: MURO.storage.scheme,
}
applyKeptScheme(LOOK)
```

`defineApp` takes the id, the name, the one colour and the storage keys the app already has, and gives them back, checked by
their type. The frame, the palette, the notices and the views are Sigrid's parts, put together as
[design-file.md](design-file.md), "The frame", says. `examples/demo/src/main.tsx` of the repository `acaprino/imago` is a
whole page, in a browser and in a window.

## 4. The window

The page's calls are the hooks of `@acaprino/sigrid/tauri`; their order, and the two commands and the event of the native
side, are in [desktop-shell.md](desktop-shell.md), section 3:

```tsx
import { useWindowControls, useSnapLayouts, useWindowTheme, useZoom } from '@acaprino/sigrid/tauri'

const controls = useWindowControls({ onError })
const snap = useSnapLayouts({ command: 'window_caption_maximize', event: 'caption-maximize', onError })
const { zoom } = useZoom({ storageKey: MURO.storage.zoom, onError })
useWindowTheme(scheme, { command: 'set_window_theme', args: (resolved) => ({ theme: choice, resolved }), onError })
```

Tauri 2 lets the page call the window, the webview or an event only when a capability file grants it. The app needs a file in
`src-tauri/capabilities/` with these nine permissions. `windows` lists the label of every window that carries the title bar:

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-is-maximized",
    "core:window:allow-start-dragging",
    "core:window:allow-internal-toggle-maximize",
    "core:webview:allow-set-webview-zoom"
  ]
}
```

What each one is for is in [desktop-shell.md](desktop-shell.md), section 3.5. The working file is
`examples/demo/src-tauri/capabilities/default.json` of the repository `acaprino/imago`. The app's own commands,
`set_window_theme` and `window_caption_maximize`, need no permission of this list.

## 5. The icons of the executables

The package carries one icon for each app, in `@acaprino/imago/icons/<app>/` with `<app>` one of `shinatama`, `xiox`,
`mukade`, `muro` and `daodan`: the app's colour as a rounded square, and the capital initial of its name. Mukade and Muro both
show an M, and no name stands beside an icon on a taskbar: the hue alone tells them apart. `npm run icons` makes the files, so
an app copies them and never draws or recolours its own.

A folder holds `icon.svg` (the source), `16x16.png` to `512x512.png` (16, 24, 32, 48, 64, 128, 256 and 512), `icon.png` (the
512 one), `icon.ico` (16, 24, 32, 48, 64 and 256), `favicon.ico` (16, 32 and 48) and `favicon.svg`.

- **A Tauri app** puts these in its `src-tauri/icons/`: `32x32.png`, `128x128.png`, `128x128@2x.png` (the package's
  `256x256.png`), `icon.png` and `icon.ico`.
- **A command-line program built with a resource file** keeps a copy of `icon.ico` in the app, and its `.rc` points at that
  copy: `1 ICON "icon.ico"`.
- **A page served in a browser** links `favicon.svg` and `favicon.ico`.

`imago-check` reports a copy that is not the package's file, byte for byte (rule `app-icon`).

## 6. For the app's coding agents and its check

Paste this into the app's `AGENTS.md`, and write the path where the package is installed (`node_modules/@acaprino/imago` at the
root of the app, or below the folder it is installed in: the check looks for the written path from the file's folder and from
the root of the repository):

```markdown
Before UI work, read node_modules/@acaprino/imago/docs/design-file.md and the files it references.
Lay out with Sigrid's parts: write no class, no style and no stylesheet.
Run npx imago-check and npx sigrid-check before you say UI work is done.
```

and this into its `CLAUDE.md`:

```markdown
For UI work, apply the design file.

@node_modules/@acaprino/imago/docs/design-file.md
```

`imago-check` reports an agent file that does not name the design file of the installed package by a path that exists (rule
`agent-rules`). It reads the `"imago"` block of the app's `package.json`:

```json
"imago": {
  "src": ["apps/desktop/src"],
  "tests": ["apps/desktop/tests"],
  "cargo": "apps/desktop/src-tauri/Cargo.toml",
  "agents": ["AGENTS.md", "CLAUDE.md"],
  "app": "muro",
  "icons": {
    "apps/desktop/src-tauri/icons/icon.ico": "icon.ico",
    "apps/desktop/src-tauri/icons/128x128@2x.png": "256x256.png"
  }
}
```

| Key | What it is |
|---|---|
| `src` | The folders of the app's sources. Default `["src"]` |
| `tests` | The folders of the app's tests |
| `cargo` | The `Cargo.toml` that depends on `imago-shell`, for `pin-mismatch`. Without it the rule is skipped |
| `agents` | The agent files, for `agent-rules`. Default `["AGENTS.md", "CLAUDE.md"]` |
| `app` | The app's id, one of the folders of the package's `icons/` |
| `icons` | A path in the app, and the file of `icons/<app>/` it must equal, for `app-icon`. Without it the rule is skipped |
| `package` | Where the package is installed. Default `node_modules/@acaprino/imago` |

A rule that is skipped says so. The rules are in [design-file.md](design-file.md), "What a program checks".

## 7. Moving from 0.4.1

Imago's own look is gone, with nothing kept as an alias. Each row is a name, or a family of names (`*` stands for the rest of
the name). `imago-check` reports every one of them (rule `removed-name`).

| Old name | What to write instead |
|---|---|
| `im-*` | A part of Sigrid |
| `data-im-*` | The props of that part |
| `--im-*` | The theme |
| `@acaprino/imago/css/*` | `@acaprino/sigrid/styles.css` |
| `@acaprino/imago/ui` | `@acaprino/sigrid/primitives`, `/components`, `/layout`, `/assemblies` |
| `@acaprino/imago/shell` | `@acaprino/sigrid/tauri` |
| `@acaprino/imago/tauri` | `@acaprino/sigrid/tauri` |
| `@acaprino/imago/graph` | `@acaprino/sigrid/graph` |
| `@acaprino/imago/graph-layout` | `@acaprino/sigrid/graph` |
| `@acaprino/imago/react` | `@acaprino/sigrid/layout` |
| `@acaprino/imago/tokens` | `colorTheme` of `@acaprino/sigrid` |
