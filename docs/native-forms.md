# Forms, dialogs and the wizard

How a form is written with native controls, how it is checked and saved, which dialog holds it, and how a first run is
written in steps. The rules are in [design-file.md](design-file.md): in a `form` a control is the native element with
the class of its drawing; a form that must block the window while it saves is a dialog; a form for the selected object
that does not block it is the inspector's.

Import everything below from `@acaprino/imago/ui`.

## Native controls

A native control keeps what the browser gives it: submission, FormData, browser validation, the value of a checkbox,
the keys of a radio group and a form's reset. The package adds nothing to keep in step: the class of its drawing is all.

| Control | Markup |
|---|---|
| Text field | `<span class="im-input"><input></span>` in an `im-field` (`im-input--code` for code), or `input.im-input` when the field holds no icon and no key cap |
| Text area | `textarea.im-textarea` |
| Select | `select.im-select` |
| Checkbox, radio | `input.im-check`, `input.im-radio`, in a `label.im-option` |
| Switch | `input.im-switch` with `role="switch"`, in a form that has no Save button |
| Single choice | `im-seg` over `label > input[type=radio] + span`, with one name, one checked input and a name for the group |

A native control without a class keeps the browser's drawing. An input that carries `im-input` itself (from `uiInput()`)
inside a field's box has no frame, fill or ring of its own: the box draws it once.

## The form renderers

| Call | What it writes |
|---|---|
| `textFieldHtml(label, name, value, options)` | A labelled input in its box, with a hint and an error slot ([html-composition.md](html-composition.md)) |
| `selectHtml(options)` | A `select.im-select` (`SelectMarkupOptions`: `name`, `options`, `value`, `label?`, `disabled?`, `attrs?`); a `class` in `attrs` is added after it. Its options are `SelectOption`s, `[value, label]`, written by `selectOptionsHtml(options, selected)` |
| `selectFieldHtml(label, name, options, selected)` | A select in a labelled `im-field` |
| `checkboxOptionHtml(options)` | An `input.im-check` in its `label.im-option` (`CheckboxMarkupOptions`: `name`, `checked`, `label`, `value?`, `hint?`, `hintHtml?`, `leadingHtml?`, `top?`, `disabled?`); `top` aligns the box with the first line (`im-leading`) |
| `inputHtml(options)` | An input in its box, with its name, its accessible name and the ids that describe it: `{ name, label, value, describedBy?, invalid?, attrs? }` |
| `formGroupHtml(legend, contentHtml, hint)` | A `fieldset` with its legend and a muted hint |
| `repeatableFieldRowHtml(contentHtml)` | A row of fields that repeats, `im-repeat-row`. `appendRepeatedFieldRow(container, markup, options)` adds one and focuses its first control; `removeRepeatedFieldRow(row, options)` removes one and moves focus to the next row, the previous one, or the `fallback` (the Add button) |
| `formHeaderHtml(title, subtitle, locked, id, closeLabel)` | The head of a form, `im-form-head`: its title, a subtitle and the close button, named and titled `closeLabel` (default `Close`), disabled while `locked` |
| `formFooterHtml(options)` | The foot of a form: `{ submit, leadingHtml?, disabled?, cancel? }`, Cancel and the primary submit button at the end |
| `fieldErrorHtml(id, text, tag)` | The error under a field, `im-field-error` with `role="alert"`, in a `small`, a `div` or a `p` |
| `statusTextHtml(text, tone)` | A status in words, in the class of its tone (`im-text-ok`, `im-text-warn`, `im-text-err`, `im-text-info`); `tone` is a `Tone` or `''` |
| `settingsGroupHtml(contentHtml, options)` | A group of settings on a sheet, `im-settings`: `{ title?, description? }` |
| `settingsRowHtml(options)` | A setting and its control, `im-setting-row`: `{ title, hintHtml?, controlHtml, field?, error? }`; with `field`, the hint and the error have the ids its input is described by |
| `settingInputHtml(options)` | The input of a setting, described by its hint and its error: `{ name, label, value, invalid?, attrs? }` |
| `settingsMessageHtml(message, details, options)` | A line of status under the settings, `role="status"`, with its details: `{ icon?, tone? }`, a `Tone` |

`FormAttributes` are the attributes a form renderer takes in `attrs`: `data-` and `aria-` attributes and those of a
native control. A setting saves itself when it changes and says "Saved" ([design-file.md](design-file.md), "Saving").

## Checking and saving

- `showFieldErrors(form, errors, options)` writes plain-text errors (`FieldErrors`, by field name) into the error slots,
  marks each field `aria-invalid`, opens every disclosure round the first one and focuses it. `ValidationOptions.field`
  finds the target of an error that is about a group. It returns `true` when there is no error: the form is valid.
  `clearFieldError(element)` takes one away as the person corrects it.
- `formSignature(form)` is a stable reading of what the form would submit: compare two to know whether it has unsaved
  changes (the `isDirty` of `inspector(shell).guard`).
