# Imago design file

The canon of Imago: who owns what in an app of the suite, and the rules of the shell. Every other document agrees with it.
Read it before UI work.

**The look and the components are Sigrid's. The shell is Imago's. The screens are the app's.** Imago has no CSS, no token
and no control of its own (decided by the owner on 2026-11-24): it puts Sigrid's parts together, once, and gives Sigrid's engine
the look of the suite.

## The documents

| Document | What it holds |
|---|---|
| This file | The rules, and what a program and a person check |
| [using-imago.md](using-imago.md) | How an app depends on the package, what it exports, the window's wiring, the icons, the check, and the table "Moving from 0.4.1" |
| [desktop-shell.md](desktop-shell.md) | The window: the techniques on Windows 11, the crate `imago-shell`, the wiring in order, WebView2 recovery |
| [verification.md](verification.md) | What has been run on a real window, and what has not |

The design system up to 0.4.1 (the CSS, the renderers, the two looks, the graphs) is at the tag `v0.4.1`, with its documents.

## Who owns what

| Layer | What it is | Where |
|---|---|---|
| Sigrid | The components and the theme engine: colour, type, spaces, density, motion, states, words. It knows no app | `@acaprino/sigrid`; its rules are its `DESIGN.md`, and its `agents/catalog.json` says which entry exports each name |
| Imago | The base shell of the suite: the window, the frame, the palette, the notices, the look as a theme preset, the icons, the identity of an app | `@acaprino/imago` and the crate `imago-shell` |
| App | Its screens and its data, made of Sigrid's parts | the app |

- A rule about how a part looks or behaves is Sigrid's. Imago does not restate it and does not override it.
- Imago re-exports nothing of Sigrid: an app imports a part from the entry of Sigrid that has it.
- Sigrid and React are peers, so that an app has one copy of each.
- A part the suite needs and Sigrid lacks is added to Sigrid, not to Imago or to an app.

The app calls, each once: `defineApp`, `startApp`, `AppWindow`. Inside: `useNotify`, `useWindow`, `useGlass`, `useFocusKept`,
`focusContent`, and `ScreenBoundary` round a part that may fail. [using-imago.md](using-imago.md), section 3, has them.

- An app does not write what the shell draws: `AppShell`, `TitleBar`, `WindowControls`, `CommandPalette`, `CommandsProvider`,
  `Toasts` and `useSchemeCommands` are the shell's (rule `shell-import`). It writes its own `Sidebar`, `Inspector`, `Panel` and
  commands (`useCommand`).
- The person collapses the sidebar to its rail, and opens it again, with the button at its head and with a command of the palette.
  It is open at first, and the choice is kept under the app's own storage key. Its head is the name of the list and its count.
- An app with an engine that takes the keys for itself (a terminal, a code editor) gives `ownKeysIn` to `defineApp`: the selector
  of those engines, `'.xterm, .cm-editor'`, and no other. In them the shell takes away no key of the browser and runs no key of a
  command, so Ctrl+R, F and K reach the engine; everywhere else the shell's keys stay as they are. An app never calls
  `useDesktopGuard` or `CommandsProvider` itself.
- The zoom is the shell's: `useWindow` gives its level (`zoom`) and `setZoom`, for a setting of the app. An app starts no `useZoom`
  of its own, and keeps no level of its own.
- A prop is added to `AppWindow` when a second app needs it. Until then the need is met by a region.

## The look

Xiox's, as a theme that Sigrid's engine computes (`ts/preset.ts` of the repository). Sigrid's defaults are not touched.

- An app gives one colour. It is its hue: the accent is that hue at the suite's lightness and saturation, one for dark and one
  for light. An app writes no other colour, size, radius or space.
- Two planes: the ground, which carries the title bar and the sidebar, and one sheet laid on it.

| | Dark | Light |
|---|---|---|
| Ground | `#12161E` | `#F6F7F9` |
| Sheet | `#1A202C` | `#FFFFFF` |
| Raised | `#232834` | `#FFFFFF` |
| Hairline | `#2A3240` | `#E3E6EA` |
| Text | `#E8ECF3` | `#111827` |
| Muted text | `#9AA5B8` | `#5B6472` |
| Border of a control | `#8791A6` | `#767E8B` |
| Daodan | `#6ED0FF` | `#006398` |
| Xiox | `#F2B966` | `#844C00` |
| Muro | `#68DDB8` | `#00714F` |
| Shinatama | `#FFA3C8` | `#90355E` |
| Mukade | `#D0B2FF` | `#674698` |

- The corners are 4, 6 and 10; the density is compact (controls and rows of 32, 44 with a finger); keys are drawn as caps; fields
  and outline buttons have the border of a control; the tone is Balanced, so the accents are the colours above.
- The chosen view of the bar and the chosen item of a segment are marked by their weight, 700 beside 500, and by the accent: a line
  under the view, clear of the sheet, the fill and the border of the item. The status strip is 40 tall and
  its text is that of the body. Commands is quiet: a hairline and muted text.
- The font is the system's, Segoe UI on Windows: no font is loaded. An app sets none.
- Motion is on for the whole app, on Fluent's curves in 90 to 180 ms: the line of the chosen view grows from its middle. A person who asked
  the system for less motion sees none. What a press does is done at once: nothing waits for a movement.
