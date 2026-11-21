// The rules of the design file that a program can judge: one pure function per rule. A rule takes what css.mjs,
// source.mjs and names.mjs read (never a path on disk) and returns its findings, `{ file, line, rule, message }`;
// `endLine` is kept when a declaration spans lines, so that an exception above it covers all of it, and `via` when the
// literal is in the value of an app's own custom property defined elsewhere, so that an exception there covers it too.
// The ids are the ones docs/design-file.md names. What a rule allows is in allowed.mjs, the names the canon removed in
// removed.mjs, the closed sets of values in values.mjs. The exceptions written in comments are read and applied at the
// end of this file.

import { posix } from 'node:path';
import { CASE, COLOR, FONT_SIZE, OPACITY, SPACE, SYSTEM_COLORS, TRACKING } from './allowed.mjs';
import { classesOf, COLOR_FUNCTIONS, COLOR_WORDS, isLength, SIZE_KEYWORDS, takesColor, valueTokens } from './css.mjs';
import { namesIn, namesUsed } from './names.mjs';
import { REMOVED } from './removed.mjs';
import { DYNAMIC, lineAt } from './source.mjs';
import { VALUES } from './values.mjs';

/**
 * @typedef {import('./source.mjs').Source} Source
 * @typedef {import('./css.mjs').Rule} Rule
 * @typedef {import('./css.mjs').Declaration} Declaration
 * @typedef {import('./css.mjs').Token} Token
 * @typedef {import('./names.mjs').Names} Names
 * @typedef {import('./removed.mjs').Removed} Removed
 * @typedef {{ file: string, line: number, endLine?: number }} Place
 * @typedef {{ file: string, line: number, endLine?: number, rule: string, message: string, via?: Place }} Finding
 * @typedef {{ file: string, line: number, rule: string, reason: string }} Exception
 * @typedef {{ name: string, file: string, line: number, endLine: number, value: string }} Definition
 *   A custom property of the app, where it is set and to what.
 * @typedef {Map<string, Definition[]>} Properties
 *   The app's own custom properties (not --im-), each with every place the app sets it.
 * @typedef {Token & { via?: Definition }} Resolved
 *   A token of a value, with the definition it came from when it is the value of an app's custom property.
 */

/** @returns {Finding} */
function finding(file, line, rule, message, endLine = line) {
  return endLine > line ? { file, line, endLine, rule, message } : { file, line, rule, message };
}

