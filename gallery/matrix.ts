// The state matrix of the gallery: one row for every control of gallery/manifest.ts, one column for every state, and in
// each cell the control as the package draws it. Hover, pressed and focus are forced with data-im-force, which
// css/controls.css answers with the same rule as the pseudo-class; every other state is the real attribute
// (disabled, aria-busy, aria-invalid, readonly, aria-selected, aria-pressed, aria-checked, checked). A control drawn on a
// native element has a row of its own under its ARIA twin (gallery/manifest.ts, NATIVE_TWINS). The markup follows the
// contract at the top of css/controls.css, and tests/gallery/controls.mjs measures it.

import { noteHtml } from '../ts/ui/shell-markup.ts';
import { CONTROLS, type State } from './manifest.ts';

const COLUMNS: { state: State; label: string }[] = [
  { state: 'rest', label: 'Rest' },
  { state: 'hover', label: 'Hover' },
  { state: 'press', label: 'Pressed' },
  { state: 'focus', label: 'Focus' },
  { state: 'selected', label: 'Selected' },
  { state: 'disabled', label: 'Disabled' },
  { state: 'busy', label: 'Busy' },
  { state: 'invalid', label: 'Invalid' },
  { state: 'readonly', label: 'Read-only' },
];

const LABELS: Record<string, string> = {
  'button-primary': 'Primary button',
  'button-secondary': 'Secondary button',
  'button-ghost': 'Ghost button',
  'button-danger': 'Danger button',
  'button-confirm-danger': 'Confirming danger button',
  'icon-button': 'Icon button',
  field: 'Field',
  'field-bare': 'Field, the class on the input',
  textarea: 'Text area',
  search: 'Search',
  select: 'Select',
  'select-native': 'Select, native',
  checkbox: 'Checkbox',
  'checkbox-native': 'Checkbox, native',
  radio: 'Radio',
  'radio-native': 'Radio, native',
  switch: 'Switch',
  'switch-native': 'Switch, native',
  tab: 'Tab',
  segmented: 'Segmented',
  'segmented-native': 'Segmented, native radios',
  row: 'Row',
  tree: 'Tree',
  'table-row': 'Table row',
  'menu-item': 'Menu item',
  steps: 'Steps',
  progress: 'Progress',
  key: 'Key cap',
  count: 'Count',
  chip: 'Status chip',
  avatar: 'Avatar',
  facts: 'Facts',
  note: 'Note',
};

