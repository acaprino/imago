// The names of the package: the im- classes, the data-im- attributes and the --im- custom properties. What a source
// uses is read from its selectors, its markup, its class lists and its scripts; what the package defines is what its
// css/ styles and what its scripts (ts/, or lib/ when ts/ is not there) write.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { classesOf } from './css.mjs';
import { DYNAMIC, lineAt, parseSource } from './source.mjs';

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
const usesIn = (text, pattern, line) =>
  [...text.matchAll(pattern)]
    .filter((match) => whole(text, match.index ?? 0, match[0]))
    .map((match) => ({ name: match[0], line: lineAt(text, match.index ?? 0, line) }));

/**
 * The im- classes a string holds: every one of a class list (`'im-row im-row--1'`), or those of the `class="…"` of
 * its markup and the `.im-…` of a selector in it.
 * @param {Str} str
 * @returns {Use[]}
 */
function classesInString(str) {
  const { text, line } = str;
  if (str.attribute !== undefined) return str.attribute === 'class' ? usesIn(text, CLASS, line) : [];
  if (/^[\s\w\u0001-]*$/.test(text)) return usesIn(text, CLASS, line);
  /** @type {Use[]} */
  const uses = [];
  for (const match of text.matchAll(/\bclass(?:Name)?\s*=\s*(["'])([^"']*)\1/g)) {
    uses.push(...usesIn(match[2], CLASS, lineAt(text, (match.index ?? 0) + match[0].indexOf(match[2]), line)));
  }
  for (const match of text.matchAll(/(?<![\w-])\.(im-[a-z0-9][a-z0-9-]*)/g)) {
    if (whole(text, (match.index ?? 0) + 1, match[1])) uses.push({ name: match[1], line: lineAt(text, match.index ?? 0, line) });
  }
  return uses;
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
    for (const match of chunk.text.matchAll(/\.dataset\.im([A-Z][A-Za-z0-9]*)/g)) {
      const name = `data-im-${match[1].replace(/[A-Z]/g, (letter, at) => (at ? '-' : '') + letter.toLowerCase())}`;
      attributes.push({ name, line: lineAt(chunk.text, match.index ?? 0, chunk.line) });
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

/**
 * Every file under `dir` whose name ends in one of `endings`, as paths from `root`.
 * @param {string} root
 * @param {string} dir
 * @param {string[]} endings
 * @returns {string[]}
 */
function filesUnder(root, dir, endings) {
  /** @type {string[]} */
  const found = [];
  const walk = (path) => {
    for (const name of readdirSync(path).sort()) {
      if (name === 'node_modules') continue;
      const child = join(path, name);
      if (statSync(child).isDirectory()) walk(child);
      else if (endings.some((ending) => name.endsWith(ending)) && !name.endsWith('.d.ts')) found.push(relative(root, child).replaceAll('\\', '/'));
    }
  };
  if (existsSync(join(root, dir))) walk(join(root, dir));
  return found;
}

/**
 * The names the package at `packageRoot` defines, read from its css/ and its ts/ (lib/ when ts/ is not there).
 * @param {string} packageRoot
 * @returns {Names}
 */
export function packageNames(packageRoot) {
  const scripts = existsSync(join(packageRoot, 'ts')) ? filesUnder(packageRoot, 'ts', ['.ts']) : filesUnder(packageRoot, 'lib', ['.js']);
  const files = [...filesUnder(packageRoot, 'css', ['.css']), ...scripts];
  return namesDefined(files.map((file) => parseSource(file, readFileSync(join(packageRoot, file), 'utf8'))));
}
