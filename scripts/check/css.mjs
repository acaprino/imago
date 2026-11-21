// The text of a stylesheet into its rules: each with its selector list, its declarations, the chain of at-rules round
// it and its line. A hand-written scanner, so that the check needs no dependency: it knows comments, strings, unquoted
// url(), nested blocks, CSS nesting and a custom property whose value holds braces, and it counts lines as it goes.
// At the end of the file are the words of CSS the rules need: the colours, the units, the properties that take a colour.

/**
 * @typedef {{ name: string, prelude: string, line: number }} AtRule
 * @typedef {{ property: string, value: string, important: boolean, line: number, endLine: number }} Declaration
 * @typedef {{
 *   selector: string,
 *   selectors: string[],
 *   line: number,
 *   declarations: Declaration[],
 *   atRules: AtRule[],
 *   parents: string[],
 *   inline: boolean,
 *   keyframes: boolean,
 *   implicit: boolean,
 * }} Rule
 *   `atRules` are the at-rules the rule sits in, outermost first; `parents` the selectors of the rules it is nested in;
 *   `inline` marks the declarations of a style attribute or of a script's `style`, which have no selector;
 *   `implicit` the declarations written straight inside an at-rule (`@font-face`, or `@media` nested in a rule, which
 *   then takes the selector of that rule); `keyframes` the steps of a `@keyframes`.
 * @typedef {{ text: string, line: number }} Comment
 * @typedef {{ rules: Rule[], atRules: AtRule[], comments: Comment[] }} Sheet
 * @typedef {{ name: string, arg: string | null }} Fn
 *   A function round a token; `arg` is the custom property a `var()` reads.
 * @typedef {{
 *   type: 'string' | 'hash' | 'number' | 'dimension' | 'percentage' | 'ident' | 'function' | 'url' | 'open' | 'close' | 'comma' | 'slash' | 'delim',
 *   text: string,
 *   number?: number,
 *   unit?: string,
 *   name?: string,
 *   fns: Fn[],
 * }} Token
 */

const collapse = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Reads a stylesheet.
 * @param {string} text
 * @param {number} [firstLine] the line of the first character, for a stylesheet inside a page
 * @returns {Sheet}
 */
export function parseCss(text, firstLine = 1) {
  /** @type {Sheet} */
  const sheet = { rules: [], atRules: [], comments: [] };
  /** @type {({ kind: 'rule', rule: Rule } | { kind: 'at', atRule: AtRule, implicit: Rule | null })[]} */
  const stack = [];
  let buffer = '';
  let bufferLine = firstLine;
  // The line of the last character of the buffer that is not a space: where a statement without a `;` ends.
  let bufferEnd = firstLine;
  let line = firstLine;
  let parens = 0;
  // The braces open in the value of a custom property (`--x: { … }`), which are part of the value, not a block.
  let braces = 0;
  let i = 0;

  const startBuffer = () => {
    if (!buffer.trim()) bufferLine = line;
  };
  /** Appends text that is not a space, which ends on the current line. */
  const take = (/** @type {string} */ part) => {
    buffer += part;
    bufferEnd = line;
  };
  const chain = () => stack.flatMap((entry) => (entry.kind === 'at' ? [entry.atRule] : []));
  const parents = () => stack.flatMap((entry) => (entry.kind === 'rule' ? [entry.rule.selector] : []));
  const inKeyframes = () => chain().some((at) => /keyframes$/.test(at.name));

  /** @param {string} selector @param {number} at @param {boolean} implicit @returns {Rule} */
  const makeRule = (selector, at, implicit) => ({
    selector,
    selectors: splitSelectors(selector),
    line: at,
    declarations: [],
    atRules: chain(),
    parents: parents(),
    inline: false,
    keyframes: inKeyframes(),
    implicit,
  });

  const open = () => {
    const prelude = collapse(buffer);
    if (prelude.startsWith('@')) {
      const match = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
      const atRule = { name: (match?.[1] ?? '').toLowerCase(), prelude: match?.[2] ?? '', line: bufferLine };
      sheet.atRules.push(atRule);
      stack.push({ kind: 'at', atRule, implicit: null });
    } else {
      const rule = makeRule(prelude, prelude ? bufferLine : line, false);
      sheet.rules.push(rule);
      stack.push({ kind: 'rule', rule });
    }
    buffer = '';
    parens = 0;
  };

  /**
   * A statement that ended in `;` or `}`: a declaration, or an at-rule without a block. It ends on `endLine`: the line
   * of its `;`, or, without one, the line of its own last character.
   */
  const flush = (endLine = bufferEnd) => {
    const statement = buffer.trim();
    buffer = '';
    parens = 0;
    braces = 0;
    if (!statement) return;
    if (statement.startsWith('@')) {
      const match = /^@([\w-]+)\s*([\s\S]*)$/.exec(collapse(statement));
      sheet.atRules.push({ name: (match?.[1] ?? '').toLowerCase(), prelude: match?.[2] ?? '', line: bufferLine });
      return;
    }
    const top = stack[stack.length - 1];
    if (!top) return;
    const declaration = readDeclaration(statement, bufferLine, endLine);
    if (!declaration) return;
    if (top.kind === 'rule') {
      top.rule.declarations.push(declaration);
      return;
    }
    // A declaration straight inside an at-rule: @font-face, @property, or @media nested in a rule (CSS nesting).
    if (!top.implicit) {
      const owner = [...stack].reverse().find((entry) => entry.kind === 'rule');
      top.implicit = makeRule(owner && owner.kind === 'rule' ? owner.rule.selector : '', bufferLine, true);
      sheet.rules.push(top.implicit);
    }
    top.implicit.declarations.push(declaration);
  };

  while (i < text.length) {
    const c = text[i];
    if (c === '\n') {
      line++;
      buffer += ' ';
      i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      const body = text.slice(i + 2, end === -1 ? text.length : end);
      sheet.comments.push({ text: body, line });
      line += countLines(body);
      buffer += ' ';
      i = stop;
      continue;
    }
    if (c === '\\') {
      // An escaped character (`.sm\:grid`, `\{`) is part of the name it is in, never a brace or a semicolon.
      startBuffer();
      if (text[i + 1] === '\n') line++;
      take(text.slice(i, i + 2));
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      startBuffer();
      const end = stringEnd(text, i);
      const raw = text.slice(i, end);
      line += countLines(raw);
      take(raw);
      i = end;
      continue;
    }
    if (c === '(') {
      startBuffer();
      if (/(?:^|[^\w-])url$/i.test(buffer)) {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] !== '"' && text[j] !== "'") {
          const close = text.indexOf(')', j);
          const stop = close === -1 ? text.length : close + 1;
          const raw = text.slice(i, stop);
          line += countLines(raw);
          take(raw);
          i = stop;
          continue;
        }
      }
      parens++;
      take(c);
      i++;
      continue;
    }
    if (c === ')') {
      parens = Math.max(0, parens - 1);
      take(c);
      i++;
      continue;
    }
    if (c === '{') {
      // A brace in the value of a custom property is part of the value: `--x: { … }` is a declaration, as CSS reads it.
      if (braces > 0 || /^\s*--[\w-]*\s*:/.test(buffer)) {
        braces++;
        take(c);
      } else open();
      i++;
      continue;
    }
    if (c === '}') {
      if (braces > 0) {
        braces--;
        take(c);
      } else {
        flush();
        stack.pop();
      }
      i++;
      continue;
    }
    if (c === ';' && parens === 0 && braces === 0) {
      flush(line);
      i++;
      continue;
    }
    if (!/\s/.test(c)) {
      startBuffer();
      take(c);
    } else buffer += c;
    i++;
  }
  flush();
  return sheet;
}