const ICONS: Record<string, string> = {
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  chev: '<path d="M7 10l5 5 5-5"/>',
  chevRight: '<path d="M10 7l5 5-5 5"/>',
  reload: '<path d="M19 12a7 7 0 1 1-2.05-4.95M19 5v4h-4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  warn: '<path d="M12 4l9 16H3zM12 10v4M12 17v.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};

const icon = (name: string, extra = ''): string =>
  `<svg class="im-icon${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

/** The attribute that makes a cell look hovered, pressed or focused without a pointer or a key. */
const force = (state: State): string => (state === 'hover' || state === 'press' || state === 'focus' ? ` data-im-force="${state}"` : '');

/** An id that is unique in the page: one cell per control and state. */
const uid = (control: string, state: State, part: string): string => `g-mx-${control}-${state}-${part}`;

const REASON = 'Fix the folder to continue';

// ---- buttons -----------------------------------------------------------------------------------------------------

const BUTTONS: Record<string, { modifier: string; label: string; icon: string }> = {
  'button-primary': { modifier: ' im-btn--primary', label: 'Apply', icon: 'check' },
  'button-secondary': { modifier: '', label: 'Check now', icon: 'reload' },
  'button-ghost': { modifier: ' im-btn--ghost', label: 'Cancel', icon: 'x' },
  'button-danger': { modifier: ' im-btn--danger', label: 'Remove', icon: 'trash' },
  'button-confirm-danger': { modifier: ' im-btn--confirm-danger', label: 'Delete 8 items', icon: 'trash' },
};

// Every button has an icon at rest, because a busy button swaps the icon for the spinner and keeps its width.
function button(control: string, state: State): string {
  const { modifier, label, icon: name } = BUTTONS[control];
  const mark = state === 'busy' ? '<span class="im-spinner" aria-hidden="true"></span>' : icon(name);
  const attrs = (state === 'disabled' ? ` disabled title="${REASON}"` : '') + (state === 'busy' ? ' aria-busy="true"' : '') +
    (state === 'selected' ? ' aria-pressed="true"' : '');
  return `<button type="button" class="im-btn${modifier}" tabindex="-1"${force(state)}${attrs}>${mark}<span>${label}</span></button>`;
}

function iconButton(state: State): string {
  const attrs = state === 'disabled' ? ` disabled title="${REASON}"` : '';
  return `<button type="button" class="im-icon-btn" aria-label="Settings" title="Settings" tabindex="-1"${force(state)}${attrs}>${icon('sliders')}</button>`;
}

// ---- fields ------------------------------------------------------------------------------------------------------

function field(state: State): string {
  const input = uid('field', state, 'input');
  const error = uid('field', state, 'error');
  const attrs =
    (state === 'disabled' ? ' disabled' : '') +
    (state === 'readonly' ? ' readonly' : '') +
    (state === 'invalid' ? ` aria-invalid="true" aria-describedby="${error}"` : '');
  const value = state === 'invalid' ? 'C:/Users/you/.claud' : 'C:/Users/you/.claude';
  const message = state === 'invalid' ? `<span class="im-field-error" id="${error}">Error: this folder does not exist.</span>` : '';
  return `<div class="im-field"><label class="im-field-label" for="${input}">Folder</label><span class="im-input im-input--code"${force(state)}><input id="${input}" type="text" value="${value}" tabindex="-1"${attrs}></span>${message}</div>`;
}

// The same field with im-input on the input itself, as uiInput() writes it: no box round it, the same drawing and states.
function bareField(state: State): string {
  const input = uid('field-bare', state, 'input');
  const error = uid('field-bare', state, 'error');
  const attrs =
    (state === 'disabled' ? ' disabled' : '') +
    (state === 'readonly' ? ' readonly' : '') +
    (state === 'invalid' ? ` aria-invalid="true" aria-describedby="${error}"` : '');
  const value = state === 'invalid' ? 'C:/Users/you/.claud' : 'C:/Users/you/.claude';
  const message = state === 'invalid' ? `<span class="im-field-error" id="${error}">Error: this folder does not exist.</span>` : '';
  return `<div class="im-field"><label class="im-field-label" for="${input}">Folder</label><input class="im-input im-input--code" id="${input}" type="text" value="${value}" tabindex="-1"${force(state)}${attrs}>${message}</div>`;
}

// The field's drawing on a text area: the same states, on the element itself.
function textarea(state: State): string {
  const input = uid('textarea', state, 'input');
  const error = uid('textarea', state, 'error');
  const attrs =
    (state === 'disabled' ? ' disabled' : '') +
    (state === 'readonly' ? ' readonly' : '') +
    (state === 'invalid' ? ` aria-invalid="true" aria-describedby="${error}"` : '');
  const message = state === 'invalid' ? `<span class="im-field-error" id="${error}">Error: say what the change does.</span>` : '';
  return `<div class="im-field"><label class="im-field-label" for="${input}">Note</label><textarea class="im-textarea" id="${input}" rows="2" tabindex="-1"${force(state)}${attrs}>Rename the folder</textarea>${message}</div>`;
}

function search(state: State): string {
  const disabled = state === 'disabled' ? ' disabled' : '';
  return `<label class="im-input"${force(state)}>${icon('search')}<input type="search" placeholder="Search this view" aria-label="Search this view" tabindex="-1"${disabled}><kbd class="im-key">Ctrl F</kbd></label>`;
}

function select(state: State): string {
  const label = uid('select', state, 'label');
  const value = uid('select', state, 'value');
  const disabled = state === 'disabled' ? ' disabled' : '';
  return `<div class="im-field"><span class="im-field-label" id="${label}">Harness</span><button type="button" class="im-select" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${label} ${value}" tabindex="-1"${force(state)}${disabled}><span id="${value}">Codex</span>${icon('chev')}</button></div>`;
}

