import { graphView } from '../../ts/graph.ts';
import type { MountContext } from '../main.ts';

export default function mount({ root, sections }: MountContext) {
  const section = document.createElement('section');
  section.className = 'g-block';
  for (const attr of root.attributes) if (attr.name.startsWith('data-im-')) section.setAttribute(attr.name, attr.value);
  const heading = document.createElement('h2');
  heading.textContent = 'Directed graph';
  const pane = document.createElement('div');
  pane.style.height = '240px';
  const status = document.createElement('output');
  section.append(heading, pane, status);
  sections.append(section);
  const create = () => graphView(pane, {
    label: 'Build dependencies', controls: { zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit diagram' },
    onSelect: id => { status.value = 'Selected ' + id; draw(id); },
    onOpen: id => { status.value = 'Opened ' + id; },
    onClear: () => { status.value = ''; draw(); },
  });
  let diagram = create(), current: string | undefined;
  function draw(selected?: string) {
    current = selected;
    diagram.draw({
      nodes: ['Client', 'Service', 'Store'].map((id, i) => ({
        id, label: id, x: 170 * i, y: i === 1 ? 54 : 0, width: 126, height: 42,
        selected: id === selected, openLabel: 'Open ' + id,
        title: id === 'Client' ? 'Client <worker>' : undefined,
        ariaLabel: id === 'Client' && selected === id ? 'Client' : undefined,
      })),
      edges: [{ source: 'Client', target: 'Service' }, { source: 'Service', target: 'Store', dashed: true, label: 'reads', showLabel: true },
        { source: 'Store', target: 'Client', dotted: true, directed: false, tone: 'err', label: 'Mutually exclusive' }],
    });
  }
  draw();
  const api = {
    viewport: () => diagram.viewport(),
    remount: () => {
      const snapshot = diagram.viewport();
      diagram.dispose(); diagram = create();
      // Restore before draw also covers consumers that mount while not measurable.
      diagram.restoreViewport(snapshot); draw(current);
    },
    resize: (width: string) => { pane.style.width = width; },
    hidden: (value: boolean) => { pane.hidden = value; },
    fit: () => diagram.fit(),
  };
  const debug = window as Window & { __imagoGraph?: typeof api };
  debug.__imagoGraph = api;
  return () => {
    if (debug.__imagoGraph === api) delete debug.__imagoGraph;
    diagram.dispose(); section.remove();
  };
}
