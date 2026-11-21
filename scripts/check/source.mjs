// The text of a file into what the rules read: its stylesheets, its strings, its code, its comments and its imports,
// each with lines. A stylesheet is read by css.mjs; a script (.ts, .tsx, .js, .mjs) by the small lexer below, which
// knows comments, strings, template literals with their ${} and regular expressions; a page (.html) is split into its
// <style> and <script> blocks and the attributes of its tags. The style a script writes (a style attribute in its
// markup, `.style.x =`, setProperty, cssText, setAttribute('style', …), a React `style={{ … }}` object) and the colour
// of a <meta name="theme-color"> are read as rules without a selector.

import { parseCss, parseDeclarations } from './css.mjs';

/**
 * @typedef {import('./css.mjs').Sheet} Sheet
 * @typedef {import('./css.mjs').Rule} Rule
 * @typedef {import('./css.mjs').Comment} Comment
 * @typedef {{ text: string, line: number, before: string, template: boolean, attribute?: string, at?: number, lead?: string }} Str
 *   A string of a script, or an attribute value of a page. In `text` each ${} of a template literal is the character
 *   DYNAMIC followed by as many new lines as the expression held, so that a line counted in `text` is a line of the file.
 *   `before` is the code just before the string (strings and comments in it blanked), or `name=` for an attribute.
 *   `at` is the offset of a script string's opening quote in the code it was lexed from.
 *   `lead` is, for a string inside the ${} of a template literal, the text of that template before the ${ (its own substitutions as DYNAMIC).
 * @typedef {{ text: string, line: number }} Chunk
 *   Code with its strings' contents and its comments blanked, new lines kept.
 * @typedef {{ imported: string, local: string }} Binding
 * @typedef {{ specifier: string, line: number, kind: 'import' | 'export' | 'dynamic', type: boolean, names: Binding[], namespace: string | null }} Import
 *   A module a script imports (`import`, `import('…')`) or re-exports (`export … from`), with the names it binds:
 *   `names` are the named bindings, `namespace` the name of `* as ns`. `type` marks `import type`.
 * @typedef {{ local: string, name: string }} Exported
 *   A binding of the module that `export { local as name }` exports, without `from`.
 * @typedef {{ file: string, kind: 'css' | 'script' | 'html', sheets: Sheet[], strings: Str[], code: Chunk[], comments: Comment[], imports: Import[], exported: Exported[] }} Source
 */

/** Stands for a ${} of a template literal: a name next to it is built at run time. */
export const DYNAMIC = '\u0001';

export const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
/** The scripts that can hold JSX (a page's scripts can too). */
const JSX_FILE = /\.(?:tsx|jsx|js|mjs)$/;
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
    return { file, kind: 'css', sheets: [sheet], strings: [], code: [], comments: sheet.comments, imports: [], exported: [] };
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return parseHtml(file, text);
  const lexed = lexScript(text);
  const sheet = inlineSheet(lexed.strings);
  sheet.rules.push(...styleObjects(lexed.code, lexed.strings, 1));
  // JSX is in a .tsx or a .jsx, and may be in a .js or a .mjs; a .ts cannot hold it, and `i<n` there is a comparison.
  if (JSX_FILE.test(lower)) sheet.rules.push(...jsxColors(lexed.code, lexed.strings, 1));
  return {
    file,
    kind: 'script',
    sheets: [sheet],
    strings: lexed.strings,
    code: [{ text: lexed.code, line: 1 }],
    comments: lexed.comments,
    imports: importsIn(lexed.code, lexed.strings, 1),
    exported: exportedIn(lexed.code),
  };
}

/**
 * The module specifiers a source imports: `import x from '…'`, `import '…'`, `export … from '…'`, `import('…')`.
 * @param {Source} source
 * @returns {string[]}
 */
export function importsOf(source) {
  return source.imports.map((each) => each.specifier);
}

