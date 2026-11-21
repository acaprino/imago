# Application content composition

Imago owns rendering, styles, layout primitives and UI behaviours. Consumers supply
domain models, labels, actions and the composition of shared components. A consumer
does not need its own stylesheet or a private control library.

Import `@acaprino/imago/css/imago.css` once. Add `im-shell im-app-layout
im-native-controls` to an application shell using native HTML forms. The opt-in
`im-app-layout` layout provides shell sizing, compact content typography and responsive
layouts. Its defaults have low specificity so specialised Imago components win.

## Composition APIs

Import these from `@acaprino/imago/ui`:

| Area | API |
| --- | --- |
| Controls | `buttonHtml`, `iconButtonHtml`, `switchHtml`, `segmentedHtml`, `textFieldHtml`, `selectFieldHtml`, `checkboxOptionHtml` |
| Shell | `shellFrameHtml`, `titlebarHtml`, `tabNavigationHtml`, `renderShellFrame` |
| Forms | `formHeaderHtml`, `formGroupHtml`, `formFooterHtml`, `settingsRowHtml`, `repeatableFieldRowHtml` |
| First run and processes | `wizardHtml`, `wizardHeadingHtml`, `wizardActionsHtml`, `stepProgressHtml`, `stepNavigationHtml` |
| Content | `summaryHtml`, `taskCardHtml`, `stackListHtml`, `timelineItemHtml`, `tableHtml`, `codeViewHtml` |
| Feedback | `bannerHtml`, `busyIndicatorHtml`, `emptyStateHtml`, `fieldErrorHtml`, `graphLegendHtml` |
| Behaviour | `createContentDialog`, `runFormOperation`, `showFieldErrors`, `captureDomState`, `restoreDomState`, `replaceHtmlRegion` |

Plain text arguments and attribute values are escaped. Arguments explicitly named
`Html` are trusted component output; never put unescaped service/user content in
them. See [HTML composition](html-composition.md) and [native forms](native-forms.md).

`renderShellFrame` keeps the existing titlebar and body elements. A modal can
therefore keep the body inert while application data changes. Dispose mounted
widgets before replacing their hosts and remount them afterward. Capture DOM
state before replacement, restore scroll/details, then focus when no modal owns it.

`runFormOperation` serializes a form's operation, blocks dismissal through the
content-dialog controller, preserves pre-existing disabled controls and ignores
late UI callbacks into a detached or replaced form. It does not cancel a server
operation; the consuming app still owns its transaction and reconciliation.

## Layout primitives

Shared content styles include `im-main`, `im-page-content`, `im-page-content--narrow`,
`im-page-heading`, `im-action-row`, `im-content-toolbar`, `im-table-scroll`,
`im-aside-layout`, `im-definition-list`, `im-file-list`, `im-code-view`,
`im-choice-list`, `im-numbered-result` and `im-wizard-actions`. Breakpoints respond
to the `im-shell` container. Component state uses Imago classes or `data-im-*`
attributes; business identifiers belong in the data passed by the consumer.

These shell-content primitives are distinct from the document and inspection
workspace API. `im-page` supplies a standalone page's typography; `im-document`
is a padded reading surface, while `im-page-content` only constrains the width
inside an application shell. `im-aside-layout` puts a fixed-width control column
before flexible content; `im-master-detail` puts the main region before its
detail region. `im-content-toolbar` is an inline row; `im-toolbar` is a padded
panel strip. `im-activity-list` uses timestamp rows; `im-timeline` draws a vertical
timeline. Both sets can coexist without one stylesheet changing the other.

## Stateful desktop views

Use the DOM API when a view keeps input focus, text selection, a native form or
an external renderer alive during updates. `uiPart` creates a named layout or
semantic part. `uiButton`, `uiInput`, `uiSelect` and `uiTextarea` return native
controls that can be bound to application commands. `componentElement` mounts
one trusted result from an Imago HTML renderer. Pass service and user text to
the renderer's text parameters.

`createTilingWorkspace` presents a controlled tree of weighted splits and tab
groups. Supply the current layout, reducer and stable DOM bindings keyed by view
ID. A layout edit moves an existing binding. The consumer starts and disposes
the underlying resource independently of panel visibility. `fileWorkspace`
provides the tree, command and document regions for a file tool. The application
loads the actual document and connects its editor inside the document region.

`portraitNotice` provides the image, live text and action controls of a
detached notice. The host decides which event it represents, whether to show
the window, and when to acknowledge the event.

## Graphs

Use `graphView` from `@acaprino/imago/graph`, and `groupedGraphScene` from
`@acaprino/imago/graph-layout` for grouped two-column scenes. Consumers translate
their domain into node/edge/group data; Imago owns positions, text measurement,
routes, SVG, keyboard navigation, camera and legend. Preserve `viewport()` per
document and call `restoreViewport()` after a remount, retaining both the camera
and the automatic-fit mode. Dispose the previous graph before
removing its host. See [directed graphs](graphs.md).

For a user-editable topology, the graph entry point also exposes
`graphEditorWorkspace`, `graphEditor`, `graphEditorNode`, `graphEditorPort`
and `graphEditorEdge`. The consumer supplies node and connection data, allowed
edits and persistence. Imago owns the graph controls, pointer gestures,
keyboard targets, geometry and inspectors.
