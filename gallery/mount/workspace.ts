import { breadcrumbs, createFileTree, dockTabs, inspector, searchPicker, splitView, type DockMove } from '../../ts/ui/index.ts';
import type { MountContext } from '../main.ts';

export default function mount({ app, root, sections }: MountContext) {
  if (app !== 'shinatama') return;
  const section = document.createElement('section');
  section.className = 'g-block g-files g-workspace';
  section.setAttribute('aria-label', 'Interactive workspace');
  for (const { name, value } of Array.from(root.attributes)) {
    if (name.startsWith('data-im-')) section.setAttribute(name, value);
  }
  section.innerHTML = `<h2>Workspace</h2><div class="g-docks"></div>
    <details class="im-disclosure" open><summary>Project files</summary><div class="g-file-body"></div></details>
    <div class="g-project-finder"></div><output></output>
    <button class="im-btn" type="button">Session details</button>
    <section class="im-inspector" aria-label="Session details" hidden></section>`;
  const dock = section.querySelector<HTMLElement>('.g-docks')!;
  const output = section.querySelector('output')!;
  let count = 0;
  const splits = new Map<HTMLElement, () => void>();
  function pane() {
    const el = document.createElement('section');
    el.dataset.imPane = 'pane-' + ++count;
    el.setAttribute('aria-label', 'Pane ' + count);
    const strip = document.createElement('div');
    strip.className = 'im-tabs';
    el.append(strip);
    return el;
  }
  function split(first: HTMLElement, second: HTMLElement, axis: 'columns' | 'rows') {
    const view = splitView(first, second, { axis, label: 'Resize panes', minFirst: 64, minSecond: 64 });
    splits.set(view.element, view.destroy);
    return view.element;
  }
  const left = pane();
  const right = pane();
  for (const [name, parent] of [['Console', left], ['Files', left], ['Preview', right]] as const) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'im-tab';
    tab.dataset.imDockTab = tab.textContent = name;
    tab.title = name + ' · Shift+Enter to move, arrows to choose a destination, Enter to drop';
    tab.setAttribute('aria-keyshortcuts', 'Shift+Enter');
    tab.onclick = () => { output.value = name; };
    parent.firstElementChild!.append(tab);
  }
  dock.append(split(left, right, 'columns'));
  function move(request: DockMove) {
    const tab = dock.querySelector<HTMLElement>('[data-im-dock-tab="' + CSS.escape(request.tab) + '"]')!;
    const source = tab.closest<HTMLElement>('[data-im-pane]')!;
    const dest = dock.querySelector<HTMLElement>('[data-im-pane="' + CSS.escape(request.pane) + '"]')!;
    if (request.relativeTo) {
      const peer = dest.querySelector<HTMLElement>('[data-im-dock-tab="' + CSS.escape(request.relativeTo) + '"]')!;
      if (request.placement === 'before') peer.before(tab);
      else peer.after(tab);
    } else if (request.placement === 'center') dest.firstElementChild!.append(tab);
    else {
      const sibling = pane();
      sibling.firstElementChild!.append(tab);
      const marker = document.createComment('split');
      dest.replaceWith(marker);
      const before = request.placement === 'left' || request.placement === 'top';
      const axis = request.placement === 'left' || request.placement === 'right' ? 'columns' : 'rows';
      marker.replaceWith(split(before ? sibling : dest, before ? dest : sibling, axis));
    }
    if (!source.querySelector('[data-im-dock-tab]')) {
      const group = source.parentElement!;
      const peer = Array.from(group.children).find(el => el !== source && !el.classList.contains('im-splitter'))!;
      splits.get(group)?.();
      splits.delete(group);
      group.replaceWith(peer);
    }
    tab.focus();
    output.value = request.tab + ' moved ' + request.placement;
  }
  const stopDock = dockTabs(dock, { move, describe: r => [r.tab, r.placement, r.relativeTo ?? r.pane].join(' ') });
  const tree = createFileTree(document, [{ id: 'src', name: 'src', lazy: true }], {
    label: 'Workspace source', loadChildren: async () => [{ id: 'main', name: 'main.ts' }],
    onSelect: file => { output.value = file.name; },
    onLoadError: (_, error) => { output.value = String(error); },
  });
  const path = breadcrumbs(document, 'File location', [{ id: 'src', label: 'src' }, { id: 'main', label: 'main.ts' }],
    id => { void tree.reveal([id], true); });
  section.querySelector('.g-file-body')!.append(path, tree.element);
  const marked = new Set<string>();
  const projects = ['Shinatama', 'Mukade', 'Imago'].map(label => ({ id: label, label }));
  const picker = searchPicker(document, {
    label: 'Find project', loading: 'Finding projects…', empty: 'No matching projects', errorText: String,
    search: async query => projects.filter(p => p.label.toLowerCase().includes(query.toLowerCase())),
    onChoose: project => { output.value = 'Opened ' + project.label; },
    mark: { label: 'Show in sidebar', checked: p => marked.has(p.id), toggle: p => {
      if (marked.has(p.id)) marked.delete(p.id); else marked.add(p.id);
    } },
  });
  section.querySelector('.g-project-finder')!.append(picker.element);
  const drawer = inspector(section);
  const open = section.querySelector<HTMLButtonElement>(':scope > button')!;
  open.onclick = () => {
    const parent = document.createElement('div');
    parent.innerHTML = '<label>Session name <input></label> <button class="im-btn" type="button">Inspect event</button>';
    const inspect = parent.querySelector('button')!;
    inspect.onclick = () => {
      const back = document.createElement('button');
      back.className = 'im-btn';
      back.textContent = 'Back to session';
      back.onclick = drawer.close;
      drawer.push(back, inspect);
    };
    drawer.open(parent, open);
  };
  sections.append(section);
  return () => { stopDock(); for (const stop of splits.values()) stop(); tree.destroy(); picker.destroy(); section.remove(); };
}
