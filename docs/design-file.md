# Imago design file

The design rules of the suite: Shinatama, Xiox, Mukade, Muro and Daodan. Read this file before any UI work in
an app that uses Imago. It says what every app does the same way, what an app may do on its own, and which name in
the code stands for each rule.

Where this file and [design.md](design.md) differ, this file wins: `design.md` is the approved design with its
reasons, and its "Corrections after the build" section lists what changed when the code was built.

## Where each thing lives

| What | Where |
|---|---|
| Every value (colour, size, font, motion) | `tokens/imago.tokens.json`, the single source |
| The same values as CSS custom properties `--im-*` | `css/tokens.css`, generated: change the JSON, run `npm run tokens` |
| The window layout and its breakpoints | `css/primitives.css` |
| The controls and their states | `css/controls.css`, and `css/looks/oni.css` for what ONI draws differently |
| The floating surfaces (menu, sheet, dialog, notice, palette) | `css/surfaces.css` |
| Behaviour: commands, keys, surfaces, panel states | `ts/ui/` (import `@acaprino/imago/ui`) |
| The desktop window: look, theme, zoom, buttons, guard | `ts/shell/` (import `@acaprino/imago/shell`) and the crate `imago-shell` |
| Every control in every state, both looks, both themes, each app's accent | the gallery: `npm run gallery` |

The gallery is the acceptance surface. A control is done when its row is complete and its contrast test passes.
Class names and custom property names in these documents are checked against the code by `tests/docs.test.ts`.

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
- A look or theme a user stored keeps working: `parseLook` and `parseTheme` take a stale or corrupt value for the
  default (Smooth, follow Windows).
- In Smooth light the sidebar is not a dark column. It sits on the ground in both themes.
- Shinatama's four ONI skins stay in Shinatama, as overrides of tokens. They are not part of the package.
- The root class `im-glass` is set only in the desktop app. Under it the ground and the sheets are translucent and
  show the Windows acrylic. Without it every surface is opaque (a browser preview, a test).
- `data-im-app` and `data-im-theme` go on the same element as `data-im-look`, because the accent reads the hue of
  the app and the lightness of the theme from that element.

## Colour

### Surfaces, lines and text

| Token | Role |
|---|---|
| `--im-ground` | The window's ground. Translucent under `im-glass` |
| `--im-sheet` | A sheet on the ground: the work area, panels |
| `--im-sheet-solid` | The sheet as an opaque colour, also under `im-glass`: for what rows scroll under, such as the sticky header of a table |
| `--im-float` | A floating surface: menu, sheet, dialog, notice, palette |
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
bars, not on every button, not on navigation backgrounds. ONI also takes the accent as the text of short labels.

### Status

The tones are `ok`, `warn`, `err` and `info`, set with `data-im-tone` on a chip, a dot, a note or a notice. A tone
always comes with a word, or an icon that has a name. Never the colour alone.

A toned chip has a ground of its own: 14% of its tone over the sheet in Smooth, the sheet itself in ONI (where the chip
is outlined). The fill of a row that is hovered, pressed or selected, which the chip sits on, therefore cannot take its
text under 4.5:1.

## Type

All fonts are local Windows fonts. The app downloads nothing.

| Token | Stack | Use |
|---|---|---|
| `--im-font-text` | Segoe UI Variable Text, Segoe UI, system-ui | Text and values |
| `--im-font-display` | Bahnschrift, Segoe UI Variable Display, Segoe UI | The head font of ONI, and display text |
| `--im-font-code` | Cascadia Mono, Cascadia Code, Consolas | Code, paths, IDs and key caps |
| `--im-font-head` | Smooth: the text font. ONI: the display font | Titles, labels, buttons, chips |

Sizes: 12 for meta text, 13 for body text, 14 for a panel title, 18 for a dialog title. Nothing is smaller than 11.
Numbers use tabular figures (`im-num`) and are right-aligned in columns. Smooth writes sentence case; ONI writes
capitals with letter spacing on titles, tabs and buttons, through `--im-case` and `--im-track`.

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
| `--im-w-sidebar` | Sidebar | 232 | |
| `--im-w-rail` | The sidebar as a rail | 56 | |
| `--im-w-inspector` | Inspector | 300 | The design allows 300 to 360. The token is 300. A 360 inspector next to the 232 sidebar needs a window at least 1012 wide to leave the content its 420 |

