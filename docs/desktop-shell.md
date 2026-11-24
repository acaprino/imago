# Desktop shell: the window, native and in the page

How a Tauri 2 window on Windows 11 looks and behaves like a desktop application, and how an app of the suite gets that
from Imago. The native side is the crate `imago-shell`. The page side is the shell of `@acaprino/imago`, on Sigrid's parts
([design-file.md](design-file.md) says who owns what). This file holds the techniques, the reasons and the measurements
behind them.

It comes from Shinatama's `docs/design-system/desktop-shell.md`. The code that Shinatama and Xiox each had per app is the
crate, and an app calls it instead of copying it.

The measurements in section 1 were made by Shinatama on 2026-11-19 with Tauri 2.12.5, tauri-runtime-wry 2.12.3,
tao 0.37.2, wry 0.57.1, window-vibrancy 0.8.1 and WebView2 on Windows 11 Home 10.0.26200. The crate pins
`tauri = "=2.12.5"`. What has been run on a real window with Imago itself, and what has not, is in
[verification.md](verification.md). A statement here that `verification.md` does not list as run is a statement
from Shinatama's work or from reading the code.

## 1. The material of the window

### 1.1 What Windows paints

`Material` says what the main window is made of. Either way it has no decorations (the HTML title bar is the frame), a
minimum width of 500 or the app's own if larger (the snap zones need it), and the theme it had last time (1.2).

- `Material::Opaque` is one colour for each theme, the ground the page draws there. It shows before the page has drawn,
  while it is reloaded and at the edge of a window that is resized. It is the material of the suite, whose page is opaque:
  its two grounds are `DARK_GROUND` and `LIGHT_GROUND` of the crate.
- `Material::Acrylic` is a transparent window with the background colour `#00000000`, so there is no white flash before
  the page draws, and Windows' acrylic behind it.

Facts about the material:

- On Windows 11 22H2 and later the acrylic is the DWM system backdrop `DWMSBT_TRANSIENTWINDOW`. That material is the
  system's own: **it ignores the tint colour of `windowEffects`** and follows only the window's light or dark theme.
  The tint reaches only Windows 10 (and the first Windows 11, 21H2), where the legacy `SetWindowCompositionAttribute`
  path is used (and is slow to drag).
- There the acrylic has no colour but the tint, so the tint follows the theme the page draws, which the page sends with
  the window theme (1.2): `#0C111D` and an alpha of 204 in dark, `#F6F7F9` and 224 in light. The first frame keeps the
  tint of the app's own config, until the page's first `set_theme`. On Windows 11 22H2 and later nothing changes:
  setting the effect again sets the backdrop the window already has, and that backdrop takes no tint.
- The acrylic is a blur of what is behind the window, with a nearly fixed luminosity. Measured from the screen
  (0 to 255): light acrylic about **143 over a dark window and 226 over a white one**; dark acrylic about **84 over a
  dark window**. A light acrylic over dark content is therefore a mid grey, and a dark one over bright content a
  lighter grey.
- Windows drops the material (a solid fallback) when the window is inactive, in battery saver, with transparency off
  in Settings, and in high contrast. The page cannot detect most of these states.

### 1.2 The window theme follows the page

The theme of the window decides its material, the frame Windows draws and the colour scheme of WebView2. It is the
person's choice: `light`, `dark` or `system`.

1. The page sends the choice as `theme` and the scheme it draws (`light` or `dark`, never `system`) as `resolved`, when
   either changes. The shell of `@acaprino/imago` does it (section 3.4).
2. The plugin's command `set_theme` (3.3) takes the word, and refuses one that is not `light`, `dark` or `system`. It sets
   the window's theme, then the colour of its material for the theme drawn (`Material::Opaque`) or the tint of 1.1
   (`Material::Acrylic`), and keeps the bare word in `window-theme` in the app's data folder, whole or not at all.
3. At the next start the window is built with that theme, so the **first frame** already has it. A window built again
   after a WebView2 crash gets it too.
