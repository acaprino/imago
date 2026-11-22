# Imago: one design system for the suite

Date: 2026-11-20. Status: approved by the owner on 2026-11-20, after the toolkit preview ("Bello, crea il pacchetto").

## Intent

Shinatama, Xiox, Mukade, Muro and Daodan are one suite and should feel like one product: the same
controls, the same behaviour, the same window layout. Today each app writes its own. Xiox and Mukade
each carry their own `smooth.css` beside a base stylesheet, Muro has one stylesheet of its own, and
Shinatama has 29. A control learned in one app behaves differently in the next.

The owner asked for the weight to be on **controls, UX and layouts**, and delegated the open
decisions. Every decision below marked *(call)* was made by the agent, not agreed with the owner.

**The proposal.** "The proposal" below is the page of 2026-11-20 (then under the working name Waku), kept beside this file as
[reference/proposal.html](reference/proposal.html). Its looks A (Smooth) and B (ONI) are
the reference for the appearance of every control, including the ones no app has yet (Tree, Steps,
Facts, Avatar, Segmented, Count): its CSS draws them. Where this document and the page differ, this
document wins. So Imago 0.1 is extraction plus design work for the states the page does not draw.

## Goals

- One package that every app imports: tokens, layout primitives, controls, behaviour, desktop shell.
- Every control has every state defined once: rest, hover, pressed, focus, selected, disabled, busy,
  invalid, read-only.
- One set of behaviour rules, so the same key, the same click and the same failure do the same
  thing in every app.
- One window layout that each app fills in, with one set of breakpoints.

## Non-goals

- No change to an app's features or content: terminals, graphs and tables stay the app's own. Where
  things sit and how they are operated does change: that is the work (inspector, command registry,
  palette, breakpoints).
- No framework. The apps are Tauri 2, Vite and TypeScript without a UI framework, and stay so. The one exception is
  Daodan's viewer, which is written in React and is not rewritten: it takes the package's markup through a binding,
  `@acaprino/imago/react`, whose components write the canonical classes and nothing of their own *(call)*.
- Ethel and artcraft-web are not in this work *(call)*. Ethel has its own design folder and a web
  client; artcraft-web is a web product. They may take the tokens later.
- No third look. The "Modules" look of the proposal is dropped *(call)*: its 10px gap around every
  region costs space in terminals and tables, and it adds translucent layers to measure.

## Anti-goals

- A package that is only a stylesheet. If behaviour (focus, keys, dialogs, states) stays in each app,
  the suite still feels like five apps with one paint.
- A control with only its rest state specified.
- Shinatama losing a pane row or a terminal column when it adopts the package.
- Any app refused or broken at start because the package changed: each app pins a version.

## Constraints

- Windows 11, Tauri 2.12, WebView2. The window is transparent over the acrylic material; the rules
  of `docs/design-system/desktop-shell.md` stay in force.
- `AGENTS.md`: two branches (`main`, `develop`), releases by the workflow, no hand-made versions or
  tags. The new repository follows the same rules.
- Minimum window width 500px (Snap zones), in every app: Xiox is at 960 today, Mukade at 900, Muro
  at 760. Each gets the three breakpoints.
- Text contrast 4.5:1 on the composited colour, checked by tests.

## Approaches

1. **A shared package in its own repository** (chosen, *call*). `acaprino/imago`, with its own
   releases; each app pins a tag. One source for every app, and Shinatama's release rhythm does not
   gate the others. Cost: one more repository, and a version to bump in five places.
2. **Inside Shinatama, the others import from it.** No new repository, but every app then depends on
   the largest and most frequently released one, and a Xiox fix needs a Shinatama release.
3. **Keep copying** (`docs/design-system/README.md` today: "copy `tokens/` into the app"). Cheapest
   now; it is how the three copies of Smooth came to exist.

## Decisions

### Looks

- **Smooth is the default look, ONI the second, in every app** *(call)*. Three apps already ship
  exactly this.
