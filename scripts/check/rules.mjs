// The rules of the design file that a program can judge: one pure function per rule. A rule takes what css.mjs,
// source.mjs and names.mjs read (never a path on disk) and returns its findings, `{ file, line, rule, message }`;
// `endLine` is kept when a declaration spans lines, so that an exception above it covers all of it. The ids are the
// ones docs/design-file.md names. The exceptions written in comments are read and applied at the end of this file.

import { COLOR, FONT_SIZE, SPACE, SYSTEM_COLORS } from './allowed.mjs';
import { classesOf, valueTokens } from './css.mjs';
import { namesUsed } from './names.mjs';
import { lineAt } from './source.mjs';

/**
 * @typedef {import('./source.mjs').Source} Source
 * @typedef {import('./css.mjs').Rule} Rule
 * @typedef {import('./css.mjs').Declaration} Declaration
 * @typedef {import('./css.mjs').Token} Token
 * @typedef {import('./names.mjs').Names} Names
 * @typedef {{ file: string, line: number, endLine?: number, rule: string, message: string }} Finding
 * @typedef {{ file: string, line: number, rule: string, reason: string }} Exception
 */

/** @returns {Finding} */
function finding(file, line, rule, message, endLine = line) {
  return endLine > line ? { file, line, endLine, rule, message } : { file, line, rule, message };
}

const list = (items) => [...new Set(items)].join(', ');
const byLine = (/** @type {Finding} */ a, /** @type {Finding} */ b) => a.line - b.line;

/** Every rule of a source with its declarations, the inline ones of a script or a page included. */
function* rulesOf(/** @type {Source} */ source) {
  for (const sheet of source.sheets) yield* sheet.rules;
}

/** The rules a selector rule judges: written in a stylesheet, with a selector of their own. */
const selectorRules = (source) => [...rulesOf(source)].filter((rule) => !rule.inline && !rule.keyframes && !rule.implicit);

/**
 * One finding per declaration whose value holds literals, as `literalsOf(declaration)` returns them.
 * @param {Source} source @param {string} id
 * @param {(declaration: Declaration) => string[]} literalsOf
 * @param {(literals: string, declaration: Declaration) => string} message
 * @returns {Finding[]}
 */
function perDeclaration(source, id, literalsOf, message) {
  /** @type {Finding[]} */
  const findings = [];
  for (const rule of rulesOf(source)) {
    for (const declaration of rule.declarations) {
      const literals = literalsOf(declaration);
      if (literals.length) findings.push(finding(source.file, declaration.line, id, message(list(literals), declaration), declaration.endLine));
    }
  }
  return findings.sort(byLine);
}

// ---------- im-selector ----------

/**
 * A selector of the app's CSS that names a class of the package, or a declaration that sets a --im- property. The
 * style written inline by a script is not judged: `style="--im-level: 2"` is how a tree item gets its depth.
 * @param {Source} source @returns {Finding[]}
 */
export function imSelector(source) {
  /** @type {Finding[]} */
  const findings = [];
  for (const rule of rulesOf(source)) {
    if (rule.inline) continue;
    if (!rule.keyframes && !rule.implicit) {
      const own = classesOf(rule.selector).filter((name) => name.startsWith('im-'));
      if (own.length) {
        findings.push(finding(source.file, rule.line, 'im-selector', `${list(own.map((name) => `.${name}`))} in a selector: an app never restyles a class of the package; give the element a class of the app's own prefix`));
      }
    }
    for (const declaration of rule.declarations) {
      if (declaration.property.startsWith('--im-')) {
        findings.push(finding(source.file, declaration.line, 'im-selector', `${declaration.property} is set: an app never sets a custom property of the package; name its own with its prefix`, declaration.endLine));
      }
    }
  }
  for (const sheet of source.sheets) {
    for (const at of sheet.atRules) {
      if (at.name === 'property' && at.prelude.startsWith('--im-')) findings.push(finding(source.file, at.line, 'im-selector', `@property ${at.prelude} defines a custom property of the package`));
    }
  }
  return findings;
}