/**
 * Reads the declarations of a style attribute: `color: x; padding: y`.
 * @param {string} text
 * @param {number} [firstLine]
 * @returns {Declaration[]}
 */
export function parseDeclarations(text, firstLine = 1) {
  const sheet = parseCss(`{${text}}`, firstLine);
  return sheet.rules[0]?.declarations ?? [];
}

/**
 * @param {string} statement
 * @param {number} line
 * @param {number} endLine
 * @returns {Declaration | null}
 */
function readDeclaration(statement, line, endLine) {
  const colon = statement.indexOf(':');
  if (colon === -1) return null;
  const name = statement.slice(0, colon).trim();
  if (!/^(?:--[\w-]*|-?[A-Za-z_][\w-]*)$/.test(name)) return null;
  let value = collapse(statement.slice(colon + 1));
  const important = /!\s*important$/i.test(value);
  if (important) value = value.replace(/\s*!\s*important$/i, '');
  return { property: name.startsWith('--') ? name : name.toLowerCase(), value, important, line, endLine };
}

/** The index just after the string that starts at `start`; a string ends at its quote or, unclosed, at a new line. */
function stringEnd(text, start) {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    if (c === '\n') return i;
    i++;
  }
  return text.length;
}

const countLines = (text) => {
  let count = 0;
  for (const c of text) if (c === '\n') count++;
  return count;
};

/**
 * Splits a selector list at its top-level commas.
 * @param {string} selector
 * @returns {string[]}
 */
export function splitSelectors(selector) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '"' || c === "'") {
      const end = stringEnd(selector, i);
      current += selector.slice(i, end);
      i = end - 1;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    if (c === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * The classes a selector names, once each, in order; the values of attribute selectors and strings are not classes.
 * @param {string} selector
 * @returns {string[]}
 */
export function classesOf(selector) {
  const bare = withoutAttributes(selector);
  return [...new Set([...bare.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((match) => match[1]))];
}

/**
 * The selector with its strings and the insides of its attribute selectors left out (the brackets stay).
 * @param {string} selector
 */
export function withoutAttributes(selector) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '"' || c === "'") {
      i = stringEnd(selector, i) - 1;
      continue;
    }
    if (c === '[') {
      if (depth === 0) out += '[';
      depth++;
      continue;
    }
    if (c === ']' && depth > 0) {
      depth--;
      if (depth === 0) out += ']';
      continue;
    }
    if (depth === 0) out += c;
  }
  return out;
}