- Smooth has a dark and a light theme and follows Windows by default. ONI has dark and light
  *(call)*: Mukade already ships ONI light (`look.ts`, `THEMES.oni`), and removing it would take a
  shipped choice away. ONI dark stays as it is today. A look or theme a user already stored keeps
  working in every app.
- Muro has one look today and gains ONI from the package.
- Shinatama's four ONI skins stay, as token overrides that live in Shinatama, not in the package.
- **In Smooth light the sidebar is not a dark column** *(call)*. The proposal keeps it dark as in
  Qamille; that is dark glass on a light acrylic, which `desktop-shell.md` forbids, and it puts the
  loudest surface on navigation. The sidebar sits on the glass ground in both themes.

### Colour

- **One accent per app, of one lightness and one strength for all** (the owner's rule). Only the hue
  differs. The accent is defined in OKLCH from the app's hue *H*; the owner saw these numbers and
  hues in the toolkit preview on 2026-11-20 and approved them:

  | Role | Value |
  |---|---|
  | Accent on dark | `oklch(0.82 0.12 H)` |
  | Text on that accent | `oklch(0.20 0.04 H)` |
  | Accent, highlighted | `oklch(0.90 0.08 H)` |
  | Accent on light, text and fill | `oklch(0.47 0.13 H)`, with white text on the fill |

  Hues: Xiox amber 75, Shinatama pink 355, Mukade violet 300, Muro mint 170, Daodan cyan 235. Muro
  leaves violet and Daodan leaves pink, so no two apps share a hue. Chroma 0.12 is the most that
  every hue reaches at that lightness inside sRGB; so Xiox's amber and Shinatama's pink become a
  little quieter than today's `#FFB21E` and `#F48FB8`, and Xiox's light theme takes a dark amber
  fill with white text instead of bright amber with dark text. `DESIGN.md`'s rule "one accent"
  becomes "one accent per app". The token export also writes the sRGB hex of each value.
- **The accent goes on four things only**: the one primary action, the selection mark, the focus
  ring, and data. Not on bars, not on every button, not on navigation backgrounds. (ONI keeps the
  accent as text on short labels, as today.) On data the accent is the tone `accent` of a chip, a dot or a summary, as
  the approved preview draws it ("lead", "Demo"); it is not a status, and a note or a notice never takes it.
- **Categorical colours** *(call)*: eight fixed hues (25, 75, 125, 170, 215, 255, 300, 345) at the accent's lightness
  and strength in each theme, the same in every app, with one colour for the text on them. They tell one thing among
  others of its kind (a thread, a project), always beside its name, never alone. A row that wants the person carries a
  badge, a dot in its tone, and says the same in its words.
- ONI dark's muted text is `#9CB8E2`, not the preview's `#8AA8D6`: the preview's reaches only 3.92:1 on a
  button, `#9CB8E2` reaches 4.70:1.
- Status tones are `ok`, `warn`, `err`, `info`. A tone always comes with a word or an icon with a
  name: never colour alone.

### Type

- **Local Windows fonts only** *(call)*: Segoe UI Variable Text for text, Bahnschrift for ONI and
  for display, Cascadia Mono for code, paths, IDs and key caps. The proposal's IBM Plex Sans is
  dropped: the apps work offline and download nothing.
- Sizes: 12 meta, 13 body, 14 panel title, 18 dialog title. Nothing under 11. The five sizes (11, 12, 13, 14, 18) are
  tokens *(call)*, and every size of text in the package and in an app is one of them.
- Numbers use tabular figures and are right-aligned in columns. Sentence case in Smooth; capitals
  only in ONI, on titles, tabs and buttons.

### Measures

| Token | Smooth | ONI |
|---|---|---|
| Title bar | 46 | 38 |
| Control and field | 32 | 28 |
| Small control | 24 | 22 |
| List row, one line | 32 | 28 |
| List row, two lines | 44 | 40 |
| Table row | 36 | 32 |
| Panel header | 42 | 40 |
| Footer | 30 | 26 |
| Radius (chip, control, sheet) | 4, 6, 10 | 0, with cuts of 6, 8, 14 |

Spacing: 4, 8, 12, 16, 24. Motion: 120ms for hover and press, 180ms for menus, sheets and the
inspector, ease-out `(0.16, 1, 0.3, 1)`; with reduced motion, states change at once. One control
height per row of controls. Pointer targets are at least 24px.

Shinatama's pane geometry does not change with the look (kept from `DESIGN.md`): the pane header
and terminal grid take Shinatama's own fixed sizes, not the table above.

### Layout

One grid for every window, with seven regions. An app switches on the regions it needs. It is the only frame: there is
no second layout for a page, a document or a workbench.

```text
┌ title bar: mark, name · view tabs · window buttons ┐
├ status row: last result · summary · info at right  ┤
│ sidebar  │ content                    │ inspector  │
│ 232      │ fluid, 420 or more         │ 300 to 360 │
│          ├ action bar: primary at the right        ┤
└ footer: service · counts · keys                    ┘
```

- **Sidebar**: the list of the app's objects (threads, rooms, categories, projects). Muro has none.
- **Inspector**: the details or the form of the selected object. It replaces today's right drawers
  in Shinatama and Muro and Xiox's bottom detail box. It pushes the content; it never covers it at
  1000px or more. It is the only panel for the selected object, 300 wide, or 360 when the app asks for the wide one, the top
  of the range. (A drawer, not modal, also exists: a layer for content the app owns that stays beside live panels, not a
  second inspector; see [design-file.md](design-file.md), "Surfaces: which one for what".)
- **Action bar**: at most one primary action per window, at the right, with its key on the button.
- Breakpoints (Shinatama's own), as ranges of the window's own width: under 1000 the inspector covers the
  content as a drawer; from 620 to under 850 the sidebar is a 56px rail of icons, each with a tooltip and a
  name; under 620 the sidebar is opened by a button in the title bar and the view tabs become one "Views"
  menu. From 850 up a button in the sidebar header folds the sidebar into the same rail. The package does not
  store that choice: the app keeps it through `onChange` and passes it back as `collapsed`.
- Layout primitives: Shell, Panel (header, tools, body, foot), Stack, Cluster, Split, Scroll,
  Surface (ground, sheet, dense, floating).
- The window names the product: mark and name at the left of the title bar, always. ONI shows the app's mark
  in the title bar too; the preview hid it there. The mark is the initial of the product's name in capitals, in the
  square of the app's accent: no drawn symbol and no logo (the owner's choice). The icon of the app's executables, its
  window program and its command-line program alike, is the same mark, made by the package for the five apps.

### Surfaces: which one for what

| Need | Surface | Rules |
|---|---|---|
| A few commands | Menu | Under its control; Escape or a press outside closes it; focus returns to the control |
| A short choice tied to one control or pane | Sheet | Docked to its control; one at a time |
| Details or a form for the selected object | Inspector | Not modal; the rest of the window keeps working |
| A decision about the whole window | Dialog | Everything under the title bar is inert; focus is contained; actions at the bottom right |
| A form that must block the window while it saves | Dialog | Locked while it writes; never the inspector, which is not modal |
| A short result | Notice | Bottom centre; never takes focus; an error stays until dismissed and says "Error" in words |

No surface uses `showModal()` (it makes the HTML title bar inert). Nothing opens a second OS window
except what an app already has.

### Controls

Set: Button (primary, secondary, ghost, danger, icon), Key cap, Count; Field, Search, Select,
Checkbox (on, part, off), Radio, Switch; Tabs, Segmented, Menu, Tooltip; Row, Table, Facts, Tree,
Avatar; Status chip, Notice, Progress, Steps; Inspector, Sheet, Dialog.

One control for one need: each is drawn once, and the drawing serves the ARIA element and the native one (a native
input in a form keeps its own keys and validation) *(call)*. One message that stays in the page, one loading state,
one empty state, one steps, one dialog. A selected item is drawn the same whatever attribute says it is selected.

States, the same for every control:

| State | Rule |
|---|---|
| Hover | A translucent wash; never a change of size |
| Pressed | One step darker than hover |
| Focus | A ring 2px wide in the accent text colour, only from the keyboard; drawn with `outline` so forced colours keep it. 2px outside a control that stands alone; 1px outside a field; 2px inside an item of a list, table, tree, menu, tab strip or segmented control; 5px inside ONI chamfered controls |
| Selected | The selection fill plus a mark that is not colour (weight, underline or check). Hover, focus and selected must be told apart at a glance |
| Disabled | Stays readable at 4.5:1, with no hover, and says why in a tooltip or a line beside it |
| Busy | The label and the width stay; a progress mark takes the icon's place; a second press does nothing |
| Invalid | The field's edge takes `err`, with one sentence under the field, tied by `aria-describedby`, shown after the field loses focus or on submit |
| Read-only | No field fill, text selectable, no caret |

More rules:

- A label sits above its field. A placeholder is never the label.
- The danger button is outlined at rest. Only the confirming button of a destructive dialog is
  filled, with text at 4.5:1 (this closes the 2.2:1 finding in `DESIGN.md`).
- An icon-only control has an accessible name and a tooltip.
- A chip never wraps or shrinks. One status mark per row.
- Tables: no zebra, no header band, headers in sentence case, a missing value as a grey dash, a real
  zero printed as zero.
- A switch changes at once; a checkbox waits for Save. A switch is never used inside a form with a
  Save button.

### What is common and what is an app's own

The owner's rule: every app has the same layout structure, the same shapes and the same controls;
an app may have its own where it needs them.

- **Common, never redefined by an app**: the seven regions and the breakpoints, the measures, the
  radii and cuts, the control set with its states, the surfaces, the behaviour rules.
- **An app's own**: the content of the regions and the controls only it needs (Shinatama's terminal
  panes and team map, Mukade's graph and lanes, Muro's plugin × harness matrix, Daodan's pipeline).
- An app's own control *(call)*: is built from the package's tokens and primitives, never from
  literal colours or sizes; takes the common states and keys (focus ring, disabled, selection,
  Escape, arrows); lives in the app's repository; and moves into the package when a second app
  needs it.
- An app never restyles a common control. If the common one does not fit, the fix goes into the
  package.

### Behaviour

**Keyboard.**
- One command registry per app. Bindings, key caps on buttons, the footer's key list, menus and the
  palette all come from it.
- `Ctrl+K` opens the command palette in every app; `Ctrl+F` is search inside the current view.
  Mukade's search moves from `Ctrl+K` to `Ctrl+F` *(call)*. The package registers both, with the same ids in every
  app, in the one call every app makes for its shell, `mountApp` *(call)*: it also attaches the layers, the keys, the
  regions and the sidebar, so no app forgets one.
- A key is answered once: a handler that answers a key (Escape that closes a surface, an arrow that moves a list)
  claims it, and no command also runs on it.
- Tab moves between regions' controls; arrows move inside a list, a table, tabs or a menu (one tab
  stop each). `F6` moves between regions.
