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
  type Row = { entry: FileTreeEntry; parent?: string; element: HTMLLIElement; level: number };
  const byId = new Map<string, Row>();
  const changed = new Set<string>();
  const rowFor = (element: Element | null): Row | undefined => {
    const id = (element as HTMLElement | null)?.dataset.imEntry;
    return id === undefined ? undefined : byId.get(id);
  };

  function setAttribute(row: HTMLElement, name: string, value: string | null) {
    if (row.getAttribute(name) === value) return;
    if (value === null) row.removeAttribute(name);
    else row.setAttribute(name, value);
  }

  function createRow(entry: FileTreeEntry, level: number, index: number, count: number, parent?: string): Row {
    const element = doc.createElement('li');
    element.className = 'im-tree-item';
    element.dataset.imEntry = entry.id;
    element.setAttribute('role', 'treeitem');
    element.setAttribute('aria-level', String(level));
    element.setAttribute('aria-posinset', String(index + 1));
    element.setAttribute('aria-setsize', String(count));
    element.style.setProperty('--im-level', String(level - 1));
    const chevron = doc.createElement('span');
    chevron.className = 'im-tree-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▸';
    const label = doc.createElement('span');
    label.className = 'im-tree-label';
    label.textContent = label.title = entry.name;
    element.append(chevron, label);
    return { entry, parent, element, level };
  }

  function setFolderState({ entry, element }: Row) {
    setAttribute(element, 'aria-busy', pending.has(entry.id) ? 'true' : null);
    setAttribute(element, 'aria-expanded', canExpand(entry) ? String(expanded.has(entry.id)) : null);
  }

  function insert(group: readonly FileTreeEntry[], level: number, parent?: string, before: Element | null = null) {
    const fragment = doc.createDocumentFragment();
    function append(siblings: readonly FileTreeEntry[], depth: number, parentId?: string) {
      siblings.forEach((entry, index) => {
        const row = createRow(entry, depth, index, siblings.length, parentId);
        byId.set(entry.id, row);
        setFolderState(row);
        row.element.setAttribute('aria-selected', String(selected === entry.id));
        row.element.tabIndex = entry.id === active ? 0 : -1;
        fragment.append(row.element);
        if (expanded.has(entry.id)) append(childrenOf(entry) ?? [], depth + 1, entry.id);
      });
    }
    append(group, level, parent);
    tree.insertBefore(fragment, before);
  }

  function updateBranch(id: string) {
    const row = byId.get(id);
    if (!row) return;
    setFolderState(row);
    let next = rowFor(row.element.nextElementSibling);
    if (expanded.has(id)) {
      const children = childrenOf(row.entry);
      if (children?.length && next?.parent !== id) insert(children, row.level + 1, id, row.element.nextElementSibling);
    } else {
      while (next && next.level > row.level) {
        byId.delete(next.entry.id);
        next.element.remove();
        next = rowFor(row.element.nextElementSibling);
      }
    }
  }

  function scheduleBranch(id: string) {
    if (!changed.size) queueMicrotask(() => {
      if (!lifetime.signal.aborted) changed.forEach(updateBranch);
      changed.clear();
    });
    changed.add(id);
  }

  function move(row?: Row, focus = true): void {
    if (!row) return;
    const previous = active !== undefined ? byId.get(active) : undefined;
    if (previous) previous.element.tabIndex = -1;
    active = row.entry.id;
    row.element.tabIndex = 0;
    if (focus) row.element.focus();
  }

  function select(entry: FileTreeEntry): void {
    if (selected !== undefined) byId.get(selected)?.element.setAttribute('aria-selected', 'false');
    selected = entry.id;
    byId.get(selected)?.element.setAttribute('aria-selected', 'true');
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
      if (!lifetime.signal.aborted) scheduleBranch(entry.id);
    });
    pending.set(entry.id, request);
    scheduleBranch(entry.id);
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
    updateBranch(row.entry.id);
    move(row);
    options.onToggle?.(row.entry, expanded.has(row.entry.id));
  }

  const fromEvent = (event: Event) => rowFor((event.target as Element).closest?.('[data-im-entry]') ?? null);
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
    const next = rowFor(row.element.nextElementSibling);
    switch (event.key) {
      case 'ArrowDown': move(next); break;
      case 'ArrowUp': move(rowFor(row.element.previousElementSibling)); break;
      case 'Home': move(rowFor(tree.firstElementChild)); break;
      case 'End': move(rowFor(tree.lastElementChild)); break;
      case 'ArrowRight':
        if (canExpand(row.entry)) {
          if (expanded.has(row.entry.id)) move(next?.parent === row.entry.id ? next : undefined);
          else toggle(row);
        }
        break;
      case 'ArrowLeft':
        if (canExpand(row.entry) && expanded.has(row.entry.id)) toggle(row);
        else if (row.parent !== undefined) move(byId.get(row.parent));
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
        let candidate = row;
        do {
          candidate = rowFor(candidate.element.nextElementSibling ?? tree.firstElementChild)!;
          if (candidate.entry.name.toLocaleLowerCase().startsWith(needle)) { move(candidate); break; }
        } while (candidate !== row);
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }, { signal: lifetime.signal });
  /** Resolve an ancestor-to-leaf chain of IDs, including folders that have never been read. */
  async function reveal(ids: readonly string[], focus = false): Promise<boolean> {
    const revision = ++navigation;
    const origin = doc.activeElement;
    let focusMoved = false;
    const moved = () => { focusMoved = true; };
    let group = entries;
    for (const [index, id] of ids.entries()) {
      const entry = group.find(item => item.id === id);
      if (!entry || lifetime.signal.aborted || revision !== navigation) return false;
      if (index === ids.length - 1) {
        const stillHere = !focusMoved && doc.activeElement === origin;
        move(byId.get(id), stillHere && (focus || tree.contains(origin)));
        select(entry);
        if (stillHere) byId.get(id)?.element.scrollIntoView({ block: 'nearest' });
        return true;
      }
      if (!isFolder(entry)) return false;
      expanded.add(entry.id);
      const ready = load(entry);
      updateBranch(entry.id);
      doc.addEventListener('focusin', moved, { once: true, capture: true, signal: lifetime.signal });
      try {
        if (!await ready) return false;
      } finally {
        doc.removeEventListener('focusin', moved, true);
      }
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
  insert(entries, 1);
  if (active === undefined || !byId.has(active)) move(rowFor(tree.firstElementChild), false);
  return { element: tree, reveal, destroy() { lifetime.abort(); tree.remove(); } };
}
