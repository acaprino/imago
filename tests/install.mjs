// npm run test:install: an empty project installs the package as a release gives it (`npm pack`, the asset
// acaprino-imago-<version>.tgz) with its peers, with no install script run, and imports it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version, devDependencies, scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'imago-install-'));
const run = (args, cwd) => execFileSync(process.execPath, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const npm = (args, cwd) => run([process.env.npm_execpath, ...args], cwd);
try {
  npm(['pack', '--pack-destination', dir], root);
  const asset = `acaprino-imago-${version}.tgz`;
  assert.deepEqual(readdirSync(dir), [asset]);
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) assert.ok(!(name in scripts), `the script ${name} would run when the package is installed`);

  const app = join(dir, 'app');
  mkdirSync(app);
  writeFileSync(join(app, 'package.json'), '{ "name": "app", "private": true, "type": "module" }\n');
  const peers = [devDependencies['@acaprino/sigrid'], ...['react', 'react-dom'].map((name) => `${name}@${devDependencies[name]}`)];
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', join(dir, asset), ...peers], app);

  const installed = join(app, 'node_modules', '@acaprino', 'imago');
  for (const file of ['lib/index.js', 'lib/index.d.ts', 'docs/design-file.md', 'icons/muro/icon.ico', 'scripts/check/cli.mjs']) assert.ok(existsSync(join(installed, file)), `${file} is not in the package`);
  for (const file of ['ts', 'tests', 'examples', 'crates', 'node_modules']) assert.ok(!existsSync(join(installed, file)), `${file} is in the package`);
  // The page's calls to a window are imported when they are made: a bundler must find them, in an app that runs in a browser too.
  assert.ok(existsSync(join(app, 'node_modules', '@tauri-apps', 'api')), '@tauri-apps/api is not installed with the package');
  const exported = run(['--input-type=module', '-e', "console.log(Object.keys(await import('@acaprino/imago')).sort().join())"], app).trim();
  assert.equal(exported, 'AppWindow,ScreenBoundary,defineApp,focusContent,startApp,useFocusKept,useNotify,useWindow');
  assert.match(run([join(installed, 'scripts', 'check', 'cli.mjs'), '--help'], app), /Usage: imago-check/);
  console.log(`ok   ${asset} installs in an empty project and is imported: ${exported}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
