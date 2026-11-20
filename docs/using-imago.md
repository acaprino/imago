# Using Imago in an app

How an app of the suite depends on Imago, what it imports, what markup it writes, what it calls, what it must still
do itself, and in what order it adopts the package. The rules of the design are in [design-file.md](design-file.md);
the window techniques are in [desktop-shell.md](desktop-shell.md).

Imago is a package of CSS, TypeScript and one Rust crate. There is no UI framework in it, and the app needs none.

## 1. Depend on it

The npm package is `@acaprino/imago` and the Rust crate is `imago-shell`. Both come from the repository
`acaprino/imago`, and an app pins both to the same version.

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
- A git install runs the package’s prepare script to compile its TypeScript into ES modules and type declarations.
  Vite and Node use the same entry points. A consumer test can import the command registry directly with Node 24.
  Browser interactions still require a DOM. The package includes its design and component documentation under docs/.

## 2. Package imports

| Import | What it is |
|---|---|
| `@acaprino/imago/css/imago.css` | The stylesheet: tokens, base, layout primitives, controls, surfaces and the ONI look. Import it once, first |
| `@acaprino/imago/tauri` | Window controls for Tauri 2 apps. Requires `@tauri-apps/api`. |
| `@acaprino/imago/ui` | Behaviour without a framework: the command registry, keys, menus, sheets, dialogs, notices, the inspector, the palette, panel states, the sidebar functions |
| `@acaprino/imago/shell` | The desktop window as the page sees it: look, window theme, zoom, window buttons, the desktop guard |

`@acaprino/imago/tokens` is the token source, `tokens/imago.tokens.json`, for any other tool.

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

Do not write these by hand in code that changes them. `applyLook(root, state, deps)` writes the three attributes and
the class, sets `color-scheme`, resolves the theme `system` to `dark` or `light`, and tells the native window its
theme. Call it before the first paint, and again when the user changes the look or the theme, and when Windows changes
its colours while the theme is `system` (listen to `matchMedia('(prefers-color-scheme: dark)')`). Where the choice is
stored is the app's business; read it back through `parseLook(value)` and `parseTheme(value)`.

## 4. The shell markup

The seven regions, with the real class names. Everything an app does not use can be left out: an app without a
sidebar sets `data-im-sidebar="off"` and writes none.

```html
<div class="im-shell" data-im-sidebar="on">
  <header class="im-titlebar" data-tauri-drag-region>
    <div class="im-brand" data-tauri-drag-region><span class="im-mark" data-tauri-drag-region><svg viewBox="0 0 24 24" aria-hidden="true" data-tauri-drag-region>…</svg></span><span class="im-wordmark" data-tauri-drag-region>Name</span></div>
    <button type="button" class="im-icon-btn im-sidebar-toggle" aria-label="Threads" title="Threads" aria-expanded="false" aria-controls="sidebar">…</button>
    <nav class="im-tabs" role="tablist" aria-label="Views">
      <button type="button" role="tab" class="im-tab" aria-selected="true">First view</button>
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
        <h4 class="im-panel-title">Threads</h4><span class="im-spacer"></span>
        <button type="button" class="im-icon-btn im-sidebar-collapse" aria-label="Collapse sidebar" title="Collapse sidebar" aria-expanded="true" aria-controls="sidebar"
                data-im-label-collapse="Collapse sidebar" data-im-label-expand="Expand sidebar">…</button>
      </header>
      <div class="im-panel-body im-list" role="listbox" aria-label="Threads">
        <div class="im-row" role="option" aria-selected="true" title="Thread name">
          <span class="im-rail-item" aria-hidden="true"><svg class="im-icon" viewBox="0 0 24 24">…</svg></span>
          <span class="im-row-text"><span class="im-row-title">Thread name</span><span class="im-row-sub">3 sessions</span></span>
        </div>
      </div>
    </section>
    <div class="im-work">
      <div class="im-status"><span class="im-chip" data-im-tone="ok">Ready</span><span class="im-status-text">Summary</span><span class="im-spacer"></span><span class="im-status-end">Info</span></div>
      <div class="im-columns">
        <section class="im-panel im-content" aria-label="First view">…</section>
        <section class="im-panel im-inspector" aria-label="Inspector" hidden>…</section>
      </div>
      <div class="im-actions"><button type="button" class="im-btn im-btn--primary"><span>Apply</span><kbd class="im-key">↵</kbd></button></div>
      <footer class="im-footer"><span class="im-dot" data-im-tone="ok"></span><span class="im-footer-text">State</span><span class="im-spacer"></span><span class="im-footer-keys"><span><kbd class="im-key">F6</kbd>next region</span></span></footer>
    </div>
  </div>
</div>
```