4. With nothing saved (a fresh install) the window follows Windows until the page has spoken. The page then says dark, which is
   what an app of the suite draws until the person chooses.
5. The word in `window-theme` is the choice, and the page asks for it (`kept_theme`, 3.3) before it draws and takes it over its
   own. The page's own copy is in the browser's storage, which WebView2 writes to the disk some seconds later: when its
   processes die, a choice made just before is lost there, and not in `window-theme`.

`set_theme` reaches DWM through tao, and tauri-runtime-wry passes the new theme to WebView2's
`PreferredColorScheme`. The JavaScript `setTheme()` would need `core:window:allow-set-theme` and cannot save the choice
for the first frame. The calls the page makes on the window
itself (minimize, maximize, close, drag, zoom, listening to an event) do need permissions: see section 3.5.

### 1.3 How to check it on screen

A webview screenshot does not show what Windows composes. Photograph the real window from the screen. Imago's demo app
(`examples/demo` of the repository `acaprino/imago`) is a small app on the shell in a real window, and `npm run capture` copies
it from the screen in both themes over a dark and a bright window. The demo is never built on a developer's machine: the
`demo` job of the Verify workflow builds it and keeps it as the artifact `imago-demo`. Run `npm run demo:fetch` first,
which downloads the artifact of the latest successful run of a push to `develop` to `examples/demo/app/` (never one of a
pull request, because the capture starts the program and clicks it), says which commit built it and warns when that is
not the checkout's `HEAD`, then `npm run capture`. (`npm run demo` starts it in development and is for a machine where
Rust may be built.) Shinatama's method still holds:

- Raise the window once (topmost) and keep it there for every capture of a run. A window lowered between captures
  ends up behind the window in use.
- Discard a capture whose title bar pixel is not the app's: it photographed the window in front.
- Switch the theme through the page, not by reloading.

## 2. The window: Tauri techniques

| Behaviour | How | Where |
|---|---|---|
| No white flash | The window is hidden until the page has drawn, and has the ground of its theme (1.1) | `open_main`, `Material` |
| Windows built after the app state | `"create": false` in the window's config, opened in `setup` once every service is managed | `open_main` in the app's `main.rs` |
| HTML title bar with Snap Layouts | No decorations. A child window that never paints lies over the HTML maximize button and answers `HTMAXBUTTON`; the page reports the button's rectangle | the plugin (`caption`); `useSnapLayouts` and `WindowControls` of Sigrid |
| Dragging | `data-tauri-drag-region` on each element that should drag. Tauri starts a drag only when the pressed element itself carries the attribute; Sigrid's `TitleBar` hands it to its toolbar, its title and its spacers, and leaves buttons, tabs and fields unmarked, so they take their clicks. Needs the permissions of section 3.5 | `DRAG_REGION` of Sigrid, which the shell gives to `TitleBar` as `dragProps` |
| Snap zones | A minimum width of 500 | `open_main` |
| Not a web page | Navigation limited to the app's own origin; new windows refused; browser accelerators off and the engine's context menu trimmed to editing in a release build; browser keys, the page menu and the mouse's back and forward buttons refused in the page | `open_main`, `Origins`; `useDesktopGuard` of Sigrid |
| Reload when hung | A "Reload interface" item in the window menu (Alt+Space) | `open_main` (`reload_label`, `before_reload`) |
| WebView2 crash | A page reloaded at most three times a minute; a lost browser process rebuilds the window; nothing is done while the app closes | `open_main`, `on_run_event` (see section 4) |
| Chrome versus content | Chrome is not selectable and keeps the arrow cursor; fields, the content and what carries `data-selectable` are selectable | `AppShell` of Sigrid with `desktop` |
| Zoom | `Ctrl+=`, `Ctrl+-`, `Ctrl+0` and `Ctrl`+wheel, 50 to 200%, saved per machine | `useZoom` of Sigrid |
| Theme | The window theme from the person's choice, saved for the first frame (1.2), and the colour of the material (1.1) | the shell (section 3.4), the plugin (`set_theme`), `Material` |
| Place of the window | The position, size and maximized state are saved, and brought back inside the monitors there are now | `open_main` |

