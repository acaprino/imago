# Directed graphs

Import `graphView` from `@acaprino/imago/graph` and include the normal Imago stylesheet. Give the host a height. The graph uses D3 for pan and zoom and accepts positions from the application or a layout engine.

```ts
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

Supply a unique ID for each node or group. The same IDs identify the endpoints of an edge. An optional array of route points carries the bends supplied by a layout engine. A group accepts a positioned rectangle and DOM content. A node accepts text, detail, a count or custom DOM content. To make a node expandable, supply its `openLabel` and the graph's `onOpen` callback.

`ariaLabel` supplies a node's full accessible name when its visible label is abbreviated;
`title` supplies its tooltip. Edges accept `tone: 'err'`, `dotted: true`, and
`directed: false` for symmetric relationships. Left and Right keyboard navigation
follows symmetric edges from either endpoint.

Nodes and viewport controls expose stable `data-im-key` values for Imago's DOM
state and dialog focus restoration. Set `GraphOptions.key` to a stable unique value
when a screen contains multiple graphs with the same accessible label.

For two-column group-to-member graphs, import `groupedGraphScene` from
`@acaprino/imago/graph-layout`. Pass unpositioned nodes, groups with `children`
identifiers, and optional additional relationships. Imago sizes and positions the
nodes, routes relationships outside the member column, and generates membership
edges. Shared members occur once, empty groups are omitted, and unrelated members
follow the grouped ones. Duplicate node identities are rejected. The application
owns labels and relationship meaning, not layout code.

`graphLegendHtml` from `@acaprino/imago/ui` renders a text key with decorative
solid/dashed/dotted samples. A host with `im-graph-host` has a bounded responsive
height; `im-graph-panel` supplies the surrounding panel spacing.

Drag the background to pan. Use the wheel, pinch or the labelled buttons to zoom. On the keyboard, Up and Down visit nodes in scene order. Right follows the first outgoing edge and Left the first incoming edge. Home and End jump to the first and last node. Enter activates the focused button. The plus and minus keys zoom and zero fits the diagram.

Call `draw` again to reflect changes. It preserves a manually positioned camera unless its second argument is true.

Use `viewport(): GraphViewport` and `restoreViewport(snapshot)` to carry state
between mounts. The snapshot contains `{ x, y, k, fitted }`: an automatically fitted
graph continues to fit on resize and scene changes; a manually panned or zoomed
graph preserves its camera. Restoring automatic fitting before the first draw or
while hidden keeps that intention until the graph can be measured.

The existing `camera(): GraphCamera` and `restore(camera)` API remains available;
`restore` deliberately selects a fixed manual camera. Call `dispose` when removing
the graph.