const list = (items) => [...new Set(items)].join(', ');
const byLine = (/** @type {Finding} */ a, /** @type {Finding} */ b) => a.line - b.line;
/** A string as the program prints it: a ${} of a template literal written as such. */
const shown = (/** @type {string} */ text) => text.replaceAll(DYNAMIC, '${…}').replace(/\s+/g, ' ');
/** The value of a declaration as the rules compare it: without spaces, and in lower case but for a custom property's name. */
const compact = (/** @type {string} */ value) => value.replace(/\s+/g, '').replace(/^[^(]*/, (head) => head.toLowerCase());
/** The same value as allowed.mjs writes it, a zero of any unit being `0`. */
const asAllowed = (/** @type {Token} */ token) => (token.number === 0 ? '0' : `${token.number}${token.unit}`);

/** Every rule of a source with its declarations, the inline ones of a script or a page included. */
function* rulesOf(/** @type {Source} */ source) {
  for (const sheet of source.sheets) yield* sheet.rules;
}

/** The rules a selector rule judges: written in a stylesheet, with a selector of their own. */
const selectorRules = (source) => [...rulesOf(source)].filter((rule) => !rule.inline && !rule.keyframes && !rule.implicit);

/** @type {Properties} */
const NO_PROPERTIES = new Map();

/**
 * The custom properties the app sets (in its CSS, its pages and the style its scripts write), but those of the package.
 * @param {Source[]} sources
 * @returns {Properties}
 */
export function customProperties(sources) {
  /** @type {Properties} */
  const properties = new Map();
  for (const source of sources) {
    for (const rule of rulesOf(source)) {
      for (const { property, value, line, endLine } of rule.declarations) {
        if (!property.startsWith('--') || property.startsWith('--im-')) continue;
        properties.set(property, [...(properties.get(property) ?? []), { name: property, file: source.file, line, endLine, value }]);
      }
    }
  }
  return properties;
}

/**
 * The most tokens the values of one custom property are read to. A chain of properties that doubles at each step
 * (`--c1: var(--c0) var(--c0)`, `--c2: var(--c1) var(--c1)`, …) would otherwise take time and memory in two to the
 * power of its depth; past this size the rest of that property is not read, and the program says so in a note. A
 * thousand tokens is some hundred values of a shorthand, far more than a real property holds.
 */
export const MAX_EXPANSION = 1000;

/**
 * @typedef {{ tokens: Map<string, Resolved[]>, resolving: Set<string>, cut: Set<string> }} Expansions
 *   The properties resolved so far, each once for the whole run; those being resolved, to stop a loop; and those
 *   whose values passed MAX_EXPANSION.
 */
/** @type {WeakMap<Properties, Expansions>} */
const EXPANSIONS = new WeakMap();

/** @param {Properties} properties @returns {Expansions} */
function expansionsOf(properties) {
  let expansions = EXPANSIONS.get(properties);
  if (!expansions) {
    expansions = { tokens: new Map(), resolving: new Set(), cut: new Set() };
    EXPANSIONS.set(properties, expansions);
  }
  return expansions;
}

/**
 * The tokens of every value the app gives `name`, resolved, each with the definition it came from: computed once,
 * then reused. Null when `name` is being resolved already (a loop), which leaves its var() as it is.
 * @param {string} name @param {Properties} properties @param {Expansions} expansions
 * @returns {Resolved[] | null}
 */
function expand(name, properties, expansions) {
  const known = expansions.tokens.get(name);
  if (known) return known;
  if (expansions.resolving.has(name)) return null;
  expansions.resolving.add(name);
  /** @type {Resolved[]} */
  const out = [];
  reading: for (const definition of properties.get(name) ?? []) {
    for (const token of splice(valueTokens(definition.value), properties, expansions)) {
      if (out.length === MAX_EXPANSION) {
        expansions.cut.add(name);
        break reading;
      }
      out.push(token.via ? token : { ...token, via: definition });
    }
  }
  expansions.resolving.delete(name);
  expansions.tokens.set(name, out);
  return out;
}

/**
 * Tokens with each var() of an app's own property replaced by the tokens of its values, the functions round the var()
 * kept round them.
 * @param {Token[]} tokens @param {Properties} properties @param {Expansions} expansions
 * @returns {Resolved[]}
 */
function splice(tokens, properties, expansions) {
  /** @type {Resolved[]} */
  const out = [];
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k];
    const name = token.type === 'function' && token.name === 'var' ? tokens[k + 1]?.text ?? '' : '';
    const expanded = properties.has(name) ? expand(name, properties, expansions) : null;
    if (!expanded) {
      out.push(token);
      continue;
    }
    let close = k + 1;
    while (close < tokens.length && !(tokens[close].type === 'close' && tokens[close].fns.length === token.fns.length + 1)) close++;
    for (const inner of expanded) out.push({ ...inner, fns: [...token.fns, ...inner.fns] });
    k = close;
  }
  return out;
}

/**
 * The tokens of a value with each var() of an app's own property replaced by the tokens of the values the app gives
 * it, through as many var() as it takes; each such token keeps the definition it came from. A property set in several
 * places gives the tokens of all of them; one the app never sets, or a loop, is left as it is. Each property is
 * resolved once for the run (a loop may leave a property met inside it resolved without the loop's part).
 * @param {string} value @param {Properties} properties
 * @returns {Resolved[]}
 */
function resolve(value, properties) {
  const tokens = valueTokens(value);
  return properties.size ? splice(tokens, properties, expansionsOf(properties)) : tokens;
}

/**
 * What the program says about the app's own custom properties once the rules have read them: the properties whose
 * values passed MAX_EXPANSION, and were read only that far.
 * @param {Properties} properties
 * @returns {string[]}
 */
