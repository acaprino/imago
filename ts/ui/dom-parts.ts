import { buttonHtml, type ButtonMarkupOptions } from './markup.ts';

/** Mount a single trusted Imago renderer result. User and service text belongs in the renderer's text arguments. */
export function componentElement<T extends HTMLElement = HTMLElement>(componentHtml: string): T {
  const template = document.createElement('template');
  template.innerHTML = componentHtml.trim();
  const node = template.content.firstChild;
  if (template.content.childNodes.length !== 1 || node?.nodeType !== 1 ||
      (node as Element).namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    throw new TypeError('A component must have exactly one root element');
  }
  return document.adoptNode(node) as T;
}

/** Imperative compositions keep event targets, live content and native form state across updates. */
const parts = {
  stack: ['div', 'im-stack'], row: ['div', 'im-inline-row'], toolbar: ['div', 'im-content-toolbar'],
  actions: ['div', 'im-action-row'], panel: ['section', 'im-panel im-surface'], region: ['section', 'im-region'],
  main: ['main', 'im-main'], aside: ['aside', 'im-aside'], header: ['header', 'im-section-heading'],
  footer: ['footer', 'im-footer'], form: ['form', 'im-form'], field: ['label', 'im-field'], label: ['label', 'im-label'],
  title: ['h1', 'im-title'], heading: ['h2', 'im-heading'], subheading: ['h3', 'im-heading'], minorHeading: ['h4', 'im-heading'],
  text: ['span', 'im-text'], strong: ['strong', 'im-strong'], hint: ['small', 'im-muted'], paragraph: ['p', 'im-paragraph'],
  status: ['p', 'im-status-text'], alert: ['p', 'im-field-error'], list: ['ul', 'im-stack-list'], item: ['li', 'im-list-item'],
  body: ['div', 'im-region'], scroll: ['div', 'im-scroll'], viewport: ['div', 'im-viewport'], separator: ['hr', 'im-rule'],
  spacer: ['span', 'im-grow'], dialog: ['dialog', 'im-content-dialog im-native-controls'], details: ['details', 'im-disclosure'],
  summary: ['summary', 'im-disclosure-title'], fieldset: ['fieldset', 'im-fieldset'], legend: ['legend', 'im-legend'],
  code: ['code', 'im-mono'], pre: ['pre', 'im-code-view'], time: ['time', 'im-time'],
  descriptionList: ['dl', 'im-definition-list'], term: ['dt', 'im-term'], definition: ['dd', 'im-definition'],
  table: ['table', 'im-table'], tableHead: ['thead', ''], tableBody: ['tbody', ''], tableRow: ['tr', ''],
  cell: ['td', ''], columnHeader: ['th', ''], progress: ['progress', 'im-progress'],
  nav: ['nav', 'im-navigation'], orderedList: ['ol', 'im-ordered-list'], mark: ['mark', 'im-highlight'],
  optionGroup: ['optgroup', ''], article: ['article', 'im-region'],
} as const satisfies Record<string, readonly [keyof HTMLElementTagNameMap, string]>;

/** What a part can also be: the layout, list, dialog and desktop roles that combine with any kind. The app names
 * the role; the classes that draw it are Imago's. */
const traits = {
  stack: 'im-stack', row: 'im-inline-row', scroll: 'im-scroll', bounded: 'im-scroll--bounded', grow: 'im-grow',
  spacer: 'im-spacer', truncate: 'im-truncate', wrap: 'im-wrap-text', muted: 'im-muted', visuallyHidden: 'im-visually-hidden',
  chip: 'im-chip', signal: 'im-signal', list: 'im-list', formGrid: 'im-form-grid', section: 'im-section',
  choiceList: 'im-choice-list', choiceRow: 'im-choice-row', summaryList: 'im-summary-list', conversation: 'im-scroll-log',
  emptyMessage: 'im-empty-message', renderView: 'im-render-view', viewportFooter: 'im-viewport-footer',
  paddedDrawer: 'im-padded-drawer', sectionedDrawer: 'im-sectioned-drawer', fileDialog: 'im-file-dialog',
  desktopContent: 'im-desktop-content', toolbar: 'im-toolbar', workArea: 'im-work-area', workspaceArea: 'im-workspace-area',
  noticeHost: 'im-notices', notice: 'im-float im-notice', dockedInspector: 'im-docked-inspector',
  inspectionRail: 'im-inspection-rail', resizableNav: 'im-resizable-nav', navRail: 'im-nav-rail', navLine: 'im-nav-line',
  navEntry: 'im-nav-entry', navMark: 'im-nav-mark', navDetail: 'im-nav-detail',
} as const satisfies Record<string, string>;

export type UiTrait = keyof typeof traits;
/** Gives `node` these roles (`uiTraits(uiPart('orderedList'), 'scroll', 'bounded')`) and returns it. */
export function uiTraits<T extends Element>(node: T, ...names: readonly UiTrait[]): T {
  for (const name of names) node.classList.add(...traits[name].split(' '));
  return node;
}

const tones = { ok: 'im-text-ok', warn: 'im-text-warn', err: 'im-text-err' } as const;
export type UiTone = keyof typeof tones;
/** The text of `node` in a semantic tone, or in its own colour again with `null`. Say the state in words too. */
export function uiTone<T extends Element>(node: T, tone: UiTone | null): T {
  for (const [name, className] of Object.entries(tones)) node.classList.toggle(className, name === tone);
  return node;
}

const emphases = { primary: 'im-btn--primary', danger: 'im-btn--danger' } as const;
/** A button that becomes the primary action, or the armed destructive one, and back to plain with `null`. */
export function uiEmphasis(button: HTMLButtonElement, emphasis: keyof typeof emphases | null): HTMLButtonElement {
  for (const [name, className] of Object.entries(emphases)) button.classList.toggle(className, name === emphasis);
  return button;
}

export type UiPart = keyof typeof parts;
export function uiPart<K extends UiPart>(kind: K, text?: string, className?: string): HTMLElementTagNameMap[(typeof parts)[K][0]] {
  const [tag, classes] = parts[kind];
  const node = document.createElement(tag);
  node.className = [classes, className].filter(Boolean).join(' ');
  if (text !== undefined) node.textContent = text;
  if (kind === 'status' || kind === 'alert') node.setAttribute('role', kind);
  if (kind === 'spacer') node.setAttribute('aria-hidden', 'true');
  return node as HTMLElementTagNameMap[(typeof parts)[K][0]];
}

export function uiButton(label: string, options: ButtonMarkupOptions & { title?: string; onClick?: () => void } = {}): HTMLButtonElement {
  const button = componentElement<HTMLButtonElement>(buttonHtml(label, '', options));
  button.removeAttribute('data-action');
  if (options.title !== undefined) button.title = options.title;
  if (options.onClick) button.addEventListener('click', options.onClick);
  return button;
}

export function uiInput(type = 'text'): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.className = type === 'checkbox' ? 'im-native-check' : type === 'radio' ? 'im-native-radio' : 'im-native-input';
  return input;
}

export function uiOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

export function uiSelect(options: readonly (readonly [string, string])[] = [], value?: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'im-native-select';
  for (const [key, label] of options) select.append(uiOption(key, label));
  if (value !== undefined) select.value = value;
  return select;
}

export function uiTextarea(): HTMLTextAreaElement {
  const control = document.createElement('textarea');
  control.className = 'im-native-textarea';
  return control;
}