The place of the window is Xiox's, moved into the shell: `window.json` in the data folder with the fields `x`, `y`,
`width`, `height` and `maximized`, in physical pixels, read as Xiox wrote it. A window that is minimized reports the
position (-32000, -32000) and a size of 0, so what is saved is the last place it had while it was neither maximized nor
minimized. A saved place comes back inside the work area of the monitor that holds its corner, at least the minimum
times that monitor's scale; a corner on no monitor takes the primary one. A window with no saved place opens as its
config says, inside the work area.

## 3. The wiring of an app, in order

The crate is a Tauri plugin that opens the main window of an app and watches it. The demo's `main.rs`
(`examples/demo/src-tauri/src/main.rs` of the repository `acaprino/imago`) is the whole of what an app writes in Rust.
[using-imago.md](using-imago.md) has the page's side.

### 3.1 Rust

1. `imago_shell::plugin()` on the app's builder (`plugin`).
2. In `setup`, `open_main(app.handle(), options)`. The window is the one called `main` in `tauri.conf.json`, with
   `"create": false`.
3. `on_run_event` given to `run`. An app with a handler of its own calls it there, but not for an `ExitRequested` it
   prevents. Without it a rebuild of the window ends the application.

`Options::for_app` gives the defaults of `Options`:

| Field | What it is | Default |
|---|---|---|
| `window` | The window's config: title, size, minimum, first page. The window is made with `WebviewWindowBuilder::from_config`, so the fields the crate does not set (`dragDropEnabled`, `center`) hold as the app wrote them | The window `main` of the app's config |
| `data_dir` | Where the theme and the place are kept; with none, neither is | The app's data folder |
| `material` | `Material` (1.1) | `Material::Acrylic` |
| `origins` | `Origins`: what the window may show besides its embedded page. Clones share one list, and `Origins::allow` adds to it also after the window is open | None, and the dev server in development |
| `background` | Started with Windows: hidden until `show_main` | No |
| `reload_label`, `stopped_message`, `lost_message` | The reload item of the window menu, the question when reloading did not help, and what is said when the window cannot be built again (the app then ends) | English |
| `before_reload` | Called before each reload, on a thread that may wait: the app saves what it must and answers whether to reload. It is given the `ProcessFailure`, or none when the person asked for the reload | Reload |

`open_main` does the rest: the window hidden until the page has drawn (shown anyway after three seconds), the navigation
guard, Snap Layouts, the reload item, the recovery of section 4, and, in a release build, the browser accelerators off
and the engine's context menu trimmed. That menu keeps the editing commands (emoji, undo, redo, cut, copy, paste, paste
as plain text, select all), a separator only between two of them, and is not shown when nothing is left; where it opens
is the page's own guard (3.4).

`show_main` brings the window to the front, from the notification area or because the app was started again.

### 3.2 One running copy

`single_instance::launch` takes the data folder and whether this is a background start, and answers with a `Launch`:
`Launch::First` with the `Instance` whose `on_raise` is called each time the app is started again, `Launch::Running`
(the copy that runs was asked to show its window: end), or `Launch::Closing` (one is still quitting after five
seconds). An app that quits slowly holds `Quitting::mark` meanwhile, so that a new start waits for it.

### 3.3 Between the page and Rust