// ---------- literal-color ----------

const NAMED_COLORS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood '
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
for (const { value } of SYSTEM_COLORS) NAMED_COLORS.add(value.toLowerCase());
const ALLOWED_COLORS = new Set([...COLOR, ...SYSTEM_COLORS].map(({ value }) => value.toLowerCase()));
const COLOR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'device-cmyk']);
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** The literal colours of a CSS value: hex, a colour function, a colour by name; a color-mix( over them is one. */
function colorLiterals(/** @type {string} */ value) {
  /** @type {string[]} */
  const literals = [];
  for (const token of valueTokens(value)) {
    if (token.fns.some((fn) => COLOR_FUNCTIONS.has(fn.name))) continue;
    if (token.type === 'hash' && HEX.test(token.text)) literals.push(token.text);
    else if (token.type === 'function' && COLOR_FUNCTIONS.has(token.name ?? '')) literals.push(`${token.name}()`);
    else if (token.type === 'ident' && NAMED_COLORS.has(token.text.toLowerCase()) && !ALLOWED_COLORS.has(token.text.toLowerCase())) literals.push(token.text);
  }
  return literals;
}

// A string that is the argument of these calls is a selector, and `#fade` in it is an id.
const ID_CALL = /(?:querySelector(?:All)?|closest|matches|getElementById)\s*\(\s*$/;
// An attribute that holds a reference, never a colour.
const REFERENCE_ATTRIBUTES = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'for', 'id', 'name', 'form', 'list', 'usemap',
  'aria-controls', 'aria-describedby', 'aria-labelledby', 'aria-owns', 'aria-activedescendant']);
