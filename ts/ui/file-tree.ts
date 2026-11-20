/** Supply the files visible to the application. Imago never reads a filesystem. */
export interface FileTreeEntry {
  id: string;
  name: string;
  children?: readonly FileTreeEntry[];
}

export function fileTree(doc: Document, entries: readonly FileTreeEntry[], options: {
  label: string;
  expanded?: readonly string[];
  onSelect?: (entry: FileTreeEntry) => void;
  onOpen?: (entry: FileTreeEntry) => void;
}): HTMLUListElement {
  const tree = doc.createElement('ul');
  tree.className = 'im-tree';
  tree.setAttribute('role', 'tree');
  tree.setAttribute('aria-label', options.label);
  const expanded = new Set(options.expanded);
  let selected: string | undefined;
  let active = entries[0]?.id;
  type Row = { entry: FileTreeEntry; parent?: string; element: HTMLLIElement };
  let rows: Row[] = [];

  function draw(focus = false): void {
    const fragment = doc.createDocumentFragment();
    rows = [];
    function append(group: readonly FileTreeEntry[], level: number, parent?: string): void {
      group.forEach((entry, index) => {
        const row = doc.createElement('li');
        row.className = 'im-tree-item';
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-level', String(level));
        row.setAttribute('aria-posinset', String(index + 1));
        row.setAttribute('aria-setsize', String(group.length));
        row.setAttribute('aria-selected', String(selected === entry.id));
        row.style.setProperty('--im-level', String(level - 1));
        if (entry.children?.length) row.setAttribute('aria-expanded', String(expanded.has(entry.id)));
        row.tabIndex = entry.id === active ? 0 : -1;
        const chevron = doc.createElement('span');
        chevron.className = 'im-tree-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '▸';
        const label = doc.createElement('span');
        label.className = 'im-tree-label';
        label.textContent = label.title = entry.name;
        row.append(chevron, label);
        fragment.append(row);
        rows.push({ entry, parent, element: row });
        if (entry.children && expanded.has(entry.id)) append(entry.children, level + 1, entry.id);
      });
    }
    append(entries, 1);
    tree.replaceChildren(fragment);
    if (focus) rows.find(row => row.entry.id === active)?.element.focus();
  }

  function move(row?: Row): void {
    if (!row) return;
    const previous = rows.find(item => item.entry.id === active);
    if (previous) previous.element.tabIndex = -1;
    active = row.entry.id;
    row.element.tabIndex = 0;
    row.element.focus();
  }

  function select(entry: FileTreeEntry): void {
    selected = entry.id;
    for (const row of rows) row.element.setAttribute('aria-selected', String(row.entry.id === selected));
    options.onSelect?.(entry);
  }

  function toggle(row: Row): void {
    if (expanded.has(row.entry.id)) expanded.delete(row.entry.id);
    else expanded.add(row.entry.id);
    draw(true);
  }

  const fromEvent = (event: Event) => rows.find(row => row.element.contains(event.target as Node));
  tree.addEventListener('click', event => {
    const row = fromEvent(event);
    if (!row) return;
    move(row);
    if (event.target === row.element.firstChild && row.entry.children?.length) toggle(row);
    else select(row.entry);
  });
  tree.addEventListener('dblclick', event => {
    const row = fromEvent(event);
    if (!row || event.target === row.element.firstChild) return;
    if (row.entry.children?.length) toggle(row);
    else if (!row.entry.children) options.onOpen?.(row.entry);
  });
  tree.addEventListener('keydown', event => {
    const row = fromEvent(event);
    if (!row || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = rows.indexOf(row);
    switch (event.key) {
      case 'ArrowDown': move(rows[index + 1]); break;
      case 'ArrowUp': move(rows[index - 1]); break;
      case 'Home': move(rows[0]); break;
      case 'End': move(rows.at(-1)); break;
      case 'ArrowRight':
        if (row.entry.children?.length) {
          if (expanded.has(row.entry.id)) move(rows[index + 1]);
          else toggle(row);
        }
        break;
      case 'ArrowLeft':
        if (row.entry.children?.length && expanded.has(row.entry.id)) toggle(row);
        else move(rows.find(item => item.entry.id === row.parent));
        break;
      case ' ': select(row.entry); break;
      case 'Enter':
        if (row.entry.children?.length) toggle(row);
        else { select(row.entry); if (!row.entry.children) options.onOpen?.(row.entry); }
        break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  });
  draw();
  return tree;
}
