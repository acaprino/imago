#!/usr/bin/env node
// imago-check [--root <dir>] [--package]
//
// Checks an app against the rules of docs/design-file.md that a program can judge, or, with --package, the package's
// own css/. This file is the command: its arguments, the files it reads, what it prints and its exit code (1 on any
// finding, 0 on none, 2 on a bad argument). The rules are in rules.mjs.
//
// In an app it reads "imago" from the app's package.json:
//   { "src": ["apps/desktop/src"], "cargo": "apps/desktop/src-tauri/Cargo.toml", "agents": ["AGENTS.md", "CLAUDE.md"],
//     "entry": "apps/desktop/src/main.ts" }
// `src` defaults to ["src"] and `agents` to those two files; without `cargo` or `entry` their rules are skipped, and
// the program says so.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageNames } from './names.mjs';
import * as rules from './rules.mjs';
import { importsOf, parseSource, SCRIPT_EXTENSIONS, SOURCE_EXTENSIONS } from './source.mjs';

/**
 * @typedef {import('./rules.mjs').Finding} Finding
 * @typedef {import('./rules.mjs').Exception} Exception
 * @typedef {import('./source.mjs').Source} Source
 * @typedef {{ findings: Finding[], accepted: Exception[], notes: string[] }} Result
 */

/** A bad argument, or an app the program cannot read: exit 2. */
export class UsageError extends Error {}

export const USAGE = `Usage: imago-check [--root <dir>] [--package]

  Checks an app against the design rules of @acaprino/imago (docs/design-file.md), reading the "imago" block of its
  package.json: { "src": [...], "cargo": "...", "agents": [...], "entry": "..." }.
  --package       check the package's own css/ instead
  --root <dir>    the folder to check (default: the current folder)

  Prints file:line  rule  message for each finding. Exit 1 on a finding, 0 on none, 2 on a bad argument.
  An exception is a comment on the line or the line above: imago-check: allow <rule> — <reason>`;

/** Where an app has the package installed, from the folder of its package.json. */
const INSTALLED = join('node_modules', '@acaprino', 'imago');
const SKIP = new Set(['node_modules', '.git', 'dist', 'target']);

const read = (/** @type {string} */ path) => readFileSync(path, 'utf8');
const isFile = (/** @type {string} */ path) => existsSync(path) && statSync(path).isFile();
const isFolder = (/** @type {string} */ path) => existsSync(path) && statSync(path).isDirectory();
const fromRoot = (/** @type {string} */ root, /** @type {string} */ path) => relative(root, path).replaceAll('\\', '/');

// ---------- arguments ----------

/**
 * @param {string[]} argv
 * @returns {{ root: string | null, packageMode: boolean, help: boolean }}
 */
export function parseArguments(argv) {
  let root = null;
  let packageMode = false;
  let help = false;
  for (let k = 0; k < argv.length; k++) {
    const arg = argv[k];
    if (arg === '--package') packageMode = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--root' || arg.startsWith('--root=')) {
      const value = arg === '--root' ? argv[++k] : arg.slice('--root='.length);
      if (!value || value.startsWith('--')) throw new UsageError('--root needs a folder');
      root = value;
    } else throw new UsageError(`unknown argument ${arg}`);
  }
  return { root, packageMode, help };
}

// ---------- files ----------

/** Every source file under `path` (or `path` itself), skipping node_modules, .git, dist and target. */
function sourcesUnder(/** @type {string} */ path, /** @type {string[]} */ endings) {
  if (isFile(path)) return [path];
  /** @type {string[]} */
  const found = [];
  const walk = (/** @type {string} */ dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (SKIP.has(name)) continue;
      const child = join(dir, name);
      if (statSync(child).isDirectory()) walk(child);
      else if (endings.some((ending) => name.toLowerCase().endsWith(ending)) && !name.endsWith('.d.ts')) found.push(child);
    }
  };
  walk(path);
  return found;
}

/** @param {string} root @param {string} path */
const sourceAt = (root, path) => parseSource(fromRoot(root, path), read(path));

/**
 * The "imago" block of the app's package.json, with its defaults.
 * @param {unknown} block
 * @returns {{ src: string[], agents: string[], cargo: string | null, entry: string | null }}
 */
