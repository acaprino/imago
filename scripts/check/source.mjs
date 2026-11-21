// The text of a file into what the rules read: its stylesheets, its strings, its code and its comments, each with
// lines. A stylesheet is read by css.mjs; a script (.ts, .tsx, .js, .mjs) by the small lexer below, which knows
// comments, strings, template literals with their ${} and regular expressions; a page (.html) is split into its
// <style> and <script> blocks and the attributes of its tags.

import { parseCss, parseDeclarations } from './css.mjs';

/**
 * @typedef {import('./css.mjs').Sheet} Sheet
 * @typedef {import('./css.mjs').Rule} Rule
 * @typedef {import('./css.mjs').Comment} Comment
 * @typedef {{ text: string, line: number, before: string, template: boolean, attribute?: string }} Str
 *   A string of a script, or an attribute value of a page. In `text` each ${} of a template literal is the character
 *   DYNAMIC followed by as many new lines as the expression held, so that a line counted in `text` is a line of the file.
 *   `before` is the code just before the string (strings and comments in it blanked), or `name=` for an attribute.
 * @typedef {{ text: string, line: number }} Chunk
 *   Code with its strings' contents and its comments blanked, new lines kept.
 * @typedef {{ file: string, kind: 'css' | 'script' | 'html', sheets: Sheet[], strings: Str[], code: Chunk[], comments: Comment[] }} Source
 */

/** Stands for a ${} of a template literal: a name next to it is built at run time. */
export const DYNAMIC = '\u0001';

export const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
export const SOURCE_EXTENSIONS = ['.css', '.html', ...SCRIPT_EXTENSIONS];

/**
 * The line of a character of `text`.
 * @param {string} text
 * @param {number} offset
 * @param {number} firstLine the line of the first character
 */
export function lineAt(text, offset, firstLine) {
  let line = firstLine;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

/**
 * The same for many characters of one long text: its new lines are found once.
 * @param {string} text
 * @param {number} firstLine
 * @returns {(offset: number) => number}
 */
export function lineCounter(text, firstLine) {
  /** @type {number[]} */
  const breaks = [];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') breaks.push(i);
  return (offset) => {
    let low = 0;
    let high = breaks.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (breaks[middle] < offset) low = middle + 1;
      else high = middle;
    }
    return firstLine + low;
  };
}

/**
 * Reads a file by its extension.
 * @param {string} file the path from the root, with forward slashes
 * @param {string} text
 * @returns {Source}
 */
