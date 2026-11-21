import assert from 'node:assert/strict';
import test from 'node:test';
import { runFormOperation, isFormOperationPending } from '../ts/ui/form-operation.ts';

function fixture() {
  const attributes = new Map<string, string>();
  const buttons = [{ disabled: false }, { disabled: true }];
  const node = {
    isConnected: true,
    ownerDocument: { activeElement: null, body: {} },
    getAttribute: (key: string) => attributes.get(key) ?? null,
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    removeAttribute: (key: string) => attributes.delete(key),
    querySelectorAll: () => buttons,
    querySelector: () => null,
    contains: () => false,
  };
  const host = node as unknown as HTMLElement;
  const error = { textContent: 'Previous failure' } as HTMLElement;
  let resolve!: (value: number) => void;
  let reject!: (reason: unknown) => void;
  const request = new Promise<number>((yes, no) => { resolve = yes; reject = no; });
  return { host, node, attributes, buttons, error, request, resolve, reject };
}

test('one pending action locks every action and preserves originally disabled buttons', async () => {
  const f = fixture();
  let writes = 0, received = 0;
  const first = runFormOperation(f.host, () => { writes++; return f.request; }, { error: f.error, after: value => { received = value; } });
  assert.equal(isFormOperationPending(f.host), true);
  assert.equal(f.attributes.get('aria-busy'), 'true');
  assert.deepEqual(f.buttons.map(button => button.disabled), [true, true]);
  assert.equal(f.error.textContent, '');
  assert.equal(await runFormOperation(f.host, async () => { writes++; return 3; }), false);
  assert.equal(writes, 1);
  f.resolve(42);
  assert.equal(await first, true);
  assert.equal(received, 42);
  assert.equal(isFormOperationPending(f.host), false);
  assert.equal(f.attributes.has('aria-busy'), false);
  assert.deepEqual(f.buttons.map(button => button.disabled), [false, true]);
});

test('a rejected write stays in its own error slot and can be retried', async () => {
  const f = fixture();
  f.attributes.set('aria-busy', 'false');
  const first = runFormOperation(f.host, () => f.request, { error: f.error });
  f.reject(new Error('Revision changed'));
  await first;
  assert.equal(f.error.textContent, 'Revision changed');
  assert.equal(f.attributes.get('aria-busy'), 'false');
  await runFormOperation(f.host, async () => 9, { error: f.error });
  assert.equal(f.error.textContent, '');
  assert.deepEqual(f.buttons.map(button => button.disabled), [false, true]);
});

test('late completion after a form was replaced cannot invoke navigation or close a new dialog', async () => {
  const f = fixture();
  let after = 0;
  const first = runFormOperation(f.host, () => f.request, { error: f.error, after: () => { after++; } });
  f.node.isConnected = false;
  f.resolve(1);
  await first;
  assert.equal(after, 0);
  assert.equal(isFormOperationPending(f.host), false);
});

test('a reused host can reject a stale generation and late errors do not enter a new form', async () => {
  const f = fixture();
  let current = true, after = 0;
  const first = runFormOperation(f.host, () => f.request, { error: f.error, current: () => current, after: () => { after++; } });
  current = false;
  f.error.textContent = 'New form';
  f.reject(new Error('Old failure'));
  await first;
  assert.equal(after, 0);
  assert.equal(f.error.textContent, 'New form');
});

test('dialog pending-state query sees a child form operation', () => {
  const dialog = { querySelector: (selector: string) => selector === '[data-im-operation]' ? {} : null } as unknown as HTMLElement;
  assert.equal(isFormOperationPending(dialog), true);
});

test('an error without a presentation slot reaches the caller and still unlocks the form', async () => {
  const f = fixture();
  await assert.rejects(runFormOperation(f.host, async () => { throw new Error('Failed'); }), /Failed/);
  assert.equal(isFormOperationPending(f.host), false);
  assert.deepEqual(f.buttons.map(button => button.disabled), [false, true]);
});

test('an event queued before disposal cannot start a write from the detached form', async () => {
  const f = fixture();
  f.node.isConnected = false;
  let writes = 0;
  assert.equal(await runFormOperation(f.host, async () => { writes++; return 1; }), false);
  assert.equal(writes, 0);
});

test('locking editable controls prevents a pending payload from silently discarding newer edits', async () => {
  const f = fixture(), field = { disabled: false };
  f.node.querySelectorAll = (selector?: string) => selector?.includes('input') ? [...f.buttons, field] : f.buttons;
  const run = runFormOperation(f.host, () => f.request, { lockFields: true });
  assert.equal(field.disabled, true);
  f.resolve(3);
  await run;
  assert.equal(field.disabled, false);
  assert.deepEqual(f.buttons.map(button => button.disabled), [false, true]);
});

test('a focused action disabled during a write gets keyboard focus back after unlocking', async () => {
  const f = fixture();
  let focused = 0;
  const action = {
    disabled: false, localName: 'button',
    getAttribute: (key: string) => key === 'data-action' ? 'save' : null,
    hasAttribute: (key: string) => key === 'data-action',
    focus: () => { focused++; },
    matches: () => action.disabled,
    closest: () => null,
  };
  const doc = f.node.ownerDocument as unknown as { activeElement: unknown; body: unknown };
  doc.activeElement = action;
  f.node.contains = (candidate?: unknown) => candidate === action;
  f.node.querySelector = () => action as never;
  f.node.querySelectorAll = () => [action];
  const run = runFormOperation(f.host, () => f.request);
  doc.activeElement = doc.body;
  f.resolve(3);
  await run;
  assert.equal(action.disabled, false);
  assert.equal(focused, 1);
});
