# Moving from 0.1.4: messages, loading, empty, steps and tones (task 5)

One message (`im-note`), one loading state (the panel's, or `loader` inline, or `aria-busy` on a button), one empty state
(`im-empty`), one steps (`im-steps`) and four tones (`ok`, `warn`, `err`, `info`). Each row is a name an app may still
write, with the name that replaces it or what to do instead.

| Old name | New name, or what to do instead |
|---|---|
| `bannerHtml(options)` | `noteHtml({ title, message, items, actionsHtml, tone })`, in the panel or page it is about, never across the window. With a title, a list or actions it writes `im-note im-note--block`; with a message only, `im-note` |
| `BannerOptions` | `NoteOptions` |
| `im-banner` | `im-note im-note--block`: a title in `b`, the message in `p`, a `ul` of `<b>label</b>: message`, the buttons in `im-action-row` |
| `im-callout` | `im-note` (`noteHtml({ message })`); its tone, if any, in `data-im-tone` |
| `busyIndicatorHtml(label)` | An operation in the content: `loader(doc, label)` (`im-loader`, inline). A button that runs it: `aria-busy="true"` on the button. A panel that loads: its loading state (`setPanelState`, `panelStateHtml`) |
| `im-busy` | The same: `im-loader`, `aria-busy="true"` on the button, or the panel's loading state. Nothing is fixed to the corner of the window |
| `loadingStateHtml(label)` | `panelStateHtml({ kind: 'loading', rows })` as the panel body, with `aria-busy="true"` on the panel; or `setPanelState(panel, { kind: 'loading', rows })`, shown after `showAfter(LOADING_DELAY_MS, …)`. Flat bars, never a spinner in place of the panel |
| `im-zero-state` | `im-empty`: `emptyStateHtml(title, description, actionHtml)`, or `setPanelState(panel, { kind: 'empty', title, text, action })` |
| `im-empty-message` (in `im-document-panes`) | `im-empty`, as above |
| The `im-empty` of `css/forms.css` (centred, muted, 24px of padding, a 15px title) | The `im-empty` of `css/controls.css`, the one `setPanelState` draws: start-aligned, a dashed edge, inside the panel body; its title (`strong`) is 14 |
| `emptyStateHtml` wrote `<div class="im-panel im-surface im-empty" data-im-surface="sheet">` | It writes the empty layer of `setPanelState`, `<div class="im-empty" data-im-state-layer="empty">`: put it in an `im-panel-body`. An empty title writes no `strong` |
| `im-step-nav` | `im-steps`. `stepNavigationHtml` writes `ol.im-steps[role=tablist]`, each `li[role=presentation]` holding its `button[role=tab]`; the label is the text of `im-step-text` (no `strong`), the detail `small.im-step-sub`. The selected tab is drawn as the current step |
| The tone `accent` | `info`. For the accent on text (data, a short label), the class `im-text-accent` |
| The tone `danger` | `err`. A menu item with `danger: true` carries `data-im-tone="err"` |
| The tone `good` | `ok` |
| The tone `bad` | `err` |
| `ChipTone` with `'accent'`, `'good'`, `'bad'`; `chipHtml(label, string)`, `summaryHtml({ tone: string })` | `ChipTone` is `'' \| Tone`, `Tone` is `'ok' \| 'warn' \| 'err' \| 'info'`. In TypeScript another tone is a type error; from plain JavaScript it is written as no tone |
| `data-im-tone=""` (`chipHtml`, `actionChipHtml`, `summaryHtml` without a tone) | No attribute: a chip without a tone is the neutral chip (`--im-chip`, `--im-chip-text`) |
| `StatusButtonOptions.tone: 'accent'` | One of the four tones |
| `GraphEdge.tone` and `GraphLegendItem.tone` `'accent'` | `'info'`. The grouped layout marks the edges of a selected node `info` |
| `im-accent` | `im-text-accent` |
| The accent colour of `im-kicker` | `im-kicker im-text-accent`: the kicker keeps its size, the colour is the class's |
| `im-warning` | `im-text-warn` |
| `im-error` | `im-text-err` |