export function propertyNotes(properties) {
  const cut = [...(EXPANSIONS.get(properties)?.cut ?? [])].sort();
  return cut.length ? [`the values of ${cut.join(', ')} expand to more than ${MAX_EXPANSION} tokens: literal-color, literal-font-size and literal-space read the first ${MAX_EXPANSION} of each`] : [];
}

/**
 * One finding per declaration whose own value holds literals, as `literalsOf` returns them, and one per definition
 * of an app's custom property whose value, used here, holds them: that finding is on the line of the use, names the
 * line of the definition, and an exception at either place allows it.
 * @param {Source} source @param {string} id
 * @param {(tokens: Resolved[], declaration: Declaration) => Resolved[]} literalsOf
 * @param {(literals: string, declaration: Declaration) => string} message `literals` is what to print before " in <property>"
 * @param {Properties} [properties]
 * @returns {Finding[]}
 */
function perDeclaration(source, id, literalsOf, message, properties = NO_PROPERTIES) {
  /** @type {Finding[]} */
  const findings = [];
  for (const rule of rulesOf(source)) {
    for (const declaration of rule.declarations) {
      const literals = literalsOf(resolve(declaration.value, properties), declaration);
      const own = literals.filter((token) => !token.via);
      if (own.length) findings.push(finding(source.file, declaration.line, id, message(list(own.map(literalText)), declaration), declaration.endLine));
      /** @type {Map<Definition, Resolved[]>} */
      const byDefinition = new Map();
      for (const token of literals) {
        if (!token.via) continue;
        const group = byDefinition.get(token.via);
        if (group) group.push(token);
        else byDefinition.set(token.via, [token]);
      }
      for (const [via, tokens] of byDefinition) {
        const from = `${list(tokens.map(literalText))} from ${via.name} (${via.file}:${via.line})`;
        findings.push({ ...finding(source.file, declaration.line, id, message(from, declaration), declaration.endLine), via: { file: via.file, line: via.line, endLine: via.endLine } });
      }
    }
  }
  return findings.sort(byLine);
}

/** A literal as a finding prints it: a colour function by its name. */
const literalText = (/** @type {Token} */ token) => (token.type === 'function' ? `${token.name}()` : token.text);

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

const ALLOWED_COLORS = new Set([...COLOR, ...SYSTEM_COLORS].map(({ value }) => value.toLowerCase()));
const isColorWord = (/** @type {string} */ word) => COLOR_WORDS.has(word.toLowerCase()) || SYSTEM_COLORS.some(({ value }) => value.toLowerCase() === word.toLowerCase());
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * The literal colours of a value: a hex or a colour function in any property, and a colour by name in a property that
 * takes a colour (`animation: red 1s` names keyframes); a color-mix( over them is one.
 * @param {Resolved[]} tokens @param {string} property
 */
function colorLiterals(tokens, property) {
  return tokens.filter((token) => {
    if (token.fns.some((fn) => COLOR_FUNCTIONS.has(fn.name))) return false;
    if (token.type === 'hash') return HEX.test(token.text);
    if (token.type === 'function') return COLOR_FUNCTIONS.has(token.name ?? '');
    return token.type === 'ident' && takesColor(property) && isColorWord(token.text) && !ALLOWED_COLORS.has(token.text.toLowerCase());
  });
}

/**
 * A literal colour in a CSS value, and in the style a script or a page writes: a style attribute, `.style.x =`,
 * setProperty, cssText, setAttribute('style', …), a React style object, a <meta name="theme-color">. Any other string
 * of a script ('Issue #123', location.hash = '#top') is not style. A colour word in an app's custom property is judged
 * where the property is used, by the property that uses it; a hex or a colour function there is found where it is set.
 * @param {Source} source @param {Properties} [properties] the app's own custom properties
 * @returns {Finding[]}
 */
export function literalColor(source, properties) {
  return perDeclaration(source, 'literal-color',
    (tokens, declaration) => colorLiterals(tokens, declaration.property).filter((token) => !token.via || token.type === 'ident'),
    (literals, declaration) => `${literals} in ${declaration.property}: a colour is a token (--im-…)`, properties);
}

// ---------- literal-font-size and literal-space ----------

const ALLOWED_FONT_SIZES = new Set(FONT_SIZE.map(({ value }) => value));
const onTheScale = (/** @type {Token} */ token) => token.fns.some((fn) => fn.name === 'var' && (fn.arg ?? '').startsWith('--im-fs-'));

/**
 * The literal sizes of a font-size, or of the size in a font shorthand (its line-height, after the slash, is not one).
 * @param {string} property @param {Resolved[]} tokens
 */
function fontSizeLiterals(property, tokens) {
  /** @type {Resolved[]} */
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
    if ((isLength(token) || token.type === 'percentage') && !ALLOWED_FONT_SIZES.has(asAllowed(token))) literals.push(token);
    else if (token.type === 'ident' && token.fns.length === 0 && SIZE_KEYWORDS.has(token.text.toLowerCase()) && !ALLOWED_FONT_SIZES.has(token.text)) literals.push(token);
  }
  return literals;
}

