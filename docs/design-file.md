# Imago design file

The design rules of the suite: Shinatama, Xiox, Mukade, Muro and Daodan. Read this file before any UI work in
an app that uses Imago. It says what every app does the same way, what an app may do on its own, and which name in
the code stands for each rule. For each need it gives one way: where the package serves two markups with one drawing,
it says when each is used.

This file is the canon. Every rule is here; the other documents hold the calls, the markup and the techniques, and none
of them states a rule this file does not. Where another document and this file differ, this file wins.

## The documents

| Document | What it is for |
|---|---|
| [design-file.md](design-file.md) | This file: every rule, and the name in the code that stands for it |
| [using-imago.md](using-imago.md) | How an app adopts the package: the dependency, the imports, the shell markup, the calls, `mountApp`, the lines for its agents, and the table "Moving from 0.1.4" of what was removed |
| [desktop-shell.md](desktop-shell.md) | The window on Windows 11: the glass, the window techniques, the crate `imago-shell`, the wiring of an app in order, WebView2 recovery |
| [verification.md](verification.md) | What has been run on a real window, and what has not |
| [html-composition.md](html-composition.md) | The string renderers: what is escaped, the shell frame as a string, the atoms, and how a repaint keeps focus and scroll |
| [content-composition.md](content-composition.md) | The content of the content region: the renderers and DOM builders of the page patterns, and the workspace, project and file controls |
| [native-forms.md](native-forms.md) | Forms with native controls, their renderers and validation, the dialogs, and the wizard |
| [inspection.md](inspection.md) | Inspection content (a single choice, metrics, process stages, progress, notes) and the React binding |
| [graphs.md](graphs.md) | Directed graphs: the view, the grouped layout and the editor |
| [design.md](design.md) | The approved design with its reasons, and its "Corrections after the build" |

`design.md` is the approved design with its reasons; its corrections say what changed when the code was built. Where it
and this file differ, this file wins.

## Where each thing lives

| What | Where |
|---|---|
| Every value (colour, size, font, motion) | `tokens/imago.tokens.json`, the single source |
| The same values as CSS custom properties `--im-*` | `css/tokens.css`, generated: change the JSON, run `npm run tokens` |
| The whole stylesheet, in order | `css/imago.css`, which imports every file below |
| The window layout and its breakpoints | `css/primitives.css` |
| The controls and their states | `css/controls.css`, and `css/looks/oni.css` for what ONI draws differently |
| The floating surfaces (menu, sheet, drawer, dialog, notice, palette) | `css/surfaces.css` |
| The page in the content region and its patterns | `css/content.css`, `css/patterns.css`, `css/inspection.css`, `css/navigation-panels.css`, `css/content-surfaces.css`, `css/forms.css`, `css/dom-parts.css` |
| The workspace and file controls, the graph | `css/workspace.css`, `css/tiling-workspace.css`, `css/file-workspace.css`, `css/overview-strip.css`, `css/file-tree-detail.css`, `css/graph.css` |
| Behaviour: commands, keys, surfaces, panel states, the renderers | `ts/ui/` (import `@acaprino/imago/ui`) |
| The desktop window: look, theme, zoom, buttons, guard | `ts/shell/` (import `@acaprino/imago/shell`), `ts/tauri.ts` (`@acaprino/imago/tauri`) and the crate `imago-shell` |
| The graph | `ts/graph.ts` and `ts/graph-layout.ts` (`@acaprino/imago/graph`, `@acaprino/imago/graph-layout`) |
| The React binding | `react/` (`@acaprino/imago/react`) |
| The icons of the executables | `icons/<app>/` (`@acaprino/imago/icons/*`), made by `npm run icons` |
| The check of an app against these rules | `scripts/check/` (the program `imago-check`) |
| Every control in every state, both looks, both themes, each app's accent | the gallery: `npm run gallery` |

The gallery is the acceptance surface. A control is done when its row is complete and its contrast test passes. Every
class `css/` defines is shown there, but those `tests/gallery/coverage.mjs` lists as pending removal (today `im-path`). The gallery forces a pseudo-state on a cell with `data-im-force` (`hover`, `press`,
`focus`): it is the gallery's, never an app's. The names these documents write are checked against the code by
`tests/docs.test.ts`.

## Names

