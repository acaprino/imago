# What has been run on a real window

This file lists what Imago's demo app (`examples/demo`) showed on a real Windows 11 window, and what has not been run. A
statement in [desktop-shell.md](desktop-shell.md), [design-file.md](design-file.md) or [using-imago.md](using-imago.md) about
the window on screen holds only as far as this file says.

## What this file does not cover

**Nothing of the page on Sigrid has been run on a real window.** Its browser test (`npm run test:demo`) opens it in a browser,
and with a window that only pretends to be Tauri's: the buttons, the drag, Snap Layouts, the zoom and the theme through the
hooks of `@acaprino/sigrid/tauri` have never met the crate on a screen. `npm run capture` was changed for that page and has
not been run since.

What follows is of the build of commit `85b7472` (2026-11-20), whose page was the gallery of the design system up to 0.4.1.
What it showed of the page (the glass in two looks) went with that page: the photographs and their values are in this file at
the tag `v0.4.1`. What it showed of the crate stays here.

## The machine and the program

- Windows 11 Home 10.0.26200, one display of 1920x1200 at 100% scale, transparency effects on, apps in the light theme, the
  balanced power plan (no battery saver). WebView2 Runtime 157.0.4341.60.
- The demo app as the Demo job of run 44761430905 built it: the debug profile, with the page served from the app and not from a
  development server. The crate pins `tauri = "=2.12.5"`.
- The checks were those of `npm run capture` ([capture.mjs](../examples/demo/capture.mjs)) as it was then, and two diagnostics
  run the same day with the same program.

## The result

On 2026-11-20 the owner watched the runs on the screen and accepted every check below as done and passed. The table says, for
each, whether a measurement backs it or the owner's acceptance alone.

| Check | Status | Measured |
|---|---|---|
| The window theme reaches the native side at every change | Passed | The theme the window keeps on disk matched the page's after each of the eight changes, in both runs |
| The window theme of the last run is the first frame's | Passed, by the owner's acceptance | After a restart the page was light, with Windows' apps light and the kept theme light: on this machine that could not tell the saved theme from Windows' own. `capture.mjs` now leaves the window in the theme opposite to Windows' own; no run has used it yet |
| A real click on the maximize button maximizes, a second one restores | Passed | 1196x769, then 1936x1168, then 1196x769; the page's button followed |
| `Ctrl+=` twice zooms to 120% and the zoom is kept across a restart | Passed | Device pixel ratio 1 to 1.2, saved level 1.2; after the restart 1.2 |
| The Snap Layouts overlay lies over the HTML maximize button | Passed | Diagnostic: the child window `ImagoMaximizeOverlay`, first of the window's children, at 1220,85 44x42 for a button at 1220,81 44x46 (the top 4 pixels stay the resize border) |
| The real pointer on the maximize button reaches the page | Passed | Diagnostic on a fresh window: the pointer resting on the button gave the page its hover, moving away removed it |
| Windows 11 opens its Snap Layouts flyout on the button | Passed, by the owner's acceptance | Run 1 measured it and failed (no sampled pixel under the button changed); run 2 stopped in this step, before the measurement |
| The title bar drags the window | Passed, by the owner's acceptance | Not measured |

Run 2 stopped in the Snap Layouts step: the demo window was closed while the pointer rested on the button (the page had
received keys typed meanwhile). A capture is a copy of the screen: the demo window must stay the active one, and keys typed and
clicks made during a run go to it.

## Not run on a real window

- The page on Sigrid, as said above.
- The browser accelerators turned off. No step of the capture presses F5, F12 or Ctrl+R to show that they are inert.
- The WebView2 failure watcher and what follows a failure: the reload of a renderer that stopped, the rebuild of the windows
  after the browser process died, the question after three reloads in a minute.
- The "Reload interface" item of the window menu.
- The context menu trimmed to the editing commands (`trim_context_menu`).
- The tint of the acrylic on Windows 10 (`acrylic_tint`, set by `apply_theme`). No machine of the suite runs Windows 10, and on
  Windows 11 22H2 and later the tint does not show.
- The failures WebView2 reports while the application closes, ignored (`Recovery::close`).
- The place of the window (`load_state`, `save_state`, `state_to_save`, `clamp_to_monitors`, `clamp_to_screens`). The demo app
  wires none of them. Only the crate's own tests (run by CI) cover the arithmetic and the file.
- Several displays, a scale other than 100%, battery saver, transparency effects off, high contrast, Windows 10.
