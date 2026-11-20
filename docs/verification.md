# What has been run on a real window

This file lists what Imago's demo app (`examples/demo`) showed on a real Windows 11 window, and what has not been
run. A statement in [desktop-shell.md](desktop-shell.md), [design-file.md](design-file.md) or
[using-imago.md](using-imago.md) about the window on screen holds only as far as this file says.

## The machine and the program

- Windows 11 Home 10.0.26200, one display of 1920x1200 at 100% scale, transparency effects on, apps in the light
  theme, the balanced power plan (no battery saver).
- WebView2 Runtime 157.0.4341.60.
- The demo app as the Verify workflow built it: run 44761430905, commit `85b7472`, a debug build
  (`npm run demo:build` on the runner), downloaded with `npm run demo:fetch`. The crate pins `tauri = "=2.12.5"`.
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
| The window theme of the last run is the first frame's | Passed | Run 1: after a restart the page was light, with Windows' apps light and the kept theme light |
| A real click on the maximize button maximizes, a second one restores | Passed | Run 1: 1196x769, then 1936x1168, then 1196x769; the page's button followed (`data-im-maximized`) |
| `Ctrl+=` twice zooms to 120% and the zoom is kept across a restart | Passed | Run 1: device pixel ratio 1 to 1.2, saved level 1.2; after the restart 1.2 |
| The Snap Layouts overlay lies over the HTML maximize button | Passed | Diagnostic: the child window `ImagoMaximizeOverlay`, first of the window's children, at 1220,85 44x42 for a button at 1220,81 44x46 (the top 4 pixels stay the resize border) |
| The real pointer on the maximize button reaches the page | Passed | Diagnostic on a fresh window: the pointer resting on the button gave `data-im-os="hover"`, moving away removed it |
| Windows 11 opens its Snap Layouts flyout on the button | Passed, by the owner's acceptance | Not measured: see the notes |
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

When the window is not the active one Windows drops the material and paints a solid fill: the diagnostic read the
Smooth dark title bar at 28,31,40 over a dark window then, the same over a bright one.

## Notes on the runs

- Run 1 failed four checks that run 2 passed or did not reach. Over the dark window every dark frame read as if a
  light material lay behind it (Smooth dark 40,43,52 over both windows), so nothing showed through; run 2 and the
  diagnostic, the same program on the same machine, read the values above. In run 1 the Snap Layouts step counted no
  changed pixel under the button and the page never saw the hover, after the eight look changes; the diagnostic, on
  a fresh window, delivered hover and leave to the page. These two are what a new run of `npm run capture` should
  look at first.
- Run 2 stopped in the Snap Layouts step: the demo window was closed while the pointer rested on the button (the
  page had received keys typed meanwhile). The steps after it were run 1's.
- A capture is a copy of the screen: the demo window must stay the active one. Keys typed and clicks made during a
  run go to it.

## Not run on a real window

- The browser accelerators turned off: the demo is a debug build, which keeps them.
- The WebView2 failure watcher and what follows a failure: the reload of a renderer that stopped, the rebuild of the
  windows after the browser process died, the question after three reloads in a minute.
- The "Reload interface" item of the window menu.
- Several displays, a scale other than 100%, battery saver, transparency effects off, high contrast, Windows 10.