Every class of the package starts with `im-`, every custom property with `--im-`, every attribute it keeps for itself
with `data-im-`. The `data-action` and `data-id` that the string renderers write from their arguments are the app's
values: the app's handlers read them, and the package reads them too, to know a control again after a repaint
(`focusKey`) and to move between steps (`stepNavigationKey`). `data-close` and `data-setting` are written for the app's
handlers only ([html-composition.md](html-composition.md)). An app's own classes
and custom properties carry the app's own prefix (`mk-`, `--mk-`), never `im-`. A name the package
removed is removed, not kept as an alias: the table "Moving from 0.1.4" in [using-imago.md](using-imago.md#11-moving-from-014)
says what replaces each.

## Looks and themes

Two looks, each with a dark and a light theme, set by three attributes on the root element of the page:

| Attribute | Values |
|---|---|
| `data-im-app` | `shinatama`, `xiox`, `mukade`, `muro`, `daodan` |
| `data-im-look` | `smooth` (the default), `oni` |
| `data-im-theme` | `dark`, `light` |

- **Smooth** is the default look in every app. Outlined buttons, underlined tabs, sentence case, rounded corners.
- **ONI** is the second look. Chamfered buttons with a 2px edge, boxed tabs, capitals with letter spacing,
  square panes with cut corners on a grid ground, the head font Bahnschrift. ONI has a dark and a light theme.
- The theme the user picks is `dark`, `light` or `system` (follow Windows). The page always draws `dark` or
  `light`; `applyLook` resolves `system`. ONI with `system` is dark.
- `applyLook` writes the three attributes and the class `im-glass`; an app never writes them by hand. `data-im-app` and
  `data-im-theme` are on the same element as `data-im-look`, because the accent reads the hue of the app and the
  lightness of the theme from that element.
- A look or theme a user stored keeps working: `parseLook` and `parseTheme` take a stale or corrupt value for the
  default (Smooth, follow Windows).
- In Smooth light the sidebar is not a dark column. It sits on the ground in both themes.
- Shinatama's four ONI skins stay in Shinatama, as overrides of tokens. They are not part of the package.
- The root class `im-glass` is set only in the desktop app. Under it the ground and the sheets are translucent and
  show the Windows acrylic. Without it every surface is opaque (a browser preview, a test).

### How the user picks them

The look and the theme are picked with five commands of the palette, the same in every app. `mountApp` registers them
when the app gives it `appearance` (`AppearanceOptions`):

| Id | Constant | Title |
|---|---|---|
| `imago.look.smooth` | `LOOK_SMOOTH` | Smooth look |
| `imago.look.oni` | `LOOK_ONI` | ONI look |
| `imago.theme.system` | `THEME_SYSTEM` | Follow Windows |
| `imago.theme.light` | `THEME_LIGHT` | Light theme |
| `imago.theme.dark` | `THEME_DARK` | Dark theme |

They are in the group `Appearance`; an app in another language gives its words in `labels`. No key is bound to them.
The command of the current choice is not offered. The app keeps the choice where it keeps it: `get` gives it back, and
`set` stores the new one and calls `applyLook`. The package stores nothing. These commands are the one place where the
look and the theme are picked: no app has a control or a command of its own for them.

### Where Settings live

An app that has settings of its own shows them in a Settings view, the last view tab of the title bar. Settings save
themselves when they change and show "Saved"; a Settings view has no Save button. It does not repeat the look and the
theme, which are the five commands above.

## Colour

### Surfaces, lines and text

| Token | Role |
|---|---|
| `--im-ground` | The window's ground. Translucent under `im-glass` |
| `--im-sheet` | A sheet on the ground: the work area, panels |
| `--im-sheet-solid` | The sheet as an opaque colour, also under `im-glass`: for what rows scroll under, such as the sticky header of a table |
| `--im-float` | A floating surface: menu, sheet, drawer, dialog, notice, palette |
| `--im-field` | The fill of a field |
| `--im-button` | The fill of a neutral button |
| `--im-terminal` | A dense surface for terminals and tables |
| `--im-line`, `--im-line-soft` | Hairlines between and inside regions |
| `--im-line-strong` | The edge of a control: it has to stay visible on its surface |
| `--im-text`, `--im-text-2`, `--im-text-hi` | Main text, secondary text, headings |
| `--im-muted` | Hints, meta text, disabled text |
| `--im-hover`, `--im-press` | Translucent washes for hover and pressed |
| `--im-selected` | The fill of a selected item |
| `--im-chip`, `--im-chip-text` | A chip without a tone |
| `--im-skeleton` | The flat bars of a loading panel |
| `--im-scrim`, `--im-shadow`, `--im-edge` | The layer behind a dialog, the shadow of a floating surface, its edge |
| `--im-ok`, `--im-warn`, `--im-err`, `--im-info` | Status tones |
| `--im-danger`, `--im-danger-on` | The filled button that confirms a destructive dialog, and its text |

Text has a contrast of 4.5:1 or more on the opaque colour of its surface, disabled text included. That surface is also
the one that results when hover, press or selected lays its fill over the ground, a sheet, a field or a button, with the
wash of a button counted. The gallery's contrast test checks it for every control, in both looks, both themes and every
app (the accent is the app's hue); the token tests check every text colour on those fills.

### One accent per app

The accent is defined from the app's hue *H* in OKLCH. The lightness and the strength are the same for every app:
only the hue differs.

| Role | Dark | Light |
|---|---|---|
| Accent: the primary fill, the selection mark, the focus ring | `oklch(0.82 0.12 H)` | `oklch(0.47 0.13 H)` |
| Text and icons on the accent | `oklch(0.2 0.04 H)` | `#FFFFFF` |
| The accent, highlighted | `oklch(0.9 0.08 H)` | the accent itself |

The tokens are `--im-accent`, `--im-accent-on`, `--im-accent-hi`, `--im-accent-text` (the accent as the colour of
text and of the focus ring) and `--im-accent-hover`. The hue is `--im-hue`.

| App | Hue |
|---|---|
| xiox | 75 |
| shinatama | 355 |
| mukade | 300 |
| muro | 170 |
| daodan | 235 |

No two apps share a hue. Where the browser does not know `oklch()`, `css/tokens.css` carries the same colours as
hex for each app, clipped into sRGB.

The accent goes on four things only: the one primary action, the selection mark, the focus ring, and data. Not on
bars, not on every button, not on navigation backgrounds. ONI also takes the accent as the text of short labels. On
data, the accent is the tone `accent` of a chip, a dot or a summary, and the class `im-text-accent` on a short label or a
key figure. A secondary action is a plain `im-btn`: there is no accent button.

### Status

The tones are `ok`, `warn`, `err` and `info`, set with `data-im-tone` (in code, `Tone`). A tone always comes with a word,
or an icon that has a name. Never the colour alone.

| What | Takes | Code |
|---|---|---|
| A chip, a dot, a summary | A status tone, the accent (data, not a status), or none | `ChipTone`: `''`, a `Tone` or `'accent'` |
| A note, a status text, a settings message | A status tone, or none | `Tone` |
| A notice | Plain, or an error | `tone: 'err'` of `notify`, or none |
| A menu item | Its `danger` option writes `data-im-tone="err"` | `MenuItem` |

A value outside these sets draws nothing (`imago-check` reports it: rule `unknown-value`). In text, a tone is the class
`im-text-ok`, `im-text-warn`, `im-text-err` or `im-text-info`, which `statusTextHtml` writes.

A toned chip has a ground of its own: 14% of its tone over the sheet in Smooth, the sheet itself in ONI (where the chip
is outlined). The fill of a row that is hovered, pressed or selected, which the chip sits on, therefore cannot take its
text under 4.5:1.

### Categorical colours

A categorical colour tells one thing among others of its kind (a thread, a project) by a fixed hue, the same in every
app. There are eight, at the accent's lightness and strength in each theme:

| Token | Hue |
|---|---|
| `--im-cat-1` | 25 |
| `--im-cat-2` | 75 |
| `--im-cat-3` | 125 |
| `--im-cat-4` | 170 |
| `--im-cat-5` | 215 |
| `--im-cat-6` | 255 |
| `--im-cat-7` | 300 |
| `--im-cat-8` | 345 |

`--im-cat-on` is the text on them. The one way to give a thing its colour is `data-im-cat="1"` to `"8"` on its `im-row`,
`im-rail-item`, `im-avatar`, `im-dot` or `im-chip`; the package draws it. An app never writes a categorical colour into a
style itself.

- A row draws it as a 3px mark at its start edge, beside its selection mark, never in its place.
- An avatar, a rail item and a dot are filled with it, their text in `--im-cat-on`. A chip takes it as its tone.
- In the rail a row shows only its rail item, and draws no mark: put `data-im-cat` on the rail item too, whose fill then
  tells the category. A row whose rail item is its check shows no category in the rail.
- A categorical colour is never the only thing that tells the things apart: each is named in words. As text it stands
  only on a ground of its own (the chip's).

### The badge of a row

`data-im-badge` on an `im-row` says the row wants something: a dot at the end of the row, and on the corner of its
`im-rail-item` in the rail. Its tone is the row's `data-im-tone`, `warn` when it has none. A dot alone is colour alone,
so the row's text says the same (its `im-row-sub`: "needs you"), and its `title`, which is the rail's tooltip, carries the
word too: `title="Webhook signature check · needs you"`.

## Type

All fonts are local Windows fonts. The app downloads nothing.

| Token | Stack | Use |
|---|---|---|
| `--im-font-text` | Segoe UI Variable Text, Segoe UI, system-ui | Text and values |
| `--im-font-display` | Bahnschrift, Segoe UI Variable Display, Segoe UI | The head font of ONI, and display text |
| `--im-font-code` | Cascadia Mono, Cascadia Code, Consolas | Code, paths, IDs and key caps |
| `--im-font-head` | Smooth: the text font. ONI: the display font | Titles, labels, buttons, chips |

Every size of text is one of five:

| Token | px | Use |
|---|---|---|
| `--im-fs-micro` | 11 | The smallest text: key caps, counts. Nothing is smaller |
| `--im-fs-meta` | 12 | Meta text, hints, the line under a field |
| `--im-fs-body` | 13 | Body text, values, controls |
| `--im-fs-title` | 14 | A panel title, a section title |
| `--im-fs-display` | 18 | A page title, a dialog title |

Numbers use tabular figures (`im-num`) and are right-aligned in columns. Smooth writes sentence case; ONI writes
capitals with letter spacing on titles, tabs and buttons, through `--im-case` and `--im-track`. An app never sets a case
or a spacing of its own (rule `literal-case`).

## Measures

The measures change with the look. A control has one height per row of controls. A pointer target is at least 24px.

| Token | Measure | Smooth | ONI |
|---|---|---|---|
| `--im-h-titlebar` | Title bar | 46 | 38 |
| `--im-h-control` | Control and field | 32 | 28 |
| `--im-h-control-sm` | Small control | 24 | 22 |
| `--im-h-row` | List row, one line | 32 | 28 |
| `--im-h-row-2` | List row, two lines | 44 | 40 |
| `--im-h-table-row` | Table row | 36 | 32 |
| `--im-h-panel-header` | Panel header | 42 | 40 |
| `--im-h-footer` | Footer | 30 | 26 |
| `--im-r-chip` | Radius of a chip | 4 | 0 |
| `--im-r-control` | Radius of a control | 6 | 0 |
| `--im-r-sheet` | Radius of a sheet | 10 | 0 |
| `--im-cut-sm` | Cut corner, small (buttons of size sm, the mark) | 0 | 6 |
| `--im-cut-md` | Cut corner, medium (buttons) | 0 | 8 |
| `--im-cut-lg` | Cut corner, large (panes) | 0 | 14 |

The same in both looks:

| Token | Measure | px | Note |
|---|---|---|---|
| `--im-w-sidebar` | Sidebar | 232 | `sidebarResize` lets the user drag it from 168 to 420 |
| `--im-w-rail` | The sidebar as a rail | 56 | |
| `--im-w-inspector` | Inspector | 300 | The design allows 300 to 360 |
| `--im-w-inspector-wide` | The wide inspector | 360 | `data-im-inspector="wide"` on the shell. Beside the 232 sidebar it needs a window at least 1012 wide to leave the content its 420, so such a shell keeps the drawer up to there |

The content region is 420px or more. The minimum window width is 500.

Spacing is `--im-s-1` 4, `--im-s-2` 8, `--im-s-3` 12, `--im-s-4` 16 and `--im-s-5` 24. Motion is `--im-t-fast` (120ms,
hover and press), `--im-t-base` (180ms, menus, sheets and the inspector) and `--im-ease`
(`cubic-bezier(0.16, 1, 0.3, 1)`). With reduced motion, states change at once. Every size of text, every space, radius
and colour an app writes is a token (rules `literal-font-size`, `literal-space`, `literal-color`); the few literals that
are not findings, the 1px hairline and the 2px ring among them, are listed with their reasons in
`scripts/check/allowed.mjs`.

## Layout

### One frame

One window layout for every app: `im-shell` with seven regions. An app fills in the regions it needs. Versions up to
0.1.4 also had three other frames, made for Muro, Shinatama and Daodan, with their own sidebars, side panels and toolbars:
they are removed, and the table [Moving from 0.1.4](using-imago.md#11-moving-from-014) names each of their classes and
what replaces it.

```text
┌ title bar: mark, name · view tabs · command button · window buttons ┐
├ status row: last result · summary · info at right                   ┤
│ sidebar  │ content                    │ inspector                   │
│ 232      │ fluid, 420 or more         │ 300 to 360                  │
│          ├ action bar: primary at the right                         ┤
└ footer: service · counts · keys                                     ┘
```

| Region | Class | What it is |
|---|---|---|
| Title bar | `im-titlebar` | The brand (`im-brand`, see "The mark" below), then the view tabs, the command button (`im-titlebar-command`, `Ctrl+K`), the three window buttons (`im-window-buttons`). It always names the product, in ONI too |
| Status row | `im-status` | The last result as a chip, a summary (`im-status-text`), and info at the right (`im-status-end`) |
| Sidebar | `im-sidebar` | The list of the app's objects: threads, rooms, categories, projects. An app without one (Muro) sets `data-im-sidebar="off"` on the shell and writes none |
| Content | `im-content` | What the app is for, a panel whose body scrolls. The content of this region is the app's own |
| Inspector | `im-inspector` | The details or the form of the selected object. Not modal; the rest of the window keeps working. It is closed with the `hidden` attribute, and the content takes its room |
| Action bar | `im-actions` | At most one primary action per window, at the right, with its key on the button |
| Footer | `im-footer` | Service state (`im-footer-text`), counts, and the keys that work now (`im-footer-keys`) |

The window is `im-shell`. Its body is `im-body` (the sidebar and the work area `im-work`, which holds the status row,
the columns `im-columns` with the content and the inspector, the action bar and the footer); its first element is the
skip link `im-shell-skip-link`. It measures its own width (a container query), so the breakpoints follow the window and
not the screen. `shellFrameHtml` writes the frame, `renderShellFrame` repaints it, and the React `Shell` and `Workbench`
write the same markup ([using-imago.md](using-imago.md), section 4).

The shell fills the window: put it directly in `<body>`, or, when the app renders into a root of its own (React's
`<div id="app">`), give that root, and every element between the body and the shell, the class `im-root`. Without it
the shell is as tall as its title bar, and `checkShellFill` says so on the console.

### The mark and the icons

- The mark at the top left is `im-mark`: the 22px square in the app's accent (rounded in Smooth, cut in ONI) holding one
  letter, the initial of the product's name in capitals, in the head font, weight 700, in `--im-accent-on`. No drawn
  symbol and no image. The name, `im-wordmark`, is always beside it, and both are in `im-brand`. `titlebarHtml` writes
  them from `brand.name` (the letter is `brandInitial(name)`). Mukade and Muro both show M: the hue and the name tell them
  apart. `imago-check` reports a brand that is not this markup (rule `brand-mark`).
- The app's logo is what Windows shows: the icon of its executables, which is the mark, a rounded square in the app's
  dark accent holding the capital initial in its ink. One icon per app, for its window program, its command-line program
  and a page of it served in a browser. The package makes the files (`icons/<app>/`, `npm run icons`) and an app copies
  them, never draws or recolours its own (rule `app-icon`). Which file goes where is in [using-imago.md](using-imago.md),
  "The icons of the executables".

### Breakpoints

| Window width | Layout |
|---|---|
| 1000 or more | The inspector is docked at the right and pushes the content. It never covers the content |
| Under 1000 | The inspector covers the right edge of the content as a drawer |
| 850 or more | The full sidebar, 232px. A button in its header (`im-sidebar-collapse`) folds it into the rail; the user's choice is kept by the app |
| 620 to under 850 | The sidebar is the 56px rail: one icon per row (`im-rail-item`), each with a tooltip and an accessible name. The width forces it; the user's choice does not matter |
| Under 620 | The sidebar is not in the layout. A title-bar button (`im-sidebar-toggle`) opens it as an overlay from the left edge. The view tabs become one "Views" menu (`im-views-menu`). The command button shrinks to its icon |
| Under 450 | The command button is gone from the title bar (`Ctrl+K` still opens the palette) and the gaps of the bar close up. The name of the product gives way before the window buttons: it ends in an ellipsis |
| Under 340 | The mark and the name are gone, and the Views menu is its chevron alone (its label stays its accessible name) |

Every breakpoint is a container query on the shell (`@container im-shell`) at 1000, 850 or 620; the narrower steps of
the title bar follow the same container. Nothing is a `@media` on a width (rule `media-width`).

The minimum window is 500 physical pixels, so at 200% page zoom the shell is 250 CSS pixels wide (341 for a window half-snapped
on a 1366px screen). At 250 and at every width up to 500 the three window buttons, the sidebar button, the Views menu and
the primary action are never pushed out of the shell. The gallery's width control goes down to 250 to show it.

### The rail

In the rail a row shows only its `im-rail-item`, so every sidebar row has one. It is the row's own icon (an `im-icon`),
or, when the app has no icon that tells its rows apart, the initials of the row in an avatar (`im-avatar` with
`im-rail-item`). A row whose control is a check has the check as its rail item (`im-check im-rail-item`): it is shown in
the whole sidebar and in the rail, ticked the same in both, with a 24 by 24 target in the rail. A row without a rail item
is blank in the rail. A row keeps its text in the rail, hidden, as its accessible name, and its `title` is its tooltip.
Every row of the rail is as tall as a two-line row. The header's count and the sidebar's foot are not shown in the rail.

### Panels and helpers

A panel (`im-panel`) has a header (`im-panel-header`, with `im-panel-title` and, after it, an `im-count` or a subtitle
`im-panel-sub`), tools (`im-panel-tools`), a body that scrolls (`im-panel-body`) and a foot (`im-panel-foot`). The
content region and the inspector are panels; a sidebar is a panel whose body is a list (`im-list`). Helpers: `im-stack`
(a column), `im-cluster` (a wrapping row), `im-split` (two groups at the two ends of a row), `im-scroll` (a region that
scrolls), `im-spacer` (the space that pushes what follows to the end). A surface (`im-surface`) is one of four
materials, set with `data-im-surface`: `ground`, `sheet`, `dense`, `float`.

## Controls

The set, each with every state defined once. The markup each class expects is written at the top of
`css/controls.css`. A form control has one drawing, which serves the ARIA element and the native one. **In a `form`
the control is the native element** with the class of its drawing (it keeps FormData, browser validation and its own
keys); **outside a form it is the ARIA element** whose state the app sets.

| Control | Class | ARIA form, outside a form | Native form, in a form |
|---|---|---|---|
| Button | `im-btn`, with `im-btn--primary`, `im-btn--ghost`, `im-btn--danger`, `im-btn--confirm-danger`, `im-btn--sm` | `button` | `button`: the neutral button is `im-btn` alone |
| Icon button | `im-icon-btn` | `button` with an accessible name and a tooltip | the same |
| Key cap | `im-key` | One cap per key, in the code font; `keyCaps` writes them in `im-keys` | |
| Count | `im-count` | A number in a pill | |
| Field | `im-field` with `im-field-label`, `im-field-hint`, `im-field-error`; the box `im-input` | | `<span class="im-input"><input></span>`, the box round the input when it holds an icon or a key cap (`im-input--code` for code); `input.im-input` otherwise |
| Text area | `im-textarea` | | `textarea.im-textarea` |
| Search | `im-input` with an `im-icon` and an `im-key` | | `<span class="im-input">` round the input |
| Select | `im-select` | `button.im-select` that opens a menu of the choices (`openMenu`, items with `checked`) | `select.im-select` (`selectHtml`, `uiSelect`) |
| Checkbox, radio, switch | `im-check`, `im-radio`, `im-switch`, in an `im-option` | `role="checkbox"`, `"radio"` or `"switch"` with `aria-checked` (`true`, `false`, `mixed` for a checkbox) | `input.im-check`, `input.im-radio`, `input.im-switch` with `role="switch"`: `:checked`, `:indeterminate`, `:disabled` |
| Segmented | `im-seg` | Buttons with `aria-selected`, for a choice of view (`role="tablist"`) | Labels over native radios, `label > input[type=radio] + span` (`role="radiogroup"`), for a value (`segmentedHtml`, `segmentedControl`) |
| Tabs | `im-tabs`, `im-tab` | `button role="tab"` with `aria-selected` | |
| Menu | `im-menu`, `im-menu-item`, `im-menu-sep` | Opened by `openMenu` | |
| Tooltip | the `title` attribute | There is no tooltip element | |
| Row | `im-row`, `im-row-text`, `im-row-title`, `im-row-sub`, `im-row-meta`; one line `im-row--1`, or two | `role="option"` with `aria-selected` in a listbox; a native `button` with `aria-pressed` in the React binding (`im-row--detail`) | |
| Table | `im-table`, `im-cell-title`, `im-cell-sub`, `im-col-check` (a column of checks), `im-num` | A row with `aria-selected` | |
| Facts | `im-facts`, `im-facts-code` | A name and its value; the value is content and can be selected; a code value in the code font | |
| Tree | `im-tree`, `im-tree-item`, `im-tree-chevron`, `im-tree-label` | `role="tree"`, items `role="treeitem"` with `aria-level` and `aria-expanded` | |
| Avatar | `im-avatar` | Initials; decorative, its name beside it | |
| Status chip | `im-chip` with `data-im-tone` | | |
| Dot | `im-dot` with `data-im-tone` | A status said in words next to it | |
| Missing value | `im-none` | A grey dash | |
| Note | `im-note`, `im-note--block` | A result or a warning that stays in the page (`noteHtml`) | |
| Notice | `im-notice` | Shown by `notify` | |
| Progress | `im-progress`, with `im-progress-row` and `im-progress-value` for a bar with its value | `role="progressbar"`; without `aria-valuenow` it is indeterminate (`setProgress`) | |
| Steps | `im-steps`, with `data-im-step` of `done`, `now`, `todo`, `failed` or `skipped` on each item; `im-step-index`, `im-step-text`, `im-step-sub`, `im-step-status` | A step that can be opened is a `button` inside its item | |
| Spinner | `im-spinner` | The progress mark of a busy control, in the icon's place | |
| Inspector, sheet, dialog | `im-inspector`, `im-sheet`, `im-dialog` | See the surfaces below | |

An icon is `im-icon`, a 16px line drawing in the colour of its text. A text only for assistive technology is
`im-visually-hidden`.

### States

The same for every control. They are real attributes and pseudo-classes, never extra classes.

| State | Rule | Code |
|---|---|---|
| Hover | A translucent wash; never a change of size | `:hover` |
| Pressed | One step darker than hover | `:active` |
| Focus | The focus ring, only from the keyboard. See the rule below | `:focus-visible` |
| Selected | The selection fill plus a mark that is not colour: weight, an underline, a bar, a check. Hover, focus and selected can be told apart at a glance | Any of four, one drawing: `aria-selected="true"` (an item of a listbox, a tab strip, a tree or a table), `aria-current` that is not `"false"` (the current page or step), `aria-pressed="true"` (a toggle button), `:checked` (the radio of a segment) |
| Checked | A checkbox, radio or switch that is on | `aria-checked="true"` or `:checked`; `"mixed"` or `:indeterminate` |
| Disabled | A dashed edge and the muted text colour, readable at 4.5:1. No hover. It says why in a tooltip or a line beside it. Never an opacity | `disabled`, `:disabled` or `aria-disabled="true"` |
| Busy | The label and the width stay; a progress mark (`im-spinner`) takes the icon's place; a second press does nothing | `aria-busy="true"` |
| Invalid | The field's edge takes `--im-err`, with one sentence under the field that starts with the word "Error", tied by `aria-describedby`, shown after the field loses focus or on submit | `aria-invalid="true"` on the input |
| Read-only | No field fill, no frame, text selectable, no caret | `readonly` on the input |

A selected button (`aria-pressed`) takes the selection fill and a 2px bar inside its bottom edge in the accent text
colour, and in Smooth the weight 600. A busy button ignores the pointer, not the keyboard: Enter or Space on a busy
button still fires its click. The app ignores a second activation itself, or disables the button.

### The focus ring

The ring is 2px wide, in the accent text colour (`--im-accent-text`), drawn with `outline` so forced colours keep
it. How far it sits from the control depends on what surrounds the control:

| What is focused | Where the ring is |
|---|---|
| A control that stands alone: button, icon button, select, checkbox, radio, switch | 2px outside |
| A field: input, search, text area. Its edge also turns to the accent | 1px outside |
| An item of a list, table, tree, menu, tab strip or segmented control. Their container scrolls and clips | 2px inside |
| The field of the command palette (the ring is round the field while its input has focus), and the three window buttons of the title bar | 2px inside |
| An ONI chamfered button. A clip-path would cut an outer ring | 5px inside |

`tests/gallery/controls.mjs` measures the ring of every control in both looks.

### More rules

- A label sits above its field. A placeholder is never the label.
- The danger button is outlined at rest. Only the button that confirms a destructive dialog is filled, with text at
  4.5:1.
- An icon-only control has an accessible name and a tooltip.
- A chip never wraps or shrinks. One status mark per row.
- A label longer than its room ends in an ellipsis, and the element carries the whole label as its `title`.
- Tables: no zebra, no header band, headers in sentence case, a missing value as a grey dash (`im-none`), a real
  zero printed as zero.
- A switch changes at once; a checkbox waits for Save. A switch is never used inside a form with a Save button.
- No control has a hand cursor (rule `cursor-pointer`).

## Page patterns

The content region holds what the app is for. Where that is a page (a list, a card, settings, a document), it is made of
the package's page patterns, so an app may have no stylesheet of its own. A pattern with content has a renderer, which
is the one way to write it; a class that only lays out the app's own elements (a grid of measures, the host of a graph)
goes on them. The calls are in [content-composition.md](content-composition.md) and [native-forms.md](native-forms.md).

| Pattern | Class | Written by |
|---|---|---|
| The page in the content region's body, its padding round a column of 1180, or 860 narrow | `im-page-content`, `im-page-content--narrow` | `pageContentHtml` |
| The page's title, its line and its actions | `im-page-heading`, `im-action-row` | `pageHeadingHtml` |
| A section's title | `im-section-heading` | `sectionHeadingHtml` |
| A row of tools at the head of the page or of a section | `im-content-toolbar` | `toolbarHtml` |
| A list of things with a title, a line and actions; as a timeline of events; as decisions | `im-stack-list`, `im-activity-list`, `im-decision-list`, `im-related-list` | `stackListHtml`, `stackRowHtml`, `timelineItemHtml` |
| A table in its scrolling sheet; a log; a table of inputs | `im-table-scroll`, `im-log-table`, `im-input-list` | `tableHtml`, `tableRowHtml` |
| A summary of a state: an icon, a title, metadata | `im-summary`, `im-summary-icon`, `im-summary-meta` | `summaryHtml` |
| A card of a task that runs | `im-task-card`, `im-leading` | `taskCardHtml` |
| A group of settings, and a setting with its control | `im-settings`, `im-setting-row` | `settingsGroupHtml`, `settingsRowHtml`, `settingsMessageHtml` |
| A list of names and values | `im-definition-list` | `uiPart('descriptionList')` |
| Code or literal text, selectable | `im-code-view` | `codeViewHtml`, `uiPart('pre')` |
| A list of bullets; a quoted line; a title over a line | `im-bullet-list`, `im-wrap-text`, `im-text-stack` | `bulletListHtml`, `quoteHtml`, `textStackHtml` |
| A first run in steps | `im-wizard-wrap`, `im-wizard`, `im-wizard-actions`, `im-choice-rows` | `wizardHtml`, `wizardActionsHtml`, `choiceRowsHtml` |
| A form and its parts | `im-form`, `im-form-head`, `im-repeat-row` | `uiPart('form')`, `formHeaderHtml`, `formFooterHtml`, `repeatableFieldRowHtml` |
| A measure: a value, its meaning and its context; measures side by side | `im-metric`, `im-metric-value`, `im-caption`; `im-metric-grid` round them | `metric`; the grid on the app's element |
| A timeline of a React view | `im-timeline` | `Timeline` |
| A panel that holds a canvas | `im-canvas-panel` | on the app's element |
| A graph, its host and its key | `im-graph-host`, `im-graph-panel` round the graph; `im-graph-legend`, `im-graph-summary` | the host on the app's element, then `graphView`; `graphLegendHtml` |
| A group that opens | `im-disclosure` | `uiPart('details')`, `Disclosure` |

Where no renderer writes a pattern, the app writes its markup with the package's classes, as the app named below does;
the gallery shows each one so written. They are the package's, and no app redefines them.

| Pattern | Class | As written by |
|---|---|---|
| A section's line under its heading | `im-section-description` | Muro |
| The room for a back button above a page's head | `im-breadcrumb-space` | Muro |
| The head of a record: its avatar, its `h1`, its chips; and its meta (a path, a button, a line, a disclosure) | `im-record-heading`, `im-record-meta` | Muro |
| The files a record holds: a name, what it is, a path | `im-file-list` | Muro |
| A row of a stack list that opens its record: the whole row one button | `im-list-link` | Muro |
| In a table: a record's name and path as a ghost button; a state with its icon (in `ok`, `im-tone-ok`); a cell's head on one line, and a line under it; a note of a log that keeps its line breaks | `im-record-button`, `im-inline-cell`, `im-tone-ok`, `im-inline`, `im-cell-meta`, `im-log-note` | Muro |
| A row of chips in a definition | `im-tag-row` | Muro |
| The numbered result of a run: its chips, the request, the numbered steps, a line | `im-numbered-result` | Muro |
| A column of controls beside the content, in two stacks of 12 and of 4 | `im-aside-layout`, `im-stack-3`, `im-stack-2` | Muro |
| A list of choices, each a button with `aria-pressed`; or a listbox of buttons `im-btn im-choice-row`, each with its two texts | `im-choice-list`, `im-choice-row` | Muro |
| A grid of fields | `im-form-grid` | Muro |
| In a form: a field shown for one choice; a slot hidden while empty; a section that takes focus; the operations it runs with their status; notes with their files; a disclosure of more actions; a line pushed to the start of the foot | `im-field-space`, `im-hide-empty`, `im-form-section`, `im-operation-list`, `im-operation-status`, `im-notes`, `im-file-lines`, `im-disclosure-section`, `im-push-start` | Muro |
| A line of its own in a hint | `im-block` | Muro |
| The sections of an inspection page | `im-section` (16 between two), a kicker over its title `im-kicker` | Daodan |
| A list of findings; a grid of cards; a padded card; a region that scrolls up to half the window; a readout that keeps its lines | `im-detail-list`, `im-auto-grid`, `im-inset`, `im-scroll--bounded`, `im-readout` | Daodan |
| A canvas in a frame of a fixed height, a smaller preview frame, a message over it, what fills it | `im-canvas-frame`, `im-canvas-frame--preview`, `im-canvas-message`, `im-fill` | Daodan |
| A mark the size of a line of text (a harness's logo before its name) | `im-inline-mark` | Daodan |
| The sessions of a thread over its conversation, which scrolls on its own | `im-summary-list`, `im-scroll-log` | Shinatama |
| A banner at the foot of a viewport | `im-viewport-footer` | Shinatama |
| A dialog of files; a render view (an address bar over a canvas) | `im-file-dialog`, `im-render-view` | Shinatama |
| The actions at the foot of a form in a sheet | `im-sheet-actions` | the gallery's form sheet |

Text helpers, for content inside a pattern: `im-muted` (the muted colour), `im-caption` (a muted meta line), `im-mono`
(the code font), `im-grow` (takes the room left), `im-end` (pushed to the end of its row), `im-nowrap` (one line),
`im-truncate` (one line, cut with an ellipsis), `im-text-accent` (the accent on data), `im-content-text` (content that
can be selected outside a page: a message, a path, terminal output). `im-ellipsis` draws what `im-truncate` draws, and
`data-im-align="end"` what `im-end` draws: an app writes `im-truncate` and `im-end`. `im-path`, a muted path on one
line, is used by nothing and the gallery does not draw it: a file's location is `im-file-location` (`fileWorkspace`) and
an editable path `im-path-field` (`pathField`). A page's own headings are `h1` 18,
`h2` 14 and `h3` 13, in the head font, in sentence case in both looks.

## Surfaces: which one for what

| Need | Surface | Rules |
|---|---|---|
| A few commands | Menu | Under its control. Escape or a press outside closes it. Focus returns to the control |
| A short choice tied to one control or pane | Sheet | Docked to its control or pane. One at a time. Tab stays inside it |
| Details or a form for the selected object | Inspector | Not modal. The rest of the window keeps working. Leaving it with unsaved changes asks once |
| Content the app owns, beside the panels, that does not block them | Drawer | `openDialogDrawer(dialog)`: an app-owned `dialog` shown, not modal, at the window's edge under the title bar. The panels stay live and a press in them leaves it open. Escape or its control closes it. Nothing is inert |
| A decision about the whole window | Dialog | Everything under the title bar is inert. Focus is contained and starts on Cancel. Actions at the bottom right |
| A form that must block the window while it saves | Dialog | `openFormDialog`, locked while it writes, or `createContentDialog` with `canDismiss`. Never the inspector, which is not modal |
| A short result | Notice | Bottom centre, above the footer. It never takes focus. An error stays until dismissed and says "Error" in words |
| A command by name | Command palette | Opened with `Ctrl+K`. Modal like a dialog |

The inspector is the only side panel for the selected object: there is no second detail box, and no modal drawer.
A drawer is not a second inspector and not a way to block the window: it is a layer of the one stack, not modal, for
content the app owns beside live panels (the archive of a terminal, a list the person keeps while working). What must
block the window while it saves is a dialog, never a drawer. Every dialog is one drawing,
`im-dialog`, centred in the window: `confirm` for a decision, `openFormDialog` for a form the package lays out,
`openContentDialog` or `createContentDialog` for a `dialog` element the app owns. The calls are in
[native-forms.md](native-forms.md) and [using-imago.md](using-imago.md), section 5.

No surface uses `showModal()` (rule `show-modal`): it makes the HTML title bar inert, and a borderless window cannot then
be moved, minimized or closed. A dialog makes the regions under the title bar inert instead. Nothing opens a second OS
window except what an app already has.

Surfaces float inside the shell and are placed from the rectangle of their anchor. They stack from the bottom:
sheet, drawer, dialog and palette, notice, menu. Escape closes the top surface only. An app's own floating surface goes through
the same layer stack (`pushLayer`).

## Behaviour

### One call: `mountApp`

Every app calls `mountApp(shell, registry, options)` once for each shell (rule `mount-app`). It makes the calls every app
makes, in one place, so none is forgotten: `attachLayers` (Escape and the press outside), `sidebarDrawer` and
`sidebarCollapse` when the shell has a sidebar, `registry.attach` (the keys), `regions` (`F6`), `standardCommands`
(`Ctrl+K` and `Ctrl+F`) and, with `appearance`, the five commands of the look and the theme. It returns the function that
undoes them all. The options are in [using-imago.md](using-imago.md), section 6.

### Keyboard

- One command registry per app (`createRegistry`). Key bindings, the key caps on buttons, the footer's key list, menus
  and the palette all come from it. The footer's key list is written by `footerKeys`, and every key cap by `keyCaps`.
- `Ctrl+K` opens the command palette (`PALETTE_COMMAND`, `imago.palette`) and `Ctrl+F` searches the current view
  (`SEARCH_COMMAND`, `imago.search`), with the same ids in every app.
- Tab moves between controls. Arrows move inside a list, a table, tabs or a menu, and each is one tab stop (`roving`).
  `F6` moves between the sidebar, the content and the inspector; `Shift+F6` goes back.
- Enter runs the primary action of the focused surface. Escape closes the top surface only.
- A key is answered once. A handler of the package that answers a key (Escape that closes a surface, the inspector or the
  sidebar drawer; an arrow that moves a list) claims it, and the registry runs no command on a claimed key. A key that is
  only refused to the browser by `guardDesktop` still runs the app's command; the zoom keys are the zoom's, which stops them
  at the document, so no command bound to them runs.
- An app's own key handler on the document (a terminal, an editor) is added before `mountApp`, so it runs before the
  registry, and calls `claimKey(event)` when it answers a key; from a React handler, `claimKey(event.nativeEvent)`.
  `imago-check` reports such a handler (rule `own-keydown`), and the app keeps it with an exception comment that says why.
- No command is bound to Enter or Space: the focused control's own activation would also fire. A button's key cap may
  show them. No command is bound to `F6` or `Shift+F6`, which are the regions'.
- In a text field (an input, a textarea, a select or an editable element) a binding without Ctrl or Alt does not run,
  and does not cancel the key: the field keeps every key that types and every key that edits or moves in it (letters,
  Space, Delete, Backspace, Home, End, the arrows, Enter, Tab). Escape and F1 to F24 stay available there, and so does
  any binding with Ctrl or Alt. A key pressed while an input method composes text belongs to the input method.
- No command runs while a dialog or the palette is open: a key never acts behind a pending decision.
- `Ctrl+=`, `Ctrl+-` and `Ctrl+0` zoom from 50 to 200%, in steps of 10, saved per machine (`mountZoom`).

### Destructive actions

- If it can be undone, do it at once and show a notice with Undo. The app binds Undo: the notice's button is
  reachable by pointer, and a key is the app's to add.
- If it cannot be undone, ask in a dialog that names the object and the consequence. The confirming button carries
  the verb and the object ("Delete 8 items"), and focus starts on Cancel.
- A destructive action is never the primary action of the action bar without one of the two above.

### Saving

One model per surface. Settings save themselves and show "Saved". A form in the inspector has Cancel and Save, and
leaving it with changes asks once (`inspector(shell).guard`). A form that must block the window while it saves is a
dialog.

### Empty, loading, error

- Empty: the panel keeps its header and frame, with one sentence and the first action where the data will be
  (`im-empty`).
- Loading: the final layout with flat grey bars at the real sizes (`im-skeleton`), no shimmer, and nothing moves when
  the data lands. Under 300ms show nothing (`showAfter(LOADING_DELAY_MS, …)`).
- Error: inside the panel that failed, one sentence on what failed and a Retry (`im-failure`). Never a full-window
  banner for one panel.
- A panel takes these states through `setPanelState`, or, painted from strings, `panelStateHtml`, which writes the same
  layer. An operation that runs in the content, outside a panel that loads, is `loader` (`im-loader`, a line with its
  label); a button that runs it is `aria-busy="true"`. Nothing loads in a corner of the window.

### Chrome and content

Text in the chrome is not selectable and keeps the arrow cursor. Content is selectable: messages, paths, code, the
values in facts, every field, and the text of a page in `im-page-content`; elsewhere, content carries `im-content-text`.
The controls on a page are chrome, as everywhere.

### Accessibility

Forced colours: borders and outlines take system colours where fills vanish. Reduced motion is honoured. Every
action is reachable from the keyboard. Colour never tells a state alone.

## What is common and what is an app's own

Every app has the same layout structure, the same shapes and the same controls. An app may have its own where it
needs them.

- **Common, never redefined by an app**: the seven regions and the breakpoints, the measures, the radii and cuts,
  the control set with its states, the page patterns, the surfaces, the behaviour rules.
- **An app's own**: the content of the regions, and the content no other app has: Shinatama's terminal panes and team
  map, Mukade's graph and lanes, Muro's plugin by harness matrix, Daodan's pipeline. A list, a card, a summary or a
  settings group is a page pattern of the package from the start, not an app's own.
- An app's own control is built from the package's tokens and primitives, never from literal colours or sizes. It
  takes the common states and keys: the focus ring, disabled, selection, Escape, the arrows. Its classes carry the app's
  prefix. It lives in the app's repository, and moves into the package when a second app needs it.
  [using-imago.md](using-imago.md) shows how.
- An app never restyles a common control: no selector of the app names an `im-` class, and no declaration of the app
  sets an `--im-` property (rule `im-selector`). If the common one does not fit, the fix goes into the package.

## Attributes

An app writes the attributes of the first table, in its markup or through a renderer. The package writes and reads those
of the second for itself: an app never writes or styles them.

| Attribute | On | What it says |
|---|---|---|
| `data-im-sidebar` | The shell | `on` or `off`: whether it has a sidebar |
| `data-im-inspector` | The shell | `wide`: the inspector is 360 |
| `data-im-surface` | An `im-surface` | `ground`, `sheet`, `dense` or `float` |
| `data-im-tone` | A chip, a dot, a note, a summary, a row with a badge | The tone (see "Status") |
| `data-im-cat` | A row, a rail item, an avatar, a dot, a chip | The categorical colour, `1` to `8` |
| `data-im-badge` | A row | The row wants something |
| `data-im-step` | An item of `im-steps` | `done`, `now`, `todo`, `failed` or `skipped` |
| `data-im-window` | A window button | `minimize`, `maximize` or `close` |
| `data-im-label-collapse`, `data-im-label-expand` | The fold button of the sidebar | Its two names |
| `data-im-pane`, `data-im-dock-tab` | A pane and a tab of `dockTabs` | Their stable ids |
| `data-im-key` | A control | Its identity across a repaint, for focus and dialogs (`captureDomState`) |
| `data-im-scroll` | A region that scrolls | Its scroll is kept across a repaint (`captureDomState`) |
| `data-im-rail-detail` | Anything inside the sidebar | Hidden in the rail |

`data-im-align="end"` draws what the class `im-end` draws: an app writes `im-end`, not the attribute.

| Attribute | Written by | What it says |
|---|---|---|
| `data-im-app`, `data-im-look`, `data-im-theme` | `applyLook`, on the root element | The app, the look and the theme |
| `data-im-os`, `data-im-maximized` | `mountWindowControls` | The maximize button's hover and press from Windows, and the window's state |
| `data-im-sidebar-collapsed` | `sidebarCollapse` | The sidebar is folded into the rail |
| `data-im-sidebar-open` | `sidebarDrawer` | The sidebar is open as an overlay under 620 |
| `data-im-layer`, `data-im-notices` | The layer stack, `notify` | A floating surface, the host of the notices |
| `data-im-state-layer`, `data-im-state-hidden` | `setPanelState`, `panelStateHtml` | The state layer of a panel, and the content it hides |
| `data-im-covered` | `inspector(shell).push`, the layer stack | A view of the inspector covered by a detail view, and a drawer covered by one opened from inside it |
| `data-im-drawer-open` | `openDialogDrawer` | On the shell: a drawer is shown, and from 900 the work area gives it its width (`--im-drawer-width`) |
| `data-im-dragging` | `overviewStrip` | A drag holds the strip |
| `data-im-level` | The app, on a `documentHeading` field | The level of the heading, `1` to `6` |
| `data-im-operation` | `runFormOperation` | A form operation runs |
| `data-im-error-for` | `showFieldErrors` | The field an error is about |
| `data-im-entry` | `createFileTree` | The id of a row of the tree |
| `data-im-mark` | `searchPicker` | The mark action of a result |
| `data-im-axis` | `splitView` | `columns` or `rows` |
| `data-im-dock-target` | `dockTabs` | Where a dragged tab would land |
| `data-im-node`, `data-im-external`, `data-im-dimmed` | `graphView` | A node's id; a node marked `external`, drawn with a dashed edge; a node or an edge marked `dimmed`, set back |
| `data-im-stroke` | `graphLegendHtml` | `dashed` or `dotted`: the line of a key's sample |
| `data-im-force` | The gallery | A forced pseudo-state of a cell |

## Glass

The desktop apps paint translucent layers on the Windows 11 acrylic material. The technique, with the reasons, is
in [desktop-shell.md](desktop-shell.md). The rules:

- Never put light glass on a dark acrylic, or dark glass on a light one. The window theme follows the look and is
  set before the first frame.
- Never paint an opaque fill on the frame bars over the glass. A band of one colour along the top reads as the
  system's title bar. In Smooth the title bar and the sidebar paint nothing.
- Keep a dark ground away from the grey of the Windows caption (32,32,32): tint it.
- Hover and pressed fills stay translucent on glass (`--im-hover`, `--im-press`).
- Terminals and tables stay dense. Text contrast on them must not depend on the desktop behind.
- Check contrast on the composited colour, not on the token alone.
- Of the glass values, only the Smooth dark ground is Shinatama's tint, which Shinatama measured on screen on
  2026-11-19. The Smooth light ground and the grounds of ONI are not Shinatama's: [desktop-shell.md](desktop-shell.md)
  says which, in section 1.3. What the demo app captured on a real window is in [verification.md](verification.md). A
  look that file does not list is not measured on screen.

## Files, workspaces and processes

- The app supplies every listing: Imago never reads a filesystem. A file tree (`createFileTree`) is the package's tree,
  with its keys (arrows, Home and End, typing to search, Space to select, Enter to open); a path field (`pathField`)
  hands the native chooser to the app; a native file input is `fileSelector`.
- Panes share one accessible separator for rows, columns and the expanded sidebar (`splitter`). A drag shows its
  destination on the pane edge, pane centre or neighbouring tab, and a keyboard move mode announces the same
  destinations. The app supplies the view contents and owns their layout and their persistence.
- A process in stages shows its stages as `im-steps`; an operation of known length is a progress bar; one of unknown
  length in the content is `loader`.

The calls are in [content-composition.md](content-composition.md) and [inspection.md](inspection.md).

## The React binding

The package has no UI framework, and an app needs none. There is one exception: `@acaprino/imago/react`, a binding for
Daodan's viewer, which is written in React. Its components (`Shell`, `Workbench`, `ListAction`, `Timeline`, `TabList`,
`Disclosure`) write the package's canonical markup and nothing of their own: `Shell` is `im-shell`, and `Workbench` its
body, with the sidebar, the content region and the inspector. No other app uses React. The props are in
[inspection.md](inspection.md).

## What a program checks

`imago-check` is a program of the package. An app runs `npx imago-check` before it says UI work is done, and in its CI;
the package runs `npm run check` (the program with `--package`) on its own `css/`. It prints each finding as
`file:line  rule  message` and exits 1 on any finding. It reads the `"imago"` block of the app's `package.json`
([using-imago.md](using-imago.md), section 9).

| Rule | What it reports | Where |
|---|---|---|
| `im-selector` | A selector of the app that names an `im-` class, or a declaration that sets an `--im-` property | App |
| `literal-color` | A colour that is not a token: a hex, `rgb()`, `oklch()` and their kin, a colour word | App, package |
| `literal-font-size` | A size of text that is not one of the five type tokens | App, package |
| `literal-space` | A padding, margin, gap or radius that is not a token or an allowed literal | App, package |
| `literal-case` | A `text-transform` or a `letter-spacing` of the app's own | App |
| `cursor-pointer` | A hand cursor | App, package |
| `disabled-opacity` | An opacity on a disabled state | App, package |
| `media-width` | A `@media` on a width, or a `matchMedia` of a width | App, package |
| `show-modal` | A call of `showModal()` | App |
| `own-keydown` | A key handler of the app on the document, the window or the body | App |
| `unknown-name` | An `im-` class or a `data-im-` attribute the installed package does not define | App, its tests included |
| `removed-name` | A name the canon removed (the table "Moving from 0.1.4"), with what replaces it | App, its tests included |
| `unknown-value` | A value outside the set of an attribute that takes a closed set (`data-im-tone`, `data-im-cat`, the root attributes, and the others) | App |
| `brand-mark` | A title bar brand that is not the mark and the name | App |
| `app-icon` | An icon file that is not the package's, byte for byte | App |
| `pin-mismatch` | The npm pin and the Cargo pin of Imago that are not the same tag or commit | App |
| `agent-rules` | `AGENTS.md` or `CLAUDE.md` without the path of this file in the installed package | App |
| `mount-app` | An entry that never calls `mountApp` | App |
| `class-prefix` | A class of the package that does not start with `im-` | Package |

An exception is a comment on the line or the line above, `imago-check: allow <rule> — <reason>`; without a reason it
allows nothing. The program prints every exception it accepted. A check that only warns is not a check: every rule
fails the run.

## What a person checks

A program cannot judge these. They are part of the review of every change to an app's UI:

- The confirming button of a destructive action carries the verb and the object ("Delete 8 items"), and the dialog names
  the object and the consequence.
- At most one primary action per window, and it is not destructive without Undo or a dialog.
- Undo is bound: the notice's button works, and so does the key the app gave it.
- Every icon-only control has a name and a tooltip, every dot and every badge is said in words, and every category is
  named in words.
- The words are in the app's language: the labels the package takes (`labels`, `errorWord`, `dismissLabel`, the palette's
  words, the confirm dialog's) are given.
- Settings save themselves; a form in the inspector asks once before it is left with changes.
- The real window, in both looks and both themes, over a dark and a bright window: a screenshot of the page cannot judge
  the glass ([desktop-shell.md](desktop-shell.md), section 1.5). What has been seen so is in
  [verification.md](verification.md).
