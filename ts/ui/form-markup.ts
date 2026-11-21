import { escapeHtml as esc, iconHtml } from './markup.ts';
import { isTone, type Tone } from './tone.ts';

/** Markup fragments accept plain text except parameters explicitly named Html. */
export type SelectOption = readonly [value: string | number, label: string];
export type FormAttributes = Record<string, string | boolean | undefined>;

function attributes(values: FormAttributes = {}): string {
  return Object.entries(values).filter(([, value]) => value !== false && value !== undefined).map(([name, value]) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || !(/^(aria|data)-/.test(name) || ['id','class','name','value','type','title','role','tabindex','disabled','checked','readonly','required','multiple','autofocus','placeholder','autocomplete','spellcheck','inputmode','min','max','step','minlength','maxlength','pattern','size','list','form'].includes(name))) throw new Error(`Unsupported form attribute: ${name}`);
    return value === true ? name : `${name}="${esc(value)}"`;
  }).join(' ');
}

export function selectOptionsHtml(options: readonly SelectOption[], selected: string | number): string {
  return options.map(([value, label]) => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

export interface SelectMarkupOptions {
  name: string;
  value: string | number;
  options: readonly SelectOption[];
  label?: string;
  attrs?: FormAttributes;
}
export function selectHtml(options: SelectMarkupOptions): string {
  const { name, value, label, attrs } = options;
  const { disabled, ...extra } = attrs ?? {};
  if ('name' in extra || 'value' in extra) throw new Error('A select name/value must be supplied through its options');
  return `<select ${attributes({ name, ...extra, ...(label ? { 'aria-label': label } : {}), disabled })}>${selectOptionsHtml(options.options, value)}</select>`;
}
export function selectFieldHtml(label: string, name: string, options: readonly SelectOption[], selected: string): string {
  return `<label class="im-field"><span>${esc(label)}</span>${selectHtml({ name, options, value: selected })}</label>`;
}

export interface CheckboxMarkupOptions {
  name: string;
  checked: boolean;
  label: string;
  value?: string;
  hint?: string;
  hintHtml?: string;
  leadingHtml?: string;
  top?: boolean;
  disabled?: boolean;
}
export function checkboxOptionHtml(options: CheckboxMarkupOptions): string {
  const { name, checked, label, value, hint, hintHtml, leadingHtml = '', top, disabled } = options;
  return `<label class="im-option${top ? ' im-leading' : ''}"><input ${attributes({ type: 'checkbox', name, value, checked, disabled })}>${leadingHtml}<span>${hint === undefined && hintHtml === undefined ? esc(label) : `<strong>${esc(label)}</strong><small>${hintHtml ?? esc(hint)}</small>`}</span></label>`;
}

export function formGroupHtml(legend: string, contentHtml: string, hint = ''): string {
  return `<fieldset><legend>${esc(legend)}</legend>${hint ? `<p class="im-muted">${esc(hint)}</p>` : ''}${contentHtml}</fieldset>`;
}

export function repeatableFieldRowHtml(contentHtml: string): string {
  return `<div class="im-repeat-row">${contentHtml}</div>`;
}

export function settingsGroupHtml(contentHtml: string, options: { title?: string; description?: string } = {}): string {
  return `<section class="im-panel im-surface im-settings" data-im-surface="sheet">${options.title ? `<h2>${esc(options.title)}</h2>` : ''}${options.description ? `<p>${esc(options.description)}</p>` : ''}${contentHtml}</section>`;
}

/** A status text takes a status tone, or none (`''`); the accent is not a status. */
export function statusTextHtml(text: string, tone: '' | Tone = ''): string {
  return isTone(tone) ? `<span class="im-text-${tone}">${esc(text)}</span>` : esc(text);
}

export function settingsMessageHtml(message: string, details: readonly string[] = [], options: { icon?: string; tone?: Tone } = {}): string {
  const tone = isTone(options.tone) ? `im-text-${options.tone}` : '';
  return `<div class="im-setting-row" role="status"><div><span>${options.icon ? `<span class="${tone}">${iconHtml(options.icon)}</span> ` : ''}${esc(message)}</span>${details.map(detail => `<small class="im-wrap-text">${esc(detail)}</small>`).join('')}</div></div>`;
}

export function formHeaderHtml(title: string, subtitle = '', locked = false, id = 'dlg-title'): string {
  return `<div class="im-form-head"><div><h2 id="${esc(id)}">${esc(title)}</h2>${subtitle ? `<p class="im-muted">${esc(subtitle)}</p>` : ''}</div><button type="button" class="im-icon-btn" data-close aria-label="Close" ${locked ? 'disabled' : ''}>${iconHtml('x')}</button></div>`;
}

export function formFooterHtml(options: { submit: string; leadingHtml?: string; disabled?: boolean; cancel?: string }): string {
  return `<footer>${options.leadingHtml ?? ''}<button type="button" class="im-btn" data-close>${esc(options.cancel ?? 'Cancel')}</button><button type="submit" class="im-btn im-btn--primary"${options.disabled ? ' disabled' : ''}>${esc(options.submit)}</button></footer>`;
}

export function fieldErrorHtml(id: string, text = '', tag: 'small' | 'div' | 'p' = 'small'): string {
  if (!['small', 'div', 'p'].includes(tag)) throw new Error('Unsupported error element');
  return `<${tag} class="im-field-error" id="${esc(id)}" role="alert">${esc(text)}</${tag}>`;
}

export function settingsRowHtml(options: { title: string; hintHtml?: string; controlHtml: string; field?: string; error?: string }): string {
  const { title, hintHtml, controlHtml, field, error } = options;
  return `<div class="im-setting-row"><div><strong>${esc(title)}</strong>${hintHtml ? `<small${field ? ` id="hint-${esc(field)}"` : ''}>${hintHtml}</small>` : ''}${field ? fieldErrorHtml(`err-${field}`, error) : ''}</div>${controlHtml}</div>`;
}

export function inputHtml(options: { name: string; label: string; value: string; describedBy?: string; invalid?: boolean; attrs?: FormAttributes }): string {
  const { name, label, value, describedBy, invalid, attrs } = options;
  if (attrs && ('name' in attrs || 'value' in attrs)) throw new Error('An input name/value must be supplied through its options');
  return `<input ${attributes({ ...attrs, name, 'aria-label': label, 'aria-describedby': describedBy, ...(invalid ? { 'aria-invalid': 'true' } : {}), value })}>`;
}

/** Add explicit data/ARIA attributes without rewriting serialized markup. */
export function settingInputHtml(options: { name: string; label: string; value: string; invalid?: boolean; attrs?: FormAttributes }): string {
  return inputHtml({ ...options, describedBy: `hint-${options.name} err-${options.name}`, attrs: { autocomplete: 'off', spellcheck: 'false', ...options.attrs, 'data-setting': options.name } });
}
