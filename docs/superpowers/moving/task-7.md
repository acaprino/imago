# Moving from 0.1.4: the tiling workspace takes the im- prefix

Every class of the package starts with `im-`, and the tiling workspace (`createTilingWorkspace`) wrote `wm-` classes.
Each `wm-` class is now the `im-` class of the same name; where that name was already a class of the package (`im-tabs`,
`im-tab`, `im-body`, `im-splitter`, `im-status`), it is `im-tile-`, and so are the classes of the workspace's tabs that
were named after `wm-tab`, so that none of them reads as a modifier of the title bar's `im-tab`. Each row is a name an
app may still write in its CSS, its scripts or its tests, with what replaces it.

| Old name | New name, or what to do instead |
|---|---|
| `wm-host` | `im-host` |
| `wm-canvas` | `im-tile-canvas` (`im-canvas-panel`, `im-canvas-frame` and `im-canvas-message` are the canvas of a page) |
| `wm-pane` | `im-pane` |
| `wm-focused` | `im-focused` |
| `wm-header` | `im-header` |
| `wm-chrome` | `im-chrome` |
| `wm-control` | `im-control` |
| `wm-pane-focus` | `im-pane-focus` |
| `wm-pane-tools` | `im-pane-tools` |
| `wm-tabs` | `im-tile-tabs` (`im-tabs` is the strip of tabs of the title bar and of a panel) |
| `wm-tab` | `im-tile-tab` (`im-tab` is a tab of the title bar and of a panel) |
| `wm-tabwrap` | `im-tile-tabwrap` |
| `wm-tabwrap-active` | `im-tile-tabwrap-active` |
| `wm-tab-close` | `im-tile-tab-close` |
| `wm-tab-toned` | `im-tile-tab-toned` |
| `wm-tab-dragging` | `im-tile-tab-dragging` |
| `wm-tabs-filtered` | `im-tile-tabs-filtered` |
| `wm-body` | `im-tile-body` (`im-body` is the shell's row of the sidebar and the work area) |
| `wm-placeholder` | `im-placeholder` |
| `wm-empty-start` | `im-tile-empty-start` (`im-empty` is the empty state of a panel) |
| `wm-collapsed` | `im-collapsed` |
| `wm-splitter` | `im-tile-splitter` (`im-splitter` is the handle of `splitView`) |
| `wm-drop-preview` | `im-drop-preview` |
| `wm-drop-label` | `im-drop-label` |
| `wm-drop-marker` | `im-drop-marker` |
| `wm-drag-ghost` | `im-drag-ghost` |
| `wm-changing` | `im-changing` |
| `wm-dragging` | `im-dragging` |
| `wm-status` | `im-tile-status` (`im-status` is the shell's status row) |
| `wm-add` | `im-add` |
| `wm-filtered-out` | `im-filtered-out` |
| `wm-parking` | `im-parking` |
| `data-wm-key` | `data-im-tile-key`, on the workspace's controls, tabs and handles (`data-im-key` is the focus key of a graph) |
| `--tab-tone` | `--im-tile-tone`, which the workspace sets on a tab from `toneForView`; an app reads it, never sets it |

The ids that the workspace makes for its tabs and panels (`wm-` and a random id) are ids, not names an app writes:
they are unchanged. So are its attributes without a prefix (`data-group-id`, `data-view-id`, `data-split-id`,
`data-boundary`, `data-axis`).

The package's own stylesheets now take every space, size of text and colour from the tokens. There is nothing more for
an app to rename, but some text and some spaces move. A size of text off the scale is on it: 11.5px is 12; 12.5px is
13 for a label or body text and 12 for meta text; 13.5px and 15px are 14 (the wordmark among them); 17px, 20px (ONI's
wordmark) and 1.65rem (a metric's value, which was 26.4px) are 18; .8rem (a caption) is 12. A space that was not a
step of 4, 8, 12, 16, 24 is the nearest step, the lower one between two (3px is 2, 6px is 4, 10px is 8, 14px is 12,
20px is 16, 36px is 24). The heights of the controls, rows, bars and headers, the radii and the colours do not change.
`.im-disclosure > summary` has the arrow cursor, as every control.
