/** Keep the elements and interactive state of retained rows across snapshots.
 * The host owns row content. Releasing a key also releases its update closure. */
export function keyedList<T>(
  parent: HTMLElement,
  keyOf: (value: T) => string,
  create: (value: T) => { element: HTMLElement; update?: (value: T) => void },
) {
  const rows = new Map<string, ReturnType<typeof create>>();
  return (values: readonly T[]) => {
    const next = new Map(values.map(value => [keyOf(value), value]));
    for (const [key, row] of rows) {
      if (next.has(key)) continue;
      row.element.remove();
      rows.delete(key);
    }
    let anchor = parent.firstElementChild;
    for (const [key, value] of next) {
      let row = rows.get(key);
      if (!row) { row = create(value); rows.set(key, row); }
      row.update?.(value);
      if (row.element !== anchor) {
        if (row.element.parentElement === parent && typeof parent.moveBefore === 'function') {
          parent.moveBefore(row.element, anchor);
        } else {
          const focused = parent.ownerDocument.activeElement;
          parent.insertBefore(row.element, anchor);
          if (focused instanceof HTMLElement && row.element.contains(focused)) focused.focus({ preventScroll: true });
        }
      }
      anchor = row.element.nextElementSibling;
    }
  };
}
