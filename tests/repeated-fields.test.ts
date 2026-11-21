import assert from 'node:assert/strict';
import test from 'node:test';
import { appendRepeatedFieldRow, removeRepeatedFieldRow } from '../ts/ui/repeated-fields.ts';

test('adding a repeated row focuses its first editing control', () => {
  const calls: string[] = [];
  const field = { focus: () => calls.push('focus') };
  const container = {
    lastElementChild: { querySelector: (selector: string) => { calls.push(selector); return field; } },
    insertAdjacentHTML: (position: string, html: string) => calls.push(position + ':' + html),
  } as unknown as HTMLElement;
  appendRepeatedFieldRow(container, '<div>Row</div>', { focusSelector: 'select' });
  assert.deepEqual(calls, ['beforeend:<div>Row</div>', 'select', 'focus']);
});

test('removing a row sends focus to next, previous, or the supplied add action', () => {
  for (const location of ['next', 'previous', 'fallback']) {
    const calls: string[] = [];
    const field = { focus: () => calls.push(location) };
    const sibling = { querySelector: () => field };
    const row = { nextElementSibling: location === 'next' ? sibling : null, previousElementSibling: location === 'previous' ? sibling : null, remove: () => calls.push('remove') } as unknown as HTMLElement;
    removeRepeatedFieldRow(row, { fallback: field as unknown as HTMLElement });
    assert.deepEqual(calls, ['remove', location]);
  }
});
