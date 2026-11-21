// The names of the package: the im- classes, the data-im- attributes and the --im- custom properties. What a source
// uses is read from its selectors, its markup, its class lists and its scripts; what the package defines is what its
// css/ styles and what its scripts (ts/, or lib/ when ts/ is not there) write. namesIn finds given names, with or
// without the im- prefix and the exports of the package among them, for the names the canon removed.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { classesOf } from './css.mjs';
import { DYNAMIC, lineCounter, parseSource } from './source.mjs';

/**
 * @typedef {import('./source.mjs').Source} Source
 * @typedef {import('./source.mjs').Str} Str
 * @typedef {{ name: string, line: number }} Use
 * @typedef {{ classes: Set<string>, attributes: Set<string>, properties: Set<string> }} Names
 */

const CLASS = /(?<![\w-])im-[a-z0-9][a-z0-9-]*/g;
const ATTRIBUTE = /(?<![\w-])data-im-[a-z0-9][a-z0-9-]*/g;
const PROPERTY = /--im-[a-z0-9][a-z0-9-]*/g;

/**
 * Whether `name`, found at `start` of `text`, is whole. A name that ends in a hyphen (`'im-text-' + tone`) or runs
 * into a ${} (`im-text-${tone}`) is built at run time: it is not a name the check can judge.
 * @param {string} text @param {number} start @param {string} name
 */
const whole = (text, start, name) => !name.endsWith('-') && text[start + name.length] !== DYNAMIC;

/** @param {string} text @param {RegExp} pattern @param {number} line @returns {Use[]} */
const usesIn = (text, pattern, line) => {
  const lineOf = lineCounter(text, line);
  return [...text.matchAll(pattern)]
    .filter((match) => whole(text, match.index ?? 0, match[0]))
    .map((match) => ({ name: match[0], line: lineOf(match.index ?? 0) }));
};

/**
 * The classes a string holds that `pattern` matches (the im- classes by default): every one of a class list
 * (`'im-row im-row--1'`), or those of the `class="…"` of its markup and the `.name` of a selector in it.
 * @param {Str} str
 * @param {RegExp} [pattern] a global pattern of class names, which does not start inside a longer name
 * @returns {Use[]}
 */
