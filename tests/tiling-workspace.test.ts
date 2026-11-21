import assert from 'node:assert/strict';
import test from 'node:test';
import { placeWorkspaceBinding } from '../ts/ui/tiling-workspace.ts';

test('parking and restoring a connected binding use state-preserving DOM moves', () => {
  const ownerDocument = {};
  const binding = { hidden: false, isConnected: true, ownerDocument, parentNode: null as object | null };
  const moves: boolean[] = [];
  const parent = () => ({
    isConnected: true, ownerDocument,
    moveBefore(node: typeof binding, next: null) {
      assert.equal(node, binding);
      assert.equal(next, null);
      moves.push(node.hidden);
      node.parentNode = this;
    },
  } as unknown as HTMLElement);
  const parking = parent();
  const pane = parent();
  const live = binding as unknown as HTMLElement;
  placeWorkspaceBinding(parking, live, false);
  placeWorkspaceBinding(pane, live, true);
  placeWorkspaceBinding(pane, live, true);
  assert.equal(binding.parentNode, pane);
  assert.deepEqual(moves, [true, false]);
});

test('new bindings also mount in webviews without atomic moves', () => {
  const binding = { hidden: true, parentNode: null as object | null };
  const parent = {
    appendChild(node: typeof binding) {
      assert.equal(node, binding);
      node.parentNode = this;
    },
  };
  placeWorkspaceBinding(parent as unknown as HTMLElement, binding as unknown as HTMLElement, true);
  assert.equal(binding.hidden, false);
  assert.equal(binding.parentNode, parent);
});