export function parseSource(file, text) {
  const lower = file.toLowerCase();
  if (lower.endsWith('.css')) {
    const sheet = parseCss(text);
    return { file, kind: 'css', sheets: [sheet], strings: [], code: [], comments: sheet.comments };
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return parseHtml(file, text);
  const lexed = lexScript(text);
  return {
    file,
    kind: 'script',
    sheets: [inlineSheet(lexed.strings)],
    strings: lexed.strings,
    code: [{ text: lexed.code, line: 1 }],
    comments: lexed.comments,
  };
}

/**
 * The module specifiers a source imports: `import x from '…'`, `import '…'`, `export … from '…'`, `import('…')`.
 * @param {Source} source
 * @returns {string[]}
 */
export function importsOf(source) {
  return source.strings
    .filter((str) => !str.template && /(?:\bfrom|\bimport)\s*\(?\s*$/.test(str.before))
    .map((str) => str.text);
}

// ---------- scripts ----------

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/**
 * Reads a script into its strings, its comments and its code.
 * @param {string} text
 * @param {number} [firstLine]
 * @returns {{ strings: Str[], comments: Comment[], code: string }}
 */
export function lexScript(text, firstLine = 1) {
  /** @type {Str[]} */
  const strings = [];
  /** @type {Comment[]} */
  const comments = [];
  const code = text.split('');
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (code[k] !== '\n' && code[k] !== '\r') code[k] = ' ';
  };
  const line = lineCounter(text, firstLine);
  const before = (offset) => code.slice(Math.max(0, offset - 120), offset).join('');

  /**
   * Whether a `/` at `offset` starts a regular expression: it does after an operator, and after some words. After a
   * value it divides, and after `<` it closes a JSX tag (`</div>`).
   */
  const regexAt = (offset) => {
    let k = offset - 1;
    while (k >= 0 && /\s/.test(code[k])) k--;
    if (k < 0) return true;
    const c = code[k];
    if (/[\w$]/.test(c)) {
      let start = k;
      while (start > 0 && /[\w$]/.test(code[start - 1])) start--;
      return REGEX_AFTER_WORD.has(code.slice(start, k + 1).join(''));
    }
    return !/[)\]}'"`<]/.test(c);
  };

  /** A quoted string from its opening quote; returns the index after it. */
  const quoted = (start) => {
    const quote = text[start];
    let i = start + 1;
    while (i < text.length && text[i] !== quote && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
    const end = Math.min(i, text.length);
    strings.push({ text: text.slice(start + 1, end), line: line(start), before: before(start), template: false });
    blank(start + 1, end);
    return text[end] === quote ? end + 1 : end;
  };

  /** A template literal from its backtick; returns the index after it. */
  const template = (start) => {
    const str = { text: '', line: line(start), before: before(start), template: true };
    strings.push(str);
    let i = start + 1;
    let literal = start + 1;
    while (i < text.length && text[i] !== '`') {
      if (text[i] === '\\') {
        i += 2;
        continue;
      }
      if (text[i] === '$' && text[i + 1] === '{') {
        str.text += text.slice(literal, i);
        blank(literal, i);
        const end = codeUntil(i + 2, true);
        str.text += DYNAMIC + '\n'.repeat(text.slice(i, end).split('\n').length - 1);
        i = end;
        literal = end;
        continue;
      }
      i++;
    }
    str.text += text.slice(literal, Math.min(i, text.length));
    blank(literal, Math.min(i, text.length));
    return i + 1;
  };

  /** A regular expression from its slash; returns the index after its flags. Like a string, it ends at a new line. */
  const regex = (start) => {
    let i = start + 1;
    let inClass = false;
    while (i < text.length && text[i] !== '\n') {
      const c = text[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
      i++;
    }
    blank(start + 1, i);
    if (text[i] !== '/') return i;
    i++;
    while (i < text.length && /[a-z]/i.test(text[i])) i++;
    return i;
  };

  /** Code from `start`; inside a template's ${}, until its closing brace (the index after it is returned). */
  const codeUntil = (start, inExpression) => {
    let depth = 0;
    let i = start;
    while (i < text.length) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '/' && next === '/') {
        const end = text.indexOf('\n', i);
        const stop = end === -1 ? text.length : end;
        comments.push({ text: text.slice(i + 2, stop), line: line(i) });
        blank(i, stop);
        i = stop;
        continue;
      }
      if (c === '/' && next === '*') {
        const end = text.indexOf('*/', i + 2);
        const stop = end === -1 ? text.length : end + 2;
        comments.push({ text: text.slice(i + 2, end === -1 ? text.length : end), line: line(i) });
        blank(i, stop);
        i = stop;
        continue;
      }
      if (c === '"' || c === "'") {
        i = quoted(i);
        continue;
      }
      if (c === '`') {
        i = template(i);
        continue;
      }
      if (c === '/' && regexAt(i)) {
        i = regex(i);
        continue;
      }
      if (inExpression) {
        if (c === '{') depth++;
        else if (c === '}') {
          if (depth === 0) return i + 1;
          depth--;
        }
      }
      i++;
    }
    return i;
  };

  codeUntil(0, false);
  return { strings, comments, code: code.join('') };
}

/**
 * The declarations a script writes as style: a `style="…"` in its markup, `el.style.prop = '…'`,
 * `el.style.setProperty('prop', '…')` and `el.style.cssText = '…'`. They form rules without a selector.
 * @param {Str[]} strings
 * @returns {Sheet}
 */