The content region is 420px or more. The minimum window width is 500.

Spacing is `--im-s-1` to `--im-s-5`: 4, 8, 12, 16, 24. Motion is `--im-t-fast` (120ms, hover and press),
`--im-t-base` (180ms, menus, sheets and the inspector) and `--im-ease` (`cubic-bezier(0.16, 1, 0.3, 1)`). With
reduced motion, states change at once.

## Layout

One window layout for every app, with seven regions. An app fills in the regions it needs.

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
| Title bar | `im-titlebar` | The mark and name of the app (`im-brand`), the view tabs, the command button (`Ctrl+K`), the three window buttons. It always names the product, in ONI too |
| Status row | `im-status` | The last result as a chip, a summary, and info at the right |
| Sidebar | `im-sidebar` | The list of the app's objects: threads, rooms, categories, projects. An app without one (Muro) sets `data-im-sidebar="off"` on the shell |
| Content | `im-content` | What the app is for. The content of this region is the app's own |
| Inspector | `im-inspector` | The details or the form of the selected object. Not modal; the rest of the window keeps working. It is closed with the `hidden` attribute, and the content takes its room |
| Action bar | `im-actions` | At most one primary action per window, at the right, with its key on the button |
| Footer | `im-footer` | Service state, counts, and the keys that work now |

The window is `im-shell`. It measures its own width (a container query), so the breakpoints follow the window and
not the screen.

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

The minimum window is 500 physical pixels, so at 200% page zoom the shell is 250 CSS pixels wide (341 for a window half-snapped
on a 1366px screen). At 250 and at every width up to 500 the three window buttons, the sidebar button, the Views menu and
the primary action are never pushed out of the shell. The gallery's width control goes down to 250 to show it.

In the rail a row shows only its `im-rail-item`, so every sidebar row needs one. It is the row's own icon (an `im-icon`),
or, when the app has no icon that tells its rows apart, the initials of the row in an avatar (`im-avatar` with
`im-rail-item`). A row without one is blank in the rail. A row keeps its text in the rail, hidden, as its accessible
name, and its `title` is its tooltip.

### Panels and helpers

A panel (`im-panel`) has a header (`im-panel-header`, with `im-panel-title`), tools (`im-panel-tools`), a body that
scrolls (`im-panel-body`) and a foot (`im-panel-foot`). Helpers: `im-stack` (a column), `im-cluster` (a wrapping
row), `im-split` (two groups at the two ends of a row), `im-scroll` (a region that scrolls), `im-spacer`. A surface
(`im-surface`) is one of four materials, set with `data-im-surface`: `ground`, `sheet`, `dense`, `float`.

## Controls

The set, each with every state defined once. The markup each class expects is written at the top of
`css/controls.css`.

| Control | Class | Notes |
|---|---|---|
| Button | `im-btn` with `im-btn--primary`, `im-btn--ghost`, `im-btn--danger`, `im-btn--confirm-danger`, `im-btn--sm` | The neutral button is `im-btn` alone |
| Icon button | `im-icon-btn` | Needs an accessible name and a tooltip |
| Key cap | `im-key` | One cap per key, in the code font |
| Count | `im-count` | A number in a pill |
| Field | `im-field`, `im-field-label`, `im-input`, `im-field-hint`, `im-field-error` | The label sits above the field |
| Search | `im-input` with an `im-icon` and an `im-key` | |
| Select | `im-select` | A button that opens a list |
| Checkbox, radio, switch | `im-check`, `im-radio`, `im-switch`, in an `im-option` | `aria-checked` is `true`, `false`, or `mixed` for a checkbox |
| Tabs | `im-tabs`, `im-tab` | |
| Segmented | `im-seg` | |
| Menu | `im-menu`, `im-menu-item` | Opened by `openMenu` |
| Tooltip | the `title` attribute | There is no tooltip element |
| Row | `im-row`, `im-row-text`, `im-row-title`, `im-row-sub`, `im-row-meta` | One line (`im-row--1`) or two |
| Table | `im-table`, `im-cell-title`, `im-cell-sub` | |
| Facts | `im-facts` | A name and its value; the value is content and can be selected |
| Tree | `im-tree`, `im-tree-item`, `im-tree-chevron`, `im-tree-label` | |
| Avatar | `im-avatar` | |
| Status chip | `im-chip` with `data-im-tone` | |
| Note | `im-note` | A result or a warning that stays in the page |
| Notice | `im-notice` | Shown by `notify` |
| Progress | `im-progress` | Without `aria-valuenow` it is indeterminate |
| Steps | `im-steps`, with `data-im-step` of `done`, `now` or `todo` on each item | |
| Inspector, sheet, dialog | `im-inspector`, `im-sheet`, `im-dialog` | See the surfaces below |