function classesInString(str, pattern = CLASS) {
  const { text, line } = str;
  if (str.attribute !== undefined) return str.attribute === 'class' ? usesIn(text, pattern, line) : [];
  if (/^[\s\w\u0001-]*$/.test(text)) return usesIn(text, pattern, line);
  /** @type {Use[]} */
  const uses = [];
  const lineOf = lineCounter(text, line);
  for (const match of text.matchAll(/\bclass(?:Name)?\s*=\s*(["'])([^"']*)\1/g)) {
    uses.push(...usesIn(match[2], pattern, lineOf((match.index ?? 0) + match[0].indexOf(match[2]))));
  }
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (text[at - 1] === '.' && whole(text, at, match[0])) uses.push({ name: match[0], line: lineOf(at) });
  }
  return uses;
}

const escapeRegExp = (/** @type {string} */ text) => text.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');

/** A global pattern of these names, each whole: not inside a longer name. */
const wordsPattern = (/** @type {string[]} */ names) =>
  new RegExp(`(?<![\\w-])(?:${[...names].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?![\\w-])`, 'g');

/**
 * Where a source uses any of these names: classes (in selectors, class lists, markup and selector strings), data-im-
 * attributes (wherever namesUsed reads them), --im- properties (in declarations and strings) and exports of the
 * package (an import from @acaprino/imago, or `ns.name` through a namespace import of it). `set` are --im- properties
 * found only where the source sets them: a declaration of one (in CSS, in a style a script writes, in a React style
 * object) or a setProperty('--im-…', …), not a var() that reads one. Comments are not read.
 * @param {Source} source
 * @param {{ classes: string[], attributes: string[], properties: string[], exports: string[], set?: string[] }} wanted
 * @returns {Use[]} once per name and line, in the order of the lines
 */
export function namesIn(source, wanted) {
  /** @type {Use[]} */
  const uses = [];
  if (wanted.set?.length) {
    const set = new Set(wanted.set);
    for (const sheet of source.sheets) {
      for (const rule of sheet.rules) for (const declaration of rule.declarations) if (set.has(declaration.property)) uses.push({ name: declaration.property, line: declaration.line });
    }
    for (const str of source.strings) if (set.has(str.text) && /\.setProperty\(\s*$/.test(str.before)) uses.push({ name: str.text, line: str.line });
  }
  if (wanted.classes.length) {
    const classes = new Set(wanted.classes);
    const pattern = wordsPattern(wanted.classes);
    for (const sheet of source.sheets) {
      for (const rule of sheet.rules) {
        if (rule.inline || rule.keyframes || rule.implicit) continue;
        for (const name of classesOf(rule.selector)) if (classes.has(name)) uses.push({ name, line: rule.line });
      }
    }
    for (const str of source.strings) uses.push(...classesInString(str, pattern));
  }
  if (wanted.attributes.length) {
    const attributes = new Set(wanted.attributes);
    const used = namesUsed(source).attributes;
    uses.push(...used.filter((use) => attributes.has(use.name)));
  }
  if (wanted.properties.length) {
    const properties = new Set(wanted.properties);
    for (const sheet of source.sheets) {
      for (const rule of sheet.rules) {
        for (const declaration of rule.declarations) {
          if (properties.has(declaration.property)) uses.push({ name: declaration.property, line: declaration.line });
          uses.push(...usesIn(declaration.value, PROPERTY, declaration.line).filter((use) => properties.has(use.name)));
        }
      }
    }
    for (const str of source.strings) uses.push(...usesIn(str.text, PROPERTY, str.line).filter((use) => properties.has(use.name)));
  }
  if (wanted.exports.length) {
    const exports = new Set(wanted.exports);
    const fromPackage = source.imports.filter((each) => each.specifier === '@acaprino/imago' || each.specifier.startsWith('@acaprino/imago/'));
    for (const each of fromPackage) for (const name of each.names) if (exports.has(name.imported)) uses.push({ name: name.imported, line: each.line });
    const namespaces = fromPackage.flatMap((each) => (each.namespace ? [each.namespace] : []));
    if (namespaces.length) {
      const member = new RegExp(`(?<![\\w$.])(?:${namespaces.map(escapeRegExp).join('|')})\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g');
      for (const chunk of source.code) {
        const lineOf = lineCounter(chunk.text, chunk.line);
        for (const match of chunk.text.matchAll(member)) if (exports.has(match[1])) uses.push({ name: match[1], line: lineOf(match.index ?? 0) });
      }
    }
  }
  const seen = new Set();
  return uses.filter((use) => !seen.has(`${use.line} ${use.name}`) && seen.add(`${use.line} ${use.name}`)).sort((a, b) => a.line - b.line);
}

/**
 * The im- classes and data-im- attributes a source uses, each with its line.
 * @param {Source} source
 * @returns {{ classes: Use[], attributes: Use[] }}
 */
export function namesUsed(source) {
  /** @type {Use[]} */
  const classes = [];
  /** @type {Use[]} */
  const attributes = [];
  for (const sheet of source.sheets) {
    for (const rule of sheet.rules) {
      if (!rule.inline && !rule.keyframes && !rule.implicit) {
        for (const name of classesOf(rule.selector)) if (/^im-[a-z0-9]/.test(name)) classes.push({ name, line: rule.line });
        attributes.push(...usesIn(rule.selector, ATTRIBUTE, rule.line));
      }
      for (const declaration of rule.declarations) attributes.push(...usesIn(declaration.value, ATTRIBUTE, declaration.line));
    }
  }
  for (const str of source.strings) {
    classes.push(...classesInString(str));
    attributes.push(...usesIn(str.text, ATTRIBUTE, str.line));
  }
  for (const chunk of source.code) {
    attributes.push(...usesIn(chunk.text, ATTRIBUTE, chunk.line));
    const lineOf = lineCounter(chunk.text, chunk.line);
    for (const match of chunk.text.matchAll(/\.dataset\.im([A-Z][A-Za-z0-9]*)/g)) {
      const name = `data-im-${match[1].replace(/[A-Z]/g, (letter, at) => (at ? '-' : '') + letter.toLowerCase())}`;
      attributes.push({ name, line: lineOf(match.index ?? 0) });
    }
  }
  return { classes, attributes };
}

/**
 * The names a set of sources defines: every class and attribute they use, and every --im- property their
 * stylesheets declare or read and their scripts write.
 * @param {Source[]} sources
 * @returns {Names}
 */
export function namesDefined(sources) {
  /** @type {Names} */
  const names = { classes: new Set(), attributes: new Set(), properties: new Set() };
  for (const source of sources) {
    const used = namesUsed(source);
    for (const use of used.classes) names.classes.add(use.name);
    for (const use of used.attributes) names.attributes.add(use.name);
    for (const sheet of source.sheets) {
      for (const rule of sheet.rules) {
        for (const declaration of rule.declarations) {
          if (declaration.property.startsWith('--im-')) names.properties.add(declaration.property);
          for (const match of declaration.value.matchAll(PROPERTY)) names.properties.add(match[0]);
        }
      }
    }
    for (const str of source.strings) for (const match of str.text.matchAll(PROPERTY)) names.properties.add(match[0]);
  }
  return names;
}

/** Why a file system call failed, in a few words. */
const failure = (/** @type {unknown} */ error) => /** @type {NodeJS.ErrnoException} */ (error)?.code ?? String(/** @type {Error} */ (error)?.message ?? error);

/**
 * Every file under `dir` whose name ends in one of `endings`, as paths from `root`. An entry that cannot be read (a
 * link to nothing, a folder without permission) is skipped, with a note.
 * @param {string} root
 * @param {string} dir
 * @param {string[]} endings
 * @param {string[]} notes
 * @returns {string[]}
 */
function filesUnder(root, dir, endings, notes) {
  /** @type {string[]} */
  const found = [];
  const skip = (/** @type {string} */ path, /** @type {unknown} */ error) => notes.push(`skipped ${relative(root, path).replaceAll('\\', '/')} of the installed package: it cannot be read (${failure(error)})`);
  const walk = (path) => {
    let names;
    try {
      names = readdirSync(path).sort();
    } catch (error) {
      skip(path, error);
      return;
    }
    for (const name of names) {
      if (name === 'node_modules') continue;
      const child = join(path, name);
      let folder;
      try {
        folder = statSync(child).isDirectory();
      } catch (error) {
        skip(child, error);
        continue;
      }
      if (folder) walk(child);
      else if (endings.some((ending) => name.endsWith(ending)) && !name.endsWith('.d.ts')) found.push(relative(root, child).replaceAll('\\', '/'));
    }
  };
  if (existsSync(join(root, dir))) walk(join(root, dir));
  return found;
}

/**
 * The names the package at `packageRoot` defines, read from its css/ and its ts/ (lib/ when ts/ is not there). A file
 * that cannot be read is skipped, with a note in `notes`.
 * @param {string} packageRoot
 * @param {string[]} [notes]
 * @returns {Names}
 */
export function packageNames(packageRoot, notes = []) {
  const scripts = existsSync(join(packageRoot, 'ts')) ? filesUnder(packageRoot, 'ts', ['.ts'], notes) : filesUnder(packageRoot, 'lib', ['.js'], notes);
  const files = [...filesUnder(packageRoot, 'css', ['.css'], notes), ...scripts];
  return namesDefined(files.flatMap((file) => {
    let text;
    try {
      text = readFileSync(join(packageRoot, file), 'utf8');
    } catch (error) {
      notes.push(`skipped ${file} of the installed package: it cannot be read (${failure(error)})`);
      return [];
    }
    return [parseSource(file, text)];
  }));
}