/**
 * Reads a value into tokens. Each token knows the functions round it, innermost last, so a rule can tell a length
 * inside `var(--im-fs-body, 13px)` from one on its own.
 * @param {string} value
 * @returns {Token[]}
 */
export function valueTokens(value) {
  /** @type {Token[]} */
  const tokens = [];
  /** @type {Fn[]} */
  const fns = [];
  const push = (/** @type {Omit<Token, 'fns'>} */ token) => tokens.push({ ...token, fns: [...fns] });
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    const rest = value.slice(i);
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = stringEnd(value, i);
      push({ type: 'string', text: value.slice(i, end) });
      i = end;
      continue;
    }
    if (c === '#') {
      const match = /^#[\w-]+/.exec(rest);
      push(match ? { type: 'hash', text: match[0] } : { type: 'delim', text: c });
      i += match ? match[0].length : 1;
      continue;
    }
    const ident = /^(?:--|-?[A-Za-z_\u0080-￿])[\w\u0080-￿-]*/.exec(rest);
    if (ident) {
      const name = ident[0];
      const after = i + name.length;
      if (value[after] === '(') {
        const lower = name.toLowerCase();
        let j = after + 1;
        while (j < value.length && /\s/.test(value[j])) j++;
        if (lower === 'url' && value[j] !== '"' && value[j] !== "'") {
          const close = value.indexOf(')', j);
          const stop = close === -1 ? value.length : close + 1;
          push({ type: 'url', text: value.slice(i, stop) });
          i = stop;
          continue;
        }
        push({ type: 'function', text: `${name}(`, name: lower });
        fns.push({ name: lower, arg: null });
        i = after + 1;
        continue;
      }
      const top = fns[fns.length - 1];
      if (top && top.name === 'var' && top.arg === null && name.startsWith('--')) top.arg = name;
      push({ type: 'ident', text: name });
      i = after;
      continue;
    }
    const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
    if (number) {
      const unit = /^(?:%|[A-Za-z]+)/.exec(value.slice(i + number[0].length))?.[0] ?? '';
      const text = number[0] + unit;
      const type = unit === '%' ? 'percentage' : unit ? 'dimension' : 'number';
      push({ type, text, number: Number(number[0]), unit: unit.toLowerCase() });
      i += text.length;
      continue;
    }
    if (c === '(') {
      push({ type: 'open', text: c });
      fns.push({ name: '', arg: null });
    } else if (c === ')') {
      push({ type: 'close', text: c });
      fns.pop();
    } else if (c === ',') push({ type: 'comma', text: c });
    else if (c === '/') push({ type: 'slash', text: c });
    else push({ type: 'delim', text: c });
    i++;
  }
  return tokens;
}

// ---------- the words of CSS ----------

/** The colours CSS names (the named colours, transparent and currentColor), in lower case. */
export const COLOR_WORDS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood '
  + 'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey '
  + 'darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey '
  + 'darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite '
  + 'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon '
  + 'lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue '
  + 'lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid '
  + 'mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin '
  + 'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff '
  + 'peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver '
  + 'skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow '
  + 'yellowgreen transparent currentcolor').split(' '));

/** The functions that make a colour. */
export const COLOR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'device-cmyk']);

/** The units of a dimension that is not a length: angles, times, frequencies, resolutions and fractions. */
const NOT_LENGTH_UNITS = new Set(['deg', 'grad', 'rad', 'turn', 's', 'ms', 'hz', 'khz', 'dpi', 'dpcm', 'dppx', 'x', 'fr']);

/** Whether a token is a length (`12px`, `.8rem`, `0.06em`). */
export const isLength = (/** @type {Token} */ token) => token.type === 'dimension' && !NOT_LENGTH_UNITS.has(token.unit ?? '');

/** The sizes of text CSS names by a word. */
export const SIZE_KEYWORDS = new Set(['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'smaller', 'larger', 'math']);

// The properties whose value may hold a colour. `theme-color` is not one of CSS: it is the name the reader gives the
// content of a <meta name="theme-color">; `fill-style`, `stroke-style` and `shadow-color` are its names for the
// fillStyle, strokeStyle and shadowColor of a canvas context.
const COLOR_PROPERTIES = new Set(['color', 'background', 'background-color', 'background-image', 'border', 'border-color', 'outline',
  'outline-color', 'box-shadow', 'text-shadow', 'fill', 'stroke', 'caret-color', 'accent-color', 'column-rule', 'column-rule-color',
  'text-decoration', 'text-decoration-color', 'text-emphasis', 'text-emphasis-color', 'scrollbar-color', 'stop-color', 'flood-color',
  'lighting-color', 'filter', 'backdrop-filter', 'border-image', 'border-image-source', 'mask', 'mask-image', 'list-style',
  'list-style-image', 'theme-color', 'fill-style', 'stroke-style', 'shadow-color']);

/** Whether a property takes a colour, so that a word in its value (`red`) is a colour and not a name (`animation: red 1s`). */
export const takesColor = (/** @type {string} */ property) =>
  COLOR_PROPERTIES.has(property) || /^border-(?:top|right|bottom|left|block|inline)(?:-start|-end)?(?:-color)?$/.test(property);