function inlineSheet(strings) {
  /** @type {Rule[]} */
  const rules = [];
  const add = (declarations, line) => {
    if (declarations.length) rules.push(inlineRule(declarations, line));
  };
  strings.forEach((str, index) => {
    if (str.attribute !== undefined) return;
    for (const match of str.text.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/g)) {
      const at = lineAt(str.text, (match.index ?? 0) + match[0].indexOf(match[2]), str.line);
      add(parseDeclarations(match[2], at), at);
    }
    const property = /\.style\.([A-Za-z]+)\s*=\s*$/.exec(str.before);
    if (property && property[1] !== 'cssText') {
      add(parseDeclarations(`${kebab(property[1])}: ${str.text}`, str.line), str.line);
      return;
    }
    if (/\.style\.cssText\s*=\s*$/.test(str.before)) {
      add(parseDeclarations(str.text, str.line), str.line);
      return;
    }
    const previous = strings[index - 1];
    // The property's string is blanked in `before`: setProperty('   ', is what precedes the value.
    if (previous && /\.setProperty\(\s*(["'`])\s*\1\s*,\s*$/.test(str.before)) {
      add(parseDeclarations(`${previous.text}: ${str.text}`, str.line), str.line);
    }
  });
  return { rules, atRules: [], comments: [] };
}

const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** @param {import('./css.mjs').Declaration[]} declarations @param {number} line @returns {Rule} */
const inlineRule = (declarations, line) => ({
  selector: '', selectors: [], line, declarations, atRules: [], parents: [], inline: true, keyframes: false, implicit: false,
});

// ---------- pages ----------

/**
 * @param {string} file
 * @param {string} text
 * @returns {Source}
 */
function parseHtml(file, text) {
  /** @type {Source} */
  const source = { file, kind: 'html', sheets: [], strings: [], code: [], comments: [] };
  let rest = text;
  const line = lineCounter(text, 1);
  const blankOut = (from, to) => {
    rest = rest.slice(0, from) + rest.slice(from, to).replace(/[^\n]/g, ' ') + rest.slice(to);
  };

  for (const match of text.matchAll(/<!--([\s\S]*?)-->/g)) {
    const at = match.index ?? 0;
    source.comments.push({ text: match[1], line: line(at) });
    blankOut(at, at + match[0].length);
  }
  for (const match of rest.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style\s*>/gi)) {
    const at = (match.index ?? 0) + match[1].length;
    const sheet = parseCss(match[2], line(at));
    source.sheets.push(sheet);
    source.comments.push(...sheet.comments);
    blankOut(at, at + match[2].length);
  }
  for (const match of rest.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script\s*>/gi)) {
    const at = (match.index ?? 0) + match[1].length;
    const first = line(at);
    const lexed = lexScript(match[2], first);
    source.strings.push(...lexed.strings);
    source.code.push({ text: lexed.code, line: first });
    source.comments.push(...lexed.comments);
    blankOut(at, at + match[2].length);
  }
  source.sheets.push(inlineSheet(source.strings));

  /** @type {Rule[]} */
  const styles = [];
  for (const tag of rest.matchAll(/<[A-Za-z][\w:-]*(?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*\s*\/?>/g)) {
    const tagAt = tag.index ?? 0;
    for (const attribute of tag[0].matchAll(/\s([^\s=>"'/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g)) {
      const name = attribute[1].toLowerCase();
      const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
      const at = line(tagAt + (attribute.index ?? 0) + attribute[0].indexOf('=') + 1);
      source.strings.push({ text: value, line: at, before: `${name}=`, template: false, attribute: name });
      if (name === 'style') {
        const declarations = parseDeclarations(value, at);
        if (declarations.length) styles.push(inlineRule(declarations, at));
      }
    }
  }
  source.sheets.push({ rules: styles, atRules: [], comments: [] });
  source.code.unshift({ text: rest, line: 1 });
  return source;
}