- Enter runs the primary action of the focused surface. Escape closes the top surface only.
- In a text field (an input, a textarea, a select, editable content) a key pressed without Ctrl or Alt belongs to the
  field: a letter, Space, Delete, Backspace, Home, End, the arrows, Enter and Tab are never taken by a command there.
  Escape, F1 to F24 and every binding with Ctrl or Alt still run. Enter respects IME composition.
- `Ctrl+=`, `Ctrl+-`, `Ctrl+0` zoom from 50 to 200%, saved per machine.

**Destructive actions.**
- If it can be undone, do it at once and show a notice with Undo.
- If it cannot, ask in a dialog that names the object and the consequence. The confirming button
  carries the verb ("Delete 8 items"), and focus starts on Cancel.
- A destructive action is never the primary action of the action bar without one of the two above.

**Saving.** One model per surface: settings save themselves and show "Saved"; a form in the
inspector has Cancel and Save, and leaving it with changes asks once. An app's settings are a Settings view, the last
view tab of the title bar. The look and the theme are not in it: they are five commands of the palette, the same in
every app (Smooth look, ONI look, Follow Windows, Light theme, Dark theme), which the package registers and the app
stores.

**Empty, loading, error.**
- Empty: the panel keeps its header and frame, with one sentence and the first action where the data
  will be.