function nativeSelect(state: State): string {
  const id = uid('select-native', state, 'select');
  const disabled = state === 'disabled' ? ' disabled' : '';
  return `<div class="im-field"><label class="im-field-label" for="${id}">Harness</label><select class="im-select" id="${id}" tabindex="-1"${force(state)}${disabled}><option>Codex</option><option>Claude Code</option></select></div>`;
}

// ---- check, radio, switch ----------------------------------------------------------------------------------------

const ROLES: Record<string, string> = { check: 'checkbox', radio: 'radio', switch: 'switch' };

function option(kind: 'check' | 'radio' | 'switch', state: State, label: string): string {
  const one = (checked: string, extra = '', name = label): string =>
    `<span class="im-${kind}" role="${ROLES[kind]}" aria-checked="${checked}" aria-label="${name}" tabindex="-1"${extra}></span>`;
  const wrap = (control: string, text = label): string => `<span class="im-option">${control}${text}</span>`;
  switch (state) {
    case 'hover':
    case 'focus':
      return wrap(one('false', force(state)));
    case 'selected':
      // A checkbox also shows its third value here.
      return wrap(one('true')) + (kind === 'check' ? `<span class="im-option" style="margin-left:10px">${one('mixed', '', 'Part')}Part</span>` : '');
    case 'disabled':
      return wrap(one('true', ' aria-disabled="true"'));
    default:
      return wrap(one('false'));
  }
}

// The same three on native inputs, in their real states: checked, disabled, and the mixed checkbox made indeterminate by
// the mount (gallery/mount/matrix.ts), since no attribute says it.
function nativeOption(kind: 'check' | 'radio' | 'switch', state: State, label: string): string {
  const type = kind === 'radio' ? 'radio' : 'checkbox';
  const extra = (kind === 'switch' ? ' role="switch"' : '') + (kind === 'radio' ? ` name="${uid('radio-native', state, 'group')}"` : '');
  const one = (attrs = '', text = label, style = ''): string =>
    `<label class="im-option"${style}><input type="${type}" class="im-${kind}"${extra} tabindex="-1"${attrs}>${text}</label>`;
  switch (state) {
    case 'hover':
    case 'focus':
      return one(force(state));
    case 'selected':
      return one(' checked') + (kind === 'check' ? one(' data-indeterminate', 'Part', ' style="margin-left:10px"') : '');
    case 'disabled':
      return one(' checked disabled');
    default:
      return one();
  }
}

// ---- tabs, segmented, rows, tree, table, menu --------------------------------------------------------------------

function tab(state: State): string {
  const attrs = state === 'disabled' ? ` disabled title="${REASON}"` : '';
  return `<span class="im-tabs" role="tablist" aria-label="Views"><button type="button" class="im-tab" role="tab" aria-selected="${state === 'selected'}" tabindex="-1"${force(state)}${attrs}>Activity</button></span>`;
}

// The state sits on the first segment; the other two stay at rest so the segment is seen against its neighbours.
function segmented(state: State): string {
  const attrs = state === 'disabled' ? ` disabled title="${REASON}"` : '';
  return `<div class="im-seg" role="tablist" aria-label="View"><button type="button" role="tab" aria-selected="${state === 'selected'}" tabindex="-1"${force(state)}${attrs}>Graph</button><button type="button" role="tab" aria-selected="false" tabindex="-1">Lanes</button><button type="button" role="tab" aria-selected="false" tabindex="-1">Feed</button></div>`;
}

// The same segments as labels over native radios: checked is selected, the forced state sits on the label.
function nativeSegmented(state: State): string {
  const name = uid('segmented-native', state, 'group');
  const segment = (text: string, input = '', label = ''): string =>
    `<label${label}><input type="radio" name="${name}" value="${text.toLowerCase()}" tabindex="-1"${input}><span>${text}</span></label>`;
  const input = (state === 'selected' ? ' checked' : '') + (state === 'disabled' ? ' disabled' : '');
  const label = force(state) + (state === 'disabled' ? ` title="${REASON}"` : '');
  return `<div class="im-seg" role="radiogroup" aria-label="View">${segment('Graph', input, label)}${segment('Lanes')}${segment('Feed')}</div>`;
}

