# Content composition

What goes in the content region of the shell, and how it is written: the renderers of the page patterns, the DOM
builders for views that keep live elements, and the workspace, project and file controls. The rules, and the table of
the page patterns with their classes, are in [design-file.md](design-file.md) ("Page patterns"). The app supplies its
data, its labels, its actions and the order of the parts; the package owns the markup and its drawing. An app needs no
stylesheet of its own for any of them.

Import everything below from `@acaprino/imago/ui`. What is escaped, and which parameters take markup, is in
[html-composition.md](html-composition.md).

## The page

A page is the child of the content region's panel body, which scrolls. `pageContentHtml(contentHtml, width)` writes it
(`im-page-content`, a column of 1180, or 860 with `width` `narrow`, with the region's padding round it). Its text can be
selected and copied; its controls are chrome.

| Call | What it writes |
|---|---|
| `pageHeadingHtml(title, description, actionsHtml)` | The page's head, `im-page-heading`: its `h1`, a line, and its actions in an `im-action-row` |
| `sectionHeadingHtml(title)` | A section's head, `im-section-heading`, with its `h2` |
| `toolbarHtml(contentHtml, actionsHtml)` | A row of tools, `im-content-toolbar`, its actions in an `im-action-row` at its end |
| `stackListHtml(rowsHtml, variant)` | A list of things on a sheet, `im-stack-list`; `variant` `timeline` is a list of events (`im-activity-list`), `decisions` a list of decisions (`im-decision-list`) |
| `stackRowHtml(options)` | A row of that list (`StackRowOptions`): `title` (`titleMono` in the code font), `message`, `detail`, and the trusted `leadingHtml`, `trailingHtml`, `detailHtml` and `relatedHtml` (an `im-related-list`) |
| `timelineItemHtml(options)` | A row of a timeline: the same, with its `time` first |
| `tableHtml(headers, rowsHtml, options)` | A table in its scrolling sheet, `im-table-scroll` round `im-table`. `options` is `{ label?, variant?, empty? }`: with `label` the region can be scrolled from the keyboard; `variant` `log` is a log (`im-log-table`), `inputs` a table of fields (`im-input-list`); `empty` is the sentence of a table with no row, in one muted cell |
| `tableRowHtml(cellsHtml)` | A row of it: each cell trusted markup, or `{ html, className }` |
| `summaryHtml(options)` | A summary of a state, `im-summary`: `{ label, title, tone?, icon?, metadata? }`; its tone a `ChipTone`, its icon in `im-summary-icon`, its metadata in `im-summary-meta` |
| `taskCardHtml(options)` | A card of a task that runs, `im-task-card`: its title, its leading and its actions (`im-leading`), its phase and elapsed time, a progress bar (`progressLabel`, `progressText`), a description |
| `actionChipHtml(label, action, options)` | A chip that is a button, for a filter or a jump: `{ id?, accessibleLabel?, tone?, icon? }` |
| `codeViewHtml(text, label)` | Literal text that can be selected and scrolled from the keyboard, `im-code-view` |
| `codeNoteHtml(text)` | A line of code under something, in `im-mono` and `im-wrap-text` |
| `bulletListHtml(items)` | A list of bullets, `im-bullet-list`; no item writes nothing |
| `quoteHtml(text)` | A quoted line, `im-wrap-text` |
| `textStackHtml(title, detail, options)` | A title over a line, `im-text-stack`: `{ strong?, detailTitle? }` |
| `noteHtml(options)` | A message that stays in the page ([html-composition.md](html-composition.md)) |

The settings and form renderers (`settingsGroupHtml`, `settingsRowHtml` and the others) are in
[native-forms.md](native-forms.md); a measure (`metric`), process stages and progress in [inspection.md](inspection.md).

## Views that keep live elements

A view that keeps input focus, a selection, a native form or a renderer of its own alive during updates builds elements
instead of strings.

| Call | What it builds |
|---|---|
| `uiPart(kind, text, className)` | The element of a part of a page, with the package's class: a `UiPart`, such as `stack` (`im-stack`), `row` (`im-inline-row`), `toolbar` (`im-content-toolbar`), `actions` (`im-action-row`), `panel` (`im-panel im-surface`), `aside` (`im-aside`), `header` (`im-section-heading`), `form` (`im-form`), `field` (`im-field`), `hint` (`im-muted`), `paragraph` (`im-paragraph`), `status` (`im-status-text`, a status), `alert` (`im-field-error`, an alert), `list` (`im-stack-list`), `item` (`im-list-item`), `scroll` (`im-scroll`), `viewport` (`im-viewport`), `separator` (`im-rule`), `spacer` (`im-grow`), `dialog` (`im-content-dialog`), `details` (`im-disclosure`), `code` (`im-mono`), `pre` (`im-code-view`), `descriptionList` (`im-definition-list`), `definition` (`im-definition`), `table` (`im-table`), `mark` (`im-highlight`), and the plain elements of a table and a form. `text` is its text, escaped; `className` is added |
| `uiButton(label, options)` | A `button.im-btn`, with the options of `buttonHtml` and `{ title?, onClick? }` |
| `uiInput(type)` | A native input with the class of its drawing: `im-check` on a checkbox, `im-radio` on a radio, `im-input` on any other type. A field with an icon or a key cap has the box round the input instead (`textFieldHtml`) |
| `uiSelect(options, value)`, `uiOption(value, label)` | A native `select.im-select`, and an `option` of it |
| `uiTextarea()` | A native `textarea.im-textarea` |
| `componentElement(componentHtml)` | The one element of a renderer's result, ready to append. A result that is not one HTML element throws |

`im-truncate` cuts a line of a part with an ellipsis.

A part takes further roles by name, never by class: `uiTraits(node, ...traits)` adds layout roles (`stack`, `row`,
`scroll`, `bounded`, `grow`, `truncate`, and `overlay`, `im-overlay`, a panel over the whole of its positioned host, its parts in a column), list roles
(`choiceList`, `summaryList`, `conversation`) and the dialog role `fileDialog`. The regions of the window are not
roles: they are the frame's (`shellFrameHtml`), and the side panel is the inspector. The `UiTrait` type lists every
role, and `UI_TRAITS` the classes that draw it. `uiTone(node, tone)` puts a text in a `UiTone`, `ok`, `warn` or `err`, and `null`
gives it its own colour back; the words still say the state. `uiEmphasis(button, emphasis)` makes a button the `primary`
action or the armed `danger` one, and `null` makes it plain again. The app keeps its own classes for its own hooks;
the classes Imago draws with stay Imago's.

## Workspaces, projects and files

The gallery's Shinatama shows them together: tabs moved between panes, a project search, a folder read on demand, and a
return from an event to its session.

| Control | What the app does with it |
|---|---|
| `splitter(doc, options)` | A separator, `im-splitter`: `{ label, controls?, orientation?, reverse?, min, max, value, step?, onStart?, onResize, onCommit? }` in pixels. Apply each preview in `onResize` and keep the committed value from `onCommit`. Home and End reach the limits; the arrows move 8 pixels, 32 with Shift; a cancelled drag restores the starting size. It returns `{ element, setValue, setBounds, cancel, dragging }` |
| `splitView(first, second, options)` | Two regions with a separator between them, `im-split-view`: `{ label, axis?, fraction?, minFirst?, minSecond?, onCommit? }`. The separator follows the room there is; either element can be another split. `destroy()` removes it |
| `dockTabs(host, options)` | Tabs that move between panes. Each pane has a stable id in `data-im-pane` and each tab one in `data-im-dock-tab`. `move(request)` receives a `DockMove`, `{ tab, pane, placement, relativeTo? }` (a `DockPlacement`: `center`, `left`, `right`, `top`, `bottom`, `before`, `after`); `canMove` refuses a target; `describe` gives the words that announce each destination (in `im-dock-announcement`). It returns the function that removes it |
| `searchPicker(doc, options)` | A search box with its results, `im-search-picker`, inline or in a sheet (`SearchPickerOptions`): `label`, `loading`, `empty`, `errorText`, `search(query, signal)` (each new query cancels the last; return recent items for the empty query), `onChoose`, and `mark` (a second action on an item, its own button or Shift+Enter, drawn in `im-picker-mark`). Results are `PickerItem`s. It returns `{ element, input, refresh, close, destroy }` |
| `createFileTree(doc, entries, options)` | A tree of files the app lists (`FileTreeEntry`: `id`, `name`, `icon?`, `detail?`, `title?`, `disabled?`, `children?`, `lazy?`; a row's detail is `im-tree-detail`). `FileTreeOptions`: `label`, `singleClick?`, `expanded?`, `selected?`, `active?`, `onToggle?`, `onSelect?`, `onOpen?`, `loadChildren?` (for a `lazy` folder, cancellable), `onLoadError?`. Ids are unique in the whole tree; typing searches the visible names; children are kept once loaded, and a failed folder can be opened again. It returns `{ element, reveal(ids, focus), setSelected(id), destroy() }`. `fileTree(doc, entries, options)` is its element alone, for a tree that is never revealed or destroyed |
| `breadcrumbs(doc, label, segments, reveal)` | Where an item is, `im-breadcrumbs`: each parent a button that calls `reveal(id)`, the last segment the current item |
| `fileSelector(doc, options)` | A native file input, `im-file-selector`: `{ label, accept?, multiple?, directory? }`. Read its `FileList` on `change` |
| `pathField(input, options)` | A path the person types or picks, `im-path-field`: the input in an `im-input--code` box and a button that calls `choose()`, the app's native chooser. `{ buttonLabel, choose, onError, commit? }`. Cancelling keeps the input as it was; a choice still pending is dropped when the field is edited or removed. With `commit(path)` the choice is acted on at once (open that folder, add that root) instead of being written into the field, which keeps what was typed: an edit no longer drops the choice, a removal still does, and a failure goes to `onError` |
| `fileWorkspace(options)` | A document browser, `im-file-workspace`: a navigator, a separator, a toolbar with the item's location (`im-file-location`), the panes of the documents (`im-document-panes`, each made by `documentPane(kind, label)`, an `im-document-pane` of a `DocumentPaneKind`: a `source` pane the editor fills (`im-document-pane--source`), a `rendered` pane for a rendered document in the look's reading type (`im-document-pane--rendered`), a `picture` pane at most as wide as it (`im-document-pane--picture`), and a `form` pane for a visual editor (`im-document-pane--form`), whose fields take the `documentHeading` (`im-document-heading`, with `data-im-level`), `documentCode` (`im-document-code`) and `documentKept` (`im-document-kept`) roles. Panes side by side are divided by a rule, and a hidden pane takes no room) and a status. `{ resizeLabel, toolbarLabel, initialWidth, onWidthCommit? }`. The app loads each document and puts its editor or its preview in the panes |
| `overviewStrip(options)` | A scrolling view in miniature at its edge, `im-overview`: an `OverviewStripOptions`, `{ press(y, on), drag(y), release(completed), wheel(deltaY) }`, where `on` is an `OverviewTarget` (`band`, `frame` or `track`). It returns an `OverviewStrip`, `{ element, canvas, ink, setFrame, setBand, destroy }`. The app paints the trace in the strip's `canvas` (the colours of `ink()`), says where the frame over what is on screen (`setFrame(top, height)`, `im-overview-frame`) and the band of what has scrolled out into an archive (`setBand(height)`, `im-overview-band`) are, and turns a press on the `band`, the `frame` or the `track` into its own lines. Imago draws the strip and reports presses, drags and the wheel. The host places it with `--im-overview-top`, `--im-overview-end`, `--im-overview-bottom` and `--im-overview-width`; `data-im-dragging` is on it while a drag holds. It is hidden from assistive technology: it is a pointer shortcut beside a view that scrolls by itself |
| `createTilingWorkspace(options)` | A workspace of panes with tabs, in splits the person resizes (`TilingWorkspaceOptions`): the app gives the layout (`TilingLayout` of `TilingView`s), its model (validation, a preview of each `TilingAction`, the rectangles of the panes, the neighbour of a pane), the element of each view keyed by its id (`bindings`), and `dispatch(action, expectedLayout)`, which applies an accepted action to its own layout. A view's element moves with its tab, and its resource is started and stopped by the app, not by whether it is shown. `placeWorkspaceBinding(parent, binding, visible)` puts a view's element in its pane |
| `portraitNotice(options)` | A notice for a small window of its own (an attention window): a portrait, the name, a message and two actions, `im-portrait-notice` with `im-notice-figure` and `im-notice-bubble`. `{ label, name, dismiss, open }`. The app decides what it is about, whether the window is shown, and when the event is acknowledged |

The tiling workspace writes its own markup in the app's host, which takes `im-host`: a canvas (`im-tile-canvas`) of
panes (`im-pane`, `im-focused` when it has focus, `im-collapsed` when folded, `im-filtered-out` when a filter hides all its
tabs), each with a header (`im-header`) holding its tabs (`im-tile-tabs`, and `im-tile-tabs-filtered`, the line that says a
filter hides them all), each
tab in its `im-tile-tabwrap` (`im-tile-tabwrap-active` for the active one) as an `im-tile-tab` with its close button
`im-tile-tab-close` (`im-tile-tab-toned` when `toneForView` gives it a tone, read from `--im-tile-tone`;
`im-tile-tab-dragging` while it is dragged), and its tools (`im-pane-tools`, a button `im-control`, the focus button
`im-pane-focus`, the button that adds a tab `im-add`); then its body (`im-tile-body`), where a pane with nothing to show
says so (`im-placeholder`) and offers a new tab (`im-tile-empty-start`). Between panes is a separator,
`im-tile-splitter`. While a tab is dragged, `im-drop-preview`, `im-drop-label` and `im-drop-marker` show where it would
land and `im-drag-ghost` follows the pointer; the host takes `im-dragging`, and `im-changing` while a drag or a resize
runs. The views that are not shown wait in `im-parking`, and `im-tile-status` announces what changed. Its controls carry
`data-im-tile-key`, their identity across a repaint. The app writes none of these classes and styles none.

Dragging a tab to the centre of a pane joins its tabs; to an edge, it asks for a split; onto the first or second half of
a tab, it asks to go before or after it. A focused tab enters move mode with Shift+Enter: the arrows visit the
destinations, Enter commits and Escape cancels. The app applies each accepted move to its own layout and puts focus back
after it renders. A destination must still be there when the person confirms it. In a column split the separator
follows the pointer and the arrows in both writing directions.

While a search picker shows its results, Enter chooses the active result and leaves the enclosing form alone. In a
sheet, the first Escape in the picker closes its results and focuses its input; a second closes the sheet and gives
focus back to its opener.

A group the person opens and closes, in the sidebar or a page, is a native `details` with `im-disclosure`: its
`summary` is the group's name, and its body holds fields, check rows or actions. A section of a page is `im-section`;
two in a row have 16px between them.

A Files view can tie its breadcrumbs and its tree to the same ids:

```ts
import { breadcrumbs, createFileTree } from '@acaprino/imago/ui';

const tree = createFileTree(document, [{ id: 'src', name: 'src', lazy: true }], {
  label: 'Project files',
  loadChildren: (folder, signal) => project.listChildren(folder.id, signal),
  onLoadError: (folder, error) => showReadError(folder.name, error),
  onOpen: entry => editor.open(entry.id),
});
const segments = [{ id: 'src', label: 'src' }, { id: 'src/main.ts', label: 'main.ts' }];
const path = breadcrumbs(document, 'File location', segments, id => {
  const index = segments.findIndex(part => part.id === id);
  void tree.reveal(segments.slice(0, index + 1).map(part => part.id), true);
});
panel.append(path, tree.element);
// When the Files view closes
tree.destroy();
```

The inspector can cover its current view with a detail view (`inspector(shell).push`): closing it, or Escape inside it,
returns to the view under it with its opener, its fields, its scroll and its guard. A reveal in the tree may ask for
focus; if focus moved elsewhere while the folder loaded, the tree still selects the file and leaves focus and scrolling
with the person.

## Graphs

A graph in the content region is `graphView` from `@acaprino/imago/graph`, in an element with `im-graph-host`; a grouped
scene is `groupedGraphScene` from `@acaprino/imago/graph-layout`, and an editable graph the editor of the same entry. The
app turns its domain into nodes, edges and groups; the package owns positions, text measures, routes, the drawing, the
keys and the camera. See [graphs.md](graphs.md). The parts an app puts in an editable graph's workspace take the editor
roles by name: `uiTraits(list, 'editorItems')` for a popup's list, `editorShelf` and `editorSource` for the shelf of
things to drop, `editorNodeTitle`, `editorCaption` and `editorNodeFoot` for a card, and `editorOptions` and
`editorChoice` for a choice.