const SCRIPT_HEX = /#[0-9a-fA-F]{3,8}(?![\w-])/g;
const SCRIPT_COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|oklab|oklch|lab|lch)\(/gi;

/**
 * A literal colour in a CSS value (and in the style a script or a page writes), and a hex colour or a colour function
 * in a quoted string or a template literal of a script. In a script, `#fade` in `href="#fade"`, in `url(#fade)`, in a
 * `querySelector('#fade')` and in `&#160;` is not a colour.
 * @param {Source} source @returns {Finding[]}
 */
export function literalColor(source) {
  const findings = perDeclaration(source, 'literal-color', (declaration) => colorLiterals(declaration.value),
    (literals, declaration) => `${literals} in ${declaration.property}: a colour is a token (--im-…)`);
  const lines = new Set(findings.map((each) => each.line));
  /** @type {Map<number, string[]>} */
  const inStrings = new Map();
  for (const str of source.strings) {
    if (ID_CALL.test(str.before) || REFERENCE_ATTRIBUTES.has(str.attribute ?? '')) continue;
    const text = str.text;
    for (const match of text.matchAll(SCRIPT_HEX)) {
      const at = match.index ?? 0;
      const digits = match[0].length - 1;
      if (![3, 4, 6, 8].includes(digits) || /[&\w]/.test(text[at - 1] ?? '')) continue;
      if (/(?:url\(\s*["']?|\b(?:href|xlink:href|src|action)\s*=\s*["']?)$/i.test(text.slice(0, at))) continue;
      const line = lineAt(text, at, str.line);
      inStrings.set(line, [...(inStrings.get(line) ?? []), match[0]]);
    }
    for (const match of text.matchAll(SCRIPT_COLOR_FUNCTION)) {
      const line = lineAt(text, match.index ?? 0, str.line);
      inStrings.set(line, [...(inStrings.get(line) ?? []), `${match[0]})`]);
    }
  }
  for (const [line, literals] of inStrings) {
    if (!lines.has(line)) findings.push(finding(source.file, line, 'literal-color', `${list(literals)} in a string: a colour is a token (var(--im-…))`));
  }
  return findings.sort(byLine);
}

// ---------- literal-font-size and literal-space ----------

const NOT_LENGTHS = new Set(['deg', 'grad', 'rad', 'turn', 's', 'ms', 'hz', 'khz', 'dpi', 'dpcm', 'dppx', 'x', 'fr']);
const isLength = (/** @type {Token} */ token) => token.type === 'dimension' && !NOT_LENGTHS.has(token.unit ?? '');
const normal = (/** @type {Token} */ token) => `${token.number}${token.unit}`;
const SIZE_KEYWORDS = new Set(['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'smaller', 'larger', 'math']);
const ALLOWED_FONT_SIZES = new Set(FONT_SIZE.map(({ value }) => value));
const onTheScale = (/** @type {Token} */ token) => token.fns.some((fn) => fn.name === 'var' && (fn.arg ?? '').startsWith('--im-fs-'));

/** The literal sizes of a font-size, or of the size in a font shorthand (its line-height, after the slash, is not one). */
function fontSizeLiterals(/** @type {string} */ property, /** @type {string} */ value) {
  const tokens = valueTokens(value);
  /** @type {string[]} */
  const literals = [];
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k];
    if (property === 'font' && token.type === 'slash' && token.fns.length === 0) {
      const next = tokens[k + 1];
      k++;
      if (next?.type === 'function') {
        while (k < tokens.length && !(tokens[k].type === 'close' && tokens[k].fns.length === next.fns.length + 1)) k++;
      }
      continue;
    }
    if (onTheScale(token)) continue;
    if ((isLength(token) || token.type === 'percentage') && token.number !== 0 && !ALLOWED_FONT_SIZES.has(normal(token))) literals.push(token.text);
    else if (token.type === 'ident' && token.fns.length === 0 && SIZE_KEYWORDS.has(token.text.toLowerCase()) && !ALLOWED_FONT_SIZES.has(token.text)) literals.push(token.text);
  }
  return literals;
}

/**
 * A font-size, or the size of a font shorthand, that is not a type token (var(--im-fs-…)).
 * @param {Source} source @returns {Finding[]}
 */
export function literalFontSize(source) {
  return perDeclaration(source, 'literal-font-size',
    (declaration) => (declaration.property === 'font-size' || declaration.property === 'font' ? fontSizeLiterals(declaration.property, declaration.value) : []),
    (literals, declaration) => `${literals} in ${declaration.property}: a size of text is a type token (var(--im-fs-micro|meta|body|title|display))`);
}

const SPACE_PROPERTY = /^(?:padding|margin)(?:-[a-z]+)*$|^(?:grid-)?(?:row-|column-)?gap$|^border(?:-[a-z]+)*-radius$/;

/** @param {string} property @param {Token} token */
const allowedSpace = (property, token) =>
  token.number === 0 || SPACE.some((entry) => entry.value === normal(token) && (!entry.properties || entry.properties.includes(property)));

/**
 * A padding, margin, gap or border-radius with a length that is not a token or an allowed literal (allowed.mjs).
 * @param {Source} source @returns {Finding[]}
 */
export function literalSpace(source) {
  return perDeclaration(source, 'literal-space',
    (declaration) => (SPACE_PROPERTY.test(declaration.property)
      ? valueTokens(declaration.value).filter((token) => isLength(token) && !allowedSpace(declaration.property, token)).map((token) => token.text)
      : []),
    (literals, declaration) => `${literals} in ${declaration.property}: ${/radius/.test(declaration.property) ? 'a radius is a token (--im-r-…)' : 'a space is a token (--im-s-1 to --im-s-5)'}`);
}

// ---------- cursor-pointer, disabled-opacity, media-width ----------

/**
 * A hand cursor. No control has one; the chrome keeps the arrow.
 * @param {Source} source @returns {Finding[]}
 */
export function cursorPointer(source) {
  return perDeclaration(source, 'cursor-pointer',
    (declaration) => (declaration.property === 'cursor' ? valueTokens(declaration.value).filter((token) => token.type === 'ident' && token.text.toLowerCase() === 'pointer').map((token) => token.text) : []),
    () => 'cursor: pointer: no control has a hand cursor; leave the arrow');
}

/** The selector without its :not(…) parts, which say what the rule is not. */
function withoutNot(/** @type {string} */ selector) {
  let out = selector;
  for (;;) {
    const start = out.search(/:not\(/i);
    if (start === -1) return out;
    let depth = 0;
    let end = start + 4;
    for (; end < out.length; end++) {
      if (out[end] === '(') depth++;
      else if (out[end] === ')' && --depth === 0) break;
    }
    out = out.slice(0, start) + out.slice(end + 1);
  }
}

const DISABLED = /:disabled\b|\[\s*disabled\b|aria-disabled/i;

/**
 * An opacity in a rule whose selector, or a selector it is nested in, is a disabled state. Disabled is a dashed edge
 * and the muted text colour, never an opacity. An opacity of 1 dims nothing.
 * @param {Source} source @returns {Finding[]}
 */
export function disabledOpacity(source) {
  /** @type {Finding[]} */
  const findings = [];
  for (const rule of rulesOf(source)) {
    if (rule.inline || rule.keyframes) continue;
    if (![rule.selector, ...rule.parents].some((selector) => DISABLED.test(withoutNot(selector)))) continue;
    for (const declaration of rule.declarations) {
      if (declaration.property !== 'opacity' || declaration.value === '100%' || Number(declaration.value) === 1) continue;
      findings.push(finding(source.file, declaration.line, 'disabled-opacity', `opacity: ${declaration.value} on a disabled state: disabled is a dashed edge and the muted text colour, never an opacity`, declaration.endLine));
    }
  }
  return findings;
}

/**
 * A @media on a width. The breakpoints follow the window, not the screen: @container im-shell at 1000, 850 or 620.
 * @param {Source} source @returns {Finding[]}
 */
export function mediaWidth(source) {
  return source.sheets.flatMap((sheet) => sheet.atRules
    .filter((at) => at.name === 'media' && /width/i.test(at.prelude))
    .map((at) => finding(source.file, at.line, 'media-width', `@media ${at.prelude}: a breakpoint follows the window, not the screen; use @container im-shell at 1000, 850 or 620`)));
}

// ---------- show-modal ----------

/**
 * A call of showModal( in code (not in a comment or a string). It makes the HTML title bar inert, and a borderless
 * window cannot then be moved or closed.
 * @param {Source} source @returns {Finding[]}
 */
export function showModal(source) {
  return source.code.flatMap((chunk) => [...chunk.text.matchAll(/\bshowModal\s*\(/g)].map((match) => finding(source.file, lineAt(chunk.text, match.index ?? 0, chunk.line), 'show-modal',
    'showModal() makes the title bar inert, and the window cannot be moved or closed: use confirm, openFormDialog or openContentDialog')));
}

// ---------- unknown-name and class-prefix ----------

/**
 * An im- class or a data-im- attribute that the installed package does not define: a removed or mistyped name.
 * @param {Source} source @param {Names} defined @returns {Finding[]}
 */
export function unknownName(source, defined) {
  const used = namesUsed(source);
  const seen = new Set();
  /** @type {Finding[]} */
  const findings = [];
  const report = (/** @type {{ name: string, line: number }} */ use, /** @type {string} */ what) => {
    const key = `${use.line} ${use.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding(source.file, use.line, 'unknown-name', `${use.name} is not ${what} of the installed @acaprino/imago: a removed or mistyped name`));
  };
  for (const use of used.classes) if (!defined.classes.has(use.name)) report(use, 'a class');
  for (const use of used.attributes) if (!defined.attributes.has(use.name)) report(use, 'an attribute');
  return findings.sort(byLine);
}

/**
 * A class of the package that does not start with im- (in --package mode, over css/).
 * @param {Source} source @returns {Finding[]}
 */
export function classPrefix(source) {
  return selectorRules(source).flatMap((rule) => {
    const others = classesOf(rule.selector).filter((name) => !name.startsWith('im-'));
    return others.length ? [finding(source.file, rule.line, 'class-prefix', `${list(others.map((name) => `.${name}`))}: every class of the package starts with im-`)] : [];
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

/** @typedef {{ kind: 'tag' | 'commit', value: string }} Ref */

/** @returns {Ref} */
const refOf = (/** @type {string} */ value) => (/^[0-9a-f]{7,40}$/i.test(value) ? { kind: 'commit', value: value.toLowerCase() } : { kind: 'tag', value });
const sameCommit = (/** @type {string} */ a, /** @type {string} */ b) => a.startsWith(b) || b.startsWith(a);
const describe = (/** @type {Ref} */ ref) => `the ${ref.kind} ${ref.kind === 'commit' ? ref.value.slice(0, 7) : ref.value}`;

/** The commit package-lock.json installed the package from. */
function npmLockCommit(/** @type {string | null} */ lock) {
  if (!lock) return null;
  try {
    const data = JSON.parse(lock);
    const resolved = data?.packages?.['node_modules/@acaprino/imago']?.resolved ?? data?.dependencies?.['@acaprino/imago']?.version;
    return typeof resolved === 'string' ? (/#([0-9a-f]{40})$/i.exec(resolved)?.[1]?.toLowerCase() ?? null) : null;
  } catch {
    return null;
  }
}

/** The commit Cargo.lock took imago-shell from, when its source is the pin the manifest writes. */
function cargoLockCommit(/** @type {string | null} */ lock, /** @type {CargoEntry} */ entry) {
  if (!lock) return null;
  const query = entry.tag ? `tag=${entry.tag}` : entry.rev ? `rev=${entry.rev}` : null;
  for (const block of lock.split(/^\[\[package\]\]\s*$/m)) {
    if (!/^name\s*=\s*"imago-shell"\s*$/m.test(block)) continue;
    const source = /^source\s*=\s*"([^"]+)"/m.exec(block)?.[1] ?? '';
    const match = /[?&]([a-z]+=[^#&]+)[^#]*#([0-9a-f]{40})$/i.exec(source);
    if (match && query && match[1] === query) return match[2].toLowerCase();
  }
  return null;
}

/**
 * The npm pin of @acaprino/imago and the Cargo pin of imago-shell: the same tag, or the same commit. A Cargo.toml that
 * takes the crate from its workspace is read through the root Cargo.toml. A tag on one side and a commit on the
 * other are compared through the lock files when they say the commit; otherwise the program says it cannot compare
 * them offline (a note, not a finding).
 * @param {{
 *   npm: { file: string, text: string },
 *   cargo: { file: string, text: string },
 *   workspace: { file: string, text: string } | null,
 *   npmLock: string | null,
 *   cargoLock: string | null,
 * }} input
 * @returns {{ findings: Finding[], notes: string[] }}
 */
export function pinMismatch({ npm, cargo, workspace, npmLock, cargoLock }) {
  const id = 'pin-mismatch';
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const notes = [];
  const done = () => ({ findings, notes });

  const pin = npmPin(npm.text, npm.file);
  if (!pin) {
    findings.push(finding(npm.file, 1, id, '@acaprino/imago is not a dependency: pin it to a tag or a commit, as imago-shell is'));
    return done();
  }
  let crate = cargoEntry(cargo.text, false);
  let crateFile = cargo.file;
  if (!crate) {
    findings.push(finding(cargo.file, 1, id, 'imago-shell is not a dependency of this crate: pin it as @acaprino/imago is pinned'));
    return done();
  }
  if (crate.workspace === 'true') {
    const member = `${cargo.file}:${crate.line}`;
    const shared = workspace ? cargoEntry(workspace.text, true) : null;
    if (!workspace || !shared) {
      findings.push(finding(workspace?.file ?? cargo.file, workspace ? 1 : crate.line, id, `${member} takes imago-shell from the workspace, and ${workspace ? `${workspace.file} has no imago-shell in [workspace.dependencies]` : 'no Cargo.toml above it has [workspace]'}`));
      return done();
    }
    crate = shared;
    crateFile = workspace.file;
  }
  const where = `${crateFile}:${crate.line}`;

  const hash = pin.spec.lastIndexOf('#');
  const npmRef = hash === -1 || !pin.spec.slice(hash + 1) || pin.spec.slice(hash + 1).startsWith('semver:') ? null : refOf(pin.spec.slice(hash + 1));
  /** @type {Ref | null} */
  const cargoRef = crate.tag ? { kind: 'tag', value: crate.tag } : crate.rev ? refOf(crate.rev) : null;
  if (!npmRef) findings.push(finding(pin.file, pin.line, id, `@acaprino/imago is "${pin.spec}": pin a tag (#v<x>) or a commit (#<commit>)`));
  if (!cargoRef) {
    const what = crate.branch ? `the branch ${crate.branch}` : crate.git ? 'the default branch' : crate.version ? `the version ${crate.version}, not the git repository` : 'no pin';
    findings.push(finding(crateFile, crate.line, id, `imago-shell takes ${what}: pin a tag or a rev`));
  }
  if (!npmRef || !cargoRef) return done();

  const both = `npm pins @acaprino/imago to ${describe(npmRef)} and Cargo pins imago-shell to ${describe(cargoRef)} (${where})`;
  if (npmRef.kind === cargoRef.kind) {
    const same = npmRef.kind === 'tag' ? npmRef.value === cargoRef.value : sameCommit(npmRef.value, cargoRef.value);
    if (!same) findings.push(finding(pin.file, pin.line, id, `${both}: pin both to the same ${npmRef.kind}`));
    return done();
  }
  const npmCommit = npmRef.kind === 'commit' ? npmRef.value : npmLockCommit(npmLock);
  const cargoCommit = cargoRef.kind === 'commit' ? cargoRef.value : cargoLockCommit(cargoLock, crate);
  if (npmCommit && cargoCommit) {
    if (!sameCommit(npmCommit, cargoCommit)) findings.push(finding(pin.file, pin.line, id, `${both}, which the lock files resolve to ${npmCommit.slice(0, 7)} and ${cargoCommit.slice(0, 7)}: pin both to the same commit`));
  } else {
    notes.push(`pin-mismatch: cannot compare offline: ${both}; pin both by tag or both by commit to have them compared`);
  }
  return done();
}

// ---------- agent-rules and mount-app ----------

export const DESIGN_FILE_PATH = 'node_modules/@acaprino/imago/docs/design-file.md';

/**
 * The files of the app's coding agents (AGENTS.md, CLAUDE.md) name the design file of the installed package.
 * @param {{ file: string, text: string | null }[]} files `text` is null for a file that does not exist
 * @returns {Finding[]}
 */
export function agentRules(files) {
  return files.flatMap(({ file, text }) => {
    if (text === null) return [finding(file, 1, 'agent-rules', `${file} does not exist: it holds the lines of using-imago.md section 9, which name ${DESIGN_FILE_PATH}`)];
    return text.includes(DESIGN_FILE_PATH) ? [] : [finding(file, 1, 'agent-rules', `${file} does not name ${DESIGN_FILE_PATH}: paste the lines of using-imago.md section 9`)];
  });
}

const escapeRegExp = (/** @type {string} */ text) => text.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');

/**
 * The entry of the app, or a file it imports, calls mountApp( (under its own name, an alias, or through a namespace).
 * @param {Source[]} sources the entry first, then the files it imports
 * @returns {Finding[]}
 */
export function mountApp(sources) {
  const calls = sources.some((source) => source.code.some((chunk) => {
    if (/(?<![\w$])mountApp\s*\(/.test(chunk.text)) return true;
    return [...chunk.text.matchAll(/\bmountApp\s+as\s+([A-Za-z_$][\w$]*)/g)].some((alias) => new RegExp(`(?<![\\w$.])${escapeRegExp(alias[1])}\\s*\\(`).test(chunk.text));
  }));
  if (calls || !sources.length) return [];
  const { file } = sources[0];
  return [finding(file, 1, 'mount-app', `neither ${file} nor a file it imports calls mountApp(shell, registry, options), which attaches the layers, the keys, the regions, the sidebar and the standard commands`)];
}

// ---------- app-icon ----------

export const ICONS_PATH = 'node_modules/@acaprino/imago/icons';

/**
 * The icon files an app copied from the package (`icons/<app>/`, see using-imago.md): each is the package's file, byte
 * for byte. A line ending is a byte, so the files are compared as they are, not as text.
 * @param {string} app the id of the app, which names the package's folder
 * @param {{ file: string, name: string, have: Uint8Array | null, want: Uint8Array }[]} icons `file` is the path in the app, `name` the file in the package's folder, `have` is null when the app has no such file
 * @returns {Finding[]}
 */
export function appIcon(app, icons) {
  const id = 'app-icon';
  const same = (/** @type {Uint8Array} */ a, /** @type {Uint8Array} */ b) => a.length === b.length && a.every((byte, k) => byte === b[k]);
  return icons.flatMap(({ file, name, have, want }) => {
    const source = `${ICONS_PATH}/${app}/${name}`;
    if (have === null) return [finding(file, 1, id, `${file} does not exist: copy ${source} to it`)];
    if (same(have, want)) return [];
    return [finding(file, 1, id, `${file} is not ${source} (${have.length} bytes, the package's has ${want.length}): copy the package's file over it`)];
  });
}

// ---------- exceptions ----------

const EXCEPTION =/imago-check:\s*allow\s+([a-z]+(?:-[a-z]+)*)([^\n]*)/g;

/**
 * The exceptions written in the comments of a source: `imago-check: allow <rule> — <reason>`, a hyphen accepted for
 * the dash. An exception without a reason is read with an empty reason, and allows nothing.
 * @param {Source} source @returns {Exception[]}
 */
export function exceptionsIn(source) {
  return source.comments.flatMap((comment) => [...comment.text.matchAll(EXCEPTION)].map((match) => {
    const rest = match[2].replace(/(?:\*\/|-->)\s*$/, '');
    const reason = /^\s*(?:—|–|-{1,2})\s*(.*?)\s*$/.exec(rest)?.[1] ?? '';
    return { file: source.file, line: lineAt(comment.text, match.index ?? 0, comment.line), rule: match[1], reason };
  }));
}

/**
 * Takes out the findings an exception allows: one for the same rule, in the same file, on the line of the finding (or
 * any line of its declaration) or the line above. An exception without a reason allows nothing; the finding says so.
 * @param {Finding[]} findings @param {Exception[]} exceptions
 * @returns {{ findings: Finding[], accepted: Exception[] }}
 */
export function applyExceptions(findings, exceptions) {
  /** @type {Finding[]} */
  const kept = [];
  /** @type {Set<Exception>} */
  const accepted = new Set();
  for (const each of findings) {
    const near = exceptions.filter((exception) => exception.file === each.file && exception.rule === each.rule
      && exception.line >= each.line - 1 && exception.line <= (each.endLine ?? each.line));
    const allowing = near.find((exception) => exception.reason);
    if (allowing) accepted.add(allowing);
    else if (near.length) kept.push({ ...each, message: `${each.message} (the exception on line ${near[0].line} gives no reason: imago-check: allow ${each.rule} — <reason>)` });
    else kept.push(each);
  }
  return { findings: kept, accepted: [...accepted] };
}