- Loading: the final layout with flat grey bars at the real sizes, no shimmer, nothing moves when
  the data lands. Under 300ms show nothing.
- Error: inside the panel that failed, one sentence on what failed and a Retry. Never a full-window
  banner for one panel.

**Text in the chrome** is not selectable and keeps the arrow cursor; content (messages, paths, code,
values in Facts) is selectable. No hand cursor on buttons.

**Accessibility.** Forced colours: outlines and borders in system colours where fills vanish.
Reduced motion honoured. Every action reachable from the keyboard.

### Desktop shell

Shinatama's shell is the base and moves into the package: acrylic with the window theme from the
look, saved for the first frame; the HTML title bar with Snap Layouts; navigation closed and browser
keys off; the "Reload interface" item in the window menu, which works when the page is hung; WebView2
crash recovery, with the rebuilding contract: while the app rebuilds its windows after a lost browser
process it prevents the exit and does not save the window's state; zoom. `desktop-shell.md` moves with it
and stays the reference.

- Xiox has its own `native_frame.rs` and `window_state.rs`. Where the two differ, the builder reads
  both and the package keeps the behaviour that covers more cases. Saving and restoring the window's
  size and position is part of the shell *(call)*.
- The crate also does the three things Xiox's own window code did (the owner's request): it trims the WebView2 context
  menu to the editing commands, it tints the acrylic for the look and the theme the page draws (which shows on
  Windows 10 only), and it ignores the failures WebView2 reports while the application closes.
