# Native forms and content dialogs

Imago supports native HTML forms without changing submission, browser validation,
FormData, checkbox values or radio-group keyboard behaviour. Add
`im-native-controls` to the shell, or use `im-native-input`, `im-native-select`,
`im-native-textarea`, `im-native-check` and `im-native-radio` individually.
An input inside `im-input` keeps the wrapper's border and focus treatment.

`im-seg im-seg--native` wraps labels containing a native radio followed by a span.
Use a shared name, a checked input and an accessible group label. Browser radio
navigation and form submission remain native; there is no second state store.

`openContentDialog(shell, dialog, options)` takes an app-owned HTMLDialogElement.
The app supplies its heading, accessible name and form. Imago owns the scrim,
focus trap, layer ordering, Escape and backdrop dismissal, inert page and focus
restoration. Window controls in the title bar stay available. The app must keep
the shell's top-level body element stable when repainting its contents, and must
block title-bar navigation while `hasModal()` is true.

Use `canDismiss` to refuse Escape and backdrop dismissal while saving. The
returned `close()` or `dispose()` ends the dialog even when dismissal is locked;
both are idempotent. `onClose` runs once after the page is released. Native
`dialog.close()` and `method="dialog"` also release the shared layer. Reusing the
same dialog after closing is supported. App close buttons should consult the
same dismissal condition. App-owned content may be repainted without remounting
the dialog. The dialog is always centred; a side panel is the inspector (`inspector(shell).open`), which is not modal.

`im-form`, `im-form-head` and the direct footer provide form layout. `im-step-nav`
styles actionable workflow tabs; use the existing `im-steps` for progress only.
`im-stack-list`, `im-settings` with `im-setting-row`, `im-summary`, `im-banner`,
`im-busy` and `im-empty` are reusable page patterns. Put panels on an
`im-surface` with `data-im-surface="sheet"`. Semantic colours use `data-im-tone`
(`ok`, `warn`, `err`, `accent`) and every pattern inherits the active look.

Call `clearNotices(shell)` on unmount to remove notices and cancel their timers.
Dispose the `attachLayers` listener too: it releases locked dialogs during teardown.

Browser regression: `node tests/gallery/run.mjs content-dialog.mjs`. It checks
native values, rejected dismissal, completion, reuse, native close, notice cleanup
and wrapped inputs under both looks and both themes.