- `runFormOperation(host, work, options)` runs one write of a form at a time: while `work` runs, the form is
  `aria-busy="true"`, its buttons are disabled (its fields too with `lockFields`, once the payload is read), and a second
  submit does nothing. `FormOperationOptions`: `error` (the element that shows a failure; without it the error is
  thrown), `after(value)`, `current()` (for a host that is reused), `fallbackFocus`. A result that arrives after the form
  was replaced or detached is dropped. Each control's disabled state is restored as it was. It does not cancel the work:
  the app owns its transaction. `isFormOperationPending(root)` says whether an operation runs, so a dialog can refuse to
  be dismissed meanwhile.

## Dialogs

Every dialog is one drawing, `im-dialog`, centred in the window, in the shared layer stack: everything under the title
bar is inert, the window buttons stay available, focus is contained and goes back to the opener when it closes. None
uses `showModal()`.

| Call | For | What it gives |
|---|---|---|
| `confirm(shell, options)` | A decision | A promise of `true` or `false` ([using-imago.md](using-imago.md), section 5) |
| `openFormDialog(shell, options)` | A form the package lays out: a head, a body that scrolls, a foot that stays | A `FormDialog`: `root`, `dialog`, `body` and `foot` to append the controls to, `close()` (true when this call dismissed it), `lock(locked)` and `setTitle(title, subtitle)`. `FormDialogOptions`: `title`, `subtitle?`, `icon?`, `wide?` (`im-form-dialog--wide`), `closeLabel` (the words of the close button), `onClose?` |
| `openContentDialog(shell, dialog, options)` | A `dialog` element the app owns, with its own heading, name and form | `{ close(), dispose() }`. `ContentDialogOptions`: `canDismiss?`, `onClose?` |
| `createContentDialog(shell, options)` | A `dialog` the package makes and the app fills again and again with trusted markup | `{ element, show(markup), close(), dismiss(), dispose() }`. `ContentDialogControllerOptions`: `label?` (its name when the markup has no `h1` or `h2`), `canDismiss?`, `onClose?`, `fallbackFocus?` |
| `openDialogSheet(dialog, options)` | A native form `dialog` docked as a sheet to a control or a pane | Whether it opened. `{ anchor, placement, lightDismiss? }`; its own cancel event still decides whether it closes |

A form that must block the window while it saves:

- with `openFormDialog`, calls `lock(true)` when the write starts and `lock(false)` when it ends. While locked, the close
  button, Escape and a press outside do nothing, and the body and the foot are inert.
- with `openContentDialog` or `createContentDialog`, passes `canDismiss`, which says no while it saves; a
  `createContentDialog` also refuses to be dismissed while its form is `aria-busy="true"` or runs a `runFormOperation`.
  `close()` and `dispose()` end the dialog even then: they are for the app's own completed action. Both are idempotent,
  and `onClose` runs once, after the page is released. A native `dialog.close()` and `method="dialog"` release the layer
  too, and the same `dialog` can be opened again after it closed. The app's own close buttons ask the same condition.

The app keeps the shell's body element when it repaints its contents (`renderShellFrame` does), and blocks the title
bar's view tabs while `hasModal()` is true. On unmount it calls `clearNotices(shell)` and the function `attachLayers`
returned (through `mountApp`'s): it releases a dialog that is still locked.

The content of a dialog that holds long reports, tables or literal text is written with the page's parts: a section
heading (`im-section-heading`), definitions, code views and lists, as `uiPart('dialog')` builds it
(`im-content-dialog`).

## The wizard

A first run, or a long task in steps, is a wizard in the content region:

| Call | What it writes |
|---|---|
| `wizardHtml(contentHtml, options)` | The wizard, `im-wizard-wrap` round `im-wizard`: its steps as `im-steps` (`stepProgressHtml`), a counter, then the current step's fields, error and actions. `WizardMarkupOptions`: `headingId`, `progressLabel`, `steps`, `current` (from zero), `counter`, `counterId` |
| `wizardHeadingHtml(title, description, options)` | The step's `h1`, focusable, described by `options.describedBy`, and its line |
| `wizardActionsHtml(leadingHtml, trailingHtml)` | The actions of the step, `im-wizard-actions`, which stay in view at the bottom |
| `choiceRowsHtml(options)` | A list of checkbox rows for choosing several things, `im-choice-rows`: each a `CheckboxMarkupOptions` |
| `enterWizardStep(doc, headingId, scrollId)` | When a step changes: scrolls its region to the top and focuses its heading |

The app owns the validation of each step, the navigation between them and the retries. Steps the person can open in any
order are `stepNavigationHtml` ([inspection.md](inspection.md)).

## Browser regression

`node tests/gallery/run.mjs content-dialog.mjs` checks native values, a refused dismissal, completion, reuse, a native
close, the cleanup of notices and wrapped inputs, in both looks and both themes.
