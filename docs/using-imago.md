# Using Imago in an app

How an app of the suite depends on Imago, what it imports and what it wires. The rules are in
[design-file.md](design-file.md); the window techniques are in [desktop-shell.md](desktop-shell.md). The names that are gone
are the table [Moving from 0.4.1](#7-moving-from-041) at the end.

## 1. Depend on it

The npm package is `@acaprino/imago` and the Rust crate is `imago-shell`. Both come from a release of the repository
`acaprino/imago`, at one version (`imago-check` reports pins that differ: rule `pin-mismatch`). The npm package is the asset of the
release, already built: nothing is compiled when it is installed.

`package.json` of the app, with the peers of the package beside it:

```json
"dependencies": {
  "@acaprino/imago": "https://github.com/acaprino/imago/releases/download/v<x>/acaprino-imago-<x>.tgz",
  "@acaprino/sigrid": "https://github.com/acaprino/sigrid/releases/download/v<y>/acaprino-sigrid-<y>.tgz",
  "@tauri-apps/api": "2.12.4",
  "react": "19.3.1",
  "react-dom": "19.3.1"
}
```

`Cargo.toml` of the app's Tauri crate:

```toml
[dependencies]
imago-shell = { git = "https://github.com/acaprino/imago", tag = "v<x>" }
```

- Sigrid (`^6.9.0`), React 19 and `@tauri-apps/api` are peers: the app has one copy of each. An app that runs only in a browser has
  the last one too: it is loaded only in a window, but its bundler must find it.
- **The app's `tauri` must resolve to exactly 2.12.5.** The crate pins `tauri = "=2.12.5"`, and with it `serde = "=1.0.229"`,
  `serde_json = "=1.0.154"`, `webview2-com = "=0.39.1"`, `windows-core = "=0.62.2"` and `windows-sys = "=0.61.2"`, so that
  the apps of the suite link one copy of each. The app's own `tauri` requirement must allow 2.12.5 (`"2"` and `"2.12"` do,
  `"2.13"` does not). A newer Tauri waits for a release of Imago that raises the pins.
- The package carries `lib/`, its documents under `docs/`, its check under `scripts/check/`, and `icons/`. The demo app
  (`examples/demo/`) and the tests are in the repository only.

## 2. What the package has

| Import | What it is |
|---|---|
| `@acaprino/imago` | The shell (section 3) |
| `@acaprino/imago/icons/<app>/<file>` | The icons of the executables (section 5) |

The parts of a screen are imported from Sigrid: `@acaprino/sigrid/primitives`, `/components`, `/layout` and `/assemblies`.

## 3. The app

```tsx
import { AppWindow, defineApp, startApp, useNotify } from '@acaprino/imago'
import '@acaprino/sigrid/styles.css'

const MURO = defineApp({
  id: 'muro', name: 'Muro', lang: 'en', accent: ACCENT,
  storage: { scheme: 'muro.theme', zoom: 'muro.zoom', sidebar: 'muro.sidebar' },
})

function Muro() {
  const notify = useNotify()
  const [view, setView] = useState('sync')
  return (
    <AppWindow
      views={[{ id: 'sync', label: 'Sync', icon: 'refresh', command: 'Go to Sync' }, { id: 'projects', label: 'Projects', icon: 'structure' }]}
      view={view} onView={setView}
      status={<Status />} footer={<Text>Automatic sync on</Text>} search={find}
    >
      <Screen />
    </AppWindow>
  )
}

startApp(MURO, document.getElementById('app')!, <Muro />)
```

