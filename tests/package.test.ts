import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');
const manifest = (): { version: string; exports: Record<string, string> } => JSON.parse(read('package.json'));

test('every path in "exports" resolves to an existing file or folder', () => {
  const entries = Object.entries(manifest().exports);
  assert.ok(entries.length > 0, 'package.json has no "exports"');
  for (const [entry, target] of entries) {
    // "./css/*": "./css/*" exposes the folder: check the folder.
    const path = join(root, target.replace(/\*.*$/, ''));
    assert.ok(existsSync(path), `exports["${entry}"] points to ${target}, which does not exist`);
  }
});

test('the version is major.minor.patch', () => {
  assert.match(manifest().version, /^\d+\.\d+\.\d+$/);
});

test('AGENTS.md carries the branch rule', () => {
  assert.ok(read('AGENTS.md').includes('Never merge or push into `main`'));
});
