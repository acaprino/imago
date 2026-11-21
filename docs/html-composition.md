# HTML composition

An app that paints its views from strings writes the package's markup with the string renderers of
`@acaprino/imago/ui`; an app that keeps live elements builds them with the DOM builders of
[content-composition.md](content-composition.md). The markup and its drawing are the package's: a renderer is the one
way to write the pattern it renders. The rules are in [design-file.md](design-file.md).

```ts
import { buttonHtml, pageHeadingHtml, textFieldHtml } from '@acaprino/imago/ui';

const heading = pageHeadingHtml('Library', 'Your saved items',
  buttonHtml('Add item', 'add-item', { primary: true, icon: 'plus' }));
const name = textFieldHtml('Name', 'name', item.name, {
  id: 'item-name', required: true, hint: 'Shown in the list',
});
```

## What is escaped

- Text, action identifiers and attribute values are escaped (`escapeHtml(value)` is the function they use).
- Only a parameter whose name ends in `Html` takes markup, and it takes trusted component output: the result of another
  renderer. Service and user text never goes there; it goes into a text parameter.
- `attrs` adds attributes to a renderer's element. Of the controls (`MarkupAttributes`): `data-` and `aria-` attributes
  and `id`, `title`, `role`, `tabindex`, `autocomplete`, `inputmode`, `min`, `max`, `step`, `minlength`, `maxlength`,
  `pattern`, `size`, `list` and `form`. Of the form renderers (`FormAttributes`, [native-forms.md](native-forms.md)): the
  same and the attributes of a native control (`name`, `value`, `type`, `disabled`, `checked`, `required` and their kin).
  Anything else, an event handler included, throws; so does an attribute that would override a structural one (a
  button's `data-action`).
- `data-action` and `data-id`, which a renderer writes from its `action` and `id` arguments, are the app's: the action of
  the element and the thing it is about, for the app's own click handler. The renderers do not parse or run HTML.

## The shell frame

| Call | What it writes |
|---|---|
| `shellFrameHtml(options)` | The children of an `im-shell`: the seven regions in the order of [using-imago.md](using-imago.md), section 4. `options` is a `ShellFrameOptions`: `titlebarHtml`, `contentHtml` (the children of the content's panel body), `contentLabel`, `contentId` (default `main`), `skipLabel`, `inspectorLabel`, `busy`, and the optional `contentHeaderHtml`, `contentToolsHtml`, `contentFootHtml`, `sidebarHtml`, `statusHtml`, `actionsHtml`, `footerHtml`. A region not given is left out; the content and the inspector are always there, the inspector empty and hidden |
| `titlebarHtml(options)` | The title bar (`TitlebarOptions`): `brand: { name }` (the mark and the name), `sidebarToggle: { label, controls }` (the button that opens the sidebar under 620), `navigationHtml` (the view tabs), `views: { label, action }` (the Views menu), `statusHtml`, `commands: { label, action, shortcut }` (the command button), `windowControls` (`true`, or the `WindowButtonLabels` of an app in another language) |
| `brandInitial(name)` | The letter of the mark: the first letter of the name, in capitals, the same on every machine; `''` when the name has no letter, and then the title bar writes no mark |
| `tabNavigationHtml(tabs, selected, { label, action })` | The view tabs, `im-tabs` of `im-tab`: each a `NavigationTab`, `{ id, label, icon?, count?, countLabel?, controls? }`. The selected one has `aria-selected="true"` and `aria-current="page"`; a count is an `im-count` |
| `windowButtonsHtml(labels)` | The three window buttons (`im-window-buttons`, `im-window-button` with `data-im-window`), each with its name and its tooltip from `labels` |
| `statusButtonHtml(options)` | A status in the title bar that opens something: a ghost button (`im-titlebar-status`) with a dot and a word. `options` is a `StatusButtonOptions`, `{ label, accessibleLabel, action, id?, tone }`, its tone a `ChipTone` |
| `sidebarHtml(options)` | The sidebar (`SidebarOptions`): `id`, `label` (its title, and the name of the sidebar and of its list), `rowsHtml` (its `im-row` options, each with its `im-rail-item`), `collapse: { collapse, expand }` (the fold button's two names), `count` (an `im-count` after the title) and `footHtml` (an `im-panel-foot` under the list) |
| `pageContentHtml(contentHtml, width)` | A page in the content region: `im-page-content`, or `im-page-content--narrow` with `width` `narrow` |
| `renderShellFrame(shell, markup)` | Repaints a mounted frame from new markup. See below |
| `checkShellFill(shell)` | Says once on the console that a shell does not fill the window (a wrapper without `im-root`). `renderShellFrame` and the React `Shell` call it |

`renderShellFrame` keeps every element of the frame for the life of the shell: the title bar, the body, the work area,
the columns, the content with its panel body and the inspector stay the same elements, so what holds a reference to
them keeps working and a dialog's inert body stays inert. It replaces what is inside the title bar, the sidebar, the
status row, the content's header, tools, body and foot, the action bar and the footer. The inspector is not touched:
its content, and the values a person typed in it, are the inspector's own. A region the markup leaves out is taken out
and kept; when the markup has it again, the same element goes back in its place. The sidebar's list stays the same
element with its scroll, and the controls the package wired (the sidebar's button, the fold button, the window buttons)
stay wired. A kept control that held the focus holds it. A region takes the attributes the markup writes and loses
none: the markup takes an attribute away by writing its new value. The whole next frame is validated before anything
changes.

## The atoms

| Call | What it writes |
|---|---|
| `iconHtml(name, label?)` | An `im-icon` of the package's set (an `IconName`; `isIconName(name)` says whether a name is one, and `iconMarkup(name)` gives its drawing). Decorative, unless `label` gives it a name; an unknown name draws the neutral box |
| `spinnerHtml` | The `im-spinner` of a busy control, decorative |
| `avatarHtml(text)`, `initialsAvatarHtml(name)` | An `im-avatar`, decorative: the thing's name belongs beside it. A provider's abbreviation is the text of an avatar, not a new component |
| `chipHtml(label, tone)` | An `im-chip`; `tone` is a `ChipTone`, and `''` is the neutral chip |
| `buttonHtml(label, action, options)` | An `im-btn`. `options` is a `ButtonMarkupOptions`: `primary`, `danger`, `sm`, `busy` (the spinner in the icon's place), `icon`, `id`, `disabled`, `cls`, `attrs`. Its `accent` writes `im-btn--accent`, which an app does not use ([design-file.md](design-file.md), "One accent per app") |
| `iconButtonHtml(label, action, icon, options)` | An `im-icon-btn` whose `label` is its name and its tooltip |
| `switchHtml(on, label, action, id, disabled)` | A switch that acts at once: a `button` with `role="switch"` and `im-switch`, never in a form with a Save button |
| `segmentedHtml(name, value, options, label, config)` | A single choice in a form: an `im-seg` of labels over native radios, `role="radiogroup"`. FormData, the arrow keys and a form's reset stay the browser's |
| `textFieldHtml(label, name, value, options)` | A labelled native input in its box (`span.im-input`, or `im-input--code` with `mono`), its hint and its error slot. `options` is a `TextFieldMarkupOptions`: `required` (a real `required` attribute), `type`, `hint`, `readonly`, `mono`, `placeholder`, `optional`, `autofocus`, `error`, `id` (give a distinct one to a name that is repeated), `attrs`. A form opts into its own presentation of errors with `novalidate` |
| `noteHtml(options)` | A message that stays in the page (`NoteOptions`: `icon`, `title`, `message`, `items`, `actionsHtml`, `tone`). A title and a line write the compact `im-note`; a list or actions write `im-note im-note--block`, its icon beside its title and the rest in one column to its right. An `err` or `warn` note is announced at once (`role="alert"`), any other as a status |
| `emptyStateHtml(title, description, actionHtml)` | The empty layer of a panel, `im-empty`, as `setPanelState` builds it: put it in an `im-panel-body` |
| `panelStateHtml(state)` | Every state layer of a panel as a string ([using-imago.md](using-imago.md), section 5) |

The renderers of the page patterns are in [content-composition.md](content-composition.md), those of forms in
[native-forms.md](native-forms.md).

## Repainting content

A repaint replaces markup and keeps what the person was doing: focus, a selection in a field, which disclosures are open,
how far a region is scrolled. The shell and the boundary of a dialog stay where they are; only their contents change.

- `captureDomState(root, { scroll })` captures the focused control and its selection, the open and closed `details`, and
  the scroll of each region a selector of `scroll` matches (default `[data-im-scroll]`: mark a region that scrolls with
  `data-im-scroll`). It returns a `DomSnapshot`. `restoreDomState(root, snapshot, options)` puts them back after the
  markup is replaced, the scroll before the focus.
- A control's identity is its `data-im-key`, else its `id`, else its action or its name and, for a radio or a checkbox,
  its value. Make those unique in the captured root. `focusKey(element, root)` is that identity.
- `captureFocus(root)` (a `FocusSnapshot`) and `restoreFocus(root, snapshot, options)` keep a pending focus on its own,
  for an app that must hold it across a request. A disabled, hidden or inert target is skipped for the `fallback` of
  `RestoreFocusOptions`; a selection is restored only to the control it was in, never to the fallback.
- `replaceHtmlRegion(region, html, { fallbackFocus, scroll })` does the three for one region. The trusted fragment has
  one root element. It moves focus only when focus was inside that region, and to `fallbackFocus` only when the control
  that had it is gone: a field being edited elsewhere keeps its focus and its selection.
- `keyedList(parent, keyOf, create)` keeps the elements of the rows of a list across snapshots: a row whose key stays is
  the same element, moved where it now goes, with its focus. It returns the function that takes the next snapshot.

Restoring DOM state does not keep form values: they belong to the app's state, or to a form whose element is kept.