- Muro has native decorations today. It takes the HTML title bar from the shell *(call)*, because
  the view tabs live in the title bar in every app.

### The package

```text
acaprino/imago
├─ tokens/imago.tokens.json   single source (DTCG): look × theme, accent per app, measures, type, categories
├─ css/                      tokens.css (generated), base.css, primitives.css, controls.css, the page patterns, looks/oni.css
├─ ts/shell/                 window-controls, zoom, desktop-guard, window-theme
├─ ts/ui/                    commands, menu, inspector, sheet, dialog, notice, keys, mountApp, the renderers
├─ react/                    the binding for Daodan's viewer
├─ icons/                    the icons of the apps' executables
├─ scripts/check/            imago-check
├─ crates/imago-shell/        Rust: acrylic, theme, Snap Layouts, guard, WebView2 recovery
└─ docs/                     design-file.md (the canon) and the documents it links, the gallery
```

Each app depends on a tag: `"@acaprino/imago": "github:acaprino/imago#v<x>"` and
`imago-shell = { git = "…", tag = "v<x>" }`.

The gallery is a page in the package that shows every control in every state, in both looks and
themes, for each app's accent. It is the acceptance surface: a control is done when its row in the
gallery is complete and its contrast test passes. Every class the package defines is shown there, but those its
coverage test lists as pending removal.

A rule is checked by a program wherever a program can check it *(call)*: `imago-check`, a program of the package, runs
in each app's CI and on the package's own stylesheets, and fails, with the file and the line, on what the design file
forbids and a program can see (a class of the package restyled by an app, a literal colour or size, a hand cursor, an
opacity on a disabled state, a breakpoint on the screen, a removed name, the missing agent lines, no call of
`mountApp`). What only a person can judge (the words of a destructive button, one primary action) stays a rule of the
design file and a line of the review.

`docs/design-system/` in Shinatama moves to the package; Shinatama keeps a pointer.

### Order of work

1. Imago 0.1: tokens, primitives, controls with all states, behaviour modules, shell, gallery;
   extracted from Shinatama and Xiox. Then the one canon: one frame, one control per need, the check.
