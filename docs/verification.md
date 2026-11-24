# What has been run on a real window

This file lists what Imago's demo app (`examples/demo`) showed on a real window, and what has not been run. A statement in
[desktop-shell.md](desktop-shell.md), [design-file.md](design-file.md) or [using-imago.md](using-imago.md) about the window on
screen holds only as far as this file says.

## The shell and the plugin together

On 2026-11-24 a throwaway run of GitHub Actions (45472732704, commit `2a6ca89`) built the demo, started it on a `windows-latest`
runner (Windows 10.0.26100, a screen of 1024x768 at 100%, WebView2 157.0.4341.46, apps in the light theme) and drove its page
over the debugging port of WebView2. The program is the debug profile with the page embedded, under the policy of
`tauri.conf.json`. Every check passed:

| What | Measured |
|---|---|
| `set_theme`, `caption` and `ready` answer | Status 200 each, in 17 to 22 ms |
| The window is made hidden and shown by `ready` | Seen 5 ms before the answer to `ready` reached the page, and not before it was sent |
| It is shown in its theme, on a Windows in the light theme | The theme was told before `ready` was sent; the window's frame was dark as it was shown; `window-theme` held `dark` |
| `caption` puts the overlay over the maximize button | The button at 936,0 44x44, the overlay `ImagoMaximizeOverlay` at 936,4 44x40 (4 pixels stay the resize border); after Ctrl+= it follows |
| The real pointer on the button reaches the page | `data-os-state` is `hover` |
| Light, dark and the system's look | The page, `window-theme` and the window's frame follow each choice; a choice that draws the same scheme is told too |
| `chrome` | The title of the window followed; 13 calls in a job, none sent before the one before had answered |
| The buttons | Maximize and restore; close ends the program with code 0 |
| Ctrl+= | Device pixel ratio 1 to 1.1, kept at the next start |
| The browser process is killed | The window is built again and the program goes on, in its theme, with no failed call |
| The second start | The kept theme is the first frame's |
| The program started again while it runs | The second copy ends, and the page is told the window is back |

Two things it showed besides. A choice made in the seconds before the browser process is lost may be lost with it: WebView2 writes
the page's storage to the disk some seconds later. A window that had reached past the edge of that small screen came back inside
its work area when it was built again.

## Not run: for the coordinator

From the artifact of a run of Verify on `develop`, on a desktop of Windows 11 (`npm run demo:fetch`, then `npm run capture`):

1. The four photographs: both themes, over a dark and a bright window, with nothing showing through.
2. The flyout of Snap Layouts under the real pointer (the runner above opened none).
3. A real click on the maximize button, through the overlay: maximize, then restore.
4. The zoom and the kept theme across a restart, in the theme opposite to Windows' own.

## Not run: for the owner

By hand and by eye, on the owner's machine, from the same program:

1. The start: no flash of another colour, in both themes and with each theme of Windows; how long the window takes to appear.
2. The bar drags the window, a double press maximizes it, the edges resize it, and it goes to a half of the screen.
3. The flyout of Snap Layouts opens on the button, and choosing a place in it puts the window there.
4. Ctrl with + - 0 and the wheel; the text stays sharp.
5. "System theme" while Windows changes its own.
6. The progress on the taskbar button while the job runs, and the attention asked for when it ends behind another window.
7. Started again while it is open, minimized or behind: it comes to the front.
8. "Reload interface" in the window menu (Alt+Space).
9. The place kept: moved, maximized, closed and started again; with a second display taken away.
10. A scale other than 100%, two displays with different scales, a high contrast theme, Narrator on the frame.
11. F5, F12 and Ctrl+R do nothing, and the menu of a right press is the editing one, in fields only.

## What was run before, of the crate

The build of commit `85b7472` (2026-11-20), whose page was the gallery of the design system up to 0.4.1, on Windows 11 Home
10.0.26200, one display of 1920x1200 at 100%, WebView2 157.0.4341.60, with `npm run capture`
([capture.mjs](../examples/demo/capture.mjs)) as it was then. The owner watched the runs and accepted each check. What they showed
of that page is in this file at the tag `v0.4.1`; of the crate, beside what the run above showed again:

| Check | Status | Measured |
|---|---|---|
| A real click on the maximize button maximizes, a second one restores | Passed | 1196x769, then 1936x1168, then 1196x769 |
| Windows 11 opens its Snap Layouts flyout on the button | Passed, by the owner's acceptance | Run 1 measured it and failed (no sampled pixel under the button changed); run 2 stopped in this step |
| The title bar drags the window | Passed, by the owner's acceptance | Not measured |

A capture is a copy of the screen: the demo window must stay the active one, and keys typed and clicks made during a run go to it.

## Never run

- A page that stops answering, and the question the person is asked after three reloads, with the page of the shell.
- The tint of the acrylic (`Material::Acrylic`) on Windows 10. No app of the suite asks for the acrylic.
- Battery saver, transparency effects off, Windows 10.
