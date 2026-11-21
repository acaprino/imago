export type FieldErrors = Record<string, string>;

export interface ValidationOptions {
  /** Supply a focus target for a group error. Ordinary fields are found by their name. */
  field?: (form: HTMLFormElement, name: string) => HTMLElement | null | undefined;
}

function namedField(form: HTMLFormElement, name: string): HTMLElement | null {
  return Array.from(form.querySelectorAll<HTMLElement>('[name]')).find(el => el.getAttribute('name') === name) ?? null;
}
function errorSlot(form: HTMLFormElement, name: string): HTMLElement | null {
  return Array.from(form.querySelectorAll<HTMLElement>('.im-field-error[id]')).find(el => el.id === `err-${name}`) ?? null;
}

/** Displays plain-text errors and opens every disclosure around the first invalid field. */
export function showFieldErrors(form: HTMLFormElement, errors: FieldErrors, options: ValidationOptions = {}): boolean {
  form.querySelectorAll('.im-field-error').forEach(el => { el.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach(el => { el.removeAttribute('aria-invalid'); el.removeAttribute('data-im-error-for'); });
  let first: HTMLElement | null = null;
  for (const [name, message] of Object.entries(errors)) {
    const slot = errorSlot(form, name);
    if (slot) slot.textContent = message;
    const field = options.field?.(form, name) ?? namedField(form, name);
    field?.setAttribute('aria-invalid', 'true');
    field?.setAttribute('data-im-error-for', name);
    first ??= field;
  }
  if (first) {
    for (let ancestor = first.parentElement; ancestor && ancestor !== form; ancestor = ancestor.parentElement) {
      if (ancestor.localName === 'details') ancestor.setAttribute('open', '');
    }
    first.focus();
  }
  return Object.keys(errors).length === 0;
}

export function clearFieldError(element: HTMLElement): void {
  if (!element.hasAttribute('aria-invalid')) return;
  element.removeAttribute('aria-invalid');
  const form = element.closest('form');
  const name = element.getAttribute('data-im-error-for') ?? element.getAttribute('name');
  element.removeAttribute('data-im-error-for');
  if (form && name) { const slot = errorSlot(form, name); if (slot) slot.textContent = ''; }
}

/** A stable reading of successful controls, useful for detecting unsaved edits. */
export function formSignature(form: HTMLFormElement): string {
  return JSON.stringify([...new FormData(form).entries()].map(([key, value]) => [key, typeof value === 'string' ? value : { name: value.name, size: value.size, type: value.type, modified: value.lastModified }]));
}