### States

The same for every control. They are real attributes and pseudo-classes, never extra classes.

| State | Rule | Code |
|---|---|---|
| Hover | A translucent wash; never a change of size | `:hover` |
| Pressed | One step darker than hover | `:active` |
| Focus | The focus ring, only from the keyboard. See the rule below | `:focus-visible` |
| Selected | The selection fill plus a mark that is not colour: weight, an underline, a check. Hover, focus and selected can be told apart at a glance | `aria-selected="true"` |
| Checked | A checkbox, radio or switch that is on | `aria-checked="true"`, or `"mixed"` |
| Disabled | A dashed edge and the muted text colour, readable at 4.5:1. No hover. It says why in a tooltip or a line beside it. Never an opacity | `disabled` or `aria-disabled="true"` |
| Busy | The label and the width stay; a progress mark (`im-spinner`) takes the icon's place; a second press does nothing | `aria-busy="true"` |
| Invalid | The field's edge takes `--im-err`, with one sentence under the field that starts with the word "Error", tied by `aria-describedby`, shown after the field loses focus or on submit | `aria-invalid="true"` on the input |
| Read-only | No field fill, no frame, text selectable, no caret | `readonly` on the input |

A busy button ignores the pointer, not the keyboard: Enter or Space on a busy button still fires its click. The app
ignores a second activation itself, or disables the button.

### The focus ring

The ring is 2px wide, in the accent text colour (`--im-accent-text`), drawn with `outline` so forced colours keep
it. How far it sits from the control depends on what surrounds the control:

| What is focused | Where the ring is |
|---|---|
| A control that stands alone: button, icon button, select, checkbox, radio, switch | 2px outside |
| A field: input, search. Its edge also turns to the accent | 1px outside |
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

## Surfaces: which one for what

| Need | Surface | Rules |
|---|---|---|
| A few commands | Menu | Under its control. Escape or a press outside closes it. Focus returns to the control |
| A short choice tied to one control or pane | Sheet | Docked to its control or pane. One at a time. Tab stays inside it |
| Details or a form for the selected object | Inspector | Not modal. The rest of the window keeps working |
| A decision about the whole window | Dialog | Everything under the title bar is inert. Focus is contained and starts on Cancel. Actions at the bottom right |
| A short result | Notice | Bottom centre, above the footer. It never takes focus. An error stays until dismissed and says "Error" in words |
| A command by name | Command palette | Opened with `Ctrl+K`. Modal like a dialog |

No surface uses `showModal()`: it makes the HTML title bar inert, and a borderless window cannot then be moved,
minimized or closed. A dialog makes the regions under the title bar inert instead. Nothing opens a second OS window
except what an app already has.

Surfaces float inside the shell and are placed from the rectangle of their anchor. They stack from the bottom:
sheet, dialog and palette, notice, menu. Escape closes the top surface only.

## Behaviour

### Keyboard

- One command registry per app. Key bindings, the key caps on buttons, the footer's key list, menus and the palette
  all come from it.
- `Ctrl+K` opens the command palette in every app. `Ctrl+F` is search inside the current view.
- Tab moves between controls. Arrows move inside a list, a table, tabs or a menu, and each is one tab stop. `F6`
  moves between the sidebar, the content and the inspector; `Shift+F6` goes back.
- Enter runs the primary action of the focused surface. Escape closes the top surface only.
- In a text field (an input, a textarea, a select or an editable element) a binding without Ctrl or Alt does not run,
  and does not cancel the key: the field keeps every key that types and every key that edits or moves in it (letters,
  Space, Delete, Backspace, Home, End, the arrows, Enter, Tab). Escape and F1 to F24 stay available there, and so does
  any binding with Ctrl or Alt. A key pressed while an input method composes text belongs to the input method.
- A binding of Enter or Space is not made in the registry: the focused control's own activation would also fire.
  A button's key cap may show it.