function row(state: State): string {
  const attrs = state === 'disabled' ? ` aria-disabled="true" title="${REASON}"` : ' title="hop-review"';
  return `<div role="listbox" aria-label="Rooms"><div class="im-row im-row--1" role="option" aria-selected="${state === 'selected'}" tabindex="-1"${force(state)}${attrs}><span class="im-row-text"><span class="im-row-title">hop-review</span></span></div></div>`;
}

// The item under test is the first; the next two show the indent of a child and of a leaf, 16px a level.
function tree(state: State): string {
  const attrs = state === 'disabled' ? ` aria-disabled="true" title="${REASON}"` : '';
  const item = (label: string, level: number, expanded: boolean | null, extra = ''): string =>
    `<li class="im-tree-item" role="treeitem" aria-level="${level + 1}"${expanded === null ? '' : ` aria-expanded="${expanded}"`} style="--im-level: ${level}" tabindex="-1"${extra}>${icon('chevRight', ' im-tree-chevron')}<span class="im-tree-label">${label}</span></li>`;
  return `<ul class="im-tree" role="tree" aria-label="Files">${item('src', 0, true, ` aria-selected="${state === 'selected'}"${force(state)}${attrs}`)}${item('components', 1, false, ' aria-selected="false"')}${item('index.ts', 1, null, ' aria-selected="false"')}</ul>`;
}

function tableRow(state: State): string {
  return `<table class="im-table" aria-label="Items"><tbody><tr aria-selected="${state === 'selected'}" tabindex="-1"${force(state)}><td><span class="im-cell-title">Cookies</span><span class="im-cell-sub">Sites stay signed in</span></td><td class="im-num">40.0 MB</td></tr></tbody></table>`;
}

function menuItem(state: State): string {
  const attrs = (state === 'selected' ? ' aria-selected="true"' : '') + (state === 'disabled' ? ` aria-disabled="true" title="${REASON}"` : '');
  return `<div class="im-float im-menu" role="menu" aria-label="Actions" style="position:static;animation:none"><button type="button" class="im-menu-item" role="menuitem" tabindex="-1"${force(state)}${attrs}><span>Check now</span><span class="im-keys"><kbd class="im-key">r</kbd></span></button></div>`;
}

// ---- progress, steps and the controls that only show ------------------------------------------------------------

function steps(state: State): string {
  const item = (kind: 'done' | 'now' | 'todo', index: number, title: string, sub: string): string =>
    `<li data-im-step="${kind}"${kind === 'now' ? ' aria-current="step"' : ''}><span class="im-step-index">${kind === 'done' ? icon('check') : index}</span><span class="im-step-text"><span class="im-step-title">${title}</span><span class="im-step-sub">${sub}</span></span></li>`;
  const kinds: ('done' | 'now' | 'todo')[] = state === 'selected' ? ['done', 'now', 'todo'] : ['todo', 'todo', 'todo'];
  const items = [['Scan', 'Inventory'], ['Analyze', 'By technology'], ['Union', 'Join the graphs']];
  return `<ol class="im-steps" aria-label="Analysis steps">${items.map(([title, sub], x) => item(kinds[x], x + 1, title, sub)).join('')}</ol>`;
}

function progress(state: State): string {
  if (state === 'busy') return `<div class="im-progress-row"><div class="im-progress" role="progressbar" aria-label="Analysis" aria-busy="true"></div><span class="im-progress-value">Working</span></div>`;
  return `<div class="im-progress-row"><div class="im-progress" role="progressbar" aria-label="Analysis" aria-valuemin="0" aria-valuemax="100" aria-valuenow="64" style="--im-progress: 64"></div><span class="im-progress-value">64%</span></div>`;
}

const chips = (): string =>
  ['ok|open', 'warn|waiting', 'err|blocked', 'info|running', 'accent|demo', '|closed']
    .map((entry) => {
      const [tone, text] = entry.split('|');
      return `<span class="im-chip"${tone ? ` data-im-tone="${tone}"` : ''}>${text}</span>`;
    })
    .join('');

const facts = (): string =>
  `<dl class="im-facts" style="padding:0"><dt>Harness</dt><dd>Claude Code</dd><dt>Folder</dt><dd class="im-facts-code">C:\\work\\acme</dd></dl>`;