/**
 * A font-size, or the size of a font shorthand, that is not a type token (var(--im-fs-…)), here or in the value of an
 * app's custom property it reads.
 * @param {Source} source @param {Properties} [properties] the app's own custom properties
 * @returns {Finding[]}
 */
export function literalFontSize(source, properties) {
  return perDeclaration(source, 'literal-font-size',
    (tokens, declaration) => (declaration.property === 'font-size' || declaration.property === 'font' ? fontSizeLiterals(declaration.property, tokens) : []),
    (literals, declaration) => `${literals} in ${declaration.property}: a size of text is a type token (var(--im-fs-micro|meta|body|title|display))`, properties);
}

const SPACE_PROPERTY = /^(?:padding|margin)(?:-[a-z]+)*$|^(?:grid-)?(?:row-|column-)?gap$|^border(?:-[a-z]+)*-radius$/;

/** @param {string} property @param {Token} token */
const allowedSpace = (property, token) => SPACE.some((entry) => entry.value === asAllowed(token) && (!entry.properties || entry.properties.includes(property)));

/**
 * A padding, margin, gap or border-radius with a length that is not a token or an allowed literal (allowed.mjs), here
 * or in the value of an app's custom property it reads.
 * @param {Source} source @param {Properties} [properties] the app's own custom properties
 * @returns {Finding[]}
 */
export function literalSpace(source, properties) {
  return perDeclaration(source, 'literal-space',
    (tokens, declaration) => (SPACE_PROPERTY.test(declaration.property) ? tokens.filter((token) => isLength(token) && !allowedSpace(declaration.property, token)) : []),
    (literals, declaration) => `${literals} in ${declaration.property}: ${/radius/.test(declaration.property) ? 'a radius is a token (--im-r-…)' : 'a space is a token (--im-s-1 to --im-s-5)'}`, properties);
}

// ---------- literal-case ----------

const ALLOWED_CASE = new Set(CASE.map(({ value }) => value));
const ALLOWED_TRACKING = new Set(TRACKING.map(({ value }) => value));

/**
 * A text-transform other than none or var(--im-case), or a letter-spacing other than 0, normal or var(--im-track), in
 * the app's CSS and in the style its scripts write: the case and the spacing of a label are the look's (capitals with
 * spacing in ONI, none in smooth), never typed.
 * @param {Source} source @returns {Finding[]}
 */
export function literalCase(source) {
  /** @type {Finding[]} */
  const findings = [];
  for (const rule of rulesOf(source)) {
    for (const declaration of rule.declarations) {
      const { property, value } = declaration;
      const tokens = valueTokens(value);
      const zero = tokens.length === 1 && (tokens[0].type === 'number' || tokens[0].type === 'dimension') && tokens[0].number === 0;
      if (property === 'text-transform' && !ALLOWED_CASE.has(compact(value))) {
        findings.push(finding(source.file, declaration.line, 'literal-case', `text-transform: ${value}: the case of a label is the look's, var(--im-case) (capitals in ONI, none in smooth); write the text as it reads`, declaration.endLine));
      } else if (property === 'letter-spacing' && !zero && !ALLOWED_TRACKING.has(compact(value))) {
        findings.push(finding(source.file, declaration.line, 'literal-case', `letter-spacing: ${value}: the spacing of a label is the look's, var(--im-track), or none`, declaration.endLine));
      }
    }
  }
  return findings.sort(byLine);
}

