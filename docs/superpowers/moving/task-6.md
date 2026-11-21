# Moving from 0.1.4: dialogs, zoom and the skins

A dialog is one drawing, centred in the window: `confirm`, `openFormDialog`, `openContentDialog` and
`createContentDialog` all draw `im-dialog`. The only side panel is the inspector, which is not modal. The zoom has one
scale, 50 to 200% in steps of 10. Each row is a name an app may still write, with what replaces it.

| Old name | New name, or what to do instead |
|---|---|
| `im-content-dialog--drawer` | Remove it. A panel for the selected object is `inspector(shell).open(content, opener?)`: not modal, docked from 1000 up and over the content's edge under it. A dialog is centred |
| `im-content-drawer` | `inspector(shell).open(content, opener?)`. The `data-covered` attribute that hid it while another surface covered it goes too: the inspector hides what it covers by itself (`push`) |
| `im-sectioned-drawer` | `inspector(shell).open(content, opener?)`; the sections inside it are `im-section` |
| `im-padded-drawer` | `inspector(shell).open(content, opener?)` |
| `createContentDialog(shell, options).show(markup, 'drawer')` | `show(markup)`. The second argument is gone: a dialog is always the centred one. To open a side panel, use the inspector |
| `ZoomOptions.levels` (`mountZoom`, `createZoomController`) | Remove it. The steps are 10: 50, 60, ... 200%. A level an app saved earlier is rounded to the nearest multiple of 10, half up, and kept from 50 to 200 (a saved 67 becomes 70, 175 becomes 180, 125 becomes 130). The levels of 0.1.4 that were not multiples of 10 (67, 75, 125, 175) are not offered any more |
| `clampZoom(value, levels)`, `stepZoom(current, direction, levels)` | `clampZoom(value)`, `stepZoom(current, direction)`: the last parameter is gone |
| `applyShinatamaPalette`, `SHINATAMA_PALETTES`, `ShinatamaPaletteTokens` from `@acaprino/imago/shell` | Removed from the package: the skins are Shinatama's, as overrides of tokens. Shinatama takes them from the tag `v0.1.4` (`git show v0.1.4:ts/shell/shinatama-palette.ts`, and `tests/shinatama-palette.test.ts` beside it) |

`im-form-grid`, `im-choice-list`, `im-scroll-log` and `im-summary-list` stay: they are layouts for a form or a list, not
drawers.