| What | Name | Direction |
|---|---|---|
| The window theme | `plugin:imago-shell\|set_theme`, `theme` (`light`, `dark` or `system`, the choice) and, optional, `resolved` (`light` or `dark`, the theme drawn). A page that sends no `resolved` draws its word's own, and dark for `system` | page to Rust. The window takes the theme and its material's colour, and keeps the choice (1.2) |
| The theme kept | `plugin:imago-shell\|kept_theme`, no arguments | page to Rust. The answer is the choice in `window-theme`, or null when there is none (1.2) |
| The maximize button's rectangle | `plugin:imago-shell\|caption`, `x`, `y`, `width`, `height` | page to Rust. The numbers go to the overlay unchanged |
| The first frame | `plugin:imago-shell\|ready`, no arguments | page to Rust. The page has drawn: the window is shown |
| The title and the taskbar | `plugin:imago-shell\|chrome`, `title` and `progress` (a whole number from 0 to 100, or null), always both | page to Rust. A job that ends while the window is not in front asks for attention |
| Hover and press of the maximize button | the event `caption-maximize`, payload `{ hover, pressed }`, sent at every change and again at every `caption` | Rust to page. Listening needs `core:event:allow-listen` and `core:event:allow-unlisten` (section 3.5) |
| The window came back | the event `window-shown`, sent by `show_main`: WebView2 gives the page no focus event for that | Rust to page |

Only the main window has the commands. They run off the window's thread, so two sent together have no fixed order: a page
that sends one again waits for the answer to the one before.

The page sends the rectangle as `getBoundingClientRect()` times `devicePixelRatio`, rounded. The zoom of the page
and the monitor's scale are both part of `devicePixelRatio`, so the numbers are already physical pixels of the
client area, which is the coordinate system of the child window. The command multiplies by nothing. A rectangle of
all zeros, or a negative size, hides the overlay: the page sends it when the title bar is hidden.

`useSnapLayouts` reads it as `pressed` when `pressed` is true, else `hover` when `hover` is true, else neither, and gives
it to `WindowControls` as `maximizeState`.

The state comes again with every rectangle because a page may draw its title bar anew: a page
that was mounted while the pointer rested on the button has seen no event, and the rectangle it sends tells it. A
hover begins only when Windows has accepted the request to say when the pointer leaves, and it ends with that
message or when the rectangle is empty (the overlay hidden), which also ends a press that began on the button.

### 3.4 The page, in order

The shell of `@acaprino/imago` does it; an app writes none of it.

1. Before React draws: the density, the kept scheme and the theme. In a window `kept_theme` is asked, and the choice it answers is
   the page's; with none there the one of the browser's storage is, and with none at all dark. When the call fails the page
   draws the one of its storage, and sends no `set_theme` until the person chooses.
2. In a window, outside development: the browser's own keys and menu taken away (`useDesktopGuard` of Sigrid).
3. The first frame drawn, `ready`, once: after two animation frames, or after 250 ms, since a hidden window may run none.
4. `set_theme`: the choice and the scheme drawn, when either changes.
5. The title bar drawn, `caption`, by `useSnapLayouts`; `caption-maximize` comes back.
6. `useWindowControls` and `useZoom` of Sigrid for the buttons and the zoom.
7. `chrome`: the title and the progress, from the first time the app sets one; `window-shown` comes back.

`set_theme` and `chrome` go one at a time: the next is sent when the one before has answered, and of those that came meanwhile only
the last. A button or the zoom that fails is said in a notice; a failure of the rest is written in the console. In a browser nothing
of Tauri is called or loaded.

### 3.5 The capabilities

Tauri 2 refuses every call of the page on the window, the webview or an event until a capability file allows it. The
wiring of this document needs nine permissions, for the label of every window that carries the title bar. One row
serves a part of the wiring that an app can leave out, and says so:

| Permission | What needs it |
|---|---|
| `core:window:allow-minimize`, `core:window:allow-close` | The window buttons: `win.minimize()` and `win.close()` |
| `core:window:allow-toggle-maximize` | The maximize button: `win.toggleMaximize()` |
| `core:window:allow-is-maximized` | `useWindowControls`: the button's icon and name follow the window's state, read when the window is resized |
| `core:window:allow-start-dragging`, `core:window:allow-internal-toggle-maximize` | Only with drag regions (section 2): a press on one drags the window, and a double click on one maximizes it. A title bar with no `data-tauri-drag-region` needs neither |
| `core:webview:allow-set-webview-zoom` | `useZoom` |
| `core:event:allow-listen`, `core:event:allow-unlisten` | The events `caption-maximize` and `window-shown`, the resize events, and the function that stops listening |

