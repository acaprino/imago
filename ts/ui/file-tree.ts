/** Supply the files visible to the application. Imago never reads a filesystem. */
export interface FileTreeEntry {
  id: string;
  name: string;
  children?: readonly FileTreeEntry[];
  /** A folder whose children are supplied by loadChildren on first expansion. */
  lazy?: boolean;
}

export interface FileTreeOptions {
  label: string;
  expanded?: readonly string[];
  selected?: string;
  active?: string;
  onToggle?: (entry: FileTreeEntry, expanded: boolean) => void;
  onSelect?: (entry: FileTreeEntry) => void;
  onOpen?: (entry: FileTreeEntry) => void;
  loadChildren?: (entry: FileTreeEntry, signal: AbortSignal) => Promise<readonly FileTreeEntry[]>;
  onLoadError?: (entry: FileTreeEntry, error: unknown) => void;
}

export function fileTree(doc: Document, entries: readonly FileTreeEntry[], options: FileTreeOptions): HTMLUListElement {
  return createFileTree(doc, entries, options).element;
}

export function createFileTree(doc: Document, entries: readonly FileTreeEntry[], options: FileTreeOptions) {
  const tree = doc.createElement('ul');
  tree.className = 'im-tree';
  tree.setAttribute('role', 'tree');
  tree.setAttribute('aria-label', options.label);
  const expanded = new Set(options.expanded);
  const loaded = new Map<string, readonly FileTreeEntry[]>();
  const pending = new Map<string, Promise<boolean>>();
  const lifetime = new AbortController();
  let navigation = 0;
  let prefix = '';
  let typedAt = 0;
  const childrenOf = (entry: FileTreeEntry) => entry.children ?? loaded.get(entry.id);
  const isFolder = (entry: FileTreeEntry) => entry.children !== undefined || entry.lazy === true;
  const canExpand = (entry: FileTreeEntry) => (childrenOf(entry)?.length ?? (entry.lazy ? 1 : 0)) > 0;
  let selected = options.selected;
  let active = options.active ?? selected ?? entries[0]?.id;
  type Row = { entry: FileTreeEntry; parent?: string; element: HTMLLIElement };
  let rows: Row[] = [];

  function draw(focus = false): void {
    const fragment = doc.createDocumentFragment();
    rows = [];
    function append(group: readonly FileTreeEntry[], level: number, parent?: string): void {
      group.forEach((entry, index) => {
        const row = doc.createElement('li');
        row.className = 'im-tree-item';
        row.dataset.imEntry = entry.id;
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-level', String(level));
        row.setAttribute('aria-posinset', String(index + 1));
        row.setAttribute('aria-setsize', String(group.length));
        row.setAttribute('aria-selected', String(selected === entry.id));
        row.style.setProperty('--im-level', String(level - 1));
        if (pending.has(entry.id)) row.setAttribute('aria-busy', 'true');
        if (canExpand(entry)) row.setAttribute('aria-expanded', String(expanded.has(entry.id)));
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
        if (expanded.has(entry.id)) append(childrenOf(entry) ?? [], level + 1, entry.id);
      });
    }
    append(entries, 1);
    if (rows.length && !rows.some(row => row.entry.id === active)) {
      active = rows[0].entry.id;
      rows[0].element.tabIndex = 0;
    }
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

  function load(entry: FileTreeEntry): Promise<boolean> {
    if (childrenOf(entry) || !entry.lazy) return Promise.resolve(true);
    const underway = pending.get(entry.id);
    if (underway) return underway;
    const request = Promise.resolve().then(async () => {
      if (lifetime.signal.aborted) return false;
      if (!options.loadChildren) throw new Error('A lazy folder requires loadChildren');
      const children = await options.loadChildren(entry, lifetime.signal);
      if (lifetime.signal.aborted) return false;
      loaded.set(entry.id, children);
      return true;
    }).catch(error => {
      expanded.delete(entry.id);
      if (!lifetime.signal.aborted) options.onLoadError?.(entry, error);
      return false;
    }).finally(() => {
      pending.delete(entry.id);
      if (!lifetime.signal.aborted) draw(tree.contains(doc.activeElement));
    });
    pending.set(entry.id, request);
    return request;
  }

  function toggle(row: Row): void {
    if (expanded.has(row.entry.id)) expanded.delete(row.entry.id);
    else {
      expanded.add(row.entry.id);
      void load(row.entry).then(ok => {
        if (ok && expanded.has(row.entry.id) && !lifetime.signal.aborted) loadExpanded(childrenOf(row.entry) ?? []);
      });
    }
    draw(true);
    options.onToggle?.(row.entry, expanded.has(row.entry.id));
  }

  const fromEvent = (event: Event) => rows.find(row => row.element.contains(event.target as Node));
  tree.addEventListener('click', event => {
    const row = fromEvent(event);
    if (!row) return;
    navigation++;
    move(row);
    if (event.target === row.element.firstChild && canExpand(row.entry)) toggle(row);
    else select(row.entry);
  }, { signal: lifetime.signal });
  tree.addEventListener('dblclick', event => {
    const row = fromEvent(event);
    if (!row || event.target === row.element.firstChild) return;
    if (canExpand(row.entry)) toggle(row);
    else if (!isFolder(row.entry)) options.onOpen?.(row.entry);
  }, { signal: lifetime.signal });
  tree.addEventListener('keydown', event => {
    const row = fromEvent(event);
    if (!row || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.isComposing) return;
    navigation++;
    const index = rows.indexOf(row);
    switch (event.key) {
      case 'ArrowDown': move(rows[index + 1]); break;
      case 'ArrowUp': move(rows[index - 1]); break;
      case 'Home': move(rows[0]); break;
      case 'End': move(rows.at(-1)); break;
      case 'ArrowRight':
        if (canExpand(row.entry)) {
          if (expanded.has(row.entry.id)) move(rows[index + 1]?.parent === row.entry.id ? rows[index + 1] : undefined);
          else toggle(row);
        }
        break;
      case 'ArrowLeft':
        if (canExpand(row.entry) && expanded.has(row.entry.id)) toggle(row);
        else move(rows.find(item => item.entry.id === row.parent));
        break;
      case ' ': select(row.entry); break;
      case 'Enter':
        if (canExpand(row.entry)) toggle(row);
        else { select(row.entry); if (!isFolder(row.entry)) options.onOpen?.(row.entry); }
        break;
      default: {
        if (event.key.length !== 1 || !event.key.trim()) return;
        const now = Date.now();
        const letter = event.key.toLocaleLowerCase();
        prefix = now - typedAt < 700 ? prefix + letter : letter;
        typedAt = now;
        const needle = [...prefix].every(c => c === letter) ? letter : prefix;
        const candidates = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
        move(candidates.find(item => item.entry.name.toLocaleLowerCase().startsWith(needle)));
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }, { signal: lifetime.signal });
  /** Resolve an ancestor-to-leaf chain of IDs, including folders that have never been read. */
  async function reveal(ids: readonly string[], focus = false): Promise<boolean> {
    const revision = ++navigation;
    let group = entries;
    for (const [index, id] of ids.entries()) {
      const entry = group.find(item => item.id === id);
      if (!entry || lifetime.signal.aborted || revision !== navigation) return false;
      if (index === ids.length - 1) {
        active = id;
        draw(focus || tree.contains(doc.activeElement));
        select(entry);
        rows.find(row => row.entry.id === id)?.element.scrollIntoView({ block: 'nearest' });
        return true;
      }
      if (!isFolder(entry)) return false;
      expanded.add(entry.id);
      const ready = load(entry);
      draw(tree.contains(doc.activeElement));
      if (!await ready) return false;
      group = childrenOf(entry) ?? [];
    }
    return false;
  }
  function loadExpanded(group: readonly FileTreeEntry[]): void {
    for (const entry of group) {
      if (!expanded.has(entry.id) || !isFolder(entry)) continue;
      const children = childrenOf(entry);
      if (children) loadExpanded(children);
      else void load(entry).then(ok => {
        if (ok && expanded.has(entry.id) && !lifetime.signal.aborted) loadExpanded(childrenOf(entry) ?? []);
      });
    }
  }
  loadExpanded(entries);
  draw();
  return { element: tree, reveal, destroy() { lifetime.abort(); tree.remove(); } };
}
