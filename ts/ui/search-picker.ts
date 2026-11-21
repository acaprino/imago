import { claimKey } from './key-claim.ts';

export interface PickerItem {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}

export interface SearchPickerOptions<T extends PickerItem> {
  label: string;
  loading: string;
  empty: string;
  errorText: (error: unknown) => string;
  search: (query: string, signal: AbortSignal) => Promise<readonly T[]>;
  onChoose: (item: T) => void | Promise<void>;
  /** An independent, persistent selection such as inclusion in a sidebar. Shift+Enter toggles it. */
  mark?: { label: string; checked: (item: T) => boolean; available?: (item: T) => boolean; key?: (item: T) => string; toggle: (item: T) => void | Promise<void> };
}

let nextPicker = 0;

/** An editable combobox. Mount inline or inside an anchored sheet; the host orders its results. */
export function searchPicker<T extends PickerItem>(doc: Document, options: SearchPickerOptions<T>) {
  const element = doc.createElement('div');
  element.className = 'im-search-picker';
  const field = doc.createElement('label');
  field.className = 'im-input';
  const input = doc.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = options.label;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', options.label);
  input.setAttribute('aria-autocomplete', 'list');
  field.append(input);
  const list = doc.createElement('div');
  list.className = 'im-list';
  list.id = 'im-picker-list-' + ++nextPicker;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', options.label);
  input.setAttribute('aria-controls', list.id);
  const status = doc.createElement('span');
  status.className = 'im-field-hint';
  status.setAttribute('role', 'status');
  const mark = doc.createElement('button');
  mark.type = 'button';
  mark.className = 'im-btn im-btn--ghost';
  mark.setAttribute('aria-keyshortcuts', 'Shift+Enter');
  mark.hidden = true;
  element.append(field, list, status, mark);
  let rows: readonly T[] = [];
  let active = -1;
  let pending: AbortController | undefined;
  let closed = false;
  let disposed = false;
  let operating = false;
  const markable = (item: T) => !!options.mark && options.mark.available?.(item) !== false;
  function select(index: number, scroll = false) {
    list.children[active]?.setAttribute('aria-selected', 'false');
    active = index;
    const row = list.children[active];
    const item = rows[active];
    if (row && item) {
      row.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', row.id);
      if (scroll) row.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
    mark.hidden = !item || !markable(item);
    if (options.mark && item) {
      mark.textContent = options.mark.label + ' · ' + item.label;
      mark.setAttribute('aria-pressed', String(options.mark.checked(item)));
    }
  }
  function paintMarks() {
    if (!options.mark) return;
    for (const [index, row] of Array.from(list.children).entries()) {
      row.querySelector('.im-picker-mark > .im-check')?.setAttribute('aria-checked', String(options.mark.checked(rows[index])));
    }
  }
  function clear() {
    rows = [];
    list.replaceChildren();
    select(-1);
  }
  async function refresh() {
    if (disposed) return;
    pending?.abort();
    const request = new AbortController();
    pending = request;
    const previous = rows[active]?.id;
    closed = false;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    list.setAttribute('aria-busy', 'true');
    clear();
    status.textContent = options.loading;
    try {
      const found = await options.search(input.value, request.signal);
      if (request.signal.aborted) return;
      rows = found;
      for (const [index, item] of rows.entries()) {
        const row = doc.createElement('div');
        row.id = list.id + '-' + index;
        row.className = 'im-row';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', 'false');
        const text = doc.createElement('span');
        text.className = 'im-row-text';
        const label = doc.createElement('span');
        label.className = 'im-row-title';
        label.textContent = item.label;
        text.append(label);
        if (item.detail) {
          const detail = doc.createElement('span');
          detail.className = 'im-row-sub';
          detail.textContent = item.detail;
          text.append(detail);
        }
        if (item.disabled) row.setAttribute('aria-disabled', 'true');
        if (options.mark && markable(item)) {
          const marker = doc.createElement('span');
          marker.className = 'im-picker-mark';
          marker.dataset.imMark = options.mark.key?.(item) ?? item.id;
          marker.title = options.mark.label + ' · ' + item.label;
          marker.setAttribute('aria-hidden', 'true');
          // The mark is drawn as every checkbox is; the button below the list says the state to assistive technology.
          const check = doc.createElement('span');
          check.className = 'im-check';
          check.setAttribute('role', 'checkbox');
          check.setAttribute('aria-checked', 'false');
          marker.append(check);
          marker.onclick = event => {
            event.stopPropagation();
            select(index);
            toggle();
            input.focus();
          };
          row.append(marker);
        }
        row.append(text);
        row.onpointerdown = event => { if (event.pointerType === 'mouse') event.preventDefault(); };
        row.onclick = () => { select(index); void operate(item, false); };
        list.append(row);
      }
      paintMarks();
      select(rows.length ? Math.max(0, rows.findIndex(item => item.id === previous)) : -1);
      status.textContent = rows.length ? '' : options.empty;
    } catch (error) {
      if (!request.signal.aborted) status.textContent = options.errorText(error);
    } finally {
      if (!request.signal.aborted) list.removeAttribute('aria-busy');
    }
  }
  function close() {
    pending?.abort();
    closed = true;
    clear();
    list.hidden = true;
    list.removeAttribute('aria-busy');
    input.setAttribute('aria-expanded', 'false');
    status.textContent = '';
  }
  async function operate(item: T, marking: boolean) {
    if (operating || (marking ? !markable(item) : item.disabled)) return;
    operating = true;
    try {
      if (marking) await options.mark!.toggle(item);
      else await options.onChoose(item);
      if (marking && !closed && !disposed) { paintMarks(); select(active); }
    } catch (error) {
      if (!closed && !disposed) status.textContent = options.errorText(error);
    } finally { operating = false; }
  }
  function toggle() {
    const item = rows[active];
    if (item) void operate(item, true);
  }
  mark.onclick = toggle;
  input.oninput = () => { void refresh(); };
  element.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || closed || event.isComposing || event.keyCode === 229) return;
    close();
    input.focus();
    event.preventDefault();
    claimKey(event); // the picker answered it: its results close, and no command runs on it
    event.stopPropagation();
  });
  input.onkeydown = event => {
    if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (closed) void refresh();
      else if (rows.length) select(Math.min(rows.length - 1, Math.max(0, active + (event.key === 'ArrowDown' ? 1 : -1))), true);
    } else if (event.key === 'Enter' && !closed) {
      const item = rows[active];
      if (item && event.shiftKey && options.mark) toggle();
      else if (item) void operate(item, false);
    } else return;
    event.preventDefault();
    claimKey(event);
    event.stopPropagation();
  };
  void refresh();
  return { element, input, refresh, close, destroy() { disposed = true; close(); element.remove(); } };
}
