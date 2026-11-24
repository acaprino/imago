// The rules a program can judge: one pure function per rule. A rule takes what source.mjs and names.mjs read (never a
// path on disk) and returns its findings, `{ file, line, rule, message }`. The ids are the ones docs/design-file.md names.
// The names the package removed are in removed.mjs. The exceptions written in comments are read and applied at the end of
// this file.

import { posix } from 'node:path';
import { namesIn } from './names.mjs';
import { REMOVED } from './removed.mjs';
import { lineAt, lineCounter } from './source.mjs';

/**
 * @typedef {import('./source.mjs').Source} Source
 * @typedef {import('./removed.mjs').Removed} Removed
 * @typedef {{ file: string, line: number, rule: string, message: string }} Finding
 * @typedef {{ file: string, line: number, endLine?: number, rule: string, reason: string }} Exception
 */

/** @returns {Finding} */
function finding(file, line, rule, message) {
  return { file, line, rule, message };
}

// ---------- removed-name ----------

/**
 * A name the package removed (removed.mjs): a class, an attribute, a custom property or an entry point, in the app's CSS,
 * markup or script, its tests included. The message gives what replaces it.
 * @param {Source} source @param {Removed[]} [removed]
 * @returns {Finding[]}
 */
export function removedName(source, removed = REMOVED) {
  return namesIn(source, removed).map(({ name, line, entry }) => finding(source.file, line, 'removed-name', `${name} was removed: ${entry.now}`));
}

// ---------- shell-import ----------

/** The parts of Sigrid the shell draws, or the hook it calls, with what of @acaprino/imago has it. */
const SHELL = new Map([
  ['AppShell', 'AppWindow'], ['TitleBar', 'AppWindow'], ['WindowControls', 'AppWindow'], ['CommandPalette', 'AppWindow'],
  ['CommandsProvider', 'startApp'], ['useSchemeCommands', 'startApp'], ['Toasts', 'useNotify'],
]);

/**
 * A part of Sigrid that the shell draws once for every app, imported by the app itself, under its name or through a
 * namespace.
 * @param {Source} source @returns {Finding[]}
 */
export function shellImport(source) {
  return source.imports.filter(({ specifier }) => /^@acaprino\/sigrid(?:\/|$)/.test(specifier)).flatMap(({ specifier, line, names, namespace }) => {
    const members = !namespace ? [] : source.code.flatMap(({ text, line: first }) => {
      const lineOf = lineCounter(text, first);
      return [...text.matchAll(new RegExp(`(?<![\\w$.])${namespace.replaceAll('$', '\\$')}\\s*\\.\\s*([A-Za-z]\\w*)`, 'g'))].map((match) => ({ name: match[1], line: lineOf(match.index) }));
    });
    return [...names.map((name) => ({ name, line })), ...members].filter(({ name }) => SHELL.has(name))
      .map((use) => finding(source.file, use.line, 'shell-import', `${use.name} of ${specifier}: the shell has it, ${SHELL.get(use.name)} of @acaprino/imago; an app does not write it itself`));
  });
}

// ---------- pin-mismatch ----------

/**
 * The npm pin of the package in a package.json: the spec of @acaprino/imago and the line it is on.
 * @param {string} text @param {string} file
 * @returns {{ file: string, line: number, spec: string } | null}
 */
export function npmPin(text, file) {
  const manifest = JSON.parse(text);
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const spec = manifest?.[field]?.['@acaprino/imago'];
    if (typeof spec === 'string') {
      const at = text.search(/"@acaprino\/imago"\s*:/);
      return { file, line: at === -1 ? 1 : lineAt(text, at, 1), spec };
    }
  }
  return null;
}

/** @typedef {{ line: number, git?: string, tag?: string, rev?: string, branch?: string, version?: string, workspace?: string, package?: string }} CargoEntry */

/** A line of TOML without its comment. */
function withoutTomlComment(/** @type {string} */ line) {
  let quote = '';
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (quote) {
      if (c === '\\' && quote === '"') k++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#') return line.slice(0, k);
  }
  return line;
}

