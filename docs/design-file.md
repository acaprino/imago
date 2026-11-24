# Imago design file

The canon of Imago: who owns what in an app of the suite, and the rules of the shell. Every other document agrees with it.
Read it before UI work.

**The look and the components are Sigrid's. The shell is Imago's. The screens are the app's.** Imago has no CSS, no token
and no control of its own (decided by the owner on 2026-11-24).

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
| Imago | The base shell of the suite: the window, its icons, the identity of an app, and the one way the frame is put together | `@acaprino/imago` and the crate `imago-shell` |
| App | Its screens and its data, made of Sigrid's parts | the app |

- A rule about how a part looks or behaves is Sigrid's. Imago does not restate it and does not override it.
- Imago re-exports nothing of Sigrid: an app imports a part from the entry of Sigrid that has it.
- Sigrid and React are peers, so that an app has one copy of each.
- A part the suite needs and Sigrid lacks is added to Sigrid, not to Imago or to an app.

What exists today: the identity of an app (`defineApp`), the crate, the icons, the check, and the demo, a page on Sigrid in
the window of the crate. The React shell (the frame, the palette and the notices as one part that an app fills) is not in
the package yet. Until it is, the page of the demo is the example of how the parts go together.

## The look

- The theme is computed by Sigrid from one colour, the app's accent, light and dark. An app gives its accent and no other
  colour, size, radius or space.
- Light, dark and the system's look are chosen in the palette, the same three commands in every app (`useSchemeCommands`).
  No app draws a switch for them. The choice is kept under the app's own storage key, and is on the page before the first
  paint (`applyKeptScheme`).
- Surfaces are opaque. There is no glass.
- An app of the suite writes no class, no style and no stylesheet. `sigrid-check` with its rule `own-class` is clean on its
  sources, on Imago's `ts/` and on the demo's page.

## The frame

- One frame: Sigrid's `AppShell` with `frame="sheet"`, and `desktop` in a window. The regions are its own: title bar, views,
  status, sidebar, content, inspector, actions, footer.
- The title bar holds, in this order: the brand, the views, the room that moves the window, the view's tools, "Commands"
  with its key, and in a window the three buttons. The shared controls keep their places from one view to the next.
- The views are in the title bar from 860px, in a row under it from 620px to 860px and in any narrower window, and at the
  foot only under 620px in a browser.
- Every view is also a command, the one in use checked. `Ctrl+K` opens the palette; `F6` goes to the next region.
- Nothing overflows sideways, at any width from 340px.

## The window

- The page asks where it runs (`readHost`), and only in a window of its own draws the buttons, marks what drags the window,
  takes the browser's keys away and speaks to the native side. In a browser nothing of Tauri is called or loaded.
- The one way from the page to the window is `@acaprino/sigrid/tauri`. The one native side is the crate `imago-shell`.
- The window is told the scheme, and keeps it for its first frame, so that no start flashes.
- A refused or failed call is said to the person in a notice, never dropped.

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
| `removed-name` | A name the package removed (the table "Moving from 0.4.1"), with what replaces it, in the app's sources and tests |
| `pin-mismatch` | The npm pin and the Cargo pin of Imago that are not the same tag or commit |
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