- Dark until the person chooses. Light, dark and the system's look are the same three commands of the palette in every app, and
  no app draws a switch for them. The choice is kept under the app's own storage key, and is on the page before the first paint.
- A state is a `Badge` with a `tone` and a word. Surfaces are opaque, until the person chooses glass.
- Glass is the person's choice, in a window of its own only: Windows' acrylic behind the page. It is off until the app says
  otherwise in its program (`Options::glass` of the crate), or the person chooses it: «Glass» (the app's word) is a command of
  the look, checked when it is on, beside light, dark and the system's look, and an app's settings may set it too with
  `useGlass` and a `Switch`. The window keeps the choice, and the next start is glass, or not, from its first frame. Turning it
  on or off changes the window at once, with no reload. The page is then drawn with Sigrid's material `glass`, which decides
  what lets the acrylic through. A browser has no glass: the command is not there, and nothing is sent.
- The contrasts below are those of the opaque surfaces. Over the acrylic they are Sigrid's to keep, and Windows draws the
  acrylic as a plain colour where it drops it (an inactive window, battery saver, transparency off, high contrast).
- Every text has 4.5:1 on what it lies on, and every part of a control 3:1, for the five apps in both schemes
  (`tests/preset.test.ts`).
- An app of the suite writes no class, no style and no stylesheet. `sigrid-check` with its rule `own-class` is clean on its
  sources, on Imago's `ts/` and on the demo.

## The frame

- One frame: Sigrid's `AppShell` with `frame="sheet"`, and `desktop` in a window. The regions are its own: title bar, views,
  status, sidebar, content, inspector, actions, footer.
- The title bar holds, in this order: the brand, the views, the room that moves the window, the view's tools, "Commands"
  with its key, and in a window the three buttons. The shared controls keep their places from one view to the next.
- The views are in the title bar from 860px, in a row under it from 620px to 860px and in any narrower window, and at the
  foot only under 620px in a browser.
- Every view is also a command, the one in use checked. `Ctrl+K` opens the palette; `Ctrl+F` is the search of the view, and where
  there is none the shell says so; `F6` goes to the next region.
- The foot names the keys that work now, from 620px. A phone has no foot.
- What had the focus and goes gives it to the content; a view opened from the palette does too, one opened from the bar keeps it.
- The notices are one stack. One goes by itself, an error stays until it is closed, and one with the id of another takes its
  place and is read again.
- A screen that fails while it is drawn says so in its place, with a button that draws it again; the bar stays, and another view is drawn.
- The shell throws no screen away: the app decides what each view mounts, and what two views share stays when the view changes.
- Nothing overflows sideways, at any width from 340px.

## The window

- The page asks where it runs (`readHost`), and only in a window of its own draws the buttons, marks what drags the window,
  takes the browser's keys away and speaks to the native side. In a browser nothing of Tauri is called or loaded.
- The one way from the page to the window is `@acaprino/sigrid/tauri`. The one native side is the crate `imago-shell`.
- The window is hidden until the page has drawn and its theme was told, and has the ground of the look, or its glass, until then,
  so that no start flashes. An app passes `on_run_event` to the run loop: without it a window built again ends the app.
- The choice of light, dark or the system's and the scheme drawn are both told, when either changes.
- A call the person asked for (a window button, the zoom) that fails is said in a notice. What the page tells the window by itself
  is written in the console when it fails.

The techniques and the wiring are in [desktop-shell.md](desktop-shell.md).

## The icons of the executables

Each app has one icon, in `icons/`: its colour as a rounded square, and the capital initial of its name. The window program,
the command-line program and a page served in a browser all use it. An app copies the files and never draws its own.

## What a program checks

`imago-check` is a program of the package. An app runs `npx imago-check` before it says UI work is done, and in its CI. It
reads the `"imago"` block of the app's `package.json` ([using-imago.md](using-imago.md), section 6), prints each finding as
`file:line  rule  message` and exits 1 on any finding. What an app draws is checked by `sigrid-check`.

| Rule | What it reports |
|---|---|
| `shell-import` | A part of Sigrid the shell draws, imported by the app's own sources |
| `removed-name` | A name the package removed (the table "Moving from 0.4.1"), with what replaces it, in the app's sources and tests |
| `pin-mismatch` | An npm pin of Imago that is not the asset of a release, a Cargo pin that is not a tag, or the two at different versions |
| `app-icon` | An icon file that is not the package's, byte for byte |
| `agent-rules` | `AGENTS.md` or `CLAUDE.md` without the path of this file in the installed package |

An exception is a comment on the line or the line above, `imago-check: allow <rule> — <reason>`; without a reason it allows
nothing. The program prints every exception it accepted. Every rule fails the run.

## What a person checks

- The confirming button of a destructive action carries the verb and the object, and the dialog names the consequence.
- At most one primary action is in sight, and it is not destructive without Undo or a dialog.
- The words are in the app's language, Sigrid's own included.
- The real window, in both themes: the buttons, the drag, Snap Layouts, the zoom, the first frame. What has been seen so is
  in [verification.md](verification.md).
