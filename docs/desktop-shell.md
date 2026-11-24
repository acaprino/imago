# Desktop shell: the window, native and in the page

How a Tauri 2 window on Windows 11 looks and behaves like a desktop application, and how an app of the suite gets that
from Imago. The native side is the crate `imago-shell`. The page side is Sigrid's: the parts of `@acaprino/sigrid/layout`
and the hooks of `@acaprino/sigrid/tauri` ([design-file.md](design-file.md) says who owns what). This file holds the
techniques, the reasons and the measurements behind them.

It comes from Shinatama's `docs/design-system/desktop-shell.md`. The code that Shinatama and Xiox each had per app is the
crate, and an app calls it instead of copying it.

The measurements in section 1 were made by Shinatama on 2026-11-19 with Tauri 2.12.5, tauri-runtime-wry 2.12.3,
tao 0.37.2, wry 0.57.1, window-vibrancy 0.8.1 and WebView2 on Windows 11 Home 10.0.26200. The crate pins
`tauri = "=2.12.5"`. What has been run on a real window with Imago itself, and what has not, is in
[verification.md](verification.md). A statement here that `verification.md` does not list as run is a statement
from Shinatama's work or from reading the code.

## 1. The material of the window

### 1.1 What Windows paints

The main window is transparent and asks for the acrylic effect. `glass_window_config(base, saved)` takes the app's
own window config (label, size, URL) and returns it with:

- `transparent` on and the background colour `#00000000`, so there is no white flash before the page draws;
- the acrylic effect;
- no decorations: the HTML title bar is the frame;
- a minimum width of 500, or the app's own if larger: the snap zones need it;
- the theme of `saved` (see 1.2).

Facts about the material:

- On Windows 11 22H2 and later the acrylic is the DWM system backdrop `DWMSBT_TRANSIENTWINDOW`. That material is the
  system's own: **it ignores the tint colour of `windowEffects`** and follows only the window's light or dark theme.
  The tint reaches only Windows 10 (and the first Windows 11, 21H2), where the legacy `SetWindowCompositionAttribute`
  path is used (and is slow to drag).
- There the acrylic has no colour but the tint, so the tint follows the look and the theme the page draws, which the
  page sends with the window theme (1.2). `apply_theme` sets it: `acrylic_tint(look, theme)` is the ground of the look
  under glass, with its alpha as a byte: Smooth dark `#0C111D` and 204, Smooth light
  `#F6F7F9` and 224, ONI dark `#0B0416` and 219, ONI light `#E9EEF8` and 230. A window on Windows 10 is then light
  under a light look and dark under a dark one. Under the theme `system` the tint follows a change of Windows' colours
  only when the page sends the theme it draws again at that change, as Sigrid's `useWindowTheme` does. The first frame
  keeps the tint of the app's own config, which
  `glass_window_config` leaves as it is, until the page's first `set_window_theme`. On Windows 11 22H2 and later
  nothing changes: setting the effect again sets the backdrop the window already has (the call Tauri made when it
  built the window), and that backdrop takes no tint.
- The acrylic is a blur of what is behind the window, with a nearly fixed luminosity. Measured from the screen
  (0 to 255): light acrylic about **143 over a dark window and 226 over a white one**; dark acrylic about **84 over a
  dark window**. A light acrylic over dark content is therefore a mid grey, and a dark one over bright content a
  lighter grey.
- Windows drops the material (a solid fallback) when the window is inactive, in battery saver, with transparency off
  in Settings, and in high contrast. The page cannot detect most of these states.
- Sigrid's surfaces are opaque and cover the window, so the material is seen only before the page draws. The demo, whose
  page is Sigrid's, shows no glass.

### 1.2 The window theme follows the page

The theme of the window decides the acrylic, the frame Windows draws and the colour scheme of WebView2. It is the
person's choice: `light`, `dark` or `system`.

`WindowTheme` is the Rust type of that word: `Light`, `Dark` or `System`. `Look` is the Rust type of the page's look,
`Look::Smooth` or `Look::Oni`, read by `parse_look` (`oni` is ONI, any other word Smooth): it decides the tint of 1.1
and nothing else. The path of the word:

1. The page sends the choice as `theme` and the scheme it draws (`light` or `dark`, never `system`) as `resolved`, with
   Sigrid's `useWindowTheme` and its option `command`. The hook sends when the scheme drawn changes: a choice that leaves
   it as it was is not sent.
2. The app's command `set_window_theme` calls `parse_theme` (a word that is not `light`, `dark` or `system` is
   refused) and `drawn_by_page` for the look and the theme drawn (a page that sends neither, an older one, is Smooth
   in the word's own theme, and dark for `system`), then `apply_theme(window, theme, look, resolved)` (Tauri's
   `set_theme`, which reaches DWM and WebView2's colour scheme, then the tint of 1.1), then `save_theme`, which writes
   the bare word to `window-theme` in the app's data folder, whole or not at all. `apply_theme` also gives the window
   the acrylic effect, so it is called on the glass window only, the one built with `glass_window_config`.
3. At the next start the app reads `saved_theme` before it builds the window and hands it to
   `glass_window_config`, so the **first frame** already has the right acrylic. A window built again after a
   WebView2 crash gets it too.
4. With nothing saved (a fresh install) the window follows Windows, which matches the default theme.

`set_theme` reaches DWM through tao, and tauri-runtime-wry passes the new theme to WebView2's
`PreferredColorScheme`. A custom app command needs no extra capability; the JavaScript `setTheme()` would need
`core:window:allow-set-theme` and cannot save the choice for the first frame. The calls the page makes on the window
itself (minimize, maximize, close, drag, zoom, listening to an event) do need permissions: see section 3.5.

### 1.3 How to check it on screen

A webview screenshot does not show what Windows composes. Photograph the real window from the screen. Imago's demo app
(`examples/demo` of the repository `acaprino/imago`) is a page on Sigrid in a real window, and `npm run capture` copies it
from the screen in both themes over a dark and a bright window. The demo is never built on a developer's machine: the
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
| No white flash | Transparent window, clear background; wry gives WebView2 a transparent default background | `glass_window_config` |
| Windows built after the app state | `"create": false` in the window's config, built in `setup` once every service is managed | the app's `main.rs` |
| HTML title bar with Snap Layouts | No decorations. A child window that never paints lies over the HTML maximize button and answers `HTMAXBUTTON`; the page reports the button's rectangle | `install_snap_layouts`, `SnapLayouts::set_rect`; `useSnapLayouts` and `WindowControls` of Sigrid |
| Dragging | `data-tauri-drag-region` on each element that should drag. Tauri starts a drag only when the pressed element itself carries the attribute; Sigrid's `TitleBar` hands it to its toolbar, its title and its spacers, and leaves buttons, tabs and fields unmarked, so they take their clicks. Needs the permissions of section 3.5 | `DRAG_REGION` of Sigrid, given to `TitleBar` as `dragProps` |
| Snap zones | A minimum width of 500 | `glass_window_config` |
| Not a web page | Navigation limited to the app's own origin; new windows refused; browser accelerators off and the engine's context menu trimmed to editing in a release build; browser keys, the page menu and the mouse's back and forward buttons refused in the page | `guard_navigation`, `disable_browser_accelerators`, `trim_context_menu`; `useDesktopGuard` of Sigrid |
| Reload when hung | A "Reload interface" item in the window menu (Alt+Space) | `install_reload_menu` |
| WebView2 crash | A page reloaded at most three times a minute; a lost browser process rebuilds the windows; nothing is done while the app closes | `watch_process_failures`, `recovery_action`, `Recovery` (see section 4) |
| Chrome versus content | Chrome is not selectable and keeps the arrow cursor; fields, the content and what carries `data-selectable` are selectable | `AppShell` of Sigrid with `desktop` |
| Zoom | `Ctrl+=`, `Ctrl+-`, `Ctrl+0` and `Ctrl`+wheel, 50 to 200%, saved per machine | `useZoom` of Sigrid |
| Theme | The window theme from the person's choice, saved for the first frame (1.2), and the tint of the acrylic for Windows 10 (1.1) | `useWindowTheme` of Sigrid, `parse_theme`, `drawn_by_page`, `apply_theme`, `acrylic_tint`, `Look`, `save_theme`, `saved_theme` |
| Place of the window | The pieces to save the position, size and maximized state and to bring them back inside the monitors there are now. The crate gives the pieces and the app wires them, as the paragraph below says; the demo does not | `load_state`, `save_state`, `state_to_save`, `clamp_to_monitors`, `clamp_to_screens` |

The place of the window is Xiox's, moved into the shell. Xiox saves it in `window.json` in the data folder with the
fields `x`, `y`, `width`, `height` and `maximized`, and the crate reads that file as it is. `WindowState` is that
record, `Rect` a rectangle in physical pixels and `Screen` a monitor with its work area. A window that was minimized
reports the position (-32000, -32000) and a size of 0: `state_to_save` keeps the last normal state instead, and
`load_state` gives back what the file holds, so the app always passes it through `clamp_to_screens` before it uses
it. Pass the primary monitor first: a window whose corner is on no monitor goes to the first.

The crate does not watch the window: the app does the wiring. At start it reads the monitors (the primary first, with
their work areas and the minimum multiplied by the monitor's scale, all in physical pixels), passes the loaded state
through `clamp_to_screens` and applies the position, the size and the maximized state when it builds the window. While
the window lives it keeps the last state it saw while the window was neither maximized nor minimized (from the move
and resize events), and when the window closes it passes that, the two flags and a way to measure the window to
`state_to_save`, and gives the result to `save_state`. The demo app (`examples/demo`) wires none of this: it never
reads or saves the place of its window, so the place of the window has not been run on a real window, and
[verification.md](verification.md) lists it as not run. The crate's own tests cover the arithmetic and the file.

## 3. The wiring of an app, in order

The Rust side and the page side, each in the order that works. The demo app (`examples/demo`) is the executable
example.

### 3.1 Rust, once at start

1. Read `saved_theme` and `load_state` from the data folder. Pass the state through `clamp_to_screens`.
2. Build the window config for the glass: `glass_window_config(base, saved)`.
3. Make the builder from that config (`WebviewWindowBuilder::from_config`), then `guard_navigation_with_scheme(builder, origins, config.use_https_scheme)`
   with the dev server's origin in a development build and none in a release build, then `build()`.

### 3.2 Rust, for each window, right after it is built

A window built again after a lost browser process goes through this again.

1. `disable_browser_accelerators(&window)` and `trim_context_menu(&window)` in a release build only: a development
   build keeps the engine's own reload and DevTools keys and its whole context menu (Inspect). That is the Rust side.
   `trim_context_menu` decides what WebView2's own menu holds when it opens: the editing commands (emoji, undo, redo,
   cut, copy, paste, paste as plain text, select all), a separator only between two of them, and no menu at all when
   nothing is left. The page's guard (section 3.4) decides where the menu opens: it refuses it outside fields and the
   places the app names. It also refuses the browser's own keys (reload, the developer tools) in every build, so an app
   turns it on only outside development.
2. `watch_process_failures(&window, handler)`. The handler calls `recovery_action` (section 4).
3. `install_snap_layouts(&window)`, and keep the `SnapLayouts` it returns **per window label**, replacing the entry
   when the window is rebuilt. A `Mutex<HashMap<String, SnapLayouts>>` in the app's state does it. Tauri's `manage`
   does not: it does nothing when the type is already managed, so the first window's overlay would stay and the
   rebuilt window's would be dropped.
4. `install_reload_menu(&window, "Reload interface", on_reload)`. The app words the label and decides what a reload
   is. `on_reload` runs on a thread of its own, because the window's thread may be the one waiting for a hung page.

Each window also needs its own `Recovery`, kept per label and across rebuilds; a window opened anew, not rebuilt, gets a
new one (`Recovery::new`), also under a label used before. When an exit begins that the app does not prevent, and when
one window closes for good, the app calls `Recovery::close` on the `Recovery` of those windows (section 4).

### 3.3 Between the page and Rust

| What | Name | Direction |
|---|---|---|
| The window theme | the command `set_window_theme(theme: String, look: Option<String>, resolved: Option<String>)` | page to Rust. The app registers it: the crate has no command of its own. `theme` is the person's choice and `resolved` the theme the page draws, `light` or `dark`, for the tint of 1.1; `look` is for a page with the looks of v0.4, and Sigrid's has none. `drawn_by_page` reads the two, and gives a page that sends neither Smooth in the word's own theme, dark for `system` |
| The maximize button's rectangle | the command `window_caption_maximize(window, x, y, width, height)` | page to Rust. It finds the window's `SnapLayouts` by `window.label()` and calls `set_rect` with the four numbers unchanged |
| Hover and press of the maximize button | the event `caption-maximize`, payload `{ hover, pressed }`, sent with `emit_to` to the window that owns the overlay, at every change and again at every `window_caption_maximize` | Rust to page. Listening needs `core:event:allow-listen` and `core:event:allow-unlisten` (section 3.5) |

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

1. `applyKeptScheme` before React renders, so that the first paint has the person's scheme.
2. `useDesktopGuard`, outside development only (section 3.2, step 1).
3. `useWindowControls` and `useSnapLayouts`, whose results are the props of `WindowControls`: the second takes the names
   of section 3.3, `{ command: 'window_caption_maximize', event: 'caption-maximize' }`.
4. `useZoom`, with the storage key of the app.
5. `useWindowTheme`, with `command: 'set_window_theme'` and the scheme `useSchemeCommands` draws.

The hooks of 3 to 5 take `onError`, which is told of a call that was refused or failed. In a browser they call and load nothing of
Tauri. `examples/demo/src/main.tsx` of the repository `acaprino/imago` is the page that does it.

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
| `core:event:allow-listen`, `core:event:allow-unlisten` | The event `caption-maximize`, the resize events, and the function that stops listening |

A call the capability does not allow is a rejected promise. Sigrid's hooks pass it to their `onError`, and a refused zoom
goes back to the level it had; a refused drag leaves the window where it is, and nobody is told.

The app's own commands (`set_window_theme`, `window_caption_maximize`) are not on this list. The file that works is
`examples/demo/src-tauri/capabilities/default.json` of the repository `acaprino/imago` (it is not in the npm package); it grants these nine and nothing else, and its `windows` names
the label `main`. [using-imago.md](using-imago.md), section 4, shows the file's shape.

## 4. WebView2 recovery

`watch_process_failures` reports what failed as a `ProcessFailure`. `recovery_action(failure, &mut recovery, now,
rebuilding)` answers with a `RecoveryAction`. A window never stays an empty shell: a lost render process leaves a
transparent window with nothing in it that takes no input.

| Failure | Action | Counted against three reloads a minute |
|---|---|---|
| `ProcessFailure::Browser` (the browser process exited: every webview of the app is dead) | `RecoveryAction::Rebuild` | No |
| `ProcessFailure::Renderer` (this window's render process exited) | `Reload`, or `GiveUp` when the window already reloaded three times in the last minute | Yes |
| `ProcessFailure::NotLoaded` (the page failed to load; WebView2's status is kept) | The same as `Renderer`, after `ProcessFailure::reload_delay` (one second). `Ignore` while the app is rebuilding | Yes |
| `ProcessFailure::Unresponsive` (the render process stopped responding) | `GiveUp`: it may be busy, not dead, so there is no automatic reload | No |
| `ProcessFailure::Other` (GPU, utility, a frame of the page) | `Ignore`: WebView2 restarts those itself | No |

- A navigation that was cancelled (the guard refused it, or a newer one replaced it) is not a failure.
- `GiveUp` means the main window asks the person. Other windows stay as they are until the main one is built again.
  If the person says yes, the app calls `Recovery::reset` and reloads.
- `watch_process_failures` also turns WebView2's built-in error page off: it has no way back into the app.
- `on_failure` runs on a thread of its own for every report, never inside WebView2's callback, so it may destroy
  windows, build them, ask the person and sleep.

### While the application closes

Closing the application ends its WebView2 processes too, and WebView2 reports them as failed: that is not a failure
to recover from. That is what Xiox found with its one window, and why it ignores every failure once its exit or the
close of its window begins. A window closed while the application goes on is the same case for that window.
`Recovery::close` tells it to a window's `Recovery`, and from then on `recovery_action` answers every failure of that
window with `RecoveryAction::Ignore`: no reload, no rebuild, no question. Nothing undoes it, `Recovery::reset`
included. The app calls it:

- on every window's `Recovery` when an exit begins that the app does not prevent (Tauri's `ExitRequested` and
  `Exit`), a window that has no `Recovery` yet included. An exit the app prevents, to rebuild its windows or to stay
  in the tray, closes nothing;
- on one window's when that window is closed for good: on `Destroyed`, or already on `CloseRequested` when the app
  never prevents a close.

A closed `Recovery` stays closed, so a window opened anew under the same label, and not rebuilt, gets a new one
(`Recovery::new`): with the old one it would never reload, rebuild or ask again. A window destroyed to be built again
is not closing: while the rebuilding flag is set the app calls it for none of them, prevents the exit as the contract
below says, and keeps each `Recovery` as it is. The demo does it in `build_main`, `on_run_event` and
`close_recoveries` (`examples/demo/src-tauri/src/main.rs`); it prevents no exit and no close.

### The rebuilding contract

A lost browser process kills every webview of the app, and every window reports it. The app rebuilds once, for the
first report, with a flag it sets with an atomic swap (it acts only if the flag was false) and clears when the windows
are built. The flag is passed as `rebuilding` to every `recovery_action`. While it is set:

- **Prevent the exit.** With every window destroyed the app would exit. Answer the `ExitRequested` event of Tauri's
  run loop, when it has no exit code, with `prevent_exit`.
- **Do not save window state.** Skip the window-event handler that saves the window's place or tidies up when a
  window is closed or destroyed, or the place saved is that of a window that is not there.
- Read the main window's place before destroying anything and put it back after.
- A label is free again only once its window is gone: wait for that (Shinatama waits up to five seconds) before
  building the window again.
- Keep each window's `Recovery` across the rebuild: a window that failed three times a minute ago has still failed
  three times.

A second `Browser` report is `Rebuild` again. It is the app's flag that makes it act once, not `recovery_action`.

## 5. Native-feeling components

They are Sigrid's. None may use `showModal()`: it makes the custom title bar inert and leaves a borderless window that
cannot be moved, minimized or closed. `AppShell` with `desktop` opens every dialog, sheet and menu under the title bar.
Shinatama's attention widget (a separate transparent, always-on-top window without effects that never takes focus) is its
own and is not in the package.

## 6. Reusing it in another app

[using-imago.md](using-imago.md) says how an app depends on the package. For the shell in short:

1. Depend on the package (`@acaprino/imago` and `imago-shell`) at one version. The crate pins `tauri = "=2.12.5"`, and
   `serde`, `serde_json`, `webview2-com` and `windows-core` exactly too (the versions Shinatama's lock resolves, so the
   apps of the suite link one copy of each): the app's `tauri` must resolve to exactly 2.12.5, and an app that asks for a
   newer one does not build until the crate moves.
2. Declare the window as in section 1.1 by building it from `glass_window_config`.
3. Add the two commands of section 3.3 and the wiring of section 3.
4. Wire the page as in section 3.4.
5. Check the result with a screen capture (section 1.3) in each theme, over a dark and a bright window.

## 7. What is not verified on a real window

[verification.md](verification.md) lists what has been run on a real Windows 11 window with Imago, and what has not.
From the code and its tests, these were never run with a live webview when the crate was written: the calls into
WebView2 that turn the browser accelerators off, trim the context menu and watch the process failures, the tint of
the acrylic on Windows 10, what the failure watcher reports while the application closes, and the real flow of a
rebuild. Targets other than Windows compile the same names to no-ops that have been read, not built.