- `Ctrl+=`, `Ctrl+-` and `Ctrl+0` zoom from 50 to 200%, in steps of 10, saved per machine.

### Destructive actions

- If it can be undone, do it at once and show a notice with Undo. The app binds Undo: the notice's button is
  reachable by pointer, and a key is the app's to add.
- If it cannot be undone, ask in a dialog that names the object and the consequence. The confirming button carries
  the verb and the object ("Delete 8 items"), and focus starts on Cancel.
- A destructive action is never the primary action of the action bar without one of the two above.

### Saving

One model per surface. Settings save themselves and show "Saved". A form in the inspector has Cancel and Save, and
leaving it with changes asks once.

### Empty, loading, error

- Empty: the panel keeps its header and frame, with one sentence and the first action where the data will be.
- Loading: the final layout with flat grey bars at the real sizes, no shimmer, and nothing moves when the data
  lands. Under 300ms show nothing.
- Error: inside the panel that failed, one sentence on what failed and a Retry. Never a full-window banner for one
  panel.

### Chrome and content

Text in the chrome is not selectable and keeps the arrow cursor. Content (messages, paths, code, the values in
facts, every field) is selectable. No control has a hand cursor.

### Accessibility

Forced colours: borders and outlines take system colours where fills vanish. Reduced motion is honoured. Every
action is reachable from the keyboard. Colour never tells a state alone.

## What is common and what is an app's own

Every app has the same layout structure, the same shapes and the same controls. An app may have its own where it
needs them.

- **Common, never redefined by an app**: the seven regions and the breakpoints, the measures, the radii and cuts,
  the control set with its states, the surfaces, the behaviour rules.
- **An app's own**: the content of the regions, and the controls only that app needs. Shinatama's terminal panes
  and team map, Mukade's graph and lanes, Muro's plugin by harness matrix, Daodan's pipeline.
- An app's own control is built from the package's tokens and primitives, never from literal colours or sizes. It
  takes the common states and keys: the focus ring, disabled, selection, Escape, the arrows. It lives in the app's
  repository, and moves into the package when a second app needs it. [using-imago.md](using-imago.md) shows how.
- An app never restyles a common control. If the common one does not fit, the fix goes into the package.

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

## File controls and process status

Import these functions from `@acaprino/imago/ui`. Each uses the document supplied by the caller.

| Control | Contract |
|---|---|
| `fileTree(doc, entries, options)` | Each entry has a unique string ID, a name and optional children. Supply a label and optional initially expanded IDs. Arrows navigate and expand folders, Home and End jump, Space selects, and Enter opens a file. Use `onSelect` for selection and `onOpen` for activation. The app supplies the listing. |
| `fileSelector(doc, options)` | Returns a native file input with a label, optional accept filter, multi-file selection or directory mode. Read its FileList on change. |
| `pathField(input, options)` | Wraps an editable path and a browse button. Supply the native chooser through `choose`, a button label and an error callback. Cancel preserves the current input. |
| `stepProgress(doc, label, steps, current)` | Append the returned element and call `setCurrent(index)` as work advances. Index zero indicates the first step. Passing the step count marks all complete. The application controls validation, navigation and retries. |
| `loader(doc, label)` | Inline status message with a spinner. The label stays visible with reduced motion. Use a progress bar when the amount of work is known and panel skeletons when replacing rows. |

A docked shell can opt into a resizable sidebar with `sidebarResize(shell, { label, width, onChange })`.
Drag the separator, use Left or Right, or jump to either limit with Home or End. The app may store the reported
width. The separator only appears in the expanded desktop sidebar. The compact icon rail and narrow drawer use
their existing sizes. Call the returned cleanup function when unmounting the shell.

## Workspace controls

Panes share one accessible separator for rows, columns and the expanded sidebar. A drag shows its destination on the pane edge, pane centre or neighbouring tab. Keyboard move mode announces the same destinations. The application supplies the view contents and owns their layout and persistence.

The file tree supports incremental folder reads and keyboard search. A breadcrumb reveals a parent folder. The project finder has distinct actions for opening the highlighted project and including it in a group. An inspector can cover its current detail with a child view while the workspace stays available.

The calls, keyboard interactions and a file browser example are in [Using Imago](using-imago.md#workspaces-projects-and-files).
