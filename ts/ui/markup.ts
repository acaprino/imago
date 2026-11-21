import { iconMarkup, isIconName } from './icon.ts';
import { panelStateHtml } from './panel-state.ts';
import { toneAttribute, type Tone } from './tone.ts';
export type { IconName } from './icon.ts';
export type { Tone } from './tone.ts';

// String rendering for apps that compose HTML before mounting it. Text and attribute values are
// escaped here; the explicitly named HTML slots accept trusted component output, never user text.

/** Escapes text for an HTML text node or a quoted attribute value. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** Unknown icon names use the neutral box. Icons are decorative unless a label is supplied. */
export function iconHtml(name: string, label?: string): string {
  const markup = iconMarkup(isIconName(name) ? name : 'box');
  return label ? markup.replace('aria-hidden="true"', `role="img" aria-label="${escapeHtml(label)}"`) : markup;
}

export const spinnerHtml = '<i class="im-spinner" aria-hidden="true"></i>';

/** A decorative text avatar; the person's or object's accessible name belongs beside it. */
export const avatarHtml = (text: string): string => `<span class="im-avatar" aria-hidden="true">${escapeHtml(text)}</span>`;
export const initialsAvatarHtml = (name: string): string => avatarHtml(Array.from(name).slice(0, 2).join('').toUpperCase());

/** A chip's tone, or none (`''`): a chip without a tone is the neutral chip. */
export type ChipTone = '' | Tone;
export function chipHtml(label: string, tone: ChipTone = ''): string {
  return `<span class="im-chip"${toneAttribute(tone)}>${escapeHtml(label)}</span>`;
}

export type MarkupAttributes = Readonly<Record<string, string>>;
const safeAttributes = new Set(['id', 'title', 'role', 'tabindex', 'autocomplete', 'inputmode', 'min', 'max',
  'step', 'minlength', 'maxlength', 'pattern', 'size', 'list', 'form']);

/** Extension attributes cannot inject event handlers or override a component's structural attributes. */
function attributesHtml(attributes: MarkupAttributes | undefined, reserved: readonly string[] = []): string[] {
  return Object.entries(attributes ?? {}).map(([name, value]) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || reserved.includes(name)
      || !(safeAttributes.has(name) || name.startsWith('aria-') || name.startsWith('data-'))) {
      throw new TypeError(`Unsupported component attribute: ${name}`);
    }
    return `${name}="${escapeHtml(value)}"`;
  });
}

export interface ButtonMarkupOptions {
  primary?: boolean;
  danger?: boolean;
  accent?: boolean;
  sm?: boolean;
  busy?: boolean;
  icon?: string;
  id?: string;
  disabled?: boolean;
  cls?: string;
  attrs?: MarkupAttributes;
}

/** An action button. `data-action` and optional `data-id` are interpreted by the consuming app. */
export function buttonHtml(label: string, action: string, options: ButtonMarkupOptions = {}): string {
  const classes = ['im-btn', options.primary && 'im-btn--primary', options.danger && 'im-btn--danger',
    options.accent && 'im-btn--accent', options.sm && 'im-btn--sm', options.cls].filter(Boolean).join(' ');
  const attrs = ['type="button"', `class="${escapeHtml(classes)}"`, `data-action="${escapeHtml(action)}"`,
    options.id !== undefined ? `data-id="${escapeHtml(options.id)}"` : '',
    ...attributesHtml(options.attrs, ['data-action', 'data-id']), options.disabled ? 'disabled' : ''];
  return `<button ${attrs.filter(Boolean).join(' ')}>${options.busy ? spinnerHtml : options.icon ? iconHtml(options.icon) : ''}<span>${escapeHtml(label)}</span></button>`;
}

