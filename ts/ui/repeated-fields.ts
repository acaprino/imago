const firstControl = 'input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)';

/** Appends trusted component markup and gives the new row its first editing focus. */
export function appendRepeatedFieldRow(container: HTMLElement, markup: string, options: { focusSelector?: string } = {}): void {
  container.insertAdjacentHTML('beforeend', markup);
  container.lastElementChild?.querySelector<HTMLElement>(options.focusSelector ?? firstControl)?.focus();
}

/** Removing a row keeps the keyboard beside the edit: next row, previous row, then Add. */
export function removeRepeatedFieldRow(row: Element, options: { focusSelector?: string; fallback?: HTMLElement | null } = {}): void {
  const sibling = row.nextElementSibling ?? row.previousElementSibling;
  const next = sibling?.querySelector<HTMLElement>(options.focusSelector ?? firstControl);
  row.remove();
  (next ?? options.fallback)?.focus();
}
