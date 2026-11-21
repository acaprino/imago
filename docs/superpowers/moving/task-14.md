# Moving: the icons of the executables (task 14)

Task 14 removes and renames no name of the package. It adds `icons/<app>/`, `npm run icons`, the export
`@acaprino/imago/icons/*`, and in `imago-check` the rule `app-icon` with two keys of the `"imago"` block, `app` and
`icons`. What an app that has its own icon files for its programs does instead:

| Old name | New name, or what to do instead |
|---|---|
| The app's own icon for its window program or its command-line program (a logo PNG, a hand-made `.ico`) | The files of `node_modules/@acaprino/imago/icons/<app>/`, copied into the app (`using-imago.md`, "The icons of the executables"). A Tauri app's `src-tauri/icons/` takes `32x32.png`, `128x128.png`, `128x128@2x.png` (the package's `256x256.png`), `icon.png` and `icon.ico` |
| The app's own favicon | `favicon.svg` and `favicon.ico` of the same folder |