The real, complete markup of all five apps is `shellMarkup` in `gallery/apps.ts`. Notes:

- `im-shell` fills its parent (`block-size: 100%`) and measures its own width, so the breakpoints follow the window.
  Put it directly in `<body>`, or in an element that fills the window.
- `im-content` has no style of its own. It is the hook the `F6` key looks for, so every window that has a content
  region carries it.
- Every sidebar row carries an `im-rail-item`: it is all the row shows in the rail. It is the row's own icon, as in the
  markup above, or, when the app has no icon that tells its rows apart, an avatar with the row's initials
  (`<span class="im-avatar im-rail-item">CA</span>`). A row without one is blank in the rail. The row's `title` is the
  tooltip, and its text stays in the rail, hidden, as the accessible name.
- Tauri starts a window drag only when the pressed element itself carries `data-tauri-drag-region`, and nothing in
  `css/` changes what a child does with the pointer. Put the attribute on each element that should drag: the title
  bar, the spacer, and the brand with everything inside it (`im-brand`, `im-mark`, the `svg` and each of its shapes,
  `im-wordmark`), as `markDragRegion` in `gallery/mount/desktop.ts` does with `.im-brand *`. Leave the buttons, the
  tabs and the command field unmarked. The drag needs two permissions: see "The capabilities" in section 5. Whether
  the window drags on a real window is in [verification.md](verification.md).
- The inspector is closed with `hidden`; the content then takes its room. `inspector(shell).open(content)` opens it.
- A panel that shows an empty, loading or error state needs `im-panel-body`: `setPanelState` puts its layer there.

### The window buttons

