# Inspection content and the React binding

What an app shows when the person inspects something in the content region: a single choice of view or value, measures,
the stages of a process, progress and notes; and the React binding, the one exception to "no framework". The rules are
in [design-file.md](design-file.md). Import the functions from `@acaprino/imago/ui`; the controls follow the look, the
theme and the accent of the root.

## The controls

| Need | Call |
|---|---|
| One choice among a few (a mode, a value) | `segmentedControl(doc, { label, choices, value, onChange, name? })`: a `fieldset.im-seg` of labels over native radios, its name an `im-visually-hidden` legend. Each choice is `{ value, label, disabled? }`. It returns `{ element, inputs }`, the radios by value, to give focus back when the host repaints. Disabling the fieldset disables every choice |
| A measure: a value, its meaning, its context | `metric(doc, value, label, detail?)`: a `dl.im-metric`, its value in `im-metric-value` and its context in `im-caption`. Measures side by side go in an element with `im-metric-grid` |
| The stages of a process, each with its own state | `stepList(doc, label, steps)`: an `im-steps` list of `ProcessStep`s, `{ label, detail?, state, action? }`, `state` one of `todo`, `now`, `done`, `failed`, `skipped`. A stage with an `action` (`{ id?, disabled?, activate }`) is a button the person opens |
| A process that moves in order | `stepProgress(doc, label, steps, current, completeLabel)`: the same list; call `setCurrent(index)` as the work moves (from zero). The number of steps marks it all done and announces `completeLabel` (default "All steps complete") in its `im-step-status`. `stepProgressHtml(label, steps, current, completeLabel)` writes the same list as a string |
| Stages the person opens in any order | `stepNavigationHtml(steps, selected, options)`: an `im-steps` list with `role="tablist"`, each item holding its tab, the selected one drawn as the current step. Each step is a `NavigationStep`, `{ id, label, detail?, disabled? }`; `StepNavigationOptions` is `{ label, action, tabIdPrefix, panelId }`. `stepPanelHtml(contentHtml, id, labelledBy)` writes the panel it controls. `stepNavigationKey(event, { ids, action, onSelect })` answers the arrows, Home and End on those tabs and claims the key; `nextStepId(ids, current, key)` is its arithmetic |
| Progress | An element with `role="progressbar"` and an accessible name; `setProgress(element, percent)` sets its value, drawn and announced, and `null` makes it a busy bar |
| An operation in the content | `loader(doc, label)`: a line with a spinner and its label (`im-loader`), which stays readable with reduced motion. A bar when the amount of work is known; the panel's skeleton when rows are replaced |
| A message that stays | `noteHtml(options)`: `im-note`, `im-note--block` for a message with a list or actions, `role="alert"` for an error or a warning ([html-composition.md](html-composition.md)) |

The app owns the validation, the navigation and the retries of a process; the package draws its stages.

## The React binding

`@acaprino/imago/react` is for Daodan's viewer, which is written in React; no other app uses it. Its components write
the canonical markup of the shell and its controls, and nothing of their own: the same classes, the same regions, the
same stylesheet as the string renderers.

| Component | What it writes |
|---|---|
| `Shell` | The window, `div.im-shell`, its skip link and its `titlebar`, then its children: put a `Workbench` in it. `sidebar` writes `data-im-sidebar` (`on` or `off`), `inspector="wide"` writes `data-im-inspector="wide"`, `skipLabel` (required) is the skip link's text, and `contentId` is where it goes (default: the `contentId` of a `Workbench` that is its direct child, else `main`). Mount it in a root that carries `im-root`, `<div id="app" class="im-root">`: once mounted, a shell that does not fill the window is said on the console. The app, the look and the theme are written on the root element by `applyLook`, not by the shell |
| `Workbench` | The body of the shell, `div.im-body`: the sidebar when there are `navigation` rows (`navigationLabel` is its title and its name, `sidebarId` its id, default `sidebar`), and the work area: `status` (the children of `im-status`), the content region (`main.im-panel.im-content`, its children in its `im-panel-body`, its id `contentId`, default `main`, its name `aria-label`, required), the inspector (`details`, its name `detailsLabel`, required; `hidden` while `details` is empty), `actions` (`im-actions`) and `footer` (`im-footer`). The attributes of a `main` go on the content region. `wide` is ignored: write `inspector="wide"` on the `Shell` |
| `ListAction` | A row of the sidebar, a native `button.im-row.im-row--detail` with `aria-pressed` (`pressed`): `title` is the row's title, `detail` its second line, `icon` what the whole row shows, `rail` what it shows in the rail (the children of a `span.im-rail-item`), `tooltip` the button's HTML `title` |
| `Timeline` | An ordered list of events, `ol.im-timeline`: each item `{ id, title, detail? }`, its detail in `im-caption` |
| `TabList` | Tabs connected to their panels, `im-tabs` of `im-tab`, with the arrows and Home and End: `{ label, value, onSelect, tabs }`, each tab `{ value, id, panel, label, disabled? }` |
| `Disclosure` | A native `details.im-disclosure` whose content is mounted only while it is open: `{ label, children }` |

```jsx
import { Shell, Workbench, ListAction, Timeline } from '@acaprino/imago/react';

<Shell sidebar skipLabel="Skip to content" titlebar={<header className="im-titlebar">…</header>}>
  <Workbench navigation={items.map(item =>
    <ListAction key={item.id} title={item.name} rail={item.initials} tooltip={item.name}
      pressed={item.id === selected.id} onClick={() => select(item.id)} />)} navigationLabel="Items"
    details={<h2>{selected.name}</h2>} detailsLabel="Details" aria-label="History">
    <section className="im-canvas-panel"><Timeline items={history} /></section>
  </Workbench>
</Shell>
```

The keys of the window are the same as in every app: Daodan calls `mountApp` on the shell once it is mounted, and a key
handler of a component that answers a key calls `claimKey(event.nativeEvent)` ([using-imago.md](using-imago.md),
section 6).
