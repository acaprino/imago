# What has been run on a real window

This file lists what Imago's demo app (`examples/demo`) showed on a real Windows 11 window, and what has not been
run. A statement in [desktop-shell.md](desktop-shell.md), [design-file.md](design-file.md) or
[using-imago.md](using-imago.md) about the window on screen holds only as far as this file says.

## What this file does not cover

Everything above describes the build of commit `85b7472` (2026-11-20). The canon that followed (the one frame and its
regions, the mark and the icons, the five appearance commands, `mountApp`, the title bar at 340 and 450, the rail, the
drawer, the sidebar fold) has not been photographed on a real window: its measures and its contrast are checked by the
gallery and its tests in a browser, which cannot judge the glass. Until the capture is run again on a build of the
canon, every claim in [design-file.md](design-file.md) about how these look on screen holds as far as the gallery shows
it, and no further.

## The machine and the program

- Windows 11 Home 10.0.26200, one display of 1920x1200 at 100% scale, transparency effects on, apps in the light
  theme, the balanced power plan (no battery saver).
- WebView2 Runtime 157.0.4341.60.
- The demo app as the Demo job of the Verify workflow built it: the Demo job of run 44761430905 (the run's other job,
  Verify, failed on the document link tests, so the run as a whole is red), commit `85b7472`. `npm run demo:build`
  on the runner builds it with `--debug --features custom-protocol`: the debug profile, with the page served from the
  app and not from a development server. Downloaded with `npm run demo:fetch`. The crate pins `tauri = "=2.12.5"`.
- The checks are those of `npm run capture` ([capture.mjs](../examples/demo/capture.mjs), judged by
  [capture-rules.mjs](../examples/demo/capture-rules.mjs)), run on 2026-11-20, and two diagnostics run the same day
  with the same program.

## The result

On 2026-11-20 the owner watched the runs on the screen and accepted every check below as done and passed. The table
says, for each, whether a measurement backs it or the owner's acceptance alone.

| Check | Status | Measured |
|---|---|---|
| The glass in both looks and both themes, over a dark and a bright window | Passed | Run 2: the eight captures and every rule of `capture-rules.mjs` passed (the values below) |
| Smooth dark over a dark window is the cool slate, not Windows' caption grey | Passed | 23,26,35 (Shinatama measured 23,26,37) |
| Smooth light over a dark window is the light frost | Passed | 233,234,236 (Shinatama measured 241,241,242; the rule allows 12 levels) |
| The backdrop shows through the dark frames | Passed | Smooth dark 23,26,35 over dark, 40,43,52 over bright; ONI dark 17,12,27 over dark, 30,25,40 over bright |
| The work sheet is denser than the frame | Passed | Smooth dark: the sheet moves 1 level between the two backdrops, the frame 17 |
| The window theme reaches the native side at every change | Passed | The theme the window keeps on disk matched the look after each of the eight changes, in both runs |
| The window theme of the last run is the first frame's | Passed, by the owner's acceptance | Run 1: after a restart the page was light, with Windows' apps light and the kept theme light. On this machine that could not tell the saved theme from Windows' own: a page with no saved theme at all is light here too. `capture.mjs` now leaves the window in the theme opposite to Windows' own before the restart and reads the page's colour scheme at the first contact with the page, and prints when it read it and whether the page had mounted; no run has used it yet. The page's own boot call also sends `dark` to the window (the gallery always starts on Smooth dark), so what a read proves depends on Windows' theme. With Windows' apps light (the saved theme is dark, as on this machine): a light read proves the saved theme did not reach the first frame, and a dark read does not prove delivery unless it was taken before the page mounted. With Windows' apps dark (the saved theme is light): a light read proves delivery, and a dark read proves a failure only if it was taken before the page mounted. What a read cannot prove, the run reports as "cannot tell", not as a pass or a failure |
| A real click on the maximize button maximizes, a second one restores | Passed | Run 1: 1196x769, then 1936x1168, then 1196x769; the page's button followed (`data-im-maximized`) |
| `Ctrl+=` twice zooms to 120% and the zoom is kept across a restart | Passed | Run 1: device pixel ratio 1 to 1.2, saved level 1.2; after the restart 1.2 |
| The Snap Layouts overlay lies over the HTML maximize button | Passed | Diagnostic: the child window `ImagoMaximizeOverlay`, first of the window's children, at 1220,85 44x42 for a button at 1220,81 44x46 (the top 4 pixels stay the resize border) |
| The real pointer on the maximize button reaches the page | Passed | Diagnostic on a fresh window: the pointer resting on the button gave `data-im-os="hover"`, moving away removed it |
| Windows 11 opens its Snap Layouts flyout on the button | Passed, by the owner's acceptance | Run 1 measured it and failed (no sampled pixel under the button changed); run 2 stopped in this step, before the measurement; see the notes |
| The title bar drags the window | Passed, by the owner's acceptance | Not measured |