const note = (): string =>
  noteHtml({ icon: 'warning', title: '3 changes ready to apply', message: 'Nothing changes until you apply.', tone: 'warn' });

/** The markup of one control in one state: what goes inside its cell. */
export function cellMarkup(control: string, state: State): string {
  if (control in BUTTONS) return button(control, state);
  switch (control) {
    case 'icon-button': return iconButton(state);
    case 'field': return field(state);
    case 'field-bare': return bareField(state);
    case 'textarea': return textarea(state);
    case 'search': return search(state);
    case 'select': return select(state);
    case 'select-native': return nativeSelect(state);
    case 'checkbox': return option('check', state, 'Keep');
    case 'checkbox-native': return nativeOption('check', state, 'Keep');
    case 'radio': return option('radio', state, 'Trash');
    case 'radio-native': return nativeOption('radio', state, 'Trash');
    case 'switch': return option('switch', state, 'Sync');
    case 'switch-native': return nativeOption('switch', state, 'Sync');
    case 'tab': return tab(state);
    case 'segmented': return segmented(state);
    case 'segmented-native': return nativeSegmented(state);
    case 'row': return row(state);
    case 'tree': return tree(state);
    case 'table-row': return tableRow(state);
    case 'menu-item': return menuItem(state);
    case 'steps': return steps(state);
    case 'progress': return progress(state);
    case 'key': return '<kbd class="im-key">Ctrl ⇧ T</kbd> <kbd class="im-key">↵</kbd>';
    case 'count': return '<span class="im-count">18</span>';
    case 'chip': return chips();
    case 'avatar': return '<span class="im-avatar">CA</span> <span class="im-avatar">OC</span>';
    case 'facts': return facts();
    case 'note': return note();
    default: throw new Error(`gallery/matrix.ts has no markup for the control "${control}"`);
  }
}

// A label of 60 characters in a box of 220px: the button, the tab and the row keep their height and end in an ellipsis,
// and each carries the whole label as its title.
const LONG_LABEL = 'Rename the configuration folder of every harness in this app';

function longLabels(): string {
  return `<div class="g-mx-long"><h3>A label of 60 characters</h3><div class="g-mx-long-box" data-specimen="long-label">
    <button type="button" class="im-btn" title="${LONG_LABEL}" tabindex="-1">${icon('reload')}<span>${LONG_LABEL}</span></button>
    <span class="im-tabs" role="tablist" aria-label="Views"><button type="button" class="im-tab" role="tab" aria-selected="false" title="${LONG_LABEL}" tabindex="-1">${LONG_LABEL}</button></span>
    <div role="listbox" aria-label="Rooms"><div class="im-row im-row--1" role="option" aria-selected="false" title="${LONG_LABEL}" tabindex="-1"><span class="im-row-text"><span class="im-row-title">${LONG_LABEL}</span></span></div></div>
  </div></div>`;
}

// What lays a fill under text, in the states that do (rest, hover, pressed, selected): a row and a table row, each with the
// things an app puts in a row (a chip of every tone and a chip without one, a count, an avatar), and the buttons with a key
// cap, whose wash of hover and press is under their label and their key. The fill is under the text, which is read on what
// results; tests/gallery/controls.mjs measures every text of it like a matrix cell. These are not in the manifest (the
// manifest is the list of controls), so they carry no [data-control].
const FILL_STATES: State[] = ['rest', 'hover', 'press', 'selected'];
const WASH_STATES: State[] = ['rest', 'hover', 'press'];