// ---------- cursor-pointer, disabled-opacity, media-width ----------

/**
 * A hand cursor. No control has one; the chrome keeps the arrow.
 * @param {Source} source @returns {Finding[]}
 */
export function cursorPointer(source) {
  return perDeclaration(source, 'cursor-pointer',
    (tokens, declaration) => (declaration.property === 'cursor' ? tokens.filter((token) => token.type === 'ident' && token.text.toLowerCase() === 'pointer') : []),
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
 * and the muted text colour, never an opacity. An opacity that dims nothing (allowed.mjs) is not one.
 * @param {Source} source @returns {Finding[]}
 */
export function disabledOpacity(source) {
  /** @type {Finding[]} */
  const findings = [];
  const dimsNothing = (/** @type {string} */ value) => OPACITY.some((entry) => entry.value === value || (!entry.value.endsWith('%') && Number(entry.value) === Number(value)));
  for (const rule of rulesOf(source)) {
    if (rule.inline || rule.keyframes) continue;
    if (![rule.selector, ...rule.parents].some((selector) => DISABLED.test(withoutNot(selector)))) continue;
    for (const declaration of rule.declarations) {
      if (declaration.property !== 'opacity' || dimsNothing(declaration.value)) continue;
      findings.push(finding(source.file, declaration.line, 'disabled-opacity', `opacity: ${declaration.value} on a disabled state: disabled is a dashed edge and the muted text colour, never an opacity`, declaration.endLine));
    }
  }
  return findings;
}

/**
 * A @media on a width, and a matchMedia( of a script whose query holds a width. The breakpoints follow the window,
 * not the screen: @container im-shell at 1000, 850 or 620.
 * @param {Source} source @returns {Finding[]}
 */
export function mediaWidth(source) {
  const media = source.sheets.flatMap((sheet) => sheet.atRules
    .filter((at) => at.name === 'media' && /width/i.test(at.prelude))
    .map((at) => finding(source.file, at.line, 'media-width', `@media ${at.prelude}: a breakpoint follows the window, not the screen; use @container im-shell at 1000, 850 or 620`)));
  const queries = source.strings
    .filter((str) => str.attribute === undefined && /(?<![\w$])matchMedia\s*\(\s*$/.test(str.before) && /width/i.test(str.text))
    .map((str) => finding(source.file, str.line, 'media-width', `matchMedia('${shown(str.text)}'): a breakpoint follows the window, not the screen; style it with @container im-shell at 1000, 850 or 620`));
  return [...media, ...queries].sort(byLine);
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

// ---------- own-keydown ----------

const KEY_TARGET = /(?<![\w$.])(document(?:\s*\.\s*body)?|window)\s*\.\s*/;
const KEY_LISTENER = new RegExp(`${KEY_TARGET.source}addEventListener\\s*\\(\\s*$`);
const KEY_PROPERTY = new RegExp(`${KEY_TARGET.source}on(keydown|keyup|keypress)\\s*=(?!=)`, 'g');
const KEY_EVENT = /^key(?:down|up|press)$/;

/**
 * A key handler of the app on the document, the window or the body: addEventListener('keydown' | 'keyup' |
 * 'keypress', …), or onkeydown = (and onkeyup, onkeypress). The keys of a window are commands of the registry, which
 * mountApp attaches; a widget that runs its own keys (a terminal) carries the exception comment.
 * @param {Source} source @returns {Finding[]}
 */
export function ownKeydown(source) {
  const message = (/** @type {string} */ what) => `${what}: a key of the window is a command of the registry, which mountApp attaches; a widget that runs its own keys (a terminal) takes an exception, imago-check: allow own-keydown — <reason>`;
  /** @type {Finding[]} */
  const findings = [];
  for (const str of source.strings) {
    const target = str.attribute === undefined && KEY_EVENT.test(str.text) ? KEY_LISTENER.exec(str.before) : null;
    if (target) findings.push(finding(source.file, str.line, 'own-keydown', message(`${target[1].replace(/\s+/g, '')}.addEventListener('${str.text}')`)));
  }
  for (const chunk of source.code) {
    for (const match of chunk.text.matchAll(KEY_PROPERTY)) {
      findings.push(finding(source.file, lineAt(chunk.text, match.index ?? 0, chunk.line), 'own-keydown', message(`${match[1].replace(/\s+/g, '')}.on${match[2]} =`)));
    }
  }
  return findings.sort(byLine);
}

// ---------- unknown-name, removed-name, unknown-value and class-prefix ----------

const REMOVED_NAMES = new Set(REMOVED.map((entry) => entry.old));

/**
 * An im- class or a data-im- attribute that the installed package does not define: a removed or mistyped name. A name
 * of removed.mjs is left to removed-name, which says what replaces it.
 * @param {Source} source @param {Names} defined @returns {Finding[]}
 */
export function unknownName(source, defined) {
  const used = namesUsed(source);
  const seen = new Set();
  /** @type {Finding[]} */
  const findings = [];
  const report = (/** @type {{ name: string, line: number }} */ use, /** @type {string} */ what) => {
    const key = `${use.line} ${use.name}`;
    if (seen.has(key) || REMOVED_NAMES.has(use.name)) return;
    seen.add(key);
    findings.push(finding(source.file, use.line, 'unknown-name', `${use.name} is not ${what} of the installed @acaprino/imago: a removed or mistyped name`));
  };
  for (const use of used.classes) if (!defined.classes.has(use.name)) report(use, 'a class');
  for (const use of used.attributes) if (!defined.attributes.has(use.name)) report(use, 'an attribute');
  return findings.sort(byLine);
}

/**
 * A name the canon removed (removed.mjs): a class with or without the im- prefix, a data-im- attribute, a --im-
 * custom property or an export of the package, in the app's CSS, markup or script, its tests included. The message
 * gives what replaces it.
 * @param {Source} source @param {Removed[]} [removed]
 * @returns {Finding[]}
 */
export function removedName(source, removed = REMOVED) {
  const byName = new Map(removed.map((entry) => [entry.old, entry]));
  const of = (/** @type {Removed['kind']} */ kind) => removed.filter((entry) => entry.kind === kind).map((entry) => entry.old);
  const uses = namesIn(source, { classes: of('class'), attributes: of('attribute'), properties: of('property'), exports: of('export') });
  return uses.map((use) => {
    const entry = /** @type {Removed} */ (byName.get(use.name));
    const what = entry.kind === 'export' ? `${use.name}, an export of @acaprino/imago,` : use.name;
    return finding(source.file, use.line, 'removed-name', `${what} was removed: ${entry.now}`);
  });
}

/**
 * A value outside the set of an attribute that takes a closed set (values.mjs): in a page, in the markup and the
 * selectors of a script's strings, in JSX, in setAttribute( and dataset, and in a selector of the app's CSS. A value
 * built at run time is not judged.
 * @param {Source} source @param {Record<string, string[]>} [values]
 * @returns {Finding[]}
 */
export function unknownValue(source, values = VALUES) {
  /** @type {Finding[]} */
  const findings = [];
  const seen = new Set();
  const judge = (/** @type {string} */ attribute, /** @type {string} */ value, /** @type {number} */ line) => {
    const allowed = values[attribute];
    if (!allowed || value.includes(DYNAMIC) || allowed.includes(value) || seen.has(`${line} ${attribute} ${value}`)) return;
    seen.add(`${line} ${attribute} ${value}`);
    const last = allowed.length > 1 ? `${allowed.slice(0, -1).join(', ')} or ${allowed[allowed.length - 1]}` : allowed[0];
    findings.push(finding(source.file, line, 'unknown-value', `${attribute}="${shown(value)}": ${attribute} takes ${last}; the package draws no other value`));
  };
  // name="value", name='value' or name=value, in markup or in a selector; `^=` and its kin are not an equal value.
  const pairs = (/** @type {string} */ text, /** @type {number} */ line) => {
    for (const match of text.matchAll(/(?<![\w-])(data-im-[a-z0-9-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>\]]+))/g)) {
      judge(match[1], match[2] ?? match[3] ?? match[4] ?? '', lineAt(text, match.index ?? 0, line));
    }
  };
  // `dataset.imSidebarCollapsed` is data-im-sidebar-collapsed.
  const attributeOf = (/** @type {string} */ key) => `data-im-${key.replace(/[A-Z]/g, (letter, at) => (at ? '-' : '') + letter.toLowerCase())}`;
  source.strings.forEach((str, index) => {
    if (str.attribute !== undefined) {
      judge(str.attribute, str.text, str.line);
      return;
    }
    pairs(str.text, str.line);
    const jsx = /(?<![\w-])(data-im-[a-z0-9-]+)\s*=\s*\{?\s*$/.exec(str.before);
    if (jsx) judge(jsx[1], str.text, str.line);
    const previous = source.strings[index - 1];
    if (previous && /\.setAttribute\(\s*(["'`])\s*\1\s*,\s*$/.test(str.before)) judge(previous.text, str.text, str.line);
    const dataset = /\.dataset\.im([A-Z][A-Za-z0-9]*)\s*(?:={1,3}|!==?)\s*$/.exec(str.before);
    if (dataset) judge(attributeOf(dataset[1]), str.text, str.line);
  });
  for (const rule of selectorRules(source)) pairs(rule.selector, rule.line);
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

// A path to the design file written in an agent file: in backquotes, in a Markdown link, after the @ of a CLAUDE.md
// import or in a sentence.
const DESIGN_PATH = /[^\s`'"()<>[\]]*design-file\.md/g;

/**
 * The files of the app's coding agents (AGENTS.md, CLAUDE.md) name the design file of the installed package, by a path
 * that exists from the folder of the file or from the root of the app.
 * @param {{ file: string, text: string | null }[]} files `text` is null for a file that does not exist
 * @param {{ designFile: string, resolves: (file: string, path: string) => boolean }} installed `designFile` is the
 *   design file of the installed package from the root; `resolves` says whether a path written in a file exists, from
 *   its folder or from the root
 * @returns {Finding[]}
 */
export function agentRules(files, { designFile, resolves }) {
  return files.flatMap(({ file, text }) => {
    const expected = posix.relative(posix.dirname(file), designFile) || designFile;
    if (text === null) return [finding(file, 1, 'agent-rules', `${file} does not exist: it holds the lines of using-imago.md section 9, which name ${expected}`)];
    const written = [...text.matchAll(DESIGN_PATH)].filter((match) => match[0].includes('/') && !match[0].includes('://'));
    if (!written.length) return [finding(file, 1, 'agent-rules', `${file} does not name ${expected}: paste the lines of using-imago.md section 9`)];
    return written.flatMap((match) => {
      const path = match[0];
      if (resolves(file, path) || (path.startsWith('@') && resolves(file, path.slice(1)))) return [];
      return [finding(file, lineAt(text, match.index ?? 0, 1), 'agent-rules', `${path.replace(/^@/, '')} does not exist, from the folder of ${file} or from the root: the design file of the installed @acaprino/imago is ${expected}`)];
    });
  });
}

const escapeRegExp = (/** @type {string} */ text) => text.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');

/**
 * The entry of the app, or a file it imports, imports mountApp from @acaprino/imago/ui and calls that binding (under
 * its own name, an alias, or through a namespace). A file of the app may pass it on: `export { mountApp } from …`,
 * `export { mountApp as x } from …`, `export * from …`, or an import exported again with `export { mountApp }`, to any
 * depth. An app's own function of the same name is not it.
 * @param {Source[]} sources the entry first, then the files it imports
 * @param {Map<string, Map<string, string>>} [links] for each file, the file of the app each relative specifier of it is
 * @returns {Finding[]}
 */
export function mountApp(sources, links = new Map()) {
  // The names under which each file exports the package's mountApp. They are found together, by rounds until no file
  // gains a name: a name passes through a cycle of barrels as through a chain, and the order of the imports does not
  // change the answer. A round only adds names, of which there are finitely many, so the rounds end.
  /** @type {Map<string, Set<string>>} */
  const exportsOf = new Map(sources.map((source) => [source.file, new Set()]));
  const MOUNT = new Set(['mountApp']);
  /** @type {Set<string>} */
  const NONE = new Set();
  /** The names under which the module `specifier` of `from` exports the package's mountApp, as far as known. */
  const mountNames = (/** @type {Source} */ from, /** @type {string} */ specifier) => {
    if (specifier === '@acaprino/imago/ui') return MOUNT;
    const file = links.get(from.file)?.get(specifier);
    return (file === undefined ? undefined : exportsOf.get(file)) ?? NONE;
  };
  /**
   * The names a file binds to the package's mountApp: its locals, and `ns.name` through a namespace import.
   * @param {Source} source
   */
  const bound = (source) => {
    /** @type {Set<string>} */
    const locals = new Set();
    /** @type {string[]} */
    const members = [];
    for (const each of source.imports.filter((one) => one.kind !== 'export' && !one.type)) {
      const names = mountNames(source, each.specifier);
      for (const binding of each.names) if (names.has(binding.imported)) locals.add(binding.local);
      if (each.namespace) for (const name of names) members.push(`${escapeRegExp(each.namespace)}\\s*\\.\\s*${escapeRegExp(name)}`);
    }
    return { locals, members };
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const source of sources) {
      const names = /** @type {Set<string>} */ (exportsOf.get(source.file));
      const before = names.size;
      const { locals } = bound(source);
      for (const each of source.imports.filter((one) => one.kind === 'export' && !one.type)) {
        const passed = mountNames(source, each.specifier);
        if (!each.names.length && !each.namespace) for (const name of passed) names.add(name);
        for (const binding of each.names) if (passed.has(binding.imported)) names.add(binding.local);
      }
      for (const { local, name } of source.exported) if (locals.has(local)) names.add(name);
      if (names.size !== before) changed = true;
    }
  }
  const calls = sources.some((source) => {
    const { locals, members } = bound(source);
    const patterns = [...[...locals].map((local) => `(?<![\\w$.])${escapeRegExp(local)}\\s*\\(`), ...members.map((member) => `(?<![\\w$.])${member}\\s*\\(`)];
    if (!patterns.length) return false;
    const call = new RegExp(patterns.join('|'));
    return source.code.some((chunk) => call.test(chunk.text));
  });
  if (calls || !sources.length) return [];
  const { file } = sources[0];
  return [finding(file, 1, 'mount-app', `neither ${file} nor a file it imports calls mountApp imported from @acaprino/imago/ui, mountApp(shell, registry, options), which attaches the layers, the keys, the regions, the sidebar and the standard commands; a function of the app with that name is not it`)];
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
    return { file: source.file, line: lineAt(comment.text, match.index ?? 0, comment.line), rule: match[1], reason };
  }));
}

/**
 * Takes out the findings an exception allows: one for the same rule, in the same file, on the line of the finding (or
 * any line of its declaration) or the line above; for a literal in the value of an app's custom property, an
 * exception at the place that sets the property allows it too. An exception without a reason allows nothing; the
 * finding says so.
 * @param {Finding[]} findings @param {Exception[]} exceptions
 * @returns {{ findings: Finding[], accepted: Exception[] }}
 */
export function applyExceptions(findings, exceptions) {
  /** @type {Finding[]} */
  const kept = [];
  /** @type {Set<Exception>} */
  const accepted = new Set();
  const covers = (/** @type {Exception} */ exception, /** @type {Place} */ place) => exception.file === place.file
    && exception.line >= place.line - 1 && exception.line <= (place.endLine ?? place.line);
  for (const each of findings) {
    const near = exceptions.filter((exception) => exception.rule === each.rule && (covers(exception, each) || (each.via !== undefined && covers(exception, each.via))));
    const allowing = near.find((exception) => exception.reason);
    if (allowing) accepted.add(allowing);
    else if (near.length) kept.push({ ...each, message: `${each.message} (the exception on ${near[0].file === each.file ? `line ${near[0].line}` : `${near[0].file}:${near[0].line}`} gives no reason: imago-check: allow ${each.rule} — <reason>)` });
    else kept.push(each);
  }
  return { findings: kept, accepted: [...accepted] };
}
