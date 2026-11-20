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
  const diagram = graphView(pane, {
    label: 'Build dependencies', controls: { zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit diagram' },
    onSelect: id => { status.value = 'Selected ' + id; draw(id); },
    onOpen: id => { status.value = 'Opened ' + id; },
    onClear: () => { status.value = ''; draw(); },
  });
  function draw(selected?: string) {
    diagram.draw({
      nodes: ['Client', 'Service', 'Store'].map((id, i) => ({
        id, label: id, x: 170 * i, y: i === 1 ? 54 : 0, width: 126, height: 42,
        selected: id === selected, openLabel: 'Open ' + id,
      })),
      edges: [{ source: 'Client', target: 'Service' }, { source: 'Service', target: 'Store', dashed: true, label: 'reads', showLabel: true }],
    });
  }
  draw();
  return () => { diagram.dispose(); section.remove(); };
}