// The statements of a script's code (its strings blanked, their quotes kept) that name a module: the quote that ends
// each match opens the specifier.
const STATIC_IMPORT = /(?<![\w$.])(import|export)(?![\w$])((?:\s*type(?![\w$]))?[\w$\s{},*]*?)(?<![\w$])from\s*(?=["'])/g;
const BARE_IMPORT = /(?<![\w$.])import\s*(?=["'])/g;
const DYNAMIC_IMPORT = /(?<![\w$.])import\s*\(\s*(?=["'])/g;

/**
 * The imports of a script: each module it imports or re-exports, with the names it binds.
 * @param {string} code the code of the script, its strings blanked
 * @param {Str[]} strings its strings, with their offsets in `code`
 * @param {number} firstLine
 * @returns {Import[]}
 */
function importsIn(code, strings, firstLine) {
  const byOffset = new Map(strings.flatMap((str) => (str.at === undefined || str.template ? [] : [[str.at, str]])));
  const line = lineCounter(code, firstLine);
  /** @type {(Import & { at: number })[]} */
  const found = [];
  const add = (/** @type {RegExpMatchArray} */ match, /** @type {Import['kind']} */ kind, /** @type {{ names: Binding[], namespace: string | null }} */ bound) => {
    const at = (match.index ?? 0) + match[0].length;
    const specifier = byOffset.get(at);
    if (specifier) found.push({ specifier: specifier.text, line: line(match.index ?? 0), kind, type: /^\s*type\b/.test(match[2] ?? ''), ...bound, at });
  };
  for (const match of code.matchAll(STATIC_IMPORT)) add(match, /** @type {'import' | 'export'} */ (match[1]), bindingsOf(match[2].replace(/^\s*type\b/, '')));
  for (const match of code.matchAll(BARE_IMPORT)) add(match, 'import', { names: [], namespace: null });
  for (const match of code.matchAll(DYNAMIC_IMPORT)) {
    // `const { a, b: c } = await import('…')` binds a and c.
    const pattern = /(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*(?:await\s+)?$/.exec(code.slice(Math.max(0, (match.index ?? 0) - 400), match.index));
    const names = (pattern?.[1] ?? '').split(',').flatMap((part) => {
      const name = /^\s*([\w$]+)(?:\s*:\s*([\w$]+))?\s*$/.exec(part);
      return name ? [{ imported: name[1], local: name[2] ?? name[1] }] : [];
    });
    add(match, 'dynamic', { names, namespace: null });
  }
  return found.sort((a, b) => a.at - b.at).map(({ at, ...each }) => each);
}

/**
 * The bindings a script exports by `export { a, b as c }`, without `from` (those with `from` are imports).
 * @param {string} code the code of the script, its strings blanked
 * @returns {Exported[]}
 */
function exportedIn(code) {
  return [...code.matchAll(/(?<![\w$.])export\s*\{([^{}]*)\}(?!\s*from\s*["'])/g)].flatMap((match) => bindingsOf(`{${match[1]}}`).names.map(({ imported, local }) => ({ local: imported, name: local })));
}

/**
 * The names an import clause binds: `a, { b, c as d, type E }, * as ns` (a default import is the name `default`).
 * @param {string} clause
 */
function bindingsOf(clause) {
  /** @type {Binding[]} */
  const names = [];
  const braces = /\{([^}]*)\}/.exec(clause);
  for (const part of braces ? braces[1].split(',') : []) {
    const name = /^\s*(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(part);
    if (name) names.push({ imported: name[1], local: name[2] ?? name[1] });
  }
  const namespace = /\*\s*as\s+([\w$]+)/.exec(clause)?.[1] ?? null;
  const rest = clause.replace(/\{[^}]*\}/, '').replace(/\*(?:\s*as\s+[\w$]+)?/, '').replace(/,/g, ' ').trim();
  if (/^[\w$]+$/.test(rest)) names.push({ imported: 'default', local: rest });
  return { names, namespace };
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
    strings.push({ text: text.slice(start + 1, end), line: line(start), before: before(start), template: false, at: start });
    blank(start + 1, end);
    return text[end] === quote ? end + 1 : end;
  };

  /** A template literal from its backtick; returns the index after it. */
  const template = (start) => {
    const str = { text: '', line: line(start), before: before(start), template: true, at: start };
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
        const inside = strings.length;
        const end = codeUntil(i + 2, true);
        for (const nested of strings.slice(inside)) nested.lead ??= str.text;
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
 * `el.style.setProperty('prop', '…')`, `el.style.cssText = '…'` and `el.setAttribute('style', '…')`; the colour of a
 * `<meta name="theme-color">` and of the attributes of COLOR_ATTRIBUTES in its markup; and the colours a canvas
 * context is given (`ctx.fillStyle = '…'`, strokeStyle, shadowColor). They form rules without a selector. The same
 * attributes in JSX are read from the code, by jsxColors.
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
    const lineOf = lineCounter(str.text, str.line);
    for (const match of str.text.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/g)) {
      const at = lineOf((match.index ?? 0) + match[0].indexOf(match[2]));
      add(parseDeclarations(match[2], at), at);
    }
    for (const match of str.text.matchAll(/<meta\b[^>]*>/gi)) {
      const at = lineOf(match.index ?? 0);
      const color = themeColor(match[0]);
      if (color !== null) add(parseDeclarations(`theme-color: ${color}`, at), at);
    }
    for (const match of str.text.matchAll(MARKUP_COLOR)) {
      const at = lineOf(match.index ?? 0);
      add(parseDeclarations(`${match[1].toLowerCase()}: ${match[2] ?? match[3] ?? ''}`, at), at);
    }
    const canvas = /\.(fillStyle|strokeStyle|shadowColor)\s*=\s*$/.exec(str.before);
    if (canvas) {
      add(parseDeclarations(`${kebab(canvas[1])}: ${str.text}`, str.line), str.line);
      return;
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
    if (previous?.text.toLowerCase() === 'style' && /\.setAttribute\(\s*(["'`])\s*\1\s*,\s*$/.test(str.before)) {
      add(parseDeclarations(str.text, str.line), str.line);
    }
  });
  return { rules, atRules: [], comments: [] };
}

/** The attributes of markup that take a colour: the presentation attributes of SVG, and color. */
const COLOR_ATTRIBUTES = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color']);
// One of them with its value in the markup a string holds; `data-fill` and `stroke-width` are not one.
const MARKUP_COLOR = /(?<![\w:-])(fill|stroke|stop-color|flood-color|lighting-color|color)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
// One of them, with its JSX name, just before the string that is its value: `fill="…"`, `stopColor={'…'}`.
const JSX_COLOR = /(?<=\s)(fill|stroke|stopColor|floodColor|lightingColor|color|stop-color|flood-color|lighting-color)\s*=\s*\{?\s*$/;

/**
 * The colours of the attributes of COLOR_ATTRIBUTES in JSX (`<path d={d} fill="#fff" />`), however far the attribute
 * is from the `<` of its tag. Only for code that can hold JSX: parseSource does not call it for a .ts file.
 * @param {string} code the code of the script, its strings blanked
 * @param {Str[]} strings its strings, with their offsets in `code`
 * @param {number} firstLine
 * @returns {Rule[]}
 */
function jsxColors(code, strings, firstLine) {
  const line = lineCounter(code, firstLine);
  /** @type {Uint8Array | null} */
  let inside = null;
  /** @type {Rule[]} */
  const rules = [];
  for (const str of strings) {
    if (str.at === undefined) continue;
    const head = code.slice(Math.max(0, str.at - 40), str.at);
    const attribute = JSX_COLOR.exec(head);
    if (!attribute) continue;
    inside ??= tagStates(code);
    if (!inside[str.at - head.length + (attribute.index ?? 0) - 1]) continue;
    const at = line(str.at);
    const declarations = parseDeclarations(`${kebab(attribute[1])}: ${str.text}`, at);
    if (declarations.length) rules.push(inlineRule(declarations, at));
  }
  return rules;
}

// What a JSX tag holds between its name and its end: names, spaces, `=`, `.`, `:`, `-`, and strings, blanked so that
// a quote holds only spaces. A `{ … }` is skipped whole.
const IN_A_TAG = /[\w$\s=."'`:-]/;

/**
 * For each character of the code, whether it is inside a JSX tag that has not closed: after a `<` and the letter of a
 * tag's name, with only what a tag holds since. A `>`, a `/`, a `;`, a parenthesis, a comma or an operator ends it, so
 * `const fill = '#fff'` and `({ fill = '#fff' }) =>` are not in a tag. One pass over the code: each `{` opens a level
 * of its own (an expression, which may hold a tag of its own), and its `}` gives the level outside its state again.
 * @param {string} code the code of the script, its strings blanked
 * @returns {Uint8Array} 1 at each character inside a tag
 */
function tagStates(code) {
  const inside = new Uint8Array(code.length);
  /** @type {boolean[]} */
  const levels = [];
  let open = false;
  for (let k = 0; k < code.length; k++) {
    const c = code[k];
    if (c === '{') {
      levels.push(open);
      open = false;
    } else if (c === '}') open = levels.pop() ?? false;
    else if (c === '<' && /[A-Za-z]/.test(code[k + 1] ?? '')) open = true;
    else if (open && !IN_A_TAG.test(c)) open = false;
    inside[k] = open ? 1 : 0;
  }
  return inside;
}

/** The content of a `<meta name="theme-color" content="…">` tag, or null for another tag. */
function themeColor(/** @type {string} */ tag) {
  /** @type {Record<string, string>} */
  const attributes = {};
  for (const match of tag.matchAll(/\s([^\s=>"'/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g)) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return attributes.name?.toLowerCase() === 'theme-color' && attributes.content !== undefined ? attributes.content : null;
}

const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** A key of a React style object as the CSS property it writes: `fontSize` is font-size, `WebkitMask` -webkit-mask. */
const cssProperty = (/** @type {string} */ key) => (key.startsWith('--') ? key : kebab(key.replace(/^(Webkit|Moz|ms|O)(?=[A-Z])/, (prefix) => `-${prefix.toLowerCase()}`)));

/**
 * The declarations of each React `style={{ … }}` object in a script's code: a key with a string, a template or a
 * number for its value. React writes a number in pixels (the properties it leaves without a unit, as lineHeight and
 * opacity, are none the rules judge); a value computed at run time and a spread are not read.
 * @param {string} code the code of the script, its strings blanked
 * @param {Str[]} strings its strings, with their offsets in `code`
 * @param {number} firstLine
 * @returns {Rule[]}
 */
function styleObjects(code, strings, firstLine) {
  const byOffset = new Map(strings.flatMap((str) => (str.at === undefined ? [] : [[str.at, str]])));
  const line = lineCounter(code, firstLine);
  /** @type {Rule[]} */
  const rules = [];
  for (const match of code.matchAll(/(?<![\w$-])style\s*=\s*\{\s*\{/g)) {
    const start = (match.index ?? 0) + match[0].length;
    /** @type {[number, number][]} */
    const entries = [];
    let depth = 0;
    let from = start;
    let end = -1;
    for (let k = start; k < code.length && end === -1; k++) {
      const c = code[k];
      if (c === '{' || c === '[' || c === '(') depth++;
      else if (c === '}' || c === ']' || c === ')') {
        if (depth === 0) end = k;
        else depth--;
      } else if (c === ',' && depth === 0) {
        entries.push([from, k]);
        from = k + 1;
      }
    }
    if (end === -1) continue;
    entries.push([from, end]);
    const declarations = entries.flatMap(([a, b]) => styleEntry(code, byOffset, a, b, line));
    if (declarations.length) rules.push(inlineRule(declarations, line(match.index ?? 0)));
  }
  return rules;
}

/**
 * The declaration of one `key: value` of a style object, from `a` to `b` in the code; none for anything else.
 * @param {string} code @param {Map<number, Str>} byOffset @param {number} a @param {number} b @param {(offset: number) => number} line
 * @returns {import('./css.mjs').Declaration[]}
 */
function styleEntry(code, byOffset, a, b, line) {
  let k = a;
  while (k < b && /\s/.test(code[k])) k++;
  let key = '';
  if (code[k] === '"' || code[k] === "'") {
    const str = byOffset.get(k);
    if (!str) return [];
    key = str.text;
    k += str.text.length + 2;
  } else {
    const name = /^[A-Za-z_$][\w$]*/.exec(code.slice(k, b));
    if (!name) return [];
    key = name[0];
    k += name[0].length;
  }
  while (k < b && /\s/.test(code[k])) k++;
  if (code[k] !== ':') return [];
  k++;
  while (k < b && /\s/.test(code[k])) k++;
  const value = code.slice(k, b).trim();
  const property = cssProperty(key);
  let text = '';
  if (/^(["'])[^"'`]*\1$/.test(value) || /^`[^`]*`$/.test(value)) {
    const str = byOffset.get(k);
    if (!str) return [];
    text = str.text;
  } else if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
    text = Number(value) === 0 || property.startsWith('--') ? value : `${value}px`;
  } else return [];
  return parseDeclarations(`${property}: ${text}`, line(k));
}

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
  const source = { file, kind: 'html', sheets: [], strings: [], code: [], comments: [], imports: [], exported: [] };
  /** @type {Rule[]} */
  const objects = [];
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
    source.imports.push(...importsIn(lexed.code, lexed.strings, first));
    source.exported.push(...exportedIn(lexed.code));
    objects.push(...styleObjects(lexed.code, lexed.strings, first), ...jsxColors(lexed.code, lexed.strings, first));
    blankOut(at, at + match[2].length);
  }
  const scripts = inlineSheet(source.strings);
  scripts.rules.push(...objects);
  source.sheets.push(scripts);

  /** @type {Rule[]} */
  const styles = [];
  for (const tag of rest.matchAll(/<[A-Za-z][\w:-]*(?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*\s*\/?>/g)) {
    const tagAt = tag.index ?? 0;
    const color = /^<meta\b/i.test(tag[0]) ? themeColor(tag[0]) : null;
    if (color !== null) {
      const at = line(tagAt);
      styles.push(inlineRule(parseDeclarations(`theme-color: ${color}`, at), at));
    }
    for (const attribute of tag[0].matchAll(/\s([^\s=>"'/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g)) {
      const name = attribute[1].toLowerCase();
      const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
      const at = line(tagAt + (attribute.index ?? 0) + attribute[0].indexOf('=') + 1);
      source.strings.push({ text: value, line: at, before: `${name}=`, template: false, attribute: name });
      if (name === 'style') {
        const declarations = parseDeclarations(value, at);
        if (declarations.length) styles.push(inlineRule(declarations, at));
      }
      if (COLOR_ATTRIBUTES.has(name)) {
        const declarations = parseDeclarations(`${name}: ${value}`, at);
        if (declarations.length) styles.push(inlineRule(declarations, at));
      }
    }
  }
  source.sheets.push({ rules: styles, atRules: [], comments: [] });
  source.code.unshift({ text: rest, line: 1 });
  return source;
}
