# Directed graphs

A graph in the content region: a read-only view of nodes and edges, a grouped layout for it, and the parts of an editor
of a graph the person changes. The rules are in [design-file.md](design-file.md): a graph is content, its keys are the
package's, and the details or the form of the selected node go in the shell's inspector.

## The view

`graphView(host, options)` from `@acaprino/imago/graph` mounts one read-only diagram in `host`, an element with
`im-graph-host` (a bounded height) and, round it in a panel, `im-graph-panel`. Include the normal stylesheet. The graph
uses D3 for pan and zoom and takes its positions from the app or from a layout engine.

```ts
import { graphView } from '@acaprino/imago/graph';

const graph = graphView(host, {
  label: 'Dependencies',
  controls: { zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit diagram' },
  onSelect: id => inspect(id),
});
graph.draw({
  nodes: [
    { id: 'web', label: 'Web', x: 0, y: 0, width: 140, height: 52 },
    { id: 'api', label: 'API', x: 220, y: 0, width: 140, height: 52 },
  ],
  edges: [{ source: 'web', target: 'api', label: 'calls', showLabel: true }],
});
```

`GraphOptions` is `{ label, key?, controls, onSelect?, onOpen?, onClear? }`: `label` names the region, `controls` gives
the words of the three buttons, `key` is a stable identity when a screen holds several graphs with the same label.
`draw(scene, refit?)` takes a `GraphScene`, `{ nodes, edges, groups? }`:

- A node (`GraphNode`, a `GraphBox`: a `GraphPoint` with a width and a height) has a unique `id` and a `label`, and may
  have `ariaLabel` (its whole name when the label is short), `title` (its tooltip), `detail`, `count`, `content` (DOM
  content of its own), `selected`, `highlighted`, `dimmed` (set back), `external` (drawn with a dashed edge) and
  `openLabel` (with the graph's `onOpen`, the node can be opened).
- An edge (`GraphEdge`) joins a `source` and a `target` by their ids: `label` and `showLabel`, `points` (the bends a
  layout engine gives; without them it joins the nearest facing sides), `dashed`, `dotted`, `directed: false` for a
  symmetric relationship, `tone` (`accent`, `warn` or `err`) and `dimmed`.
- A group (`GraphGroup`) is a positioned rectangle with an `id` and DOM `content`.

The view writes `im-graph` round its region `im-graph-pane`, which holds the world `im-graph-world` (its groups
`im-graph-group`, its edges `im-graph-edge` and its cards `im-graph-card`, each with its node `im-graph-node` and, when it
opens, `im-graph-open`), and its buttons in `im-graph-tools`. The nodes and the buttons carry stable `data-im-key`
values, so a repaint and a dialog give focus back to them.

Drag the ground to pan; zoom with the wheel, a pinch or the buttons. On the keyboard, Up and Down visit the nodes in the
order of the scene, Right follows the first outgoing edge and Left the first incoming one (and a symmetric edge from
either end), Home and End go to the first and the last node, Enter activates the focused button, the plus and minus keys
zoom and zero fits the diagram. The graph claims the keys it answers.

`draw` again shows a change; it keeps a camera the person moved unless its second argument is `true`. To carry the view
between mounts, `viewport()` gives a `GraphViewport`, `{ x, y, k, fitted }`, and `restoreViewport(snapshot)` puts it back:
a graph that fitted itself keeps fitting when it is resized or its scene changes, and one the person panned or zoomed
keeps its camera; a fit restored before the first draw, or while hidden, waits until the graph can be measured. Keep a
viewport per document and restore it after a remount. `camera()` gives a `GraphCamera`, `{ x, y, k }`, and
`restore(camera)` sets a fixed camera the person moved, which never fits by itself. `fit()` fits the diagram once.
`dispose()` removes the graph; call it before removing its host.

A key of the graph is `graphLegendHtml(items, summary)` from `@acaprino/imago/ui`: a text key, `im-graph-legend`, with a
decorative sample of each line (`GraphLegendItem`: `{ label, tone?, stroke? }`, `stroke` `solid`, `dashed` or `dotted`),
and a summary in `im-graph-summary`.

## The grouped layout

`groupedGraphScene(groups, items, relations, options)` from `@acaprino/imago/graph-layout` lays out a two-column graph of
groups and their members: the groups on the left, their members on the right. The app gives unpositioned nodes
(`GraphItem`), groups with the ids of their `children` (`GraphColumnGroup`) and its other relationships (`GraphEdge`s);
the package sizes and places the nodes, routes the relationships outside the members' column and writes the edges of
membership. A member of two groups appears once, an empty group is left out, and members of no group follow the others.
A node id given twice throws. `GroupedGraphOptions` (`nodeHeight`, `rowGap`, `groupGap`, `columnGap`, `minGroupWidth`,
`minNodeWidth`) changes the measures. `graphTextWidth(text)` is the width it gives a label at the graph's text size,
without measuring the page. The app owns the labels and what the relationships mean, not the layout.

## The editor

A graph the person edits is made of the editor's parts, from `@acaprino/imago/graph`. The app owns the nodes, their
content, their coordinates, the edits it allows and their persistence; the package owns the controls, the gestures, the
keyboard targets and the geometry.

| Call | What it makes |
|---|---|
| `graphEditorWorkspace(label, paletteLabel)` | The workspace, `im-editor-workspace`: its body `im-editor-body` with a palette of things to add (`im-editor-palette`) and the stage (`im-editor-stage`) holding an editor. It returns `{ root, body, palette, stage, editor }` |
| `graphEditor()` | The editing surface: a region that scrolls (`im-editor-scroll`) round a canvas (`im-editor-canvas`) with the lines in an SVG (`im-editor-wires`). It returns `{ scroll, canvas, nodes, edges, defs, wires, point(event) }`, `point` the place of a pointer on the canvas |
| `graphEditorNode(actions)` | A node the person moves and opens, `im-editor-node`, a button: `{ press(event), open(), nudge(delta) }`. Enter or Space opens it; the arrows nudge it by 10, 40 with Shift; it claims the keys it answers |
| `graphEditorPort(symbol, title, press)` | The handle of a node from which a connection is dragged, `im-editor-port`, for the pointer only |
| `graphArrowMarker(defs, id)` | The arrow at the end of a line, `im-editor-arrow` |
| `graphEditorEdge(a, b, markerId, open)` | A connection, `im-editor-edge`, a button: its wide hit area `im-editor-hit`, its line `im-editor-line` and its label `im-editor-label`. Enter, Space or a click opens it |
| `graphConnectionPreview(layer, markerId)` | The line that follows the pointer while a connection is dragged, `im-editor-preview`, with `update(from, to)` |
| `graphGesture(event, { move, release, cancel })` | One gesture of the pointer from a press to its release, even when it leaves the canvas. Escape cancels it and is claimed. It returns the function that stops it |
| `graphMiniature(options)` | A small decorative drawing of a graph, `im-graph-mini`, with its nodes `im-graph-mini-node` and its edges `im-graph-mini-edge`: `{ width, height, nodeWidth, nodeHeight, nodes, edges }` |

The parts the app writes in its own markup round the editor, as Shinatama's team map does, take the editor's classes:

| Part | Class |
|---|---|
| In the palette: a list (`im-editor-items`) of things the person drags onto the map, each a button (`im-editor-source`), and a list of what is wrong (`im-editor-issues`); in the toolbar, a status of it in its tone (`im-editor-summary`) | `im-editor-items`, `im-editor-source`, `im-editor-issues`, `im-editor-summary` |
| In a node: its title with a dot (`im-editor-node-title`, `im-editor-dot`), a caption (`im-editor-caption`) and a foot (`im-editor-node-foot`) | `im-editor-node-title`, `im-editor-dot`, `im-editor-caption`, `im-editor-node-foot` |
| On the map: the line that says what to do on an empty one; the shelf under the map, with its key; the ghost of what is dragged onto it | `im-editor-empty`, `im-editor-shelf`, `im-editor-ghost` |
| In the form of a connection: a choice of kinds, each with a sample of its line; a group of options; a description | `im-editor-choice`, `im-editor-sample`, `im-editor-options`, `im-editor-description` |
| In a list of saved arrangements: a preset, and the form on one line that saves one | `im-editor-preset`, `im-editor-inline-form`, in `im-editor-popup` |

The editor's stylesheet also reads six states that the app sets on its own elements; the package writes none of them, and
they do not carry `data-im-` (they predate the rule): `data-pending` and `data-empty` on an `im-editor-node` draw a dashed
edge, `data-bad` an outline in the error colour, `data-lifted` raises the node and shows the grabbing cursor, and
`data-over` (a node) and `data-drop` (the shelf or the scroll region) draw the accent ring of a drop target. `graphMiniature`
writes `data-kind` on a line from the `kind` it is given.

The details and the form of the selected node or connection go in the shell's inspector (`inspector(shell).open`).
`graphInspector(label)` makes a panel inside the editor's stage (`im-editor-inspector`) instead, and Shinatama's team map
also puts its saved arrangements in one (with `im-editor-popup`): it is a second side panel, which the package still
exports and no new editor uses. An editor does not use it: the form of what is selected
goes in the shell's inspector, the only side panel, and a short choice tied to a control (the saved arrangements) in a
sheet (`openSheet`) ([design-file.md](design-file.md), "Surfaces: which one for what").