2. Muro and Shinatama, which already use the package and have the least distance to go *(call)*. Muro gains the
   shell, the inspector and the 500px minimum (today 760); Shinatama is the largest, and its terminals and panes stay
   its own.
3. Mukade (its copy of the looks becomes an import).
4. Daodan: CSS and controls for `viewer` only, through the React binding. Daodan has no Tauri app, and none is built here.
5. Xiox (it has both looks, and has not started).

Each app's step has two parts, in this order: first the tokens, controls and shell with the app's
layout unchanged; then the layout and behaviour (inspector, breakpoints, command registry, palette).
Each part is its own short branch from `develop`.

While an app migrates, its `develop` may pin a commit of Imago's `develop`. An app's release to
`main` pins a Imago tag *(call)*. Imago's release workflow sets the version and the tag and publishes
a GitHub Release with no installer.

Each step ends with a capture of the real window in both looks, over a dark and a bright window,
as `desktop-shell.md` section 1.5 describes.

## Left to the builder

- Token names and the mapping from each app's current variables.
- The exact light-theme accent values that pass 4.5:1 on each surface.
- How the command registry is typed and how an app declares its commands.
- Whether `tokens.css` is generated by zero-slop-design (as today) or by a script in the package.
- How CI in each app reads the package. The repository is public, so it needs no credential.

## Needs the owner

- Settled on 2026-11-20: the name is **Imago** (the owner's choice: in Oni, the final form the
  Daodan Chrysalis gives its host), and the owner asked for the package to be created.
- The repository `acaprino/imago` is public, as the other repositories of the suite are, so an app's CI
  reads it with no credential.
- The glass of the frame keeps Shinatama's measured values *(call)*. The preview's "more glass"
  setting is not adopted unless the owner asks for it.
- The toolkit preview the owner approved: https://claude.ai/artifact/XnSFbo8GPwuUVgUgqNiz4T. The
  ONI focus ring is drawn inside chamfered controls, because a clip-path cuts an outer ring.

## Corrections after the build

