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

Drag the background to pan. Use the wheel, pinch or the labelled buttons to zoom. On the keyboard, Up and Down visit nodes in scene order. Right follows the first outgoing edge and Left the first incoming edge. Home and End jump to the first and last node. Enter activates the focused button. The plus and minus keys zoom and zero fits the diagram.

Call `draw` again to reflect changes. It preserves a manually positioned camera unless its second argument is true. Use `camera` and `restore` to carry the viewport between mounts, and `dispose` when removing it.