function fillRows(): string {
  const list = FILL_STATES.map(
    (state) =>
      `<div class="im-row" role="option" aria-selected="${state === 'selected'}" tabindex="-1" data-fill-row="row" data-state="${state}"${force(state)}><span class="im-row-text"><span class="im-row-title">hop-review</span><span class="im-row-sub">4 members · 11 events · 12:02</span></span>${chips()}<span class="im-count">18</span><span class="im-avatar">CA</span></div>`,
  ).join('');
  const table = FILL_STATES.map(
    (state) =>
      `<tr aria-selected="${state === 'selected'}" tabindex="-1" data-fill-row="table-row" data-state="${state}"${force(state)}><td><span class="im-cell-title">Cookies</span><span class="im-cell-sub">Sites stay signed in</span></td><td>${chips()}</td><td class="im-num">40.0 MB</td></tr>`,
  ).join('');
  const buttons = WASH_STATES.map(
    (state) =>
      `<div class="g-mx-buttons" data-fill-row="buttons" data-state="${state}">${['', ' im-btn--ghost', ' im-btn--primary', ' im-btn--danger']
        .map((modifier) => `<button type="button" class="im-btn${modifier}" tabindex="-1"${force(state)}><span>Check now</span><kbd class="im-key">r</kbd></button>`)
        .join('')}</div>`,
  ).join('');
  return `<div class="g-mx-long"><h3>Chips, a count and an avatar in a row and in a table row; buttons with a key cap</h3><div class="g-mx-fill" data-specimen="fill-rows"><div role="listbox" aria-label="Rooms">${list}</div><table class="im-table" aria-label="Items"><tbody>${table}</tbody></table>${buttons}</div></div>`;
}

/** The matrix table: a cell [data-control][data-state] for every pair of the manifest, a dash where a state does not apply. */
export function matrixMarkup(): string {
  const head = COLUMNS.map(({ label }) => `<th scope="col">${label}</th>`).join('');
  const rows = CONTROLS.map(({ id, states }) => {
    const cells = COLUMNS.map(({ state }) =>
      states.includes(state)
        ? `<td data-control="${id}" data-state="${state}">${cellMarkup(id, state)}</td>`
        : '<td class="g-mx-na"><span role="img" aria-label="Does not apply">—</span></td>',
    ).join('');
    return `<tr><th scope="row">${LABELS[id] ?? id}</th>${cells}</tr>`;
  }).join('');
  return `<div class="g-mx-wrap"><table class="g-mx"><thead><tr><th scope="col">Control</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>${longLabels()}${fillRows()}`;
}

/** The look of the matrix page itself (the table around the controls); the controls are drawn by css/controls.css. */
export const MATRIX_CSS = `
.g-mx-section h2 { margin: 0; font: 600 22px/1.2 var(--g-font-display); }
.g-mx-section p { margin: 0; max-width: 72ch; color: var(--g-ink-2); }
.g-mx-surface { padding: 16px; background: var(--im-ground); color: var(--im-text); border-radius: 10px; font: 400 13px/1.45 var(--im-font-text); -webkit-user-select: none; user-select: none; cursor: default; }
.g-mx-wrap { overflow-x: auto; }
.g-mx { width: 100%; min-width: 1320px; border-collapse: separate; border-spacing: 0; background: var(--im-sheet); border-radius: var(--im-r-sheet); }
.g-mx th { padding: 10px 12px; text-align: left; white-space: nowrap; font: 600 12px/1.2 var(--im-font-text); color: var(--im-muted); border-bottom: 1px solid var(--im-line); }
.g-mx td { padding: 10px 12px; vertical-align: middle; border-bottom: 1px solid var(--im-line-soft); }
.g-mx tbody th { color: var(--im-text); }
.g-mx tbody tr:last-child > * { border-bottom: 0; }
.g-mx .g-mx-na { color: var(--im-muted); }
.g-mx .im-input, .g-mx .im-select, .g-mx .im-textarea { width: 152px; }
.g-mx label.im-input:has(input[type="search"]) { width: 210px; }
.g-mx .im-row, .g-mx .im-tree, .g-mx .im-table, .g-mx .im-progress-row { width: 152px; }
.g-mx .im-progress-row { min-width: 0; }
.g-mx .im-steps { width: 210px; grid-template-columns: minmax(0, 1fr); }
.g-mx .im-note { width: 280px; }
.g-mx .im-menu { width: 200px; max-width: none; }
.g-mx-long { display: grid; gap: 10px; margin-top: 16px; }
.g-mx-long h3 { margin: 0; font: 600 12px/1.2 var(--im-font-text); color: var(--im-muted); }
.g-mx-long-box { display: grid; gap: 10px; justify-items: start; width: 220px; }
.g-mx-long-box > [role="listbox"] { width: 100%; }
.g-mx-fill { display: grid; gap: 10px; width: 760px; max-width: 100%; }
.g-mx-fill > [role="listbox"] { display: grid; gap: 4px; }
.g-mx-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
`;