/** An icon-only action keeps its accessible label and tooltip even without visible text. */
export function iconButtonHtml(label: string, action: string, icon: string, options: {
  attrs?: MarkupAttributes; disabled?: boolean; id?: string;
} = {}): string {
  const attrs = ['type="button"', 'class="im-icon-btn"', `data-action="${escapeHtml(action)}"`,
    `aria-label="${escapeHtml(label)}"`, `title="${escapeHtml(label)}"`,
    options.id !== undefined ? `data-id="${escapeHtml(options.id)}"` : '',
    ...attributesHtml(options.attrs, ['data-action', 'data-id', 'aria-label', 'title']), options.disabled ? 'disabled' : ''];
  return `<button ${attrs.filter(Boolean).join(' ')}>${iconHtml(icon)}</button>`;
}

/** The actions slot accepts trusted component HTML. Title and description are plain text. */
export function pageHeadingHtml(title: string, description: string, actionsHtml = ''): string {
  return `<header class="im-page-heading"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actionsHtml ? `<div class="im-action-row">${actionsHtml}</div>` : ''}</header>`;
}

/** The empty layer of `setPanelState`, its title in `strong` (none when empty). The action slot accepts trusted component HTML. */
export function emptyStateHtml(title: string, description: string, actionHtml = ''): string {
  return panelStateHtml({ kind: 'empty', title, text: description, actionHtml });
}

export function switchHtml(on: boolean, label: string, action: string, id = '', disabled = false): string {
  return `<button type="button" class="im-switch" role="switch" aria-checked="${on}" aria-label="${escapeHtml(label)}" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}"${disabled ? ' disabled' : ''}><span class="im-switch-knob"></span></button>`;
}

/** Native radios preserve FormData, browser keyboard navigation and form reset behaviour. */
export function segmentedHtml(name: string, value: string, options: readonly (readonly [string, string])[], label: string, config: { attrs?: MarkupAttributes } = {}): string {
  const attrs = attributesHtml(config.attrs).join(' ');
  return `<div class="im-seg im-seg--native" role="radiogroup" aria-label="${escapeHtml(label)}">${options.map(([key, text]) => `<label><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(key)}"${key === value ? ' checked' : ''}${attrs ? ' ' + attrs : ''}><span>${escapeHtml(text)}</span></label>`).join('')}</div>`;
}

export interface TextFieldMarkupOptions {
  required?: boolean;
  type?: 'text' | 'email' | 'number' | 'password' | 'search' | 'tel' | 'url' | 'date' | 'datetime-local' | 'month' | 'time' | 'week';
  hint?: string;
  readonly?: boolean;
  mono?: boolean;
  placeholder?: string;
  optional?: boolean;
  autofocus?: boolean;
  error?: boolean;
  /** Supply a unique id when the same named field occurs more than once in a document. */
  id?: string;
  attrs?: MarkupAttributes;
}

/** A labelled native input, hint and live validation slot. No `required` field is silently aria-only. */
export function textFieldHtml(label: string, name: string, value = '', options: TextFieldMarkupOptions = {}): string {
  const slot = options.error !== false;
  const key = options.id ?? encodeURIComponent(name);
  const hintId = `hint-${key}`, errorId = `err-${key}`;
  const described = [options.hint ? hintId : '', slot ? errorId : ''].filter(Boolean).join(' ');
  const attrs = [`name="${escapeHtml(name)}"`, `value="${escapeHtml(value)}"`, `type="${escapeHtml(options.type ?? 'text')}"`,
    options.id ? `id="${escapeHtml(options.id)}"` : '', options.mono ? 'class="im-mono"' : '',
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : '',
    options.required ? 'required aria-required="true"' : '', options.readonly ? 'readonly' : '',
    options.autofocus ? 'autofocus' : '', ...attributesHtml(options.attrs, options.id ? ['id', 'aria-describedby'] : ['aria-describedby']),
    described ? `aria-describedby="${escapeHtml(described)}"` : ''];
  return `<label class="im-field"><span>${escapeHtml(label)}${options.optional ? '<em>optional</em>' : ''}</span><input ${attrs.filter(Boolean).join(' ')}>${options.hint ? `<small id="${escapeHtml(hintId)}">${escapeHtml(options.hint)}</small>` : ''}${slot ? `<small class="im-field-error" id="${escapeHtml(errorId)}" role="alert"></small>` : ''}</label>`;
}
