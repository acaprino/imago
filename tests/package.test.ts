import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { defineApp } from '@acaprino/imago';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');
type Manifest = { version: string; exports: Record<string, string>; files: string[]; peerDependencies: Record<string, string>; devDependencies: Record<string, string> };
const manifest = (): Manifest => JSON.parse(read('package.json'));

test('every path in "exports" and "files" is there', () => {
  const { exports, files } = manifest();
  // "./icons/*": "./icons/*" exposes the folder: check the folder.
  for (const [entry, target] of Object.entries(exports)) assert.ok(existsSync(join(root, target.replace(/\*.*$/, ''))), `exports["${entry}"] points to ${target}, which does not exist`);
  for (const file of files) assert.ok(existsSync(join(root, file)), `"files" names ${file}, which does not exist`);
});

test('the version is major.minor.patch', () => {
  assert.match(manifest().version, /^\d+\.\d+\.\d+$/);
});

test('Sigrid, React and the API of Tauri are peers, and the Sigrid the package is built with is one the peer allows', () => {
  const { peerDependencies, devDependencies } = manifest();
  assert.deepEqual(peerDependencies, { '@acaprino/sigrid': '^6.8.0', '@tauri-apps/api': '^2.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' });
  const [, minor] = /\/download\/v6\.(\d+)\.(\d+)\/acaprino-sigrid-6\.\1\.\2\.tgz$/.exec(devDependencies['@acaprino/sigrid']) ?? [];
  assert.ok(Number(minor) >= 2, devDependencies['@acaprino/sigrid']);
});

test('Node loads the root entry with no browser, and defineApp gives back what it is given, with the theme', () => {
  const app = { id: 'demo', name: 'Demo', lang: 'en', accent: '#006398', storage: { scheme: 'demo.scheme', zoom: 'demo.zoom', sidebar: 'demo.sidebar' } };
  const { theme, ...rest } = defineApp(app);
  assert.deepEqual(rest, app);
  assert.equal(theme.id, 'demo');
});

test('what is read of Sigrid by the shell is not handed on: the root exports its own names only', async () => {
  assert.deepEqual(Object.keys(await import('@acaprino/imago')).sort(), ['AppWindow', 'ScreenBoundary', 'defineApp', 'focusContent', 'startApp', 'useFocusKept', 'useNotify', 'useWindow']);
});

test('sigrid-check, run as `npm run check` runs it, refuses a class of the app\'s own', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imago-own-class-'));
  try {
    writeFileSync(join(dir, 'a.tsx'), 'export const A = () => <div className="p-2">x</div>;\n');
    const run = spawnSync(process.execPath, [join(root, 'node_modules/@acaprino/sigrid/bin/sigrid-check.mjs'), dir], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /own-class/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AGENTS.md carries the branch rule', () => {
  assert.ok(read('AGENTS.md').includes('Never merge or push into `main`'));
});