export function readConfig(block) {
  const value = block ?? {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new UsageError('"imago" in package.json is not an object');
  /** @type {Record<string, 'list' | 'path'>} */
  const keys = { src: 'list', agents: 'list', cargo: 'path', entry: 'path' };
  for (const [key, entry] of Object.entries(value)) {
    if (!(key in keys)) throw new UsageError(`"imago.${key}" in package.json is not a key the check reads (src, agents, cargo, entry)`);
    const good = keys[key] === 'list' ? Array.isArray(entry) && entry.every((item) => typeof item === 'string' && item) : typeof entry === 'string' && entry;
    if (!good) throw new UsageError(`"imago.${key}" in package.json must be ${keys[key] === 'list' ? 'a list of paths' : 'a path'}`);
  }
  const config = /** @type {Record<string, any>} */ (value);
  return { src: config.src ?? ['src'], agents: config.agents ?? ['AGENTS.md', 'CLAUDE.md'], cargo: config.cargo ?? null, entry: config.entry ?? null };
}

/** The folders from `path` up to `root`, both included. */
function upTo(/** @type {string} */ root, /** @type {string} */ path) {
  const folders = [];
  let dir = isFolder(path) ? path : dirname(path);
  for (;;) {
    folders.push(dir);
    if (dir === root || dirname(dir) === dir || !dir.startsWith(root)) break;
    dir = dirname(dir);
  }
  return folders;
}

/**
 * The package.json that depends on @acaprino/imago: the root's, or the nearest one above a folder of `src`.
 * @param {string} root @param {string[]} src
 */
function npmManifest(root, src) {
  const candidates = [join(root, 'package.json'), ...src.flatMap((entry) => upTo(root, resolve(root, entry)).map((dir) => join(dir, 'package.json')))];
  for (const path of candidates) {
    try {
      if (isFile(path) && rules.npmPin(read(path), fromRoot(root, path))) return path;
    } catch {
      // A package.json that is not JSON does not pin anything; the root's was read before.
    }
  }
  return join(root, 'package.json');
}

/**
 * The entry and every file it imports by a relative path (scripts only, not node_modules).
 * @param {string} root @param {string} entry
 * @returns {Source[]}
 */
function importGraph(root, entry) {
  /** @type {Map<string, Source>} */
  const seen = new Map();
  const queue = [entry];
  while (queue.length) {
    const path = /** @type {string} */ (queue.shift());
    if (seen.has(path)) continue;
    const source = sourceAt(root, path);
    seen.set(path, source);
    for (const spec of importsOf(source)) {
      if (!spec.startsWith('.')) continue;
      const base = resolve(dirname(path), spec);
      const candidates = [
        base, base.replace(/\.(m?)js$/, '.$1ts'), base.replace(/\.jsx?$/, '.tsx'),
        ...SCRIPT_EXTENSIONS.map((ending) => base + ending), ...SCRIPT_EXTENSIONS.map((ending) => join(base, `index${ending}`)),
      ];
      const target = candidates.find((candidate) => isFile(candidate) && SCRIPT_EXTENSIONS.some((ending) => candidate.endsWith(ending)));
      if (target && !target.split(/[\\/]/).includes('node_modules')) queue.push(target);
    }
  }
  return [...seen.values()];
}

// ---------- the check ----------

/**
 * Runs the check on `root` and returns what it found; it prints nothing.
 * @param {{ root: string, packageMode: boolean }} options
 * @returns {Result}
 */
export function check({ root, packageMode }) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Exception[]} */
  const exceptions = [];
  /** @type {string[]} */
  const notes = [];
  if (packageMode) checkPackage(root, findings, exceptions);
  else checkApp(root, findings, exceptions, notes);
  const applied = rules.applyExceptions(findings, exceptions);
  const order = (/** @type {{ file: string, line: number, rule: string }} */ a, /** @type {{ file: string, line: number, rule: string }} */ b) =>
    (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
  const unique = new Map(applied.findings.map((each) => [`${each.file}:${each.line} ${each.rule} ${each.message}`, each]));
  return {
    findings: [...unique.values()].sort(order).map(({ file, line, rule, message }) => ({ file, line, rule, message })),
    accepted: applied.accepted.sort(order),
    notes,
  };
}

/**
 * The package's own css/: every rule but the app's, and css/tokens.css apart from the literal rules (it is where the
 * literals are named).
 * @param {string} root @param {Finding[]} findings @param {Exception[]} exceptions
 */
function checkPackage(root, findings, exceptions) {
  const css = join(root, 'css');
  if (!isFolder(css)) throw new UsageError(`${root} has no css/ folder: --package checks the package's own css/`);
  for (const path of sourcesUnder(css, ['.css'])) {
    const source = sourceAt(root, path);
    for (const rule of [rules.classPrefix, rules.cursorPointer, rules.disabledOpacity, rules.mediaWidth]) findings.push(...rule(source));
    if (source.file !== 'css/tokens.css') for (const rule of [rules.literalColor, rules.literalFontSize, rules.literalSpace]) findings.push(...rule(source));
    exceptions.push(...rules.exceptionsIn(source));
  }
}

/**
 * An app: its sources, its pins, the files of its agents and its entry.
 * @param {string} root @param {Finding[]} findings @param {Exception[]} exceptions @param {string[]} notes
 */
