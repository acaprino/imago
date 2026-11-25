// The text of a file into what the rules read: its styles, its strings, its code and its comments, each with lines. A
// stylesheet is read without its comments; a script (.ts, .tsx, .js, .mjs) by the small lexer below, which knows comments,
// strings, template literals with their ${} and regular expressions; a page (.html) is split into its <style> and <script>
// blocks and the attributes of its tags. The imports of a script are read from its code.

/**
 * @typedef {{ text: string, line: number, attribute?: string, at?: number }} Str
 *   A string of a script, or the value of an `attribute` of a page. In `text` each ${} of a template literal is the
 *   character DYNAMIC followed by as many new lines as the expression held, so that a line counted in `text` is a line of
 *   the file. `at` is the offset of a quoted string's opening quote in the code it was lexed from.
 * @typedef {{ text: string, line: number }} Chunk
 *   Code with its strings' contents and its comments blanked, or CSS with its comments blanked, new lines kept.
 * @typedef {{ text: string, line: number }} Comment
 * @typedef {{ specifier: string, line: number, names: string[], namespace: string | null }} Import
 *   A module a script imports, or re-exports, with `import … from` or `export … from`: the names it takes of it (types left
 *   out), and the name of `* as ns`.
 * @typedef {{ file: string, kind: 'css' | 'script' | 'html', styles: Chunk[], strings: Str[], code: Chunk[], comments: Comment[], imports: Import[] }} Source
 */

/** Stands for a ${} of a template literal: a name next to it is built at run time. */
const DYNAMIC = '\u0001';

export const SOURCE_EXTENSIONS = ['.css', '.html', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

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
  if (lower.endsWith('.css')) return { file, kind: 'css', strings: [], code: [], imports: [], ...styleOf(text, 1) };
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return parseHtml(file, text);
  const { strings, comments, code } = lexScript(text);
  return { file, kind: 'script', styles: [], strings, code: [{ text: code, line: 1 }], comments, imports: importsIn(code, strings, 1) };
}

const blanked = (/** @type {string} */ text) => text.replace(/[^\n]/g, ' ');

/** A stylesheet without its comments, and its comments. A comment mark inside a string is not one. */
function styleOf(/** @type {string} */ text, /** @type {number} */ firstLine) {
  const line = lineCounter(text, firstLine);
  /** @type {Comment[]} */
  const comments = [];
  const clean = text.replace(/"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|\/\*([\s\S]*?)(?:\*\/|$)/g, (match, comment, at) => {
    if (!match.startsWith('/*')) return match;
    comments.push({ text: comment, line: line(at) });
    return blanked(match);
  });
  return { styles: [{ text: clean, line: firstLine }], comments };
}

// ---------- scripts ----------

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/**
 * Reads a script into its strings, its comments and its code.
 * @param {string} text
 * @param {number} [firstLine]
 * @returns {{ strings: Str[], comments: Comment[], code: string }}
 */
function lexScript(text, firstLine = 1) {
  /** @type {Str[]} */
  const strings = [];
  /** @type {Comment[]} */
  const comments = [];
  const code = text.split('');
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (code[k] !== '\n' && code[k] !== '\r') code[k] = ' ';
  };
  const line = lineCounter(text, firstLine);

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
    strings.push({ text: text.slice(start + 1, end), line: line(start), at: start });
    blank(start + 1, end);
    return text[end] === quote ? end + 1 : end;
  };

  /** A template literal from its backtick; returns the index after it. */
  const template = (start) => {
    const str = { text: '', line: line(start) };
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

// A statement of a script's code (its strings blanked, their quotes kept) that names a module: the quote that ends the match
// opens the specifier.
const IMPORT = /(?<![\w$.])(?:import|export)(?![\w$])(\s*type(?![\w$]))?([\w$\s{},*]*?)(?<![\w$])from\s*(?=["'])/g;

/**
 * The imports of a script that are not of types alone.
 * @param {string} code @param {Str[]} strings @param {number} firstLine
 * @returns {Import[]}
 */
function importsIn(code, strings, firstLine) {
  const byOffset = new Map(strings.map((str) => [str.at, str.text]));
  const line = lineCounter(code, firstLine);
  return [...code.matchAll(IMPORT)].flatMap((match) => {
    const specifier = byOffset.get(match.index + match[0].length);
    if (specifier === undefined || match[1]) return [];
    const names = (/\{([^}]*)\}/.exec(match[2])?.[1] ?? '').split(',').flatMap((part) => {
      const name = /^\s*(type\s+)?([\w$]+)(?:\s+as\s+[\w$]+)?\s*$/.exec(part);
      return name && !name[1] ? [name[2]] : [];
    });
    return [{ specifier, line: line(match.index), names, namespace: /\*\s*as\s+([\w$]+)/.exec(match[2])?.[1] ?? null }];
  });
}

// ---------- pages ----------

/**
 * @param {string} file
 * @param {string} text
 * @returns {Source}
 */
function parseHtml(file, text) {
  /** @type {Source} */
  const source = { file, kind: 'html', styles: [], strings: [], code: [], comments: [], imports: [] };
  const line = lineCounter(text, 1);
  let rest = text.replace(/<!--([\s\S]*?)-->/g, (match, comment, at) => {
    source.comments.push({ text: comment, line: line(at) });
    return blanked(match);
  });
  rest = rest.replace(/(<style\b[^>]*>)([\s\S]*?)(?=<\/style\s*>)/gi, (match, open, css, at) => {
    const { styles, comments } = styleOf(css, line(at + open.length));
    source.styles.push(...styles);
    source.comments.push(...comments);
    return open + blanked(css);
  });
  rest = rest.replace(/(<script\b[^>]*>)([\s\S]*?)(?=<\/script\s*>)/gi, (match, open, script, at) => {
    const first = line(at + open.length);
    const { strings, comments, code } = lexScript(script, first);
    source.strings.push(...strings);
    source.comments.push(...comments);
    source.code.push({ text: code, line: first });
    source.imports.push(...importsIn(code, strings, first));
    return open + blanked(script);
  });
  for (const tag of rest.matchAll(/<[A-Za-z][\w:-]*(?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*\s*\/?>/g)) {
    for (const attribute of tag[0].matchAll(/\s([^\s=>"'/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g)) {
      const at = line(tag.index + attribute.index + attribute[0].indexOf('=') + 1);
      source.strings.push({ text: attribute[2] ?? attribute[3] ?? attribute[4] ?? '', line: at, attribute: attribute[1].toLowerCase() });
    }
  }
  source.code.unshift({ text: rest, line: 1 });
  return source;
}
