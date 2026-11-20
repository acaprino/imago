import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistry, openFormDialog } from '@acaprino/imago/ui';
import { parseLook } from '@acaprino/imago/shell';

test('Node loads the public ES modules with no browser globals', () => {
  assert.deepEqual(createRegistry().list(), []);
  assert.equal(typeof openFormDialog, 'function');
  assert.equal(parseLook('oni'), 'oni');
});
