# Moving: the window theme carries the look and the theme drawn (`imago-shell` and `@acaprino/imago/shell`)

The window tints its acrylic with the ground of the look, which shows on Windows 10. For that the page tells the window
its look and the theme it draws, and the crate's `apply_theme` takes them. Each row is a call an app may still write,
with the call that replaces it.

| Old name | New name, or what to do instead |
|---|---|
| `apply_theme(&window, theme)` | `apply_theme(&window, theme, look, resolved)`: `look` is a `Look`, `resolved` the `tauri::Theme` the page draws. In the app's `set_window_theme` command, take `look: Option<String>` and `resolved: Option<String>` besides `theme` and get both from `drawn_by_page(theme, look.as_deref(), resolved.as_deref())`, which gives a page that sends neither Smooth in the word's own theme (dark for `system`). Call it on the glass window only, the one built with `glass_window_config`: it also gives the window the acrylic effect |
| `setWindowTheme: (theme) => …` in the `deps` of `applyLook` | `setWindowTheme: (theme, { look, resolved }) => invoke('set_window_theme', { theme, look, resolved })`. The second argument is the look (`smooth` or `oni`) and the theme the page draws (`light` or `dark`). `applyLook` now calls it when the word, the look or the theme drawn changed, not only the word: under `system` it is called again when Windows changes its colours. A function that takes only the word still works, and the window then tints for Smooth |
