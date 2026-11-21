# Moving from 0.1.4: one drawing for each form control and for selection

Each form control is drawn once, in `css/controls.css`, and the drawing serves the ARIA element and the native one: the
class goes on the element, `aria-checked` and `:checked`, `aria-disabled` and `:disabled` are the same state. A selected
item is drawn the same whatever attribute says it. Rows to fold into the table "Moving from 0.1.4".

| Old name | New name, or what to do instead |
|---|---|
| `im-native-controls` | Remove it. Each native control carries the class of its drawing: `input.im-input` or `span.im-input > input`, `select.im-select`, `textarea.im-textarea`, `input.im-check`, `input.im-radio`, `input.im-switch` with `role="switch"`, `im-seg` over radios. A native control without a class keeps the browser's drawing. `uiPart('dialog')` and `graphInspector` no longer add it |
| `im-native-input` | `im-input` on the `input` itself, or `<span class="im-input"><input></span>` when the field holds an icon or a key cap |
| `im-native-select` | `im-select` on the `select` |
| `im-native-textarea` | `im-textarea` on the `textarea` |
| `im-native-check` | `im-check` on the `input type="checkbox"` |
| `im-native-radio` | `im-radio` on the `input type="radio"` |
| `im-native-choice` | `im-check` or `im-radio` on the input: nothing is drawn with `accent-color` |
| `im-seg--native` | `im-seg` alone, over `label > input[type=radio] + span` |
| `im-seg--choice` | `im-seg` alone; `segmentedControl` writes it, with the text of each choice in a `span` after its radio |
| `im-switch-knob` | Nothing: `im-switch` draws its thumb itself; `switchHtml` writes an empty button |
| `textarea.im-input` | `textarea.im-textarea` |
| `textFieldHtml(…, { mono: true })` writing `class="im-mono"` on the input | It writes `<span class="im-input im-input--code">` round the input |
| `uiInput()` writing `im-native-input`, `im-native-check` or `im-native-radio` | `uiInput()` still returns the input, now with `im-input` on a text type (the field's box drawn on the input itself), `im-check` on a checkbox and `im-radio` on a radio. A field with an icon or a key cap is written with the box round the input (`textFieldHtml`, or a `uiPart` given the class `im-input`) |
| `uiSelect()` writing `im-native-select`, `uiTextarea()` writing `im-native-textarea` | They write `im-select` and `im-textarea` |
| `selectHtml` writing a bare `select` | It writes `select.im-select`; a `class` in `attrs` is added after it |
| `checkboxOptionHtml` and `choiceRowsHtml` writing a bare checkbox | They write `input.im-check` |
| `inputHtml` and `settingInputHtml` writing a bare input | They write `<span class="im-input"><input></span>` |
| `.im-picker-mark` drawing its own check, `data-im-checked` on it | The mark holds a `span.im-check` with `role="checkbox"` and `aria-checked`; `data-im-checked` is gone. The mark has no hand cursor |
| `.im-choice-row[aria-selected="true"]`, its own fill and accent edge | `im-choice-row` is no longer a drawing: a row of a choice list is an `im-row` with `aria-selected="true"`, or an `im-btn` with `aria-pressed="true"` (`.im-choice-row.im-btn` only lays out its two texts), and takes the common selection of the one or the other. A bare `.im-choice-row` with neither class draws nothing |
| `.im-choice-list button[aria-pressed="true"]`, a chip fill and a bar at its start | The same: the button is an `im-btn` with `aria-pressed="true"`, or the row an `im-row` with `aria-selected="true"`, with the common selection. The list's hover is only for a button that is not an `im-btn` |
| `.im-row[aria-pressed="true"]`, `.im-row[aria-current="page"]`, `.im-btn[aria-pressed="true"]` in the accent colour | The selection of the row (its fill and a heavier title) and of the button (the selection fill, a 2px bar inside its bottom edge in the accent text colour, and in Smooth the weight 600), the same for `aria-selected="true"`, an `aria-current` that is not `"false"` and `aria-pressed="true"`, on `im-row`, `im-tab`, `im-tree-item`, `im-menu-item`, `im-btn` and the segments of `im-seg`. A primary and a confirming danger button keep their fill and take the bar in their text colour |
| `.im-setting-row input` 260px wide | The field's box, `.im-setting-row .im-input`, is 260px: the box round the input as `settingInputHtml` writes it, or the input itself |
| `.im-editor-inspector input, select, textarea` stretched to its width | Its fields are stretched (`im-input`, `im-select`, `im-textarea`); a checkbox and a radio keep their 16px |
| `.im-native-controls [role="status"][data-state="error"]` in the error colour | `statusTextHtml(text, 'err')` |
| `dialog.im-content-dialog.im-native-controls` with a section heading | `dialog.im-content-dialog` with a section heading, which `uiPart('dialog')` writes |
