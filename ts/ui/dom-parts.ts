import { buttonHtml, type ButtonMarkupOptions, type TextFieldMarkupOptions } from './markup.ts';

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
  main: ['main', ''], aside: ['aside', 'im-aside'], header: ['header', 'im-section-heading'],
  footer: ['footer', 'im-footer'], form: ['form', 'im-form'], field: ['label', 'im-field'], label: ['label', 'im-label'],
  title: ['h1', 'im-title'], heading: ['h2', 'im-heading'], subheading: ['h3', 'im-heading'], minorHeading: ['h4', 'im-heading'],
  text: ['span', 'im-text'], strong: ['strong', 'im-strong'], hint: ['small', 'im-muted'], paragraph: ['p', 'im-paragraph'],
  status: ['p', 'im-status-text'], alert: ['p', 'im-field-error'], list: ['ul', 'im-stack-list'], item: ['li', 'im-list-item'],
  body: ['div', 'im-region'], scroll: ['div', 'im-scroll'], viewport: ['div', 'im-viewport'], separator: ['hr', 'im-rule'],
  spacer: ['span', 'im-grow'], dialog: ['dialog', 'im-content-dialog'], details: ['details', 'im-disclosure'],
  summary: ['summary', 'im-disclosure-title'], fieldset: ['fieldset', 'im-fieldset'], legend: ['legend', 'im-legend'],
  code: ['code', 'im-mono'], pre: ['pre', 'im-code-view'], time: ['time', 'im-time'],
  descriptionList: ['dl', 'im-definition-list'], term: ['dt', 'im-term'], definition: ['dd', 'im-definition'],
  table: ['table', 'im-table'], tableHead: ['thead', ''], tableBody: ['tbody', ''], tableRow: ['tr', ''],
  cell: ['td', ''], columnHeader: ['th', ''], progress: ['progress', 'im-progress'],
  nav: ['nav', 'im-navigation'], orderedList: ['ol', 'im-ordered-list'], mark: ['mark', 'im-highlight'],
  optionGroup: ['optgroup', ''], article: ['article', 'im-region'],
} as const satisfies Record<string, readonly [keyof HTMLElementTagNameMap, string]>;

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

/** The types of input that are a field: drawn in the box of a field, `span.im-input > input`. */
export type UiFieldType = NonNullable<TextFieldMarkupOptions['type']>;

/** A native checkbox or radio with the drawing of every checkbox and radio: `input.im-check`, `input.im-radio`. */
export function uiInput(type: 'checkbox' | 'radio'): HTMLInputElement;
/** A native input in its field box, `span.im-input > input`, as `inputHtml` writes it: append `element`, use `input`. */
export function uiInput(type?: UiFieldType): { element: HTMLSpanElement; input: HTMLInputElement };
export function uiInput(type: 'checkbox' | 'radio' | UiFieldType = 'text'): HTMLInputElement | { element: HTMLSpanElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = type;
  if (type === 'checkbox' || type === 'radio') {
    input.className = type === 'checkbox' ? 'im-check' : 'im-radio';
    return input;
  }
  const element = document.createElement('span');
  element.className = 'im-input';
  element.append(input);
  return { element, input };
}

export function uiOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

/** A native select with the drawing of the select button, `select.im-select`, as `selectHtml` writes it. */
export function uiSelect(options: readonly (readonly [string, string])[] = [], value?: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'im-select';
  for (const [key, label] of options) select.append(uiOption(key, label));
  if (value !== undefined) select.value = value;
  return select;
}

/** A native text area with the drawing of a field, `textarea.im-textarea`. */
export function uiTextarea(): HTMLTextAreaElement {
  const control = document.createElement('textarea');
  control.className = 'im-textarea';
  return control;
}
