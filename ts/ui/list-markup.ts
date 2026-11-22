import { escapeHtml, iconButtonHtml, iconHtml, type MarkupAttributes } from './markup.ts';

// String rendering for the parts of a hierarchical list (the sidebar's): the head of a group and the actions at the end of a
// row. Text and attribute values are escaped here. What `sidebarHtml` writes by default is not changed by them: the app
// writes these parts into the `rowsHtml` it gives it.

export interface ListGroupOptions {
  /** The group's label, which is also its accessible name. */
  label: string;
  /** The id of the head: the app's `role="group"` over the group's rows names itself by it (`aria-labelledby`). */
  id?: string;
  /** How many things the group holds: an `im-count` after the label. Without it the head has no count. */
  count?: number;
  /** An icon, written first. It is all the head shows in the rail: without it the head is not drawn there. */
  icon?: string;
  /**
   * Makes the head a `button` with `aria-expanded` that folds the group: `expanded` says whether its rows are shown, `action`
   * is the `data-action` the app's handler reads (and `id` the optional `data-id`). A head without it is a label.
   */
  fold?: { expanded: boolean; action: string; id?: string };
}

/**
 * The head of a group of rows: a label, not a row. A head that folds is a `button` with `aria-expanded` and a chevron at its
 * end; one that does not is a `div` with no role. The count, when given, follows the label. The head carries the whole label as
 * its `title`: it is cut with an ellipsis when it is longer than its room, and it is the rail's tooltip.
 */
export function listGroupHtml(options: ListGroupOptions): string {
  const { label, id, count, icon, fold } = options;
  const folds = fold !== undefined && typeof fold.expanded === 'boolean';
  const inner = (icon ? iconHtml(icon) : '') + `<span>${escapeHtml(label)}</span>`
    + (typeof count === 'number' && Number.isFinite(count) ? `<span class="im-count">${count}</span>` : '')
    + (folds ? iconHtml('chevron') : '');
  const idAttribute = (id === undefined ? '' : ` id="${escapeHtml(id)}"`) + ` title="${escapeHtml(label)}"`;
  if (!folds) return `<div class="im-list-group"${idAttribute}>${inner}</div>`;
  const data = fold.id === undefined ? '' : ` data-id="${escapeHtml(fold.id)}"`;
  return `<button type="button" class="im-list-group"${idAttribute} aria-expanded="${fold.expanded}" data-action="${escapeHtml(fold.action)}"${data}>${inner}</button>`;
}

export interface RowAction {
  /** The action's accessible name and its tooltip. */
  label: string;
  /** The `data-action` the app's handler reads. */
  action: string;
  /** The icon name. */
  icon: string;
  /** The optional `data-id`. */
  id?: string;
  disabled?: boolean;
  attrs?: MarkupAttributes;
}

/** The most actions a row has at its end: it has room for two. */
const ROW_ACTIONS_MAX = 2;

/**
 * The actions at the end of a row: at most two icon buttons in one `im-row-actions`, shown while the row is used (hovered,
 * holding focus, selected) and out of sight, but in its place, otherwise. No action writes nothing. A third is refused.
 */
export function rowActionsHtml(actions: readonly RowAction[]): string {
  if (actions.length > ROW_ACTIONS_MAX) throw new RangeError(`A row has room for ${ROW_ACTIONS_MAX} actions, not ${actions.length}`);
  if (actions.length === 0) return '';
  return `<span class="im-row-actions">${actions.map(({ label, action, icon, id, disabled, attrs }) => iconButtonHtml(label, action, icon, { id, disabled, attrs })).join('')}</span>`;
}
