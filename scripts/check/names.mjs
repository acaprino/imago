// Where a source writes a name the package removed: a class (in a selector, a class list or markup), an attribute (in a
// selector, in markup, in JSX, through dataset), a custom property, or an entry point of the package. A removed name may
// be a family (`im-*`): a name of it built at run time (`im-text-${tone}`) is found by what is written of it.

import { lineCounter } from './source.mjs';

/**
 * @typedef {import('./source.mjs').Source} Source
 * @typedef {import('./source.mjs').Str} Str
 * @typedef {import('./removed.mjs').Removed} Removed
 * @typedef {{ name: string, line: number, entry: Removed }} Use
 */

const escapeRegExp = (/** @type {string} */ text) => text.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');

/** A global pattern of a removed name, whole, or of every name of its family. */
function patternOf(/** @type {Removed} */ { old, kind }) {
  const rest = kind === 'entry' ? '[\\w./-]*' : '[\\w-]*';
  return new RegExp(`(?<![\\w-])${old.endsWith('*') ? escapeRegExp(old.slice(0, -1)) + rest : `${escapeRegExp(old)}(?![\\w-])`}`, 'g');
}

/**
 * @param {string} text @param {number} line the line of its first character @param {RegExp} pattern
 * @param {(index: number) => boolean} [keep]
 */
function matchesIn(text, line, pattern, keep = () => true) {
  const lineOf = lineCounter(text, line);
  return [...text.matchAll(pattern)].filter((match) => keep(match.index)).map((match) => ({ name: match[0], line: lineOf(match.index) }));
}

/** The classes a text holds as selectors: `.name`. */
const selectorsIn = (/** @type {string} */ text, /** @type {number} */ line, /** @type {RegExp} */ pattern) =>
  matchesIn(text, line, pattern, (index) => text[index - 1] === '.');

/**
 * The classes a string holds: every one of a class list (`'im-row im-row--1'`), or those of the `class="…"` of its markup
 * and the `.name` of a selector in it.
 * @param {Str} str @param {RegExp} pattern
 */
function classesInString({ text, line, attribute }, pattern) {
  if (attribute !== undefined) return attribute === 'class' ? matchesIn(text, line, pattern) : [];
  if (/^[\s\w\u0001-]*$/.test(text)) return matchesIn(text, line, pattern);
  const lineOf = lineCounter(text, line);
  const inMarkup = [...text.matchAll(/\bclass(?:Name)?\s*=\s*(["'])([^"']*)\1/g)]
    .flatMap((match) => matchesIn(match[2], lineOf(match.index + match[0].indexOf(match[2])), pattern));
  return [...inMarkup, ...selectorsIn(text, line, pattern)];
}

/** The attributes a script reaches through dataset: `dataset.imSidebarOpen` is data-im-sidebar-open. */
const datasetAttributes = (/** @type {Source} */ source) => source.code
  .flatMap((chunk) => matchesIn(chunk.text, chunk.line, /(?<=\.dataset\.)[A-Za-z]\w*/g))
  .map(({ name, line }) => ({ name: `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, line }));

/**
 * Where a source writes any of these names, in the order of the lines, once per name and line. Comments are not read.
 * @param {Source} source @param {Removed[]} removed
 * @returns {Use[]}
 */
export function namesIn(source, removed) {
  const dataset = datasetAttributes(source);
  const uses = removed.flatMap((entry) => {
    const pattern = patternOf(entry);
    const whole = (/** @type {{ text: string, line: number }[]} */ texts) => texts.flatMap(({ text, line }) => matchesIn(text, line, pattern));
    const found = entry.kind === 'class'
      ? [...source.styles.flatMap(({ text, line }) => selectorsIn(text, line, pattern)), ...source.strings.flatMap((str) => classesInString(str, pattern))]
      : [...whole(source.styles), ...whole(source.strings)];
    if (entry.kind === 'attribute') found.push(...whole(source.code), ...dataset.filter(({ name }) => name.match(pattern)?.[0] === name));
    return found.map((use) => ({ ...use, entry }));
  });
  const seen = new Set();
  return uses.filter((use) => !seen.has(`${use.line} ${use.name}`) && seen.add(`${use.line} ${use.name}`)).sort((a, b) => a.line - b.line);
}
