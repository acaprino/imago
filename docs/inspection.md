# Inspection workspaces

Import `@acaprino/imago/css/imago.css` once. The controls follow the active look, theme and accent.

| Control | Public interface |
| --- | --- |
| Mutually exclusive modes | `segmentedControl(document, { label, value, choices, onChange })` returns a fieldset and a map of native radios. Each choice has a value, a label and an optional disabled state. Use the input map to restore focus if the host redraws. |
| Summary measures | `metric(document, formattedValue, label, detail?)` creates a definition list. Place related measures in an `.im-metric-grid`. |
| Independent process stages | `stepList(document, label, steps)` accepts a label, detail and state for each step. Supply an action to make a step navigable. `stepProgress` also supports a simple linear process. |
| Progress | Give the bar an accessible label. `setProgress(element, percent)` updates its visual and accessible value. Pass `null` for a busy bar. |
| Informational and error messages | Use `.im-note` and `data-im-tone`. Use `.im-note--block` for a message with paragraphs and `role="alert"` for an error that needs immediate attention. |

The React entry point is optional. `Shell` is the window (`im-shell`) and `Workbench` its body: the navigation rows become the sidebar, the children the content region, and the details the inspector, which is `hidden` while they are empty. `inspector="wide"` on the `Shell` makes the inspector wide. `ListAction` renders a native button and accepts a title, detail, icon, pressed state and action. `Timeline` presents ordered items with a stable ID, title and optional detail. `TabList` connects tabs to their panels and handles keyboard navigation. `Disclosure` uses a native summary and mounts its content only while expanded. Each uses the same stylesheet as the DOM controls.

```jsx
import { Shell, Workbench, ListAction, Timeline } from '@acaprino/imago/react';

<Shell sidebar skipLabel="Skip to content" titlebar={<header className="im-titlebar">…</header>}>
  <Workbench navigation={items.map(item =>
    <ListAction key={item.id} title={item.name} pressed={item.id === selected.id}
      onClick={() => select(item.id)} />)} navigationLabel="Items"
    details={<h2>{selected.name}</h2>} detailsLabel="Details" aria-label="History">
    <section className="im-canvas-panel"><Timeline items={history} /></section>
  </Workbench>
</Shell>
```