| Export | What it is |
|---|---|
| `defineApp` | The app: `AppDefinition` in, `App` out, which has the `theme` made from the one colour. `words` are the app's language: `words.sigrid` Sigrid's, `words.shell` the shell's (`ShellWords`: among them `glass`, the name of the command of glass, and `toLight` and `toDark`, the names of the switch of the title bar). It refuses an accent that is not `#rrggbb` |
| `startApp` | Puts the look on the page and draws the app in a root, inside the shell. Returns how to take it away. Providers of the app go inside, round its own component |
| `AppWindow` | The window: `AppWindowProps`. `views` are `AppView` (`id`, `label`, `icon`, and, when wanted, `command`, the name of its command, and `count`, the number after its word). Regions: `tools`, `status`, `sidebar`, `inspector`, `actions`, `footer`, and the screen as children. `sidebar` is a function that is given the state of the sidebar (`SidebarState`: its drawer, whether it is collapsed, and the button of that at its head): `(state) => <Sidebar {...state} />`, the same in every view. `hints` are the app's keys in the foot. `search` is what Ctrl+F does, absent where the view has none. The children are the screen, and the app decides what each view mounts: what two views share stays as it is when the view changes, and a screen that must start again has the view as its `key`. `contentLabel` names the content, when the view's label does not |
| `useNotify` | `Notify`: says something in a notice. Its options are those of Sigrid's notice: `kind: 'error'`, `undo`, `actions`, `id`. One with the `id` of another takes its place: it is read again and its time starts again, also when the text is the same, so an app says it when there is something to hear |
| `useWindow` | `WindowHandle`: whether the app runs in a window of its own, its title, the progress on the taskbar, and a call when it is shown again |
| `useGlass` | `Glass`, `[on, set]`: whether the window is glass, and how to make it so or not, for the app's settings (a `SettingRow` with a `Switch`). The palette has the same choice as a command of the look. In a browser it is off and `set` does nothing: an app draws the setting only where `useWindow().own` is true |
| `ScreenBoundary` | What fails while it is drawn says so in its place. When its `of` (what it draws) changes, what failed is drawn again and what did not is kept. `AppWindow` has one round the screen, of the view; an app puts one round an inspector that may fail |
| `useFocusKept` | When one of its arguments changes and what had the focus has gone, the content takes it. `AppWindow` does it for the view; an app with steps of its own passes the step |
| `focusContent` | Gives the focus to the content: after a press whose own control goes away with what it did |

The commands of the app are Sigrid's `useCommand`, in any component. `examples/demo/src` of the repository `acaprino/imago` is a
whole app: views, a list with its details, a form, the notices, a job, a screen that fails.

## 4. The window

The page writes nothing for its window: the shell calls the plugin of `imago-shell` ([desktop-shell.md](desktop-shell.md), section
3.4), and in a browser nothing of Tauri is called or loaded. The program of the app is this, and what it adds of its own:

```rust
use imago_shell::{on_run_event, open_main, plugin, Material, Options, DARK_GROUND, LIGHT_GROUND};

fn main() {
    tauri::Builder::default()
        .plugin(plugin())
        .setup(|app| {
            let options = Options {
                material: Material::Opaque {
                    dark: DARK_GROUND,
                    light: LIGHT_GROUND,
                },
                ..Options::for_app(app)?
            };
            open_main(app.handle(), options)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the app failed to start")
        .run(on_run_event);
}
```

- **`on_run_event` goes to `run`.** When the browser process of the window is lost the window is destroyed and built again, and
  without it that ends the app. An app with a handler of its own calls it there, but not for an exit it prevents.
- The two grounds are those of the look ([design-file.md](design-file.md), "The look"): they show before the page has drawn and at
  the edge of a window that is resized. `Options::for_app` gives them too.
- `glass` in `Options` is the app's default, until the person chooses: off in `Options::for_app`. The window keeps the person's
  choice in its data folder ([desktop-shell.md](desktop-shell.md), section 1.4).
- The window is the one called `main` in `tauri.conf.json`, with `"create": false` and no decorations. Its material, its
  visibility and its place are the crate's.
- A program that does not start says why with `message::tell` ([desktop-shell.md](desktop-shell.md), section 3.2).
- The other fields of `Options`, `show_main` and `single_instance` (one running copy) are in [desktop-shell.md](desktop-shell.md),
  sections 3.1 and 3.2. `examples/demo/src-tauri/src/main.rs` of the repository `acaprino/imago` uses them.

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
`examples/demo/src-tauri/capabilities/default.json` of the repository `acaprino/imago`. The plugin's own commands, `set_theme`, `kept_theme`,
`set_glass`, `kept_glass`, `caption`, `ready` and `chrome`, which the shell sends, are granted by `imago-shell:default`, in a capability beside it (`capabilities/shell.json` of the demo); `tauri.conf.json` lists both. The events `caption-maximize` and `window-shown`, which come back, need the two `core:event` permissions of the nine.

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
The frame is the shell's (AppWindow of @acaprino/imago). Lay out with Sigrid's parts: write no class, no style and no stylesheet.
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
| `src` | The folders of the app's sources, read by every rule. Default `["src"]` |
| `tests` | The folders of the app's tests, which only `removed-name` reads |
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