`mountWindowControls` finds the buttons by `data-im-window="minimize"`, `"maximize"` and `"close"` inside the title
bar. A button that is missing is skipped. On the maximize button the page sets `data-im-os` (`hover` or `pressed`,
from Windows' own hit test), and, when the app gives `onMaximized`, `data-im-maximized` (`true` or `false`) with a
matching `aria-label` and `title`. The maximize button holds two icons, maximize first and restore last: the CSS shows
one of them by `data-im-maximized`.

## 5. The calls

A call that sets something up returns the function that undoes it. The calls that give something else back are `createRegistry` (the registry), `confirm` (a promise), `inspector` (the inspector), `showAfter` (the function that cancels it), `formatKeys` (a `string[]`), `keyCaps` (an element), `setPanelState` and `applyLook` (nothing), and the `parse`, `resolve` and `windowThemeFor` functions (a value).

### `@acaprino/imago/shell`

| Call | What it does |
|---|---|
| `applyLook(root, state, deps)` | The look of the window. `state` is `{ app, look, theme, glass }`; `deps` is `{ systemIsDark?, setWindowTheme? }`. `setWindowTheme` receives `light`, `dark` or `system` and is called only when the word changed |
| `parseLook(value)`, `parseTheme(value)` | A stored value back into a look or a theme choice. A stale or corrupt value is the default |
| `resolveTheme(choice, systemIsDark)`, `windowThemeFor(look, choice)` | The theme the page draws, and the theme the native window is asked for |
| `guardDesktop(document, { allowReloadIn })` | With `keyPhase` set to `bubble`, register app shortcuts before the guard to handle keys such as Ctrl+F. The default is capture. Browser keys do nothing, the page menu stays out of the chrome, the mouse's back and forward buttons do nothing, images and links are not dragged out. `allowReloadIn` is a selector for places that run their own keys and menus, such as a terminal. The guard refuses F5, F12, Ctrl+R, Ctrl+Shift+I, J and C and the page menu in every build, so under `tauri dev` it also takes away reload and DevTools: call it only outside development, as the sketch below does |
| `mountZoom(document, { apply, storage?, storageKey?, onChange? })` | `Ctrl+=`, `Ctrl+-`, `Ctrl+0` and `Ctrl`+wheel, from 50 to 200% in steps of 10, saved. The saved level is applied at start, also at 100%. `apply` gives the level to the webview. A refusal moves the level back. `storageKey` defaults to `imago.zoom`: an app passes its own key to keep the level it already saved |
| `mountWindowControls(titlebar, api, { onError })` | The three window buttons, and the maximize button's rectangle for Snap Layouts, reported in physical pixels |

`clampZoom`, `stepZoom`, `zoomDirection` and `wheelPixels` are the pure parts of the zoom, exported for tests.

`WindowApi` is what the page needs of the window, so the module needs no Tauri: `minimize()`, `toggleMaximize()` and
`close()` (each may return a promise), `reportMaximizeRect(rect)`, `onOsHover(callback)`, and optionally
`onMaximized(callback)`. With Tauri 2, as a sketch and not a file to paste (`look`, `theme` and `shell` are the app's
own values, and `notify` is imported from `@acaprino/imago/ui`):

```ts
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { applyLook, guardDesktop, mountWindowControls, mountZoom } from '@acaprino/imago/shell';
import { tauriWindowApi } from '@acaprino/imago/tauri';

const onError = (action: string, error: unknown) => notify(shell, `${action} failed: ${String(error)}`, { tone: 'err' });
const api = tauriWindowApi(onError);
applyLook(document.documentElement, { app: 'muro', look, theme, glass: true }, {
  setWindowTheme: (word) => invoke('set_window_theme', { theme: word }),
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
catch, where it calls `listen`, as the sketch above does (the demo's `stopOnResolve` in `gallery/mount/desktop.ts`).
Left alone it is an unhandled rejection, and the page never hears `caption-maximize`, so the maximize button draws no
hover or press from Windows.

### `@acaprino/imago/ui`

| Call | What it does |
|---|---|
| `createRegistry()` | The command registry of the app. `register({ id, title, keys?, group?, when?, run })` returns the function that unregisters; `list()`, `get(id)`, `match(event)`; `attach(document)` runs the matching command on `keydown` and cancels the browser's own action. `keys` is `Ctrl`, `Shift` and `Alt` in that order, then one key name, joined by `+`: `Ctrl+K`, `F6`, `Ctrl+=`. In a text field (an `input`, a `textarea`, a `select`, editable content) a key pressed without Ctrl or Alt belongs to the field, whether it types (`a`, Space) or edits and moves (Delete, Backspace, Home, End, the arrows, Enter, Tab): a binding of it does not run there and the key is not cancelled. Escape, `F1` to `F24` and every binding with Ctrl or Alt still run in a field |
| `formatKeys(keys)`, `keyCaps(document, keys)` | The key caps of a binding, as text and as `im-key` elements |
| `attachLayers(shell)` | Escape closes the top surface only, and a press outside closes a menu or a sheet. Call it once for each shell. `confirm` and `openPalette` rely on it for Escape. Its returned function also closes every open surface |
| `openMenu(anchor, items)` | A menu under `anchor`. An item is `{ label, keys?, disabled?, danger?, run }` or `'separator'`. `disabled` is the reason, shown as the item's tooltip |
| `openSheet(anchor, content, { placement })` | A sheet docked to `anchor`. `placement` is `below` (the default), `pane-top` or `pane-bottom`. Closing it gives focus back to `anchor`, or, for a pane placement (a pane takes no focus), to what had focus when the sheet opened |
| `openFormDialog(shell, options)` | Pass a title and localized closeLabel. Append controls to the returned body and foot. Call form.lock(true) during a write and form.lock(false) when it finishes. Closing restores focus to the opener. |
| `confirm(shell, options)` | A dialog. Resolves `true` on the confirming button, `false` on Cancel or Escape. `options` is `{ title, body, confirm, cancel, danger? }` |
| `notify(shell, text, options)` | A notice. `options` is `{ tone?: 'err', action?: { label, run }, timeoutMs?, errorWord?, dismissLabel? }`. An error stays until it is dismissed |
| `inspector(shell)` | The inspector of the shell: `open(content, opener?)`, `close()`, `isOpen()`, and `guard(isDirty, ask)`, which asks once before the content is closed or replaced while it has unsaved changes |
| `openPalette(shell, registry, { placeholder, empty })` | The command palette over the shell: every available command of the registry, filtered as the user types |
| `roving(container, { item, orientation, onSelect })` | One tab stop for a list, and the arrows, Home and End inside it. This is how an app's own list takes the common keys |
| `regions(shell)` | `F6` and `Shift+F6` move focus between the sidebar, the content and the inspector |
| `setPanelState(panel, state)` | A panel is `ready`, `loading` with `rows`, `empty` with a sentence and an action, or `error` with a sentence and a Retry. The panel keeps its header and frame. Focus that was in the layer being replaced (a pressed Retry) moves to the new layer's button, or to the panel body when it has none |
| `showAfter(delayMs, show)` | Runs `show` after a delay and returns the function that cancels it. `showAfter(LOADING_DELAY_MS, …)` is how a loading state shows only after 300ms |
| `sidebarDrawer(shell)` | Below 620 the title-bar toggle opens the sidebar as an overlay and moves focus into it. A second press of the toggle, or Escape, closes it and gives focus back to the toggle. A press outside, or focus moving elsewhere, closes it and leaves focus where it went |
| `sidebarCollapse(shell, { collapsed, onChange })` | From 850 up, the button in the sidebar header folds the sidebar into the 56px rail of icons and back. See below |

```ts
import {
  attachLayers, confirm, createRegistry, inspector, notify, openMenu, openPalette, openSheet,
  regions, roving, setPanelState, showAfter, LOADING_DELAY_MS, sidebarCollapse, sidebarDrawer,
} from '@acaprino/imago/ui';
```

The layer functions that the surfaces are made of (`pushLayer`, `closeLayers`, `inertShell`, `trapTab`, `placeBelow`
and the rest of `layers.ts`) are exported too, for an app's own floating surface. Most apps never call them.

#### The sidebar fold

`sidebarCollapse(shell, { collapsed, onChange })` wires the button `im-sidebar-collapse` of the sidebar header. A
click sets `data-im-sidebar-collapsed` on the shell, so the CSS needs no script, and the button's label and
`aria-expanded` follow the state: `data-im-label-collapse` and `data-im-label-expand` hold the two names. **The
package does not store the choice.** The app keeps it through `onChange(collapsed)` and passes it back as `collapsed`
the next time. The button is shown from 850 up. From 620 to under 850 the rail is forced by the width, whatever the
choice. Under 620 the title-bar toggle of `sidebarDrawer` opens the whole sidebar.

## 6. What the app must do itself

The package does not do these. Each is a place where an app that forgets looks different from the others.

1. **Bind Undo.** The button in a notice (`action`) works by pointer. A key for Undo is the app's to bind in its
   registry.
2. **Ignore a second activation of a busy button.** `aria-busy="true"` stops the pointer, not the keyboard: Enter or
   Space on a busy button still fires its click. The handler returns at once when the button is busy, or the app sets
   `disabled`.
3. **Pass `onError` to `mountWindowControls`.** Without it a failed minimize, maximize or close is swallowed. Show it
   as a notice with `tone: 'err'`.
4. **Keep `SnapLayouts` and `Recovery` per window label** in the Rust state, and replace the `SnapLayouts` when a window
   is rebuilt. See [desktop-shell.md](desktop-shell.md), sections 3 and 4.
5. **Call `attachLayers(shell)` once for each shell,** and `registry.attach(document)`, `regions(shell)` and
   `sidebarDrawer(shell)` with it.
6. **Register the commands.** `Ctrl+K` opens the palette and `Ctrl+F` searches the current view, in every app: the
   app registers both, and the palette lists what the registry holds. Do not bind Enter or Space to a command: the
   focused control's own activation would also fire, and the registry does not look at what holds focus for those two
   keys. A button's key cap may show `↵`. `registry.attach(document)` runs no command while a dialog or the palette is
   open, so a key never acts behind a pending confirmation; an app that wants otherwise passes
   `{ runUnderModal: true }` as the second argument.
7. **Keep the choices:** the look, the theme and whether the sidebar is folded. The zoom is kept by `mountZoom`.
8. **Give the words.** The package's own words are English: `errorWord` and `dismissLabel` of a notice, `placeholder`
   and `empty` of the palette, `errorWord` of an error state, the labels of the confirm dialog. An app in another
   language passes its own.
9. **Name long labels.** A label longer than its room ends in an ellipsis; the element carries the whole label as its
   `title`.
10. **Check the window.** A screenshot of the page cannot judge the glass: capture the real window in both looks
    (see [desktop-shell.md](desktop-shell.md), section 1.5).

## 7. A control of your own

An app may have controls the package does not (a graph node, a lane, a pipeline step). The rule: build it from the
tokens, take the common states and keys, and keep it in the app until a second app needs it.

- Class names carry the app's own prefix, never `im-`. Custom properties of the app carry the app's prefix, never
  `--im-`.
- Every colour, size, radius, font and time is a token. A literal value is a bug in the next look.
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
  font: 400 13px/1.45 var(--im-font-text);
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
app's tests pass at the end of each.

**Part 1: tokens, controls and shell, with the layout unchanged.**

1. Add the dependency, pinned to a commit of Imago's `develop`, and the three imports. The crate pins Tauri and its
   neighbours: the app's `tauri` must resolve to exactly 2.12.5 (section 1), so check that before anything else.
2. Set the root attributes with `applyLook`. Map the app's own variables to `--im-*` in one place, or replace them.
   Delete the app's copies of what the package now has.
3. Replace the app's controls with the package's classes, one family at a time (buttons, fields, tabs, rows, tables,
   chips), and check each in the gallery against the app's accent.
4. Replace the app's own window code with the crate `imago-shell` and the modules of `@acaprino/imago/shell`: the
   native frame and Snap Layouts, the window theme, the guard, zoom, window state and WebView2 recovery.
5. Capture the real window in both looks, over a dark window and a bright one.

**Part 2: layout and behaviour.**

1. The seven regions and the three breakpoints. The inspector replaces the app's drawers and detail boxes.
2. The command registry, the palette, and the keys of the design file.
3. The surfaces: menus, sheets, dialogs and notices from the package, and the rules for destructive actions.
4. Empty, loading and error states through `setPanelState`.
5. Capture the real window again.

A release of the app to `main` pins a tag of Imago. The order of the apps is in [design.md](design.md): Xiox, Mukade,
Muro, Shinatama, and for Daodan the CSS and controls of its viewer only.

## 9. For the app's coding agents

Paste this into the app's `AGENTS.md`:

```markdown
Before UI work, read node_modules/@acaprino/imago/docs/design-file.md and the component or style files it references.
Apply its tokens and confirmed design choices within the requested scope.
Use the package's im- classes and --im- tokens. Build a control of your own from the tokens, never from literal colours or sizes.
Report conflicts and keep unresolved choices explicit.
```

and this into its `CLAUDE.md`:

```markdown
For UI work, apply the design file and inspect the project files it references.

@node_modules/@acaprino/imago/docs/design-file.md
```

The path assumes npm installs the whole repository, as it does for a git dependency. Check it in the first app that
adopts the package: if `node_modules` is out of reach of an agent's tools, copy the file in at install time.

## 10. A note on the token file

`tokens/imago.tokens.json` is in the Design Tokens Community Group format, 2025.10, with two conventions outside it:

- **A token of `$type` `string`**: the text case of a look, `case` (`none` or `uppercase`). The format has no type
  for a keyword.
- **A number with an `em` unit in its extensions**: the letter spacing of a look, `track`, is a `number` whose
  `$extensions.imago.unit` is `em`. The format's number has no unit.

The other additions are plain `$extensions`, which the format allows: `glass`, the translucent value of a colour under
`im-glass`, and `mix`, how a colour is mixed from another. A tool that rejects a `$type` it does not know will reject
the file: read `css/tokens.css` instead, which is generated from it.