A call the capability does not allow is a rejected promise. Sigrid's hooks pass it to their `onError`, and a refused zoom
goes back to the level it had; a refused drag leaves the window where it is, and nobody is told.

The five commands of the plugin are granted by `imago-shell:default`, in a capability beside it
(`examples/demo/src-tauri/capabilities/shell.json`). A page that is not embedded in the app (a server on
`http://127.0.0.1`) is refused every command until a capability names it, the plugin's and Tauri's own alike:
`"remote": { "urls": ["http://127.0.0.1:*"] }` is any port of that address and no other host. A capability may also be
added once the port is known. The guard is a second lock: the window goes only to the origins in `origins`.

The file with the nine is
`examples/demo/src-tauri/capabilities/default.json` of the repository `acaprino/imago` (it is not in the npm package); it grants these nine and nothing else, and its `windows` names
the label `main`. [using-imago.md](using-imago.md), section 4, shows the file's shape.

## 4. WebView2 recovery

A window never stays an empty shell: a lost render process leaves a window with nothing in it that takes no input. What
failed is a `ProcessFailure`.

| Failure | What is done | Counted against three reloads a minute |
|---|---|---|
| `ProcessFailure::Browser` (the browser process exited: every webview of the app is dead) | The window is built again | No |
| `ProcessFailure::Renderer` (the render process exited) | The page is reloaded, or the person is asked when it already reloaded three times in the last minute | Yes |
| `ProcessFailure::NotLoaded` (the page failed to load; WebView2's status is kept) | The same, after one second. Nothing while the window is built again | Yes |
| `ProcessFailure::Unresponsive` (the render process stopped responding) | The person is asked: it may be busy, not dead, so there is no automatic reload | No |
| `ProcessFailure::Other` (GPU, utility, a frame of the page) | Nothing: WebView2 restarts those itself | No |

- Before each reload `before_reload` is called with the failure. The person is asked by a native message, over the window; a
  yes starts the count again. A window the app keeps hidden is not asked about.
- A navigation that was cancelled (the guard refused it, or a newer one replaced it) is not a failure. WebView2's built-in
  error page is off: it has no way back into the app.
- The window is built again where it was, on the page it went to last, hidden until that page has drawn. While it is, an
  exit with no code is prevented and no place is saved. When it cannot be built, the app says why and ends.
- Closing the application ends its WebView2 processes too, and WebView2 reports them as failed: that is not a failure to
  recover from. A failure is acted on half a second after it is reported, and not at all once `on_run_event` was told of
  an exit or of the end of the window. An app may prevent a close or an exit: it passes on no exit it prevented.

## 5. Native-feeling components

They are Sigrid's. None may use `showModal()`: it makes the custom title bar inert and leaves a borderless window that
cannot be moved, minimized or closed. `AppShell` with `desktop` opens every dialog, sheet and menu under the title bar.
Shinatama's attention widget (a separate transparent, always-on-top window without effects that never takes focus) is its
own and is not in the package.

## 6. Reusing it in another app

[using-imago.md](using-imago.md) says how an app depends on the package. For the window in short:

1. Depend on the package (`@acaprino/imago` and `imago-shell`) at one version. The crate pins `tauri = "=2.12.5"`, and
   `serde`, `serde_json`, `webview2-com` and `windows-core` exactly too (the versions Shinatama's lock resolves, so the
   apps of the suite link one copy of each): the app's `tauri` must resolve to exactly 2.12.5, and an app that asks for a
   newer one does not build until the crate moves.
2. Open the window with the plugin (section 3.1) and grant its commands (section 3.5).
3. Draw the app with the shell (section 3.4).
4. Check the result with a screen capture (section 1.3) in each theme, over a dark and a bright window.

## 7. What is not verified on a real window

[verification.md](verification.md) lists what has been run on a real window, and what has not. Targets other than Windows compile the same names to no-ops that have been read, not built.