Made on 2026-11-20, when the package was built, and on 2026-11-21, when the audit of the five apps found that the
package had grown a second way to do several things and the owner approved one canon
([the decisions](superpowers/specs/2026-11-21-one-canon-design.md)). Each text above was changed in place; this list says
what changed and why. Where [design-file.md](design-file.md) differs from this file, it wins. The names the canon removed,
and what replaces each, are in the table "Moving from 0.1.4" of [using-imago.md](using-imago.md#11-moving-from-014).

- **2026-11-20, focus ring.** The state table said "2px ring, 2px off". The ring is 2px wide everywhere, and its
  distance depends on what surrounds the control: 2px outside a control that stands alone, 1px outside a field (as in
  the approved preview), 2px inside an item of a list, table, tree, menu, tab strip or segmented control (their
  container scrolls and clips), and 5px inside ONI chamfered controls (a clip-path cuts an outer ring).
- **2026-11-20, ONI dark muted text.** `#8AA8D6` of the preview reaches 3.92:1 on a button, under the 4.5:1 rule. It is
  `#9CB8E2`, 4.70:1. This is the one value that departs from the preview the owner approved.
- **2026-11-20, the mark in ONI.** "The window names the product, always" outranks the preview, which hid the app's
  mark in the title bar in ONI. The package shows it.
- **2026-11-20, breakpoints.** They are written as ranges of the window's own width, so no fractional width falls
  between two blocks: under 1000, 620 to under 850, and under 620. Under 620 the sidebar was only hidden; a title-bar
  button now opens it as an overlay.
- **2026-11-20, the sidebar folds.** From 850 up a button in the sidebar header folds it into the 56px rail of icons,
  each with a tooltip and a name. From 620 to under 850 the width forces the rail. Under 620 the title-bar toggle opens
  the whole sidebar. The package does not store the choice: the app keeps it through `onChange` and passes it back as
  `collapsed`.
- **2026-11-20, desktop shell.** The list gains the "Reload interface" item of the window menu, and the rebuilding
  contract: while an app rebuilds its windows after a lost browser process it prevents the exit and does not save the
  window's state.
- **2026-11-20, the repository is public.** The text said the repository starts private and the owner makes it public
  when ready. It is public, so an app's CI reads it with no credential.
- **2026-11-20, keys in a text field.** The text held back only single-letter keys from the command registry while
  focus is in a field, so a command bound to Delete or an arrow broke editing in every search box. Every binding
  without Ctrl or Alt is held back in a text field, except Escape and F1 to F24.
- **2026-11-20, names.** The design file is `docs/design-file.md`, not `docs/DESIGN.md`: on Windows both names are one
  file. The proposal is `reference/proposal.html`; the link to it named a file that is not there.
- **2026-11-21, one frame.** Versions 0.1.2 to 0.1.4 added three frames beside the shell, made for Muro, Shinatama and
  Daodan, with their own sidebars, side panels and toolbars, and the design file did not name them. Muro followed them to
  the letter and still broke the design. The seven regions are the only frame; the inspector is the only panel for the
  selected object, not modal, and a form that must block the window while it saves is a dialog (a drawer, not modal, is
  for content the app owns beside live panels, and never blocks). Every breakpoint follows the shell, at 1000,
  850 and 620.
- **2026-11-21, one control for one need.** The package had two drawings of the checkbox and the radio (one on ARIA
  elements, one with the browser's own), three of the segmented control, three messages, four loading states and three
  empty ones. Each control is now drawn once, for the ARIA element and the native one alike; one message (the note), one
  loading state (the panel's, or a line in the content, or a busy button), one empty state, one steps. A selected item is
  drawn the same whatever attribute says it, where some rules gave colour alone.
- **2026-11-21, the accent on data.** The first text of the audit took the tone `accent` for an intruder. It is not: the
  approved preview has an accent chip, and the first gallery drew one. It stays, on a chip, a dot and a summary only, as
  the mark of data; the status tones stay `ok`, `warn`, `err` and `info`.
- **2026-11-21, the mark and the icons.** The five apps showed five different things at the top left. The owner chose,
  from three treatments shown side by side, the capital initial in the accent's square, beside the name, with no drawing
  and no logo. The icons of the executables are the same mark, made by the package, so that Windows shows what the title
  bar shows.
- **2026-11-21, the look, the theme and Settings.** The apps' plans picked the look and the theme in more than one way
  (palette commands, a Settings view, a dialog). The package registers five commands of the palette, alike in every app, and the
  app stores the choice; Settings are the last view tab, and they save themselves.
- **2026-11-21, a key is answered once.** Escape that closed the inspector also ran the app's own Escape command. A
  handler that answers a key claims it, and the registry runs no command on a claimed key; a key the desktop guard only
  refuses to the browser still runs the app's command.
- **2026-11-21, categorical colours and the badge.** The type scale and categorical colours had no tokens, so the apps
  wrote literals. The five sizes of text are tokens, and eight categorical colours are added, always beside a name; a row
  that wants the person carries a badge in its tone and says it in words.
- **2026-11-21, React.** The design said no framework, and the package carried a React entry. It stays as the one
  exception, a binding for Daodan's viewer, whose components write the canonical markup and nothing else.
- **2026-11-21, the crate.** At the owner's request the crate does the three things Xiox's own window code did and it did
  not: the trimmed context menu, the acrylic tinted for light and dark, the failures ignored while the application
  closes. They are Rust, proved only by the run on GitHub; what has been seen on a real window is in
  [verification.md](verification.md).
- **2026-11-21, the check.** Nothing checked an app against the rules. `imago-check` does, in each app's CI and on the
  package itself, and fails on every rule a program can judge; the rest is a list a person checks in review.
- **2026-11-21, the order of the apps.** The apps move to the canon in the order of the least distance: Muro and
  Shinatama, then Mukade, Daodan and Xiox.