The values of run 2, the title bar and then the work sheet, as read from the screen:

| Capture | Title bar | Work sheet |
|---|---|---|
| Smooth dark, over a dark window | 23,26,35 | 28,32,43 |
| Smooth light, over a dark window | 233,234,236 | 254,254,254 |
| ONI dark, over a dark window | 17,12,27 | 15,11,33 |
| ONI light, over a dark window | 225,229,238 | 250,251,252 |
| Smooth dark, over a bright window | 40,43,52 | 29,33,44 |
| Smooth light, over a bright window | 244,245,247 | 255,255,255 |
| ONI dark, over a bright window | 30,25,40 | 17,13,35 |
| ONI light, over a bright window | 233,237,246 | 251,252,253 |

Between the two backdrops the frame moved 17 levels (Smooth dark), 13 (ONI dark), 11 (Smooth light) and 8 (ONI light).
Run 2 judged the show-through of the dark frames only; `capture-rules.mjs` now judges the light frosts by the same
rule (3 levels or more), and the values above pass it.

When the window is not the active one Windows drops the material and paints a solid fill: the diagnostic read the
Smooth dark title bar at 28,31,40 over a dark window then, the same over a bright one.

## Notes on the runs

- Run 1 failed five checks, three about the glass and two about Snap Layouts:
  - Smooth dark over a dark window: the title bar was 40,43,52, more than 12 levels from 23,26,37.
  - Smooth dark: the frame was 40,43,52 over a dark window and 40,43,52 over a bright one, so the backdrop did not
    show through.
  - Smooth dark: the work sheet moved 1 level with the backdrop and the frame 0, so the sheet was not denser.
  - The real pointer on the maximize button did not reach the page: `data-im-os` was "null", not "hover".
  - No flyout under the maximize button: no sampled pixel of the region changed (0 of them).

  Run 2 and the diagnostic, the same program on the same machine, read the glass values above and passed the first
  three; run 2 stopped in the Snap Layouts step, so it gave no result for the last two. In run 1 the Snap Layouts
  step came after the eight look changes; the diagnostic, on a fresh window, delivered hover and leave to the page.
  The last two are what a new run of `npm run capture` should look at first.
- Run 2 stopped in the Snap Layouts step: the demo window was closed while the pointer rested on the button (the
  page had received keys typed meanwhile). The steps after it were run 1's.
- A capture is a copy of the screen: the demo window must stay the active one. Keys typed and clicks made during a
  run go to it.

## Not run on a real window

- The browser accelerators turned off. The photographed build is the `custom-protocol` one (see the program above),
  in which `main.rs` turns them off (it does so when `tauri::is_dev()` is false) and the navigation allow-list is
  empty. No step of the capture presses F5, F12 or Ctrl+R to show that they are inert, so this was not run.
- The WebView2 failure watcher and what follows a failure: the reload of a renderer that stopped, the rebuild of the
  windows after the browser process died, the question after three reloads in a minute.
- The "Reload interface" item of the window menu.
- The context menu trimmed to the editing commands (`trim_context_menu`). The photographed build predates it, and no
  step of the capture opens a context menu.
- The tint of the acrylic on Windows 10 (`acrylic_tint`, set by `apply_theme`). No machine of the suite runs Windows
  10, and on Windows 11 22H2 and later the tint does not show. That setting the effect again changes nothing on
  Windows 11 is read from the code (Tauri and window-vibrancy 0.8.1 set the same backdrop again), not seen on a real
  window.
- The failures WebView2 reports while the application closes, ignored (`Recovery::close`). Nothing here closed the
  demo and watched what the failure watcher reported.
- The place of the window (`load_state`, `save_state`, `state_to_save`, `clamp_to_monitors`, `clamp_to_screens`). The
  crate gives the pieces and an app wires them; the demo app wires none of them, so nothing here saved, read or
  brought back the place of a real window. Only the crate's own tests (run by CI) cover the arithmetic and the file.
- Several displays, a scale other than 100%, battery saver, transparency effects off, high contrast, Windows 10.
