import assert from 'node:assert/strict';
import test from 'node:test';
import { showFieldErrors, clearFieldError } from '../ts/ui/validation.ts';

function element(name: string, id = '') {
  const attrs = new Map<string, string>(name ? [['name', name]] : []);
  return {
    id, localName: 'input', textContent: '', parentElement: null as unknown,
    focused: false, attrs,
    getAttribute: (key: string) => attrs.get(key) ?? null,
    hasAttribute: (key: string) => attrs.has(key),
    setAttribute: (key: string, value: string) => attrs.set(key, value),
    removeAttribute: (key: string) => attrs.delete(key),
    focus() { this.focused = true; },
    closest: (_selector: string) => null as unknown,
  };
}

function fixture() {
  const name = element('title'), path = element('path'), unusual = element('x"] [name="other');
  const fields = [name, path, unusual];
  const slots = [element('', 'err-title'), element('', 'err-collection'), element('', `err-${unusual.getAttribute('name')}`)];
  const outer = element(''), inner = element('');
  outer.localName = inner.localName = 'details';
  const form = {
    querySelectorAll(selector: string) {
      if (selector === '[name]') return fields;
      if (selector === '[aria-invalid]') return fields.filter(field => field.hasAttribute('aria-invalid'));
      if (selector === '.im-field-error' || selector === '.im-field-error[id]') return slots;
      throw new Error(`Unexpected selector ${selector}`);
    },
  } as unknown as HTMLFormElement;
  outer.parentElement = form;
  inner.parentElement = outer;
  fields.forEach(field => { field.parentElement = inner; field.closest = () => form; });
  return { form, fields, slots, outer, inner, name, path, unusual };
}

test('first error gets focus after every enclosing disclosure opens', () => {
  const f = fixture();
  assert.equal(showFieldErrors(f.form, { title: '<Required>' }), false);
  assert.equal(f.slots[0].textContent, '<Required>');
  assert.equal(f.name.focused, true);
  assert.equal(f.inner.hasAttribute('open'), true);
  assert.equal(f.outer.hasAttribute('open'), true);
  assert.equal(f.name.getAttribute('aria-invalid'), 'true');
  assert.equal(showFieldErrors(f.form, {}), true);
  assert.equal(f.slots[0].textContent, '');
  assert.equal(f.name.hasAttribute('aria-invalid'), false);
});

test('group validation clears its own slot when the aliased input is edited', () => {
  const f = fixture();
  showFieldErrors(f.form, { collection: 'Fill every path' }, { field: (_form, name) => name === 'collection' ? f.path as unknown as HTMLElement : null });
  assert.equal(f.slots[1].textContent, 'Fill every path');
  assert.equal(f.path.getAttribute('aria-invalid'), 'true');
  clearFieldError(f.path as unknown as HTMLElement);
  assert.equal(f.slots[1].textContent, '');
  assert.equal(f.path.hasAttribute('aria-invalid'), false);
  assert.equal(f.path.hasAttribute('data-im-error-for'), false);
});

test('unusual field names are matched literally instead of becoming CSS selectors', () => {
  const f = fixture(), name = f.unusual.getAttribute('name')!;
  showFieldErrors(f.form, { [name]: 'Invalid' });
  assert.equal(f.unusual.focused, true);
  assert.equal(f.name.focused, false);
  assert.equal(f.slots[2].textContent, 'Invalid');
});

test('missing first field does not prevent focusing the next visible error target', () => {
  const f = fixture();
  showFieldErrors(f.form, { missing: 'Missing', title: 'Required' });
  assert.equal(f.name.focused, true);
});
