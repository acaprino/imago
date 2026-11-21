import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');
const walk = (folder: string): string[] => readdirSync(join(root, folder), { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? walk(join(folder, entry.name)) : [join(folder, entry.name)]);
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

test('@acaprino/imago/shell no longer exports the Shinatama skins: Shinatama takes them from the tag v0.1.4', async () => {
  const shell: Record<string, unknown> = await import('@acaprino/imago/shell');
  for (const name of ['applyShinatamaPalette', 'SHINATAMA_PALETTES', 'ShinatamaPaletteTokens']) {
    assert.ok(!(name in shell), `@acaprino/imago/shell still exports ${name}`);
  }
  assert.equal(typeof shell.applyLook, 'function', 'the import found the shell module');
  assert.ok(!existsSync(join(root, 'ts/shell/shinatama-palette.ts')), 'the source of the skins is still in the package');
});

test('the modal drawers are gone from the package: a side panel is the inspector, a dialog is centred', () => {
  const removed = /im-content-dialog--drawer|im-content-drawer|im-sectioned-drawer|im-padded-drawer/;
  const files = [...walk('css'), ...walk('ts'), ...walk('react')].filter((file) => /\.(css|ts|tsx)$/.test(file));
  assert.ok(files.length > 20, 'the walk found the package sources');
  for (const file of files) assert.ok(!removed.test(read(file)), `${file} still names a removed drawer class`);
  assert.ok(!/['"]drawer['"]/.test(read('ts/ui/content-dialog.ts')), "createContentDialog's show still takes a 'drawer' mode");
});

test('AGENTS.md carries the branch rule', () => {
  assert.ok(read('AGENTS.md').includes('Never merge or push into `main`'));
});