function checkApp(root, findings, exceptions, notes) {
  const manifestPath = join(root, 'package.json');
  if (!isFile(manifestPath)) throw new UsageError(`${root} has no package.json: run imago-check in the root of the app, or with --package in the package`);
  /** @type {Record<string, unknown>} */
  let manifest;
  try {
    manifest = JSON.parse(read(manifestPath));
  } catch (error) {
    throw new UsageError(`package.json cannot be read: ${/** @type {Error} */ (error).message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new UsageError('package.json is not an object');
  const config = readConfig(manifest.imago);
  const npmPath = npmManifest(root, config.src);

  const installed = [root, dirname(npmPath)].map((dir) => join(dir, INSTALLED)).find((dir) => isFile(join(dir, 'package.json')));
  if (!installed) throw new UsageError(`@acaprino/imago is not installed in ${join(root, INSTALLED)}: run npm install before the check`);
  const defined = packageNames(installed);

  for (const entry of config.src) {
    const path = resolve(root, entry);
    if (!existsSync(path)) throw new UsageError(`"imago.src" names ${entry}, which does not exist`);
    for (const file of sourcesUnder(path, SOURCE_EXTENSIONS)) {
      const source = sourceAt(root, file);
      for (const rule of [rules.imSelector, rules.literalColor, rules.literalFontSize, rules.literalSpace, rules.cursorPointer, rules.disabledOpacity, rules.mediaWidth, rules.showModal]) {
        findings.push(...rule(source));
      }
      findings.push(...rules.unknownName(source, defined));
      exceptions.push(...rules.exceptionsIn(source));
    }
  }

  if (config.cargo) {
    const cargoPath = resolve(root, config.cargo);
    if (!isFile(cargoPath)) throw new UsageError(`"imago.cargo" names ${config.cargo}, which does not exist`);
    const workspacePath = upTo(root, cargoPath).map((dir) => join(dir, 'Cargo.toml')).find((path) => isFile(path) && /^\s*\[workspace\]\s*$/m.test(read(path)));
    const lockDir = workspacePath ? dirname(workspacePath) : dirname(cargoPath);
    const npmLock = [root, dirname(npmPath)].map((dir) => join(dir, 'package-lock.json')).find(isFile);
    const pins = rules.pinMismatch({
      npm: { file: fromRoot(root, npmPath), text: read(npmPath) },
      cargo: { file: fromRoot(root, cargoPath), text: read(cargoPath) },
      workspace: workspacePath ? { file: fromRoot(root, workspacePath), text: read(workspacePath) } : null,
      npmLock: npmLock ? read(npmLock) : null,
      cargoLock: isFile(join(lockDir, 'Cargo.lock')) ? read(join(lockDir, 'Cargo.lock')) : null,
    });
    findings.push(...pins.findings);
    notes.push(...pins.notes);
  } else {
    notes.push('pin-mismatch: skipped, no "cargo" in the "imago" block of package.json');
  }

  findings.push(...rules.agentRules(config.agents.map((file) => {
    const path = resolve(root, file);
    return { file: fromRoot(root, path), text: isFile(path) ? read(path) : null };
  })));

  if (config.entry) {
    const entryPath = resolve(root, config.entry);
    if (!isFile(entryPath)) throw new UsageError(`"imago.entry" names ${config.entry}, which does not exist`);
    findings.push(...rules.mountApp(importGraph(root, entryPath)));
  } else {
    notes.push('mount-app: skipped, no "entry" in the "imago" block of package.json');
  }
}

// ---------- output ----------

/**
 * What the program prints: the findings, then the exceptions it accepted, the notes and a summary.
 * @param {Result} result
 */
export function format({ findings, accepted, notes }) {
  /** @type {string[][]} */
  const sections = [];
  if (findings.length) sections.push(findings.map((each) => `${each.file}:${each.line}  ${each.rule}  ${each.message}`));
  if (accepted.length) sections.push([`Exceptions accepted (${accepted.length}):`, ...accepted.map((each) => `${each.file}:${each.line}  ${each.rule}  ${each.reason}`)]);
  if (notes.length) sections.push(notes);
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const each of findings) counts.set(each.rule, (counts.get(each.rule) ?? 0) + 1);
  const byRule = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([rule, count]) => `${rule} ${count}`).join(', ');
  const plural = (/** @type {number} */ count, /** @type {string} */ word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const total = findings.length ? `${plural(findings.length, 'finding')} (${byRule})` : 'no findings';
  sections.push([`imago-check: ${total}${accepted.length ? `, ${plural(accepted.length, 'exception')} accepted` : ''}.`]);
  return `${sections.map((lines) => lines.join('\n')).join('\n\n')}\n`;
}

/**
 * The command: returns its exit code.
 * @param {string[]} argv
 * @param {{ cwd?: string, out?: (text: string) => void, err?: (text: string) => void }} [io]
 */
export function main(argv, io = {}) {
  const out = io.out ?? ((text) => process.stdout.write(text));
  const err = io.err ?? ((text) => process.stderr.write(text));
  try {
    const args = parseArguments(argv);
    if (args.help) {
      out(`${USAGE}\n`);
      return 0;
    }
    const root = resolve(io.cwd ?? process.cwd(), args.root ?? '.');
    if (!isFolder(root)) throw new UsageError(`${args.root} is not a folder`);
    const result = check({ root, packageMode: args.packageMode });
    out(format(result));
    return result.findings.length ? 1 : 0;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(`imago-check: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
}

/** Whether this file is the program node runs (through npm's bin link too), and not a module a test imports. */
function invoked() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invoked()) process.exitCode = main(process.argv.slice(2));
