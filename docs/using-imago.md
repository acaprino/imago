# Using Imago in an app

How an app of the suite depends on Imago, what it imports, what markup it writes, what it calls, what it must still
do itself, and in what order it adopts the package. The rules of the design are in [design-file.md](design-file.md);
the window techniques are in [desktop-shell.md](desktop-shell.md). What an app that used 0.1.4 changes is the table
[Moving from 0.1.4](#11-moving-from-014) at the end.

Imago is a package of CSS, TypeScript and one Rust crate. There is no UI framework in it, and the app needs none (the
one exception, the React binding for Daodan's viewer, is in [inspection.md](inspection.md)).

## 1. Depend on it

The npm package is `@acaprino/imago` and the Rust crate is `imago-shell`. Both come from the repository
`acaprino/imago`, and an app pins both to the same tag or the same commit (`imago-check` reports pins that differ: rule
`pin-mismatch`).

`package.json` of the app:

```json
"dependencies": {
  "@acaprino/imago": "github:acaprino/imago#v<x>"
}
```

`Cargo.toml` of the app's Tauri crate:

```toml
[dependencies]
imago-shell = { git = "https://github.com/acaprino/imago", tag = "v<x>" }
```

- A release of an app, the merge into its `main`, pins a **tag** of Imago: `v<x>`.
- While an app migrates, its `develop` may pin a **commit** of Imago's `develop`: `github:acaprino/imago#<commit>`
  in npm, and `rev = "<commit>"` in place of `tag` in Cargo. The release pins a tag again.
- **The app's `tauri` must resolve to exactly 2.12.5.** The crate pins `tauri = "=2.12.5"`, and with it `serde = "=1.0.229"`,
  `serde_json = "=1.0.154"`, `webview2-com = "=0.39.1"`, `windows-core = "=0.62.2"` and `windows-sys = "=0.61.2"`: the
  versions Shinatama's `Cargo.lock` resolves, so that the apps of the suite link one copy of each and the executable
  holds one WebView2 binding. The app's own `tauri` requirement must allow 2.12.5 (`"2"` and `"2.12"` do, `"2.13"` does
  not), and `Cargo.lock` moves to the pinned versions when the crate is added. A newer Tauri waits for a release of
  Imago that raises the pins.
- A git install runs the package's prepare script, which compiles its TypeScript into ES modules and type declarations.
  Vite and Node use the same entry points. A consumer test can import the command registry directly with Node 24;
  browser interactions still need a DOM. The package carries its documents under `docs/` and its check under
  `scripts/check/`.

## 2. Package imports

| Import | What it is |
|---|---|
| `@acaprino/imago/css/imago.css` | The stylesheet: tokens, base, layout primitives, controls, surfaces, the page patterns and the ONI look. Import it once, first |
| `@acaprino/imago/ui` | Behaviour without a framework: the command registry, keys, menus, sheets, dialogs, notices, the inspector, the palette, panel states, the sidebar functions, `mountApp`, and the string renderers and DOM builders of every pattern |
| `@acaprino/imago/shell` | The desktop window as the page sees it: look, window theme, zoom, window buttons, the desktop guard |
| `@acaprino/imago/tauri` | `tauriWindowApi`, the window for `mountWindowControls` with Tauri 2. Requires `@tauri-apps/api` |
| `@acaprino/imago/graph` | Directed graphs and the graph editor ([graphs.md](graphs.md)). Requires nothing more: it brings D3's selection and zoom |
| `@acaprino/imago/graph-layout` | The grouped layout of a graph ([graphs.md](graphs.md)) |
| `@acaprino/imago/react` | The React binding, for Daodan's viewer only ([inspection.md](inspection.md)). Requires `react` |
| `@acaprino/imago/tokens` | The token source, `tokens/imago.tokens.json`, for any other tool |
| `@acaprino/imago/icons/<app>/<file>` | The icons of the executables (section 5, "The icons of the executables") |

Nothing in `ts/ui` or `ts/shell` touches the page when it is imported. Each function takes the element or the
document it works on, and returns the function that undoes it.

## 3. The root

Three attributes on the root element (`<html>`), all on the same element, and one class in the desktop app:

```html
<html data-im-app="muro" data-im-look="smooth" data-im-theme="dark" class="im-glass">
```

| Attribute | Values |
|---|---|
| `data-im-app` | `shinatama`, `xiox`, `mukade`, `muro`, `daodan` |
| `data-im-look` | `smooth`, `oni` |
| `data-im-theme` | `dark`, `light` |

`im-glass` is set only in the desktop app. Without it every surface is opaque, so a browser preview and a test see
solid colours.

Do not write these by hand. `applyLook(root, state, deps)` writes the three attributes and the class, sets
`color-scheme`, resolves the theme `system` to `dark` or `light`, and tells the native window its theme. Call it before
the first paint, again when the user changes the look or the theme (the `set` of `mountApp`'s `appearance`, section 6),
and when Windows changes its colours while the theme is `system` (listen to `matchMedia('(prefers-color-scheme: dark)')`).
Where the choice is stored is the app's business; read it back through `parseLook(value)` and `parseTheme(value)`.

## 4. The shell markup

The seven regions, with the real class names. Everything an app does not use can be left out: an app without a
sidebar sets `data-im-sidebar="off"` and writes none.

```html
<div class="im-shell" data-im-sidebar="on">
  <a class="im-shell-skip-link" href="#main">Skip to content</a>
  <header class="im-titlebar" data-tauri-drag-region>
    <div class="im-brand" data-tauri-drag-region><span class="im-mark" aria-hidden="true" data-tauri-drag-region>N</span><span class="im-wordmark" data-tauri-drag-region>Name</span></div>
    <button type="button" class="im-icon-btn im-sidebar-toggle" aria-label="Threads" title="Threads" aria-expanded="false" aria-controls="sidebar">…</button>
    <nav class="im-tabs" role="tablist" aria-label="Views">
      <button type="button" role="tab" class="im-tab" aria-selected="true">First view</button>
      <button type="button" role="tab" class="im-tab" aria-selected="false">Settings</button>
    </nav>
    <button type="button" class="im-btn im-btn--ghost im-btn--sm im-views-menu" aria-haspopup="menu" aria-expanded="false">Views</button>
    <span class="im-spacer" data-tauri-drag-region></span>
    <button type="button" class="im-titlebar-command" aria-label="Commands">…<b>Commands</b><kbd class="im-key">Ctrl K</kbd></button>
    <div class="im-window-buttons">
      <button type="button" class="im-window-button" data-im-window="minimize" aria-label="Minimize window" title="Minimize">…</button>
      <button type="button" class="im-window-button" data-im-window="maximize" aria-label="Maximize window" title="Maximize">…maximize icon…restore icon</button>
      <button type="button" class="im-window-button" data-im-window="close" aria-label="Close window" title="Close">…</button>
    </div>
  </header>
  <div class="im-body">
    <section class="im-panel im-sidebar" id="sidebar" aria-label="Threads">
      <header class="im-panel-header">
        <h4 class="im-panel-title">Threads</h4><span class="im-count">9</span><span class="im-spacer"></span>
        <button type="button" class="im-icon-btn im-sidebar-collapse" aria-label="Collapse sidebar" title="Collapse sidebar" aria-expanded="true" aria-controls="sidebar"
                data-im-label-collapse="Collapse sidebar" data-im-label-expand="Expand sidebar">…</button>
      </header>
      <div class="im-panel-body im-list" role="listbox" aria-label="Threads">
        <div class="im-row" role="option" aria-selected="true" title="Thread name" data-im-cat="1">
          <span class="im-avatar im-rail-item" aria-hidden="true" data-im-cat="1">TN</span>
          <span class="im-row-text"><span class="im-row-title">Thread name</span><span class="im-row-sub">3 sessions</span></span>
        </div>
        <div class="im-row" role="option" aria-selected="false" title="Webhook check · needs you" data-im-badge>
          <span class="im-rail-item" aria-hidden="true"><svg class="im-icon" viewBox="0 0 24 24">…</svg></span>
          <span class="im-row-text"><span class="im-row-title">Webhook check</span><span class="im-row-sub">1 session · needs you</span></span>
        </div>
      </div>
    </section>
    <div class="im-work">
      <div class="im-status"><span class="im-chip" data-im-tone="ok">Ready</span><span class="im-status-text">Summary</span><span class="im-spacer"></span><span class="im-status-end">Info</span></div>
      <div class="im-columns">
        <main id="main" class="im-panel im-content" tabindex="-1" aria-label="First view" aria-busy="false">
          <header class="im-panel-header"><h4 class="im-panel-title">First view</h4></header>
          <div class="im-panel-body">…</div>
        </main>
        <section class="im-panel im-inspector" aria-label="Inspector" hidden></section>
      </div>
      <div class="im-actions"><button type="button" class="im-btn im-btn--primary"><span>Apply</span><kbd class="im-key">↵</kbd></button></div>
      <footer class="im-footer"><span class="im-dot" data-im-tone="ok"></span><span class="im-footer-text">State</span><span class="im-spacer"></span><span class="im-footer-keys"><span><kbd class="im-key">F6</kbd>Next region</span></span></footer>
    </div>
  </div>
</div>
```

The real, complete markup of all five apps is `shellMarkup` in `gallery/apps.ts`. An app that composes strings writes the
same frame with `shellFrameHtml(options)`, the title bar with `titlebarHtml(options)`, the sidebar with
`sidebarHtml(options)`, and repaints a mounted frame with `renderShellFrame(shell, markup)`; the calls are in
[html-composition.md](html-composition.md). An app in React writes it with `Shell` and `Workbench`
([inspection.md](inspection.md)). Notes:

- `im-shell` fills its parent (`block-size: 100%`) and measures its own width, so the breakpoints follow the window.
  Put it directly in `<body>`, or in a root of the app's own that carries `im-root` (`<div id="app" class="im-root">`,
  where React renders), as every element between the body and the shell does. In a wrapper without it the shell is as
  tall as its title bar and its content region 0 pixels; `renderShellFrame` and the React `Shell` say so once on the
  console (`checkShellFill`).
- The brand is the mark and the name: `im-mark` holds one letter, the initial of the product's name in capitals, on the
  app's accent, and `im-wordmark` the name. No drawing and no logo: the app's logo is what Windows shows (the icons of
  its executables). `titlebarHtml({ brand: { name } })` writes the two; `imago-check` reports a brand that is not
  this markup (rule `brand-mark`).
- The view tabs are the app's views; when the app has settings, the last tab is its Settings view.
- `im-content` has no style of its own. It is the hook the `F6` key looks for, so every window that has a content
  region carries it. `shellFrameHtml` writes `aria-busy="false"` on it, and `"true"` with its `busy` option.
- Every sidebar row carries an `im-rail-item`: it is all the row shows in the rail. It is the row's own icon, or, when
  the app has no icon that tells its rows apart, an avatar with the row's initials (`<span class="im-avatar im-rail-item">CA</span>`).
  A row whose control is a check has the check as its rail item (`<span class="im-check im-rail-item" role="checkbox" aria-checked="false">`).
  A row without one is blank in the rail. The row's `title` is the tooltip, and its text stays in the rail, hidden, as
  the accessible name.
- A row's categorical colour is `data-im-cat` on the row, and on its rail item too, so the rail shows it. A row's badge is
  `data-im-badge`; its tone is the row's `data-im-tone`, and its `title` and its line carry the badge's word.
- The sidebar's count and its foot are `sidebarHtml`'s `count` and `footHtml`: an `im-count` after the title and an
  `im-panel-foot` under the list, which the rail does not show.
- Tauri starts a window drag only when the pressed element itself carries `data-tauri-drag-region`, and nothing in
  `css/` changes what a child does with the pointer. Put the attribute on each element that should drag: the title
  bar, the spacer, and the brand with everything inside it (`im-brand`, `im-mark`, `im-wordmark`), as `titlebarHtml`
  writes them and as `markDragRegion` in `gallery/mount/desktop.ts` does with `.im-brand *`. Leave the buttons, the
  tabs and the command field unmarked. The drag needs two permissions: see "The capabilities" in section 5. Whether
  the window drags on a real window is in [verification.md](verification.md).
- The inspector is closed with `hidden`; the content then takes its room. `inspector(shell).open(content)` opens it.
  `data-im-inspector="wide"` on the shell makes it 360px; beside the sidebar it is then docked from 1012 up.
- A panel that shows an empty, loading or error state needs `im-panel-body`: `setPanelState` puts its layer there.

### The window buttons

`mountWindowControls` finds the buttons by `data-im-window="minimize"`, `"maximize"` and `"close"` inside the title
bar. A button that is missing is skipped. On the maximize button the page sets `data-im-os` (`hover` or `pressed`,
from Windows' own hit test), and, when the app gives `onMaximized`, `data-im-maximized` (`true` or `false`) with a
matching `aria-label` and `title`, in the words of the option `labels` (English when it is not given). The maximize
button holds two icons, maximize first and restore last: the CSS shows one of them by `data-im-maximized`.
`windowButtonsHtml(labels)` writes the three buttons with their names and their tooltips (`WindowButtonLabels`); an app
in another language gives all six words.

## 5. The calls

A call that sets something up returns the function that undoes it. The calls that give something else back are
`createRegistry` (the registry), `confirm` (a promise), `inspector` (the inspector), `showAfter` (the function that
cancels it), `formatKeys` (a `string[]`), `keyCaps` and `footerKeys` (an element), `setPanelState` and `applyLook`
(nothing), and the `parse`, `resolve` and `windowThemeFor` functions (a value).

### `@acaprino/imago/shell`

| Call | What it does |
|---|---|
| `applyLook(root, state, deps)` | The look of the window. `state` is a `LookState`, `{ app, look, theme, glass }` (`AppId`, `Look`, `ThemeChoice`); `deps` is a `LookDeps`, `{ systemIsDark?, setWindowTheme? }`. `setWindowTheme` receives the window theme (`WindowTheme`: `light`, `dark` or `system`) and a `WindowThemeDetail`, `{ look, resolved }`: the look and the theme the page draws (`light` or `dark`), which the window uses to tint its acrylic on Windows 10. It is called again only when one of the three changed: under `system`, a change of Windows' colours changes `resolved`, so the app calls `applyLook` again at that change (section 3) |
| `parseLook(value)`, `parseTheme(value)` | A stored value back into a look or a theme choice. A stale or corrupt value is the default |
| `resolveTheme(choice, systemIsDark)`, `windowThemeFor(look, choice)` | The theme the page draws, and the theme the native window is asked for |
| `guardDesktop(document, { allowReloadIn, keyPhase })` | Browser keys do nothing, the page menu stays out of the chrome, the mouse's back and forward buttons do nothing, images and links are not dragged out. `allowReloadIn` is a selector for places that run their own keys and menus, such as a terminal. A browser key is refused to the browser, not to the app: the registry still runs the app's command on it (Ctrl+F). `keyPhase` (`capture`, the default, or `bubble`) is when the guard refuses the key; an app leaves it at its default. The guard refuses F5, F12, Ctrl+R, Ctrl+Shift+I, J and C and the page menu in every build, so under `tauri dev` it also takes away reload and DevTools: call it only outside development, as the sketch below does. `KeyLike` is what it reads of a key event |
| `mountZoom(document, { apply, storage?, storageKey?, applyDefaultOnStart?, onChange? })` | `Ctrl+=`, `Ctrl+-`, `Ctrl+0` and `Ctrl`+wheel, from 50 to 200% in steps of 10, saved. The saved level is applied at start, also at 100% (`applyDefaultOnStart: false` leaves a window that already starts at 100% alone). `apply` gives the level to the webview. A refusal moves the level back. `storageKey` defaults to `imago.zoom`: an app passes its own key to keep the level it already saved. The options are a `ZoomOptions` |
| `mountWindowControls(titlebar, api, { onError, labels })` | The three window buttons, and the maximize button's rectangle for Snap Layouts, reported in physical pixels (`WindowRect`). The options are a `WindowControlsOptions` |

`clampZoom`, `stepZoom`, `zoomDirection` and `wheelPixels` are the pure parts of the zoom, exported for tests.
`createZoomController(options)` is the level of `mountZoom` without its listeners (a `ZoomController`: `ready`,
`current()`, `set(level)`, `handleKey(event)`), for a test; an app calls `mountZoom`.

`WindowApi` is what the page needs of the window, so the module needs no Tauri: `minimize()`, `toggleMaximize()` and
`close()` (each may return a promise), `reportMaximizeRect(rect)`, `onOsHover(callback)`, and optionally
`onMaximized(callback)`. `tauriWindowApi(onError)` from `@acaprino/imago/tauri` is that object for Tauri 2. As a sketch
and not a file to paste (`look`, `theme` and `shell` are the app's own values, and `notify` is imported from
`@acaprino/imago/ui`):

```ts
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { applyLook, guardDesktop, mountWindowControls, mountZoom } from '@acaprino/imago/shell';
import { tauriWindowApi } from '@acaprino/imago/tauri';

const onError = (action: string, error: unknown) => notify(shell, `${action} failed: ${String(error)}`, { tone: 'err' });
const api = tauriWindowApi(onError);
applyLook(document.documentElement, { app: 'muro', look, theme, glass: true }, {
  setWindowTheme: (word, detail) => invoke('set_window_theme', { theme: word, look: detail.look, resolved: detail.resolved }),
});
// The guard refuses reload and DevTools too: leave it out under `tauri dev`.
if (!import.meta.env.DEV) guardDesktop(document, { allowReloadIn: '.xterm' });
mountZoom(document, { apply: (level) => getCurrentWebview().setZoom(level), storageKey: 'muro.zoom' });
mountWindowControls(document.querySelector<HTMLElement>('.im-titlebar')!, api, {
  onError,
});
```

This is the wiring the package was written for. The demo app, `examples/demo`, is the version that runs on a real
window; where the two differ, the demo is right. The two commands `set_window_theme` and `window_caption_maximize`,
and the event `caption-maximize`, are the app's side of the contract and are described in
[desktop-shell.md](desktop-shell.md), section 3.3.

#### The capabilities

Tauri 2 lets the page call the window, the webview or an event only when a capability file grants it. The app needs a
file in `src-tauri/capabilities/` with these nine permissions, for the buttons, the drag, the zoom and the events.
`windows` lists the label of every window that carries the title bar. Two parts of the wiring are optional, and their
permissions go with them: `core:window:allow-is-maximized` is needed only with `onMaximized`, and
`core:window:allow-start-dragging` and `core:window:allow-internal-toggle-maximize` only with drag regions
(`data-tauri-drag-region`).

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
`examples/demo/src-tauri/capabilities/default.json`. The app's own commands, `set_window_theme` and
`window_caption_maximize`, need no permission of this list.

Without a permission Tauri refuses the call, as a rejected promise, and who sees it depends on the call.
`mountWindowControls` passes the refusal of `minimize`, `toggleMaximize` and `close` to its `onError`, and nothing
else. It does not see a refused `listen`, `unlisten`, drag or zoom. `mountZoom` moves a refused zoom back to the level
it had, and a refused drag leaves the window where it is. A refused `listen` is a rejection that only the app can
catch, where it calls `listen`; `tauriWindowApi` catches it and passes it to its `onError` (as the demo's
`stopOnResolve` in `gallery/mount/desktop.ts` does). Left alone it is an unhandled rejection, and the page never hears
`caption-maximize`, so the maximize button draws no hover or press from Windows.

### `@acaprino/imago/ui`: behaviour

The calls an app makes itself. `mountApp` (section 6) makes several of them for it.

| Call | What it does |
|---|---|
| `createRegistry()` | The command registry of the app, a `Registry`. `register(command)` takes a `Command`, `{ id, title, keys?, group?, when?, run }`, and returns the function that unregisters; it throws on an id or keys already taken. `list()`, `get(id)`, `match(event)` (a `KeyEventLike`); `attach(target, options)` (a `KeyEventTarget`, `AttachOptions`) runs the matching command on `keydown` and cancels the browser's own action. `keys` is `Ctrl`, `Shift` and `Alt` in that order, then one key name, joined by `+`: `Ctrl+K`, `F6`, `Ctrl+=`. In a text field (`isTextTarget`: an `input`, a `textarea`, a `select`, editable content) a key pressed without Ctrl or Alt belongs to the field, whether it types (`a`, Space) or edits and moves (Delete, Backspace, Home, End, the arrows, Enter, Tab): a binding of it does not run there and the key is not cancelled. Escape, `F1` to `F24` and every binding with Ctrl or Alt still run in a field. No command runs while a dialog or the palette is open, nor on a key a handler claimed (`claimKey`) |
| `formatKeys(keys)`, `keyCaps(document, keys)` | The key caps of a binding, as text and as `im-key` elements in an `im-keys` span. Every key cap of an app comes from them |
| `claimKey(event)`, `keyClaimed(event)` | A handler that answers a key claims it, beside its `preventDefault()`, so the registry runs no command on it; `keyClaimed` says whether one did. A claimed Escape stays claimed until its keyup. From a React handler, `claimKey(event.nativeEvent)` |
| `attachLayers(shell)` | Escape closes the top surface only, and a press outside closes a menu or a sheet. `confirm` and `openPalette` rely on it for Escape. Its returned function also closes every open surface |
| `openMenu(anchor, items, options)` | A menu under `anchor`. An item (`MenuItem`) is `{ label, keys?, disabled?, danger?, checked?, run }` or `'separator'`. `disabled` is the reason, shown as the item's tooltip; `checked` makes a radio item, which stays open while its choice changes. `options` is `{ heading?, configure?, onClose? }` |
| `openSheet(anchor, content, { placement, onClose })` | A sheet docked to `anchor`. `placement` (`SheetPlacement`) is `below` (the default), `pane-top` or `pane-bottom`. Closing it gives focus back to `anchor`, or, for a pane placement (a pane takes no focus), to what had focus when the sheet opened. A native form as a sheet is `openDialogSheet` ([native-forms.md](native-forms.md)) |
| `confirm(shell, options)` | A dialog for a decision. Resolves `true` on the confirming button, `false` on Cancel or Escape. `options` is a `ConfirmOptions`, `{ title, body, confirm, cancel, danger? }`; `danger` makes the confirming button the filled danger button |
| `openFormDialog(shell, options)`, `openContentDialog(shell, dialog, options)`, `createContentDialog(shell, options)` | The other dialogs: a form the package lays out, and a `dialog` element the app owns. See [native-forms.md](native-forms.md) |
| `notify(shell, text, options)` | A notice. `options` is a `NoticeOptions`, `{ tone?: 'err', action?: { label, run }, timeoutMs?, errorWord?, dismissLabel? }`. A plain notice goes after `timeoutMs` (6000) and a new one replaces it; an error stays until it is dismissed, up to three at once. Returns the function that closes it. `clearNotices(shell)` removes every notice and its timer when the app unmounts |
| `inspector(shell)` | The inspector of the shell, an `Inspector`: `open(content, opener?)`, `push(content, opener?)` (a detail view over the current one; closing it returns to the one under it, with its fields, its scroll and its guard), `close()`, `isOpen()`, and `guard(isDirty, ask)`, which asks once before the content is closed or replaced while it has unsaved changes. `content` is one element, or a fragment whose children are an `im-panel-header`, an `im-panel-body` and an `im-panel-foot`, laid out as a panel whose body scrolls. Calls for the same shell share one controller |
| `openPalette(shell, registry, options)` | The command palette over the shell: every available command of the registry, filtered as the user types. `options` is a `PaletteOptions`, `{ placeholder?, empty? }`. `mountApp` binds it to `Ctrl+K` |
| `roving(container, options)` | One tab stop for a list, and the arrows, Home and End inside it. `options` is a `RovingOptions`, `{ item, orientation, onSelect? }` (`Orientation`: `vertical` or `horizontal`). This is how an app's own list takes the common keys. `nextIndex(current, count, key, orientation)` is its arithmetic, for a `NavKey` |
| `regions(shell)` | `F6` and `Shift+F6` move focus between the sidebar, the content and the inspector. `mountApp` calls it |
| `setPanelState(panel, state)` | A panel is `ready`, `loading` with `rows`, `empty` with a sentence (and a title) and an action, or `error` with a sentence and a Retry (`PanelState`). The panel keeps its header and frame. Focus that was in the layer being replaced (a pressed Retry) moves to the new layer's button, or to the panel body when it has none |
| `panelStateHtml(state)` | The same layer as a string (`PanelStateMarkup`), for a panel body painted from strings: the action and the Retry are buttons the app writes and wires. The app sets `aria-busy="true"` on a loading panel itself. `setPanelState` replaces a layer written so as its own |
| `showAfter(delayMs, show, timers?)` | Runs `show` after a delay and returns the function that cancels it (`Timers` is for a test). `showAfter(LOADING_DELAY_MS, …)` is how a loading state shows only after 300ms |
| `sidebarDrawer(shell)` | Below 620 the title-bar toggle opens the sidebar as an overlay and moves focus into it. A second press of the toggle, or Escape, closes it and gives focus back to the toggle. A press outside, or focus moving elsewhere, closes it and leaves focus where it went. `mountApp` calls it |
| `sidebarCollapse(shell, { collapsed, onChange })` | From 850 up, the button in the sidebar header folds the sidebar into the 56px rail of icons and back. See below. `mountApp` calls it |
| `sidebarResize(shell, { label, width, onChange })` | A separator at the sidebar's edge that the user drags, or moves with Left and Right, Home and End, from 168 to 420 pixels. It is shown only in the expanded sidebar from 850 up; the rail and the drawer keep their sizes. The app keeps the width it reports. `mountApp` does not call it: an app with a resizable sidebar does |

```ts
import {
  confirm, createRegistry, inspector, mountApp, notify, openMenu, openSheet,
  roving, setPanelState, showAfter, LOADING_DELAY_MS,
} from '@acaprino/imago/ui';
```

The surfaces write their own markup, and an app writes none of it by hand: every floating surface is `im-float`.

| Surface | Its markup |
|---|---|
| Menu | `im-menu`, its items `im-menu-item`, a separator `im-menu-sep`, an item's keys in `im-keys` |
| Sheet | `im-sheet`; a native form docked as a sheet (`openDialogSheet`) is `im-form-sheet` too |
| Dialog | Over the layer `im-scrim`: `im-dialog`, its title `im-dialog-title`, its text `im-dialog-body`, its buttons `im-dialog-actions` |
| Form dialog | `im-dialog im-form-dialog` (`im-form-dialog--wide`), its head `im-form-dialog-head` with the title and its subtitle `im-form-dialog-subtitle`, its body `im-form-dialog-body`, its foot `im-form-dialog-foot` |
| Content dialog | `im-dialog im-content-dialog` on the app's `dialog` element |
| Notice | In the host `im-notices`: `im-notice`, its text `im-notice-text`, the word that opens an error `im-notice-word` |
| Palette | Over the layer `im-scrim im-scrim--top`: `im-palette`, its field `im-palette-field` round `im-palette-input`, its list `im-palette-list` and, when nothing matches, `im-palette-empty` |
| Sidebar separator | `im-sidebar-splitter`, the `im-splitter` that `sidebarResize` adds to the sidebar |

The layer functions that the surfaces are made of are exported too, for an app's own floating surface, which goes
through the same stack: `pushLayer(layer, opener)` (a `Layer` of a `LayerKind`: `menu`, `sheet`, `dialog` or `palette`),
`closeLayers(kinds)`, `topLayer()`, `hasLayer(kind)`, `hasDialog()`, `hasModal()`, `inertShell(shell)`,
`trapTab(event, root)`, `tabbables(root)`, `placeBelow(shell, anchor, el)`, `follow(place)`, `shellOf(el)` and
`nameOf(anchor)`. Most apps never call them.

The string renderers and DOM builders of the frame, the controls and the page patterns are in
[html-composition.md](html-composition.md) and [content-composition.md](content-composition.md); forms and dialogs in
[native-forms.md](native-forms.md); inspection content in [inspection.md](inspection.md).

#### The sidebar fold

`sidebarCollapse(shell, { collapsed, onChange })` wires the button `im-sidebar-collapse` of the sidebar header. A
click sets `data-im-sidebar-collapsed` on the shell, so the CSS needs no script, and the button's label and
`aria-expanded` follow the state: `data-im-label-collapse` and `data-im-label-expand` hold the two names. **The
package does not store the choice.** The app keeps it through `onChange(collapsed)` and passes it back as `collapsed`
the next time (through `mountApp`'s `sidebar`). The button is shown from 850 up. From 620 to under 850 the rail is
forced by the width, whatever the choice. Under 620 the title-bar toggle of `sidebarDrawer` opens the whole sidebar.

### The icons of the executables

The package carries one icon for each app, in `@acaprino/imago/icons/<app>/` with `<app>` one of `shinatama`, `xiox`,
`mukade`, `muro` and `daodan`. It is the mark of the title bar: the app's accent in the dark themes as a rounded
square, and the capital initial of its name in the accent's ink. The app's window program, its command-line program
and a page of it served in a browser all use the same icon. Mukade and Muro both show an M, and no name stands beside
an icon on a taskbar: the hue alone tells them apart. `npm run icons` makes the files from the token file, so an app
copies them and never draws or recolours its own.

A folder holds `icon.svg` (the source), `16x16.png` to `512x512.png` (16, 24, 32, 48, 64, 128, 256 and 512),
`icon.png` (the 512 one), `icon.ico` (16, 24, 32, 48, 64 and 256), `favicon.ico` (16, 32 and 48) and `favicon.svg`.

- **A Tauri app** puts these in its `src-tauri/icons/`: `32x32.png`, `128x128.png`, `128x128@2x.png` (the package's
  `256x256.png`), `icon.png` and `icon.ico`.
- **A command-line program built with a resource file** keeps a copy of `icon.ico` in the app, and its `.rc` points at
  that copy: `1 ICON "icon.ico"`.
- **A page served in a browser** links `favicon.svg` and `favicon.ico`:

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="48x48">
```

`imago-check` reports a copy that is not the package's file, byte for byte (rule `app-icon`). It reads which app this is
and which file is which from the `"imago"` block of the app's `package.json` (section 9): `"app"` is the app's id, and
`"icons"` maps a path in the app to the file of `icons/<app>/` it must equal. Without `"icons"` the rule is skipped, and
the program says so.

## 6. `mountApp`, and what the app still does itself

Every app calls `mountApp(shell, registry, options)` once for each shell, after it has written the shell and before the
user can press a key. `imago-check` reports an app whose entry never calls it (rule `mount-app`). As a sketch, where
`stored`, `store`, `deps`, `searchField` and `newThread` are the app's own:

```ts
import { createRegistry, mountApp } from '@acaprino/imago/ui';
import { applyLook } from '@acaprino/imago/shell';

const registry = createRegistry();
registry.register({ id: 'thread.new', title: 'New thread', keys: 'Ctrl+N', run: newThread });
const unmount = mountApp(shell, registry, {
  search: () => searchField.focus(),
  labels: { palette: 'Commands', search: 'Search in this view' },
  sidebar: { collapsed: stored.sidebarCollapsed, onChange: (collapsed) => store({ sidebarCollapsed: collapsed }) },
  appearance: {
    get: () => ({ look: stored.look, theme: stored.theme }),
    set: (next) => {
      store(next);
      applyLook(document.documentElement, { app: 'muro', ...next, glass: true }, deps);
    },
  },
});
```

It makes these calls, in this order, and the function it returns undoes them in reverse order, closes the surfaces still
open and frees the shell:

1. `attachLayers(shell)`: Escape and the press outside.
2. When the shell has a sidebar (`.im-sidebar`, at the time of the call): `sidebarDrawer(shell)`, then
   `sidebarCollapse(shell, options.sidebar)`.
3. `registry.attach(document)`: the keys of every command.
4. `regions(shell)`: `F6` and `Shift+F6`.
5. `standardCommands(registry, shell, options)`: `Ctrl+K` opens the palette (`PALETTE_COMMAND`, `imago.palette`, titled
   `Commands`), and `Ctrl+F` calls `options.search` (`SEARCH_COMMAND`, `imago.search`, titled `Search in this view`).
   `labels` (`StandardLabels`) gives the two titles and the palette's `palettePlaceholder` and `paletteEmpty` in the
   app's words.
6. With `appearance` (`AppearanceOptions`), the five commands of the look and the theme: `LOOK_SMOOTH`, `LOOK_ONI`,
   `THEME_SYSTEM`, `THEME_LIGHT` and `THEME_DARK` ([design-file.md](design-file.md), "How the user picks them").

`AppOptions` is `{ search, labels?, sidebar?, appearance? }`. Register the app's own commands before or after: the
registry keeps them in the order they come, and the palette lists them so. A command of the app with one of the ids
above, or bound to `Ctrl+K` or `Ctrl+F`, is an error: `mountApp` throws, and undoes what it had done. Every error it
throws starts with `mountApp: `, with the registry's error as its `cause`. A second call on a shell that is still
mounted throws too.

`footerKeys(document, registry, entries)` writes the footer's key list (an `im-footer-keys` span) from the registry:
an entry (`FooterEntry`) is a command id, which writes that command's key caps and title, or `{ keys, title }` for a
key of a list that is not a command (`'ArrowUp ArrowDown'`, Space, Enter). An id that is not registered, or a command
without keys, is left out. The footer is written, not watched: the app writes it again when its commands change.

The package does not do the following. Each is a place where an app that forgets looks or behaves differently from the
others.

1. **Bind Undo.** The button in a notice (`action`) works by pointer. A key for Undo is the app's to bind in its
   registry.
2. **Ignore a second activation of a busy button.** `aria-busy="true"` stops the pointer, not the keyboard: Enter or
   Space on a busy button still fires its click. The handler returns at once when the button is busy, or the app sets
   `disabled`.
3. **Pass `onError` to `mountWindowControls`.** Without it a failed minimize, maximize or close is swallowed. Show it
   as a notice with `tone: 'err'`.
4. **Keep `SnapLayouts` and `Recovery` per window label** in the Rust state, and replace the `SnapLayouts` when a window
   is rebuilt. See [desktop-shell.md](desktop-shell.md), sections 3 and 4.
5. **Bind its commands to the right keys.** Not to Enter or Space: the focused control's own activation would also fire,
   and the registry does not look at what holds focus for those two keys (a button's key cap may show `↵`). Not to `F6`
   or `Shift+F6`: `regions` listens after the registry, so a command bound to them would run instead.
6. **Add its own key handlers before `mountApp`.** A handler of the app on the document (a terminal, an editor) is added
   before `mountApp`, so it runs before the registry; when it answers a key it calls `claimKey(event)`
   (`claimKey(event.nativeEvent)` from a React handler), and the registry runs no command on that key. `imago-check`
   reports such a handler (rule `own-keydown`): the app keeps it with `imago-check: allow own-keydown — <reason>`.
7. **Keep the choices:** the look and the theme (`appearance`'s `get` and `set`), and whether the sidebar is folded
   (`sidebar`'s `collapsed` and `onChange`). The zoom is kept by `mountZoom`.
8. **Give the words.** The package's own words are English: `errorWord` and `dismissLabel` of a notice, the `labels` of
   `mountApp` and of `appearance`, `errorWord` of an error state, the labels of the confirm dialog, the six words of the
   window buttons. An app in another language passes its own.
9. **Name long labels.** A label longer than its room ends in an ellipsis; the element carries the whole label as its
   `title`.
10. **Check the window.** A screenshot of the page cannot judge the glass: capture the real window in both looks
    (see [desktop-shell.md](desktop-shell.md), section 1.5).

## 7. A control of your own

An app may have controls the package does not (a graph node, a lane, a pipeline step). The rule: build it from the
tokens, take the common states and keys, and keep it in the app until a second app needs it.

- Class names carry the app's own prefix, never `im-`. Custom properties of the app carry the app's prefix, never
  `--im-`. No selector of the app names a class of the package (rule `im-selector`).
- Every colour, size of text, space, radius, font and time is a token. A literal value is a bug in the next look, and a
  finding of `imago-check`.
- The states are the common ones, on the common attributes: `:hover`, `:active`, `:focus-visible`,
  `aria-selected="true"`, `aria-checked`, `disabled` or `aria-disabled="true"`, `aria-busy="true"`,
  `aria-invalid="true"`.
- The focus ring is 2px wide in `--im-accent-text`. Inside a list that scrolls, draw it 2px inside.
- Arrows and one tab stop come from `roving`. Escape closes the top surface through `attachLayers`. Commands go
  through the registry.

```css
.mk-lane {
  display: flex;
  align-items: center;
  height: var(--im-h-row);
  padding-inline: var(--im-s-3);
  font: 400 var(--im-fs-body)/1.45 var(--im-font-text);
  color: var(--im-text);
  background: transparent;
  border: 1px solid var(--im-line);
  border-radius: var(--im-r-control);
  transition: background-color var(--im-t-fast) var(--im-ease);
}
.mk-lane:hover { background: var(--im-hover); }
.mk-lane:active { background: var(--im-press); }
.mk-lane[aria-selected="true"] { background: var(--im-selected); font-weight: 600; box-shadow: inset 3px 0 0 var(--im-accent); }
.mk-lane:focus-visible { outline: 2px solid var(--im-accent-text); outline-offset: -2px; }
.mk-lane:is(:disabled, [aria-disabled="true"]) { color: var(--im-muted); border-style: dashed; }
```

In ONI the radius is 0 and the corners are cut. A control that wants the ONI shape clips itself with a `clip-path`
that uses `--im-cut-md`, and then draws its focus ring inside: a clip-path cuts a ring drawn outside. The package's
own ONI buttons do this, 5px inside.

## 8. The order of adoption

Two parts, in this order. Each part is its own short branch from the app's `develop`, merged back and deleted. The
app's tests and `npx imago-check` pass at the end of each.

**Part 1: tokens, controls and shell, with the layout unchanged.**

1. Add the dependency, pinned to a commit of Imago's `develop`, and the three imports. The crate pins Tauri and its
   neighbours: the app's `tauri` must resolve to exactly 2.12.5 (section 1), so check that before anything else.
2. Set the root attributes with `applyLook`. Map the app's own variables to `--im-*` in one place, or replace them.
   Delete the app's copies of what the package now has.
3. Replace the app's controls with the package's classes, one family at a time (buttons, fields, tabs, rows, tables,
   chips), and check each in the gallery against the app's accent.
4. Replace the app's own window code with the crate `imago-shell` and the modules of `@acaprino/imago/shell`: the
   native frame and Snap Layouts, the window theme, the guard, zoom, window state and WebView2 recovery.
5. Add the `"imago"` block and the lines of section 9, and run `npx imago-check` in CI.
6. Capture the real window in both looks, over a dark window and a bright one.

**Part 2: layout and behaviour.**

1. The seven regions and the three breakpoints. The inspector replaces the app's drawers and detail boxes; a form that
   must block the window while it saves becomes a dialog.
2. `mountApp`, the command registry, the palette, the look and theme commands, and the keys of the design file.
3. The surfaces: menus, sheets, dialogs and notices from the package, and the rules for destructive actions.
4. Empty, loading and error states through `setPanelState`.
5. Capture the real window again.

An app that used 0.1.4 also replaces every name of the table [Moving from 0.1.4](#11-moving-from-014): `imago-check`
reports each one it finds (rule `removed-name`). A release of the app to `main` pins a tag of Imago. The apps move in
this order: Muro and Shinatama, then Mukade, Daodan and Xiox.

## 9. For the app's coding agents and its check

Paste this into the app's `AGENTS.md`:

```markdown
Before UI work, read node_modules/@acaprino/imago/docs/design-file.md and the component or style files it references.
Apply its tokens and confirmed design choices within the requested scope.
Use the package's im- classes and --im- tokens. Build a control of your own from the tokens, never from literal colours or sizes.
Report conflicts and keep unresolved choices explicit.
Run npx imago-check before you say UI work is done.
```

and this into its `CLAUDE.md`:

```markdown
For UI work, apply the design file and inspect the project files it references.
Run npx imago-check before you say UI work is done.

@node_modules/@acaprino/imago/docs/design-file.md
```

`imago-check` reports an agent file that does not name the design file of the installed package by a path that exists
(rule `agent-rules`). The path assumes npm installs the whole repository, as it does for a git dependency: if
`node_modules` is out of reach of an agent's tools, copy the file in at install time and write that path.

`imago-check` reads the `"imago"` block of the app's `package.json`:

```json
"imago": {
  "src": ["apps/desktop/src"],
  "tests": ["apps/desktop/tests"],
  "cargo": "apps/desktop/src-tauri/Cargo.toml",
  "agents": ["AGENTS.md", "CLAUDE.md"],
  "entry": "apps/desktop/src/main.ts",
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
| `tests` | Folders read only by `removed-name` and `unknown-name` |
| `cargo` | The `Cargo.toml` that depends on `imago-shell`, for `pin-mismatch`. Without it the rule is skipped |
| `agents` | The agent files, for `agent-rules`. Default `["AGENTS.md", "CLAUDE.md"]` |
| `entry` | The entry of the page, for `mount-app`. Without it the rule is skipped |
| `app` | The app's id, one of the folders of the package's `icons/` |
| `icons` | A path in the app, and the file of `icons/<app>/` it must equal, for `app-icon`. Without it the rule is skipped |
| `package` | Where the package is installed. Default `node_modules/@acaprino/imago` |

A rule that is skipped says so. Run it as `npx imago-check` in the root of the app, and in the app's CI: it exits 1 on a
finding. The rules are in [design-file.md](design-file.md), "What a program checks".

## 10. A note on the token file

`tokens/imago.tokens.json` is in the Design Tokens Community Group format, 2025.10, with two conventions outside it:

- **A token of `$type` `string`**: the text case of a look, `case` (`none` or `uppercase`). The format has no type
  for a keyword.
- **A number with an `em` unit in its extensions**: the letter spacing of a look, `track`, is a `number` whose
  `$extensions.imago.unit` is `em`. The format's number has no unit.

The other additions are plain `$extensions`, which the format allows: `glass`, the translucent value of a colour under
`im-glass`, and `mix`, how a colour is mixed from another. A tool that rejects a `$type` it does not know will reject
the file: read `css/tokens.css` instead, which is generated from it.

## 11. Moving from 0.1.4

Version 0.1.4 had more than one way to do several things: four window frames, several drawings of one control, more
than one message, loading and empty state, its own side panels. The canon keeps one of each, the one
[design-file.md](design-file.md) names, and removes the others; a removed name is not kept as an alias. Each row below is
a name, or a way of writing, an app may still have, with what to write instead. An app moves when it pins the new
version: search its markup, its TypeScript, its CSS and its tests for the first column. `imago-check` reports every name
of this table it can match, with what replaces it (rule `removed-name`).

### The frame

| Old name | New name, or what to do instead |
|---|---|
| `im-app-layout` | Remove it. The window is `im-shell` with its seven regions; a shell placed directly in `<body>` fills the window, and the document defaults it gave (no margins on headings, paragraphs, lists and fieldsets, no bullets, `[hidden]`) apply in every `im-shell` |
| `im-main` | The content region, `main.im-panel.im-content`: a panel whose `im-panel-body` scrolls, with an optional `im-panel-header`, `im-panel-tools` and `im-panel-foot`; `shellFrameHtml` writes it. The padding went to `im-page-content` |
| `im-desktop-frame` | `im-shell` |
| `im-desktop-content` | `im-work`: the status row, the columns, the action bar and the footer |
| `im-page` | Remove it: a page sits in the content region of `im-shell`, and its headings are the shell's (h1 18, h2 14, h3 13) |
| `im-skip-link` | `im-shell-skip-link`, which `shellFrameHtml` writes first |
| `im-page-frame` | `im-shell` |
| `im-page-view` | `im-content` |
| `im-work-column` | `im-content`: a panel, with `im-panel-header` above `im-panel-body` (`shellFrameHtml`'s `contentHeaderHtml` and `contentHtml`) |
| `im-workbench` | The shell's `im-sidebar`, `im-content` and `im-inspector` |
| `im-work-area` | `im-columns` |
| `im-workspace-area` | `im-content` |
| `im-navigation-panel` | `im-sidebar`, from `sidebarHtml` |
| `im-resizable-nav` | `im-sidebar`, made resizable by `sidebarResize` |
| `--im-nav-width` | `--im-w-sidebar`, which `sidebarResize` sets on the shell |
| `data-im-compact` on `im-resizable-nav` | The rail: `sidebarCollapse` folds the sidebar and sets `data-im-sidebar-collapsed` on the shell |
| `im-nav-rail` | The sidebar's rail: every row carries an `im-rail-item` (its icon, or an `im-avatar` with its initials) |
| `im-nav-entry` | `im-row` with `role="option"` in the sidebar's `im-list`; the current one has `aria-selected="true"` |
| `im-nav-line` | `im-row`, with `im-row-text` (`im-row-title`, `im-row-sub`) and `im-row-meta`; the row's other actions go in a menu (`openMenu`) or in the inspector |
| `im-nav-mark` | `data-im-cat="1"` to `"8"` on the row (its 3px mark) and on its rail item, or an `im-dot` with `data-im-cat` in the row; a mark that turns on and off is an `im-check` |
| `im-nav-detail` | `im-row-sub`, the row's second line; more goes in the inspector |
| `im-signal` | `im-dot` with `data-im-tone`, and the word for the state beside it |
| `data-im-badge` | The badge of an `im-row`, which 0.1.4 drew on any element as a warn dot at its corner: on the row it is a dot at its end, and on the corner of its `im-rail-item` in the rail, cut out of the item's fill. Its tone is the row's `data-im-tone` (`warn` when it has none). The row's text says what the dot says (its `im-row-sub`, "needs you"), so its accessible name does. On any other element it draws nothing |
| `--im-item-color` | Set by the app on a row, an avatar, a rail item or a dot (`style="…"`): write `data-im-cat="1"` to `"8"` on the `im-row`, `im-rail-item`, `im-avatar`, `im-dot` or `im-chip` instead, and the package draws it. A row has a 3px mark at its start edge, beside its selection, in the whole sidebar; an avatar, a rail item and a dot are filled with it, their text in `--im-cat-on`; a chip takes it as its tone. In the rail the row draws no mark: put `data-im-cat` on the rail item too, whose fill then tells the category (a row whose rail item is a check shows no category there). The app does not write a categorical colour as text on a row |
| `--im-item-ink` | `--im-cat-on`, the text on a categorical fill, which the package writes |
| A row's `title` that names the thing alone (`title="Webhook signature check"`) on a row with a badge | The `title` says the badge's word too (`title="Webhook signature check · needs you"`): in the rail the title is the row's tooltip, and the row's text is hidden, so without the word the badge's tone is told by colour alone |
| A sidebar row whose rail item is an icon while its check is hidden in the rail (it cannot be ticked between 620 and 850) | The check is the rail item: `<span class="im-check im-rail-item" role="checkbox" aria-checked="…">`. It is shown in the whole sidebar and in the rail, drawn and ticked the same in both, with a 24 by 24 target in the rail; the row has no other rail item. Every row of the rail is as tall as a two-line row |
| An `im-count` the app adds to the sidebar's header, a block it adds under the sidebar's list | `sidebarHtml({ …, count, footHtml })`: the count after the title, the foot (`im-panel-foot`) under the list, hidden in the rail. `renderShellFrame` repaints both |
| A shell in an element between the body and the shell (React's `<div id="app">`) with no height of its own: the content is 0 pixels tall | `class="im-root"` on that element, and on every element between the body and the shell. `html` and `body` then take the window's height and lose their margin, as they do for a shell directly in the body. Without it, `renderShellFrame` and the React `Shell` say so once on the console (`checkShellFill`) |
| `im-docked-inspector` | `im-inspector` (`inspector(shell)`): docked from 1000 up, a drawer under it. `data-im-inspector="wide"` on the shell makes it 360 |
| `--im-inspector-size` | `--im-w-inspector` (300), or `data-im-inspector="wide"` on the shell (360) |
| `--im-w-inspector: 360px` written by the app | `data-im-inspector="wide"` on the shell, which reads the token `--im-w-inspector-wide` (360) |
| `im-inspection-rail` | `im-inspector` |
| `im-detail-panel` | `im-inspector` |
| A wrapper the app lays out itself round the inspector's header, body and foot | `inspector(shell).open(fragment)`, the fragment's children an `im-panel-header`, an `im-panel-body` and an `im-panel-foot`; or `open(form)`, one element whose children are those three. The body scrolls between the header and the foot |
| `im-document` | `im-page-content` |
| `im-content-text` on each paragraph, path, commit or id of a page in the content region | Nothing to do: text in `im-page-content` can be selected, a link, a label, a summary and a key cap in prose included. Its controls (buttons, selects, tabs, options, chips, counts, the rows of a list, a field's box, every control role) cannot, as everywhere. `im-content-text` stays for content outside a page |
| `im-toolbar` | `im-content-toolbar` |
| `im-panel-strip` | `im-content-toolbar`; at the head of a panel, `im-panel-tools` |
| `im-master-detail` | Remove it: the detail is the inspector |
| `shellFrameHtml({ mainHtml })` | `contentHtml` (the children of the content's panel body), with `contentLabel` (the content region's name) and `inspectorLabel`; `contentHeaderHtml`, `contentToolsHtml` and `contentFootHtml` add the content panel's header, tools and foot; `sidebarHtml`, `statusHtml`, `actionsHtml` and `footerHtml` add the other regions |
| `shellFrameHtml({ mainId })` | `contentId` |
| `uiPart('main')` gave `main.im-main` | It gives a `main` with no class: the frame owns the content region |
| The app's own code that gives the focus back to the fold button, the sidebar button or a window button after `renderShellFrame`, or the sidebar list's scroll | Remove it: a kept control or region that held the focus holds it, the list stays the same element with its scroll, and the fold button's `aria-expanded` follows `data-im-sidebar-collapsed` as its name does. Focus on a row or a field the markup replaced is still the app's to restore (`captureDomState`, `restoreDomState`) |
| An attribute left out of the new markup, expecting `renderShellFrame` to remove it | Write its new value: `renderShellFrame` gives a region the attributes the markup writes and removes none |
| A `focusout` or `blur` handler on the fold button, the sidebar button or a window button that closes something | Expect it at every repaint: the control is moved into the new markup, which takes its focus away, and `renderShellFrame` gives it back, so `blur`, `focusout`, `focus` and `focusin` fire on it. A handler that closes something when the focus leaves looks again once the repaint is over (`document.activeElement`) |
| Listeners the app attaches to the sidebar's list (`.im-list`) after each `renderShellFrame` | Attach them once: the list is now the same element across repaints, so attaching after each repaint attaches them again. Listen on the list once, or on the sidebar, and read the rows from the event's target |

None of the parts of a sidebar row of 0.1.4 keeps its name: each has a part of `im-row` that does its job. The
breakpoints of what stays follow the shell (`@container im-shell` at 1000, 850 and 620), not the screen.

### Controls

| Old name | New name, or what to do instead |
|---|---|
| `im-native-controls` | Remove it. Each native control carries the class of its drawing: `input.im-input` or `span.im-input > input`, `select.im-select`, `textarea.im-textarea`, `input.im-check`, `input.im-radio`, `input.im-switch` with `role="switch"`, `im-seg` over radios. A native control without a class keeps the browser's drawing. `uiPart('dialog')` and the graph editor no longer add it |
| `im-native-input` | `im-input` on the `input` itself, or `<span class="im-input"><input></span>` when the field holds an icon or a key cap |
| `im-native-select` | `im-select` on the `select` |
| `im-native-textarea` | `im-textarea` on the `textarea` |
| `im-native-check` | `im-check` on the `input type="checkbox"` |
| `im-native-radio` | `im-radio` on the `input type="radio"` |
| `im-native-choice` | `im-check` or `im-radio` on the input: nothing is drawn with `accent-color` |
| `im-seg--native` | `im-seg` alone, over `label > input[type=radio] + span` |
| `im-seg--choice` | `im-seg` alone; `segmentedControl` writes it, with the text of each choice in a `span` after its radio |
| `im-switch-knob` | Nothing: `im-switch` draws its thumb itself; `switchHtml` writes an empty button |
| `textarea.im-input` | `textarea.im-textarea` |
| `textFieldHtml(…, { mono: true })` writing `class="im-mono"` on the input | It writes `<span class="im-input im-input--code">` round the input |
| `uiInput()` writing `im-native-input`, `im-native-check` or `im-native-radio` | `uiInput()` still returns the input, now with `im-input` on a text type (the field's box drawn on the input itself), `im-check` on a checkbox and `im-radio` on a radio. A field with an icon or a key cap is written with the box round the input (`textFieldHtml`, or a `uiPart` given the class `im-input`) |
| `uiInput()` in the box of a field (`span.im-input`, as `pathField` puts it), drawn with two edges when disabled and two rings when focused | Nothing to do: the input inside the box has no frame, fill or ring of its own |
| `uiSelect()` writing `im-native-select`, `uiTextarea()` writing `im-native-textarea` | They write `im-select` and `im-textarea` |
| `selectHtml` writing a bare `select` | It writes `select.im-select`; a `class` in `attrs` is added after it |
| `checkboxOptionHtml` and `choiceRowsHtml` writing a bare checkbox | They write `input.im-check` |
| `inputHtml` and `settingInputHtml` writing a bare input | They write `<span class="im-input"><input></span>` |
| `.im-picker-mark` drawing its own check, `data-im-checked` on it | The mark holds a `span.im-check` with `role="checkbox"` and `aria-checked`; the attribute of 0.1.4 is gone. The mark has no hand cursor |
| `.im-choice-row[aria-selected="true"]`, its own fill and accent edge | `im-choice-row` is no longer a drawing: a row of a choice list is an `im-row` with `aria-selected="true"`, or an `im-btn` with `aria-pressed="true"` (`.im-choice-row.im-btn` only lays out its two texts), and takes the common selection of the one or the other. A bare `.im-choice-row` with neither class draws nothing |
| `.im-choice-list button[aria-pressed="true"]`, a chip fill and a bar at its start | The same: the button is an `im-btn` with `aria-pressed="true"`, or the row an `im-row` with `aria-selected="true"`, with the common selection. The list's hover is only for a button that is not an `im-btn` |
| `.im-row[aria-pressed="true"]`, `.im-row[aria-current="page"]`, `.im-btn[aria-pressed="true"]` in the accent colour | The selection of the row (its fill and a heavier title) and of the button (the selection fill, a 2px bar inside its bottom edge in the accent text colour, and in Smooth the weight 600), the same for `aria-selected="true"`, an `aria-current` that is not `"false"` and `aria-pressed="true"`, on `im-row`, `im-tab`, `im-tree-item`, `im-menu-item`, `im-btn` and the segments of `im-seg`. A primary and a confirming danger button keep their fill and take the bar in their text colour |
| `.im-setting-row input` 260px wide | The field's box, `.im-setting-row .im-input`, is 260px: the box round the input as `settingInputHtml` writes it, or the input itself |
| `.im-editor-inspector input, select, textarea` stretched to its width | Its fields are stretched (`im-input`, `im-select`, `im-textarea`); a checkbox and a radio keep their 16px |
| A `select.im-select` that the browser autofills, losing its chevron | Nothing to do: it keeps its chevron |

### The tiling workspace

Every class of the package starts with `im-`, and the tiling workspace (`createTilingWorkspace`) wrote `wm-` classes.
Each is now the `im-` class of the same name; where that name was already a class of the package, the name takes `tile`
after the prefix, and so do the classes of the workspace's tabs, so that none of them reads as a part of the title bar's
tabs. The ids the
workspace makes for its tabs and panels are ids, not names an app writes: they are unchanged.

| Old name | New name, or what to do instead |
|---|---|
| `wm-host` | `im-host` |
| `wm-canvas` | `im-tile-canvas` (`im-canvas-panel` is the canvas of a page) |
| `wm-pane` | `im-pane` |
| `wm-focused` | `im-focused` |
| `wm-header` | `im-header` |
| `wm-chrome` | `im-chrome` |
| `wm-control` | `im-control` |
| `wm-pane-focus` | `im-pane-focus` |
| `wm-pane-tools` | `im-pane-tools` |
| `wm-tabs` | `im-tile-tabs` (`im-tabs` is the strip of tabs of the title bar and of a panel) |
| `wm-tab` | `im-tile-tab` (`im-tab` is a tab of the title bar and of a panel) |
| `wm-tabwrap` | `im-tile-tabwrap` |
| `wm-tabwrap-active` | `im-tile-tabwrap-active` |
| `wm-tab-close` | `im-tile-tab-close` |
| `wm-tab-toned` | `im-tile-tab-toned` |
| `wm-tab-dragging` | `im-tile-tab-dragging` |
| `wm-tabs-filtered` | `im-tile-tabs-filtered` |
| `wm-body` | `im-tile-body` (`im-body` is the shell's row of the sidebar and the work area) |
| `wm-placeholder` | `im-placeholder` |
| `wm-empty-start` | `im-tile-empty-start` (`im-empty` is the empty state of a panel) |
| `wm-collapsed` | `im-collapsed` |
| `wm-splitter` | `im-tile-splitter` (`im-splitter` is the handle of `splitView`) |
| `wm-drop-preview` | `im-drop-preview` |
| `wm-drop-label` | `im-drop-label` |
| `wm-drop-marker` | `im-drop-marker` |
| `wm-drag-ghost` | `im-drag-ghost` |
| `wm-changing` | `im-changing` |
| `wm-dragging` | `im-dragging` |
| `wm-status` | `im-tile-status` (`im-status` is the shell's status row) |
| `wm-add` | `im-add` |
| `wm-filtered-out` | `im-filtered-out` |
| `wm-parking` | `im-parking` |
| `data-wm-key` | `data-im-tile-key`, on the workspace's controls, tabs and handles (`data-im-key` is the focus key of a repaint) |
| `--tab-tone` | `--im-tile-tone`, which the workspace sets on a tab from `toneForView`; an app reads it, never sets it |
| The selected tab of a pane filled twice, by its wrap and by itself | Nothing to do: the wrap (`im-tile-tabwrap-active`) holds the selection fill, and the selected tab in it is not filled again, so its text sits on the selection once |

### Messages and states

| Old name | New name, or what to do instead |
|---|---|
| `bannerHtml(options)` | `noteHtml({ icon, title, message, items, actionsHtml, tone })`, in the panel or page it is about, never across the window. A title and a line write the compact `im-note` (an icon of the package first, when given); a list or actions write `im-note im-note--block` |
| A note written by hand (`<div class="im-note">` with its icon, `b` and `span`) | `noteHtml({ icon, title, message, tone })` writes the same markup |
| `BannerOptions` | `NoteOptions`; its `title` is optional and its `tone` is a status tone |
| `im-banner` | `im-note im-note--block`: a title in `b`, the message in `p`, a `ul` of `<b>label</b>: message`, the buttons in `im-action-row` |
| The icon of a block note above its title | Nothing to do: it sits beside its title, at the gap of the compact note, and the title, the paragraph, the list and the actions are one column to its right |
| `im-callout` | `im-note` (`noteHtml({ message })`); its tone, if any, in `data-im-tone` |
| `busyIndicatorHtml(label)` | An operation in the content: `loader(doc, label)` (`im-loader`, inline). A button that runs it: `aria-busy="true"` on the button. A panel that loads: its loading state (`setPanelState`, `panelStateHtml`) |
| `im-busy` | The same: `im-loader`, `aria-busy="true"` on the button, or the panel's loading state. Nothing is fixed to the corner of the window |
| `loadingStateHtml(label)` | `panelStateHtml({ kind: 'loading', rows })` as the panel body, with `aria-busy="true"` on the panel; or `setPanelState(panel, { kind: 'loading', rows })`, shown after `showAfter(LOADING_DELAY_MS, …)`. Flat bars, never a spinner in place of the panel |
| `im-zero-state` | `im-empty`: `emptyStateHtml(title, description, actionHtml)`, or `setPanelState(panel, { kind: 'empty', title, text, action })` |
| `im-empty-message` (in the file workspace's panes) | `im-empty`, as above |
| The `im-empty` of `css/forms.css` (centred, muted, 24px of padding, a 15px title) | The `im-empty` of `css/controls.css`, the one `setPanelState` draws: start-aligned, a dashed edge, inside the panel body; its title (`strong`) is 14 |
| `emptyStateHtml` wrote `<div class="im-panel im-surface im-empty" data-im-surface="sheet">` | It writes the empty layer of `setPanelState`, `<div class="im-empty" data-im-state-layer="empty">`: put it in an `im-panel-body`. An empty title writes no `strong` |
| `im-step-nav` | `im-steps`. `stepNavigationHtml` writes `ol.im-steps[role=tablist]`, each `li[role=presentation]` holding its `button[role=tab]`; the label is the text of `im-step-text` (no `strong`), the detail `small.im-step-sub`. The selected tab is drawn as the current step |
| The tone `danger` | `err`. A menu item with `danger: true` carries `data-im-tone="err"` |
| The tone `good` | `ok` |
| The tone `bad` | `err` |
| The tone `accent` on a note, a status text or a settings message | No tone: a message takes a status tone. The accent stays on a chip, a dot and a summary; on text, use the class `im-text-accent` |
| `ChipTone` with `'good'`, `'bad'`; `chipHtml(label, string)`, `summaryHtml({ tone: string })` | `ChipTone` is `'' \| Tone \| 'accent'` |
| `statusTextHtml(text, tone)` and `settingsMessageHtml(…, { tone })` with any string | A status tone (`Tone`), or `''` for a status text |
| `data-im-tone=""` (`chipHtml`, `actionChipHtml`, `summaryHtml` without a tone) | No attribute: a chip without a tone is the neutral chip (`--im-chip`, `--im-chip-text`) |
| `im-accent` | `im-text-accent` |
| The accent colour of `im-kicker` | `im-kicker im-text-accent`: the kicker keeps its size, the colour is the class's |
| `im-warning` | `im-text-warn` |
| `im-error` | `im-text-err` |
| `.im-native-controls [role="status"][data-state="error"]` in the error colour | `statusTextHtml(text, 'err')` |

In TypeScript a tone outside its set is a type error; from plain JavaScript it is written as no tone.

### Dialogs and side panels

| Old name | New name, or what to do instead |
|---|---|
| `im-content-dialog--drawer` | Remove it. A panel for the selected object is `inspector(shell).open(content, opener?)`: not modal, docked from 1000 up and over the content's edge under it. A dialog is centred |
| `im-content-drawer` | `inspector(shell).open(content, opener?)`. The attribute that hid it while another surface covered it goes too: the inspector hides what it covers by itself (`push`). A form that must block the window while it saves is a dialog instead: `openFormDialog`, locked while it writes, or `createContentDialog` with `canDismiss` |
| `im-sectioned-drawer` | `inspector(shell).open(content, opener?)`; its sections, one under the other, are `im-section`, with 16px between two. A form that must block the window while it saves is a dialog, as above |
| `im-padded-drawer` | `inspector(shell).open(content, opener?)`, or a dialog for a form that must block the window while it saves, as above |
| `createContentDialog(shell, options).show(markup, 'drawer')` | `show(markup)`. The second argument is gone: a dialog is always the centred one. To open a side panel, use the inspector |
| `dialog.im-content-dialog.im-native-controls` with a section heading | `dialog.im-content-dialog` with a section heading, which `uiPart('dialog')` writes |
| A content dialog taller than the window, opened scrolled down to its first control (a Close button under a long text) | `openContentDialog` and `createContentDialog` open it at its top, with the focus on the dialog. A control that must take the focus when it opens carries `autofocus`: it takes it, as before |
| `formHeaderHtml(title, subtitle, locked, id)`, its close button named `Close` with no tooltip | `formHeaderHtml(title, subtitle, locked, id, closeLabel)`: `closeLabel` (default `Close`) is the close button's `aria-label` and its `title`. An app in another language passes its word |

### Keys and commands

| Old name | New name, or what to do instead |
|---|---|
| A command of the app bound to `Escape` that also ran when the same Escape closed the inspector, the sidebar drawer, a menu, a sheet, a dialog or the palette | A key is answered once. A handler of the package that answers a key claims it (`claimKey(event)`, beside its `preventDefault()`), and `registry.attach` runs no command for a claimed key. The package's handlers of Escape claim it when they close something, and a claimed Escape stays claimed until its keyup: its repeats run no command either. The app's Escape command runs on the next press, which nothing else claims. A command that relied on running after the inspector closed calls what it needs itself |
| An app's own handler that answers a key, then expects the command bound to that key not to run | Claim the key in that handler: `claimKey(event)` from `@acaprino/imago/ui`, or `claimKey(event.nativeEvent)` from a React handler, and add the handler before `mountApp`, so it runs before the registry. Preventing its default is not enough: a key that is only prevented still runs its command, as Ctrl+F does after `guardDesktop` refuses it to the browser (the guard and the zoom keys claim nothing) |
| A command bound to a key that a list or a surface of the package answers: an arrow, `Home`, `End` (or `Space` or `Enter` in a list with `onSelect`) on an item of a `roving` list, the palette's field, the file tree, the graph, a splitter, the tiling workspace, the dock tabs' move mode, the search picker, `stepNavigationKey`, `Tab` kept inside a dialog or a sheet | That handler claims the key, and the command does not also run. Bind the command to another key, or let it run from outside the list or the surface |
| A command bound to `F6` or `Shift+F6` | Remove it: they move between the regions. `regions` listens after the registry, so such a command would run instead of the move |
| An app's own handler (on the window, while capturing) that prevents the default of Escape, then expects the top layer to close as well | The layer stays: `attachLayers` closes nothing for an Escape that is already prevented |
| A held Escape in the inspector that closed every view pushed with `push` | One view per press, as one layer per press. The repeats of a held key are claimed: they run no command |
| `attachLayers`, `registry.attach`, `regions`, `sidebarDrawer`, `sidebarCollapse` called one by one; `Ctrl+K` and `Ctrl+F` registered by the app | `mountApp(shell, registry, options)` makes these calls, and registers `Ctrl+K` (`PALETTE_COMMAND`) and `Ctrl+F` (`SEARCH_COMMAND`, which calls `options.search`). Remove the app's own commands with those ids or keys, or `mountApp` throws |
| `mountApp` attaching the registry before the sidebar drawer and the fold | The drawer and the fold are attached before the registry, after the layers: the drawer claims the Escape that closes it before the registry sees it. The order of `register` calls and of the undo is unchanged |
| The errors of `mountApp`, which were the registry's own message (`Command "imago.palette" is already registered`, `Keys "Ctrl+K" of "imago.palette" are already bound to "open"`) | The same message after `mountApp: `, with the registry's error as its `cause`. Every error that `mountApp` or the function it returns throws starts with `mountApp: ` |
| `footerKeys(doc, registry, ids)` | `footerKeys(doc, registry, entries)`: an entry is a command id, as before, or `{ keys, title }` for a key of a list that is not a command (the arrows, Space, Enter). `keys` is in the grammar of a command's keys; several bindings are separated by a space (`'ArrowUp ArrowDown'`). A footer key list written by hand (`<kbd class="im-key">↑↓</kbd>move`) goes through `footerKeys` |

### Look and theme

| Old name | New name, or what to do instead |
|---|---|
| The app's own commands, controls or Settings view to pick the look (Smooth, ONI) and the theme (follow Windows, light, dark) | `mountApp(shell, registry, { …, appearance: { get, set, labels } })`. It registers five palette commands, alike in every app: `imago.look.smooth`, `imago.look.oni`, `imago.theme.system`, `imago.theme.light`, `imago.theme.dark`, in the group `Appearance`, titled `Smooth look`, `ONI look`, `Follow Windows`, `Light theme`, `Dark theme` (an app in another language passes `labels`). No key is bound. The command of the current choice is not offered, and does nothing when it is run anyway. The app keeps the choice where it keeps it today, gives it back in `get`, and in `set` stores it and calls `applyLook`; the package stores nothing. Remove the app's own commands with those ids, or `mountApp` throws |
| `applyShinatamaPalette`, `SHINATAMA_PALETTES`, `ShinatamaPaletteTokens` from `@acaprino/imago/shell` | Removed from the package: the skins are Shinatama's, as overrides of tokens. Shinatama takes them from the tag `v0.1.4` (`git show v0.1.4:ts/shell/shinatama-palette.ts`, and `tests/shinatama-palette.test.ts` beside it) |
| A size of text of the package off the scale | It is on the scale, a type token: 11.5px is 12; 12.5px is 13 for a label or body text and 12 for meta text; 13.5px and 15px are 14 (the wordmark among them); 17px, 20px (ONI's wordmark) and 1.65rem (a metric's value, which was 26.4px) are 18; .8rem (a caption) is 12. Nothing for an app to rename, but some text moves |
| A space of the package that was not a step of 4, 8, 12, 16, 24 | The nearest step, the lower one between two (3px is 2, 6px is 4, 10px is 8, 14px is 12, 20px is 16, 36px is 24). The heights of the controls, rows, bars and headers, the radii and the colours do not change |
| The hand cursor of a disclosure's summary | The arrow, as on every control |

### The mark and the icons

| Old name | New name, or what to do instead |
|---|---|
| `brand.image` of `titlebarHtml` (`titlebarHtml({ brand: { name, image } })`) | `titlebarHtml({ brand: { name } })`: the title bar shows the mark and the name. The app's logo stays what Windows shows: the icons of its executables (section 5, "The icons of the executables") |
| `im-brand-image` (an `img` in `im-brand`) | The mark and the name: `<span class="im-mark" aria-hidden="true">M</span><span class="im-wordmark">Muro</span>` in `im-brand`, as `titlebarHtml` writes them. `imago-check` reports it (rule `brand-mark`) |
| A drawn symbol in `im-mark` (an `svg`, the gallery's symbols) | The initial of the name in capitals as the text of `im-mark`: `<span class="im-mark" aria-hidden="true">X</span>`. The `svg` rule of `im-mark` is removed |
| Text other than one capital letter in `im-mark` (`d.`) | The initial in capitals, `D` |
| The name alone in `im-brand`, or an app's own mark in it (`<i class="brand-mark">`, an `svg` of its own) | `im-mark` with the initial, then `im-wordmark` with the name |
| The app's own icon for its window program or its command-line program (a logo PNG, a hand-made `.ico`) | The files of `node_modules/@acaprino/imago/icons/<app>/`, copied into the app (section 5, "The icons of the executables"). A Tauri app's `src-tauri/icons/` takes `32x32.png`, `128x128.png`, `128x128@2x.png` (the package's `256x256.png`), `icon.png` and `icon.ico` |
| The app's own favicon | `favicon.svg` and `favicon.ico` of the same folder |

### The window code

| Old name | New name, or what to do instead |
|---|---|
| `ZoomOptions.levels` (`mountZoom`, `createZoomController`) | Remove it. The steps are 10: 50, 60, ... 200%. A level an app saved earlier is rounded to the nearest multiple of 10, half up, and kept from 50 to 200 (a saved 67 becomes 70, 175 becomes 180, 125 becomes 130). The levels of 0.1.4 that were not multiples of 10 (67, 75, 125, 175) are not offered any more |
| `clampZoom(value, levels)`, `stepZoom(current, direction, levels)` | `clampZoom(value)`, `stepZoom(current, direction)`: the last parameter is gone |
| `WindowButtonLabels` with `minimize`, `maximize`, `close` | `windowButtonsHtml` (and `titlebarHtml`'s `windowControls`) also writes a `title` on each button, `Minimize`, `Maximize` and `Close` by default. The labels object gains three required words, `minimizeTitle`, `maximizeTitle`, `closeTitle`: an app that passes its labels passes the three tooltips too |
| `mountWindowControls` writing "Restore window" and "Maximize window" on an app in another language | `mountWindowControls(titlebar, api, { labels: { maximize, restore, maximizeTitle, restoreTitle } })`; a word left out is the English one |
| `setWindowTheme: (theme) => …` in the `deps` of `applyLook` | `setWindowTheme: (theme, { look, resolved }) => invoke('set_window_theme', { theme, look, resolved })`. The second argument is the look (`smooth` or `oni`) and the theme the page draws (`light` or `dark`). `applyLook` now calls it when the word, the look or the theme drawn changed, not only the word: under `system` it is called again when Windows changes its colours. A function that takes only the word still works, and the window then tints for Smooth |
| `apply_theme(&window, theme)` | `apply_theme(&window, theme, look, resolved)`: `look` is a `Look`, `resolved` the `tauri::Theme` the page draws. In the app's `set_window_theme` command, take `look: Option<String>` and `resolved: Option<String>` besides `theme` and get both from `drawn_by_page(theme, look.as_deref(), resolved.as_deref())`, which gives a page that sends neither Smooth in the word's own theme (dark for `system`). Call it on the glass window only, the one built with `glass_window_config`: it also gives the window the acrylic effect |
| The app's own code that trims WebView2's context menu, tints the acrylic for light and dark, or ignores the failures WebView2 reports while the application closes | The crate does the three: `trim_context_menu(&window)` in a release build, `apply_theme` with the look and the theme drawn, and `Recovery::close` when an exit begins or a window closes for good ([desktop-shell.md](desktop-shell.md), sections 3.2 and 4) |

### The React binding

| Old name | New name, or what to do instead |
|---|---|
| `DetailPanel` | Remove it. The details are the children of the inspector: give them to `Workbench` as `details`, with `detailsLabel` for the inspector's name. The inspector is `hidden` while `details` is empty |
| `Workbench` as a `main` | `Workbench` writes `div.im-body`, the body of a shell: put it in `Shell`, or in any element with `im-shell`. The sidebar, the content region (`main.im-panel.im-content`, id `main`) and the inspector (`section.im-panel.im-inspector`) are its regions |
| `Workbench`, the attributes of its `main` | They go on the content region. Its `id` is `contentId` (`main` by default) and its `tabIndex` is `-1` (the skip link's target), and `Workbench` does not take them |
| `Workbench`'s `navigation` in an `aside` | The sidebar, `section.im-panel.im-sidebar` with the id `sidebarId` (`sidebar` by default): a panel header with `navigationLabel` as its title, and the rows in `im-panel-body im-list`. `navigationLabel` is required with `navigation`; without `navigation` there is no sidebar, and `Shell` takes no `sidebar` |
| `Workbench`'s `details` required | `details` is optional, and `detailsLabel` (the inspector's accessible name) is required |
| `Workbench`'s `wide` | `inspector="wide"` on `Shell`, which writes `data-im-inspector="wide"`. `Workbench` ignores `wide`: a component cannot reach the shell it is in |
| `Workbench` as the window | `Shell`: `div.im-shell` with `sidebar` (`data-im-sidebar="on"`, or `"off"`), `inspector`, `titlebar` and, with `skipLabel`, the skip link. The app, the look and the theme are not the shell's: `applyLook` writes `data-im-app`, `data-im-look` and `data-im-theme` on the root element |
| A status row, an action bar or a footer written by hand beside a React `Workbench` | `Workbench`'s `status`, `actions` and `footer`: the children of `im-status`, `im-actions` and `im-footer`, in the order of `shellFrameHtml` |
| `Workbench`'s fixed ids `main` and `sidebar` (`href="#main"` that a hash router takes) | `contentId` and `sidebarId`, `main` and `sidebar` by default. Give the same `contentId` to the `Shell`: its skip link goes there. Without it, the `Shell` takes the `contentId` of a `Workbench` that is its direct child, else `main`; a `Workbench` in a fragment, a `Suspense` or a component of the app is not seen |
| `Shell` without `skipLabel`, `Workbench` without `aria-label` | Both are required in `react/index.d.ts`: give the words in the app's language |
| `ListAction`'s `title` as the button's tooltip | `tooltip`, the HTML `title` of the button. `title` is the row's title |
| `ListAction`'s `icon` given an `im-rail-item` so the row shows something in the rail | `rail`: the children of a `span.im-rail-item` the row writes first. `icon` is what the whole row shows |

### The check

| Old name | New name, or what to do instead |
|---|---|
| The lines of 0.1.4 in `AGENTS.md` and `CLAUDE.md` | The lines of section 9, which also say `Run npx imago-check before you say UI work is done.` (rule `agent-rules`) |
| No `"imago"` block in `package.json`, no check in CI | The `"imago"` block of section 9, and `npx imago-check` in the app's CI. A finding fails the run |