const PAIR = /([A-Za-z0-9_-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|true|false|[\w.+-]+)/g;
const unquote = (/** @type {string} */ value) => value.replace(/^["']|["']$/g, '');

/**
 * The imago-shell entry of a Cargo.toml: in [dependencies] and its kin (dev-, build-, target.…), or, for the root of a
 * workspace, in [workspace.dependencies]. Inline (`imago-shell = { … }`), dotted (`imago-shell.workspace = true`) and
 * table (`[dependencies.imago-shell]`) forms are read, and a renamed dependency (`package = "imago-shell"`).
 * @param {string} text @param {boolean} workspace
 * @returns {CargoEntry | null}
 */
export function cargoEntry(text, workspace) {
  const dependencies = workspace ? /^workspace\.dependencies$/ : /^(?:target\..+\.)?(?:dev-|build-)?dependencies$/;
  let table = '';
  /** @type {CargoEntry | null} */
  let inTable = null;
  /** @type {CargoEntry | null} */
  let found = null;
  const lines = text.split(/\r?\n/);
  for (let k = 0; k < lines.length; k++) {
    const line = withoutTomlComment(lines[k]).trim();
    if (!line) continue;
    const header = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (header) {
      table = header[1].replace(/["'\s]/g, '');
      const sub = /^(.*)\.imago-shell$/.exec(table);
      inTable = sub && dependencies.test(sub[1]) ? { line: k + 1 } : null;
      if (inTable && !found) found = inTable;
      continue;
    }
    if (inTable) {
      for (const match of line.matchAll(PAIR)) inTable[/** @type {'git'} */ (match[1])] = unquote(match[2]);
      continue;
    }
    if (!dependencies.test(table)) continue;
    const key = /^([A-Za-z0-9_-]+)((?:\.[A-Za-z0-9_-]+)?)\s*=\s*(.*)$/.exec(line);
    if (!key) continue;
    const [, name, dotted, value] = key;
    /** @type {Record<string, string>} */
    const fields = {};
    if (value.startsWith('{')) for (const match of value.matchAll(PAIR)) fields[match[1]] = unquote(match[2]);
    else if (dotted) fields[dotted.slice(1)] = unquote(value.trim());
    else fields.version = unquote(value.trim());
    // Dotted keys may come on several lines (imago-shell.git = …, imago-shell.tag = …): they make one entry.
    if (name === 'imago-shell' || fields.package === 'imago-shell') found = { ...found, ...fields, line: found?.line ?? k + 1 };
  }
  return found;
}

/** The tag whose release asset an npm spec installs, or null. */
const releaseTag = (/** @type {string} */ spec) => /\/acaprino\/imago\/releases\/download\/(v([^/]+))\/acaprino-imago-\2\.tgz$/.exec(spec)?.[1] ?? null;

/**
 * The npm pin of @acaprino/imago, the asset of a release, and the Cargo pin of imago-shell, a tag: the same version. A
 * Cargo.toml that takes the crate from its workspace is read through the root Cargo.toml.
 * @param {{
 *   npm: { file: string, text: string },
 *   cargo: { file: string, text: string },
 *   workspace: { file: string, text: string } | null,
 * }} input
 * @returns {Finding[]}
 */
export function pinMismatch({ npm, cargo, workspace }) {
  const id = 'pin-mismatch';
  const pin = npmPin(npm.text, npm.file);
  if (!pin) return [finding(npm.file, 1, id, '@acaprino/imago is not a dependency: pin the asset of a release, as imago-shell pins its tag')];
  let crate = cargoEntry(cargo.text, false);
  let crateFile = cargo.file;
  if (!crate) return [finding(cargo.file, 1, id, 'imago-shell is not a dependency of this crate: pin the tag of the release @acaprino/imago is taken from')];
  if (crate.workspace === 'true') {
    const member = `${cargo.file}:${crate.line}`;
    const shared = workspace ? cargoEntry(workspace.text, true) : null;
    if (!workspace || !shared) {
      return [finding(workspace?.file ?? cargo.file, workspace ? 1 : crate.line, id, `${member} takes imago-shell from the workspace, and ${workspace ? `${workspace.file} has no imago-shell in [workspace.dependencies]` : 'no Cargo.toml above it has [workspace]'}`)];
    }
    crate = shared;
    crateFile = workspace.file;
  }
  const npmTag = releaseTag(pin.spec);
  /** @type {Finding[]} */
  const findings = [];
  if (!npmTag) findings.push(finding(pin.file, pin.line, id, `@acaprino/imago is "${pin.spec}": pin the asset of a release (https://github.com/acaprino/imago/releases/download/v<x>/acaprino-imago-<x>.tgz)`));
  if (!crate.tag) {
    const what = crate.rev ? `the commit ${crate.rev}` : crate.branch ? `the branch ${crate.branch}` : crate.git ? 'the default branch' : crate.version ? `the version ${crate.version}, not the git repository` : 'no pin';
    findings.push(finding(crateFile, crate.line, id, `imago-shell takes ${what}: pin the tag of a release`));
  }
  if (npmTag && crate.tag && npmTag !== crate.tag) {
    findings.push(finding(pin.file, pin.line, id, `npm takes @acaprino/imago of ${npmTag} and Cargo imago-shell of ${crate.tag} (${crateFile}:${crate.line}): pin both to the same version`));
  }
  return findings;
}

// ---------- agent-rules ----------

// A path to the design file written in an agent file: in backquotes, in a Markdown link, after the @ of a CLAUDE.md
// import or in a sentence.
const DESIGN_PATH = /[^\s`'"()<>[\]]*design-file\.md/g;

/**
 * The files of the app's coding agents (AGENTS.md, CLAUDE.md) name the design file of the installed package, by a path
 * that exists from the folder of the file or from the root of the app, and that is the installed package's file, not
 * another design-file.md. A file that only imports another agent file of the list (`@AGENTS.md`) names what that file
 * names.
 * @param {{ file: string, text: string | null }[]} files `text` is null for a file that does not exist
 * @param {{
 *   designFile: string,
 *   resolves: (file: string, path: string) => boolean,
 *   same?: (file: string, path: string) => boolean,
 *   from?: (file: string) => string,
 * }} installed `designFile` is the design file of the installed package from the root; `resolves` says whether a path
 *   written in a file exists, from its folder or from the root. A file outside the root of the app (`../AGENTS.md`, for
 *   an app below the repository's agent files) has a path that string arithmetic on the two relative paths cannot
 *   compare: `same` says whether a path written in a file, from its folder or from the root, is the design file, and
 *   `from` gives the path of the design file from the folder of a file. Without them the paths are compared as written.
 * @returns {Finding[]}
 */
export function agentRules(files, { designFile, resolves, same, from }) {
  const texts = new Map(files.map(({ file, text }) => [posix.normalize(file), text]));
  const writtenIn = (/** @type {string} */ text) => [...text.matchAll(DESIGN_PATH)].filter((match) => match[0].includes('/') && !match[0].includes('://'));
  // Whether a path written in `file` is the installed package's design file, and not another design-file.md that exists.
  const isDesignFile = (/** @type {string} */ file, /** @type {string} */ written) => {
    const path = written.replace(/^@/, '');
    if (!resolves(file, path)) return false;
    if (same) return same(file, path);
    return [posix.join(posix.dirname(file), path), path].some((candidate) => posix.normalize(candidate) === posix.normalize(designFile));
  };
  // Whether a file, or one it imports with `@file` (to any depth), names the design file of the package.
  const names = (/** @type {string} */ file, /** @type {Set<string>} */ seen = new Set()) => {
    const path = posix.normalize(file);
    const text = texts.get(path);
    if (text == null || seen.has(path)) return false;
    seen.add(path);
    if (writtenIn(text).some((match) => isDesignFile(path, match[0]))) return true;
    return [...text.matchAll(/^[ \t]*@(?!\S*design-file\.md)(\S+)/gm)].some((match) => names(posix.join(posix.dirname(path), match[1]), seen));
  };
  return files.flatMap(({ file, text }) => {
    const expected = (from ? from(file) : posix.relative(posix.dirname(file), designFile)) || designFile;
    if (text === null) return [finding(file, 1, 'agent-rules', `${file} does not exist: it holds the lines of using-imago.md section 6, which name ${expected}`)];
    const written = writtenIn(text);
    if (!written.length) return names(file) ? [] : [finding(file, 1, 'agent-rules', `${file} does not name ${expected}: paste the lines of using-imago.md section 6`)];
    const missing = written.flatMap((match) => {
      const path = match[0];
      if (resolves(file, path) || (path.startsWith('@') && resolves(file, path.slice(1)))) return [];
      return [finding(file, lineAt(text, match.index ?? 0, 1), 'agent-rules', `${path.replace(/^@/, '')} does not exist, from the folder of ${file} or from the root: the design file of the installed @acaprino/imago is ${expected}`)];
    });
    if (missing.length || names(file)) return missing;
    return [finding(file, lineAt(text, written[0].index ?? 0, 1), 'agent-rules', `${written[0][0].replace(/^@/, '')} exists, and is not the design file of the installed @acaprino/imago: it is ${expected}`)];
  });
}

// ---------- app-icon ----------

/**
 * The icon files an app copied from the package (`icons/<app>/`, see using-imago.md): each is the package's file, byte
 * for byte. A line ending is a byte, so the files are compared as they are, not as text.
 * @param {string} app the id of the app, which names the package's folder
 * @param {{ file: string, name: string, have: Uint8Array | null, want: Uint8Array }[]} icons `file` is the path in the app, `name` the file in the package's folder, `have` is null when the app has no such file
 * @param {string} packagePath where the package is installed, from the root of the app
 * @returns {Finding[]}
 */
export function appIcon(app, icons, packagePath) {
  const id = 'app-icon';
  const same = (/** @type {Uint8Array} */ a, /** @type {Uint8Array} */ b) => a.length === b.length && a.every((byte, k) => byte === b[k]);
  return icons.flatMap(({ file, name, have, want }) => {
    const source = `${packagePath}/icons/${app}/${name}`;
    if (have === null) return [finding(file, 1, id, `${file} does not exist: copy ${source} to it`)];
    if (same(have, want)) return [];
    return [finding(file, 1, id, `${file} is not ${source} (${have.length} bytes, the package's has ${want.length}): copy the package's file over it`)];
  });
}

// ---------- exceptions ----------

const EXCEPTION = /imago-check:\s*allow\s+([a-z]+(?:-[a-z]+)*)([^\n]*)/g;

/**
 * The exceptions written in the comments of a source: `imago-check: allow <rule> — <reason>`, a hyphen accepted for
 * the dash. An exception without a reason is read with an empty reason, and allows nothing.
 * @param {Source} source @returns {Exception[]}
 */
export function exceptionsIn(source) {
  return source.comments.flatMap((comment) => [...comment.text.matchAll(EXCEPTION)].map((match) => {
    const rest = match[2].replace(/(?:\*\/|-->)\s*$/, '');
    const reason = /^\s*(?:—|–|-{1,2})\s*(.*?)\s*$/.exec(rest)?.[1] ?? '';
    const line = lineAt(comment.text, match.index ?? 0, comment.line);
    // A block comment that wraps its reason ends on a later line, and it is that line the name sits under.
    const endLine = lineAt(comment.text, comment.text.length, comment.line);
    return endLine > line ? { file: source.file, line, endLine, rule: match[1], reason } : { file: source.file, line, rule: match[1], reason };
  }));
}

/**
 * Takes out the findings an exception allows: one for the same rule, in the same file, on the line of the finding or the
 * line above. An exception without a reason allows nothing; the finding says so.
 * @param {Finding[]} findings @param {Exception[]} exceptions
 * @returns {{ findings: Finding[], accepted: Exception[] }}
 */
export function applyExceptions(findings, exceptions) {
  /** @type {Finding[]} */
  const kept = [];
  /** @type {Set<Exception>} */
  const accepted = new Set();
  const covers = (/** @type {Exception} */ exception, /** @type {Finding} */ place) => exception.file === place.file
    && (exception.endLine ?? exception.line) >= place.line - 1 && exception.line <= place.line;
  for (const each of findings) {
    const near = exceptions.filter((exception) => exception.rule === each.rule && covers(exception, each));
    const allowing = near.find((exception) => exception.reason);
    if (allowing) accepted.add(allowing);
    else if (near.length) kept.push({ ...each, message: `${each.message} (the exception on line ${near[0].line} gives no reason: imago-check: allow ${each.rule} — <reason>)` });
    else kept.push(each);
  }
  return { findings: kept, accepted: [...accepted] };
}
