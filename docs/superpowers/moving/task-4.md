# Moving from 0.1.4: one drawing for each form control and for selection

Each form control is drawn once, in `css/controls.css`, and the drawing serves the ARIA element and the native one: the
class goes on the element, `aria-checked` and `:checked`, `aria-disabled` and `:disabled` are the same state. A selected
item is drawn the same whatever attribute says it. Rows to fold into the table "Moving from 0.1.4".

| Old name | New name, or what to do instead |
|---|---|
| `im-native-controls` | Remove it. Each native control carries the class of its drawing: `span.im-input > input`, `select.im-select`, `textarea.im-textarea`, `input.im-check`, `input.im-radio`, `input.im-switch` with `role="switch"`, `im-seg` over radios. A native control without a class keeps the browser's drawing. `uiPart('dialog')` and `graphInspector` no longer add it |
| `im-native-input` | `<span class="im-input"><input></span>` |
| `im-native-select` | `im-select` on the `select` |
| `im-native-textarea` | `im-textarea` on the `textarea` |
| `im-native-check` | `im-check` on the `input type="checkbox"` |
| `im-native-radio` | `im-radio` on the `input type="radio"` |
| `im-native-choice` | `im-check` or `im-radio` on the input: nothing is drawn with `accent-color` |
| `im-seg--native` | `im-seg` alone, over `label > input[type=radio] + span` |
| `im-seg--choice` | `im-seg` alone; `segmentedControl` writes it, with the text of each choice in a `span` after its radio |
| `im-switch-knob` | Nothing: `im-switch` draws its thumb itself; `switchHtml` writes an empty button |
| `textarea.im-input` | `textarea.im-textarea` |
| `input.im-input`, the class on the input itself | `<span class="im-input"><input></span>`: the box is round the input |
| `textFieldHtml(…, { mono: true })` writing `class="im-mono"` on the input | It writes `<span class="im-input im-input--code">` round the input |
| `uiInput()` and `uiInput(type)` of a text type returning the input | They return `{ element, input }`: append `element` (the `span.im-input`), read and write `input`. `uiInput('checkbox')` and `uiInput('radio')` return the input, `input.im-check` and `input.im-radio` |
| `uiSelect()` writing `im-native-select`, `uiTextarea()` writing `im-native-textarea` | They write `im-select` and `im-textarea` |
| `selectHtml` writing a bare `select` | It writes `select.im-select`; a `class` in `attrs` is added after it |
| `checkboxOptionHtml` and `choiceRowsHtml` writing a bare checkbox | They write `input.im-check` |
| `inputHtml` and `settingInputHtml` writing a bare input | They write `<span class="im-input"><input></span>` |
| `.im-picker-mark` drawing its own check, `data-im-checked` on it | The mark holds a `span.im-check` with `role="checkbox"` and `aria-checked`; `data-im-checked` is gone. The mark has no hand cursor |
| `.im-choice-row[aria-selected="true"]`, its own fill and accent edge | The selection of `im-btn`: the selection fill and the weight 600 |
| `.im-row[aria-pressed="true"]`, `.im-row[aria-current="page"]`, `.im-btn[aria-pressed="true"]` in the accent colour | The selection of the row (its fill and a heavier title) and of the button (the selection fill and the weight 600), the same for `aria-selected="true"`, an `aria-current` that is not `"false"` and `aria-pressed="true"`, on `im-row`, `im-tab`, `im-tree-item`, `im-menu-item`, `im-btn` and the segments of `im-seg`. A primary and a confirming danger button keep their fill |
| `.im-native-controls [role="status"][data-state="error"]` in the error colour | `statusTextHtml(text, 'err')` |
| `dialog.im-content-dialog.im-native-controls` with a section heading | `dialog.im-content-dialog` with a section heading, which `uiPart('dialog')` writes |
