// The rule brand-mark: the brand at the top left of the title bar is the one titlebarHtml writes, the initial of the
// product's name in capitals in the accent's square (im-mark) and then the name (im-wordmark): no drawing, no logo, no
// other mark (docs/superpowers/specs/2026-11-21-one-canon-design.md, "The mark at the top left"). Like the rules of
// rules.mjs it is a pure function: it takes what source.mjs reads (never a path on disk) and returns its findings,
// `{ file, line, rule, message }`. The markup it reads is a page's, and that of a script's strings and template
// literals; a ${} in it is built at run time, and what it builds is not judged.

import { DYNAMIC, lineAt } from './source.mjs';

/**
 * @typedef {import('./source.mjs').Source} Source
 * @typedef {{ file: string, line: number, rule: string, message: string }} Finding
 * @typedef {{ name: string, classes: string[], at: number, end: number, closed: boolean, children: Node[] }} Element
 * @typedef {{ text: string, at: number }} Text
 * @typedef {Element | Text} Node
 */

const RULE = 'brand-mark';
const SHAPE = "the brand is one im-mark holding the initial of the product's name in capitals, then one im-wordmark holding the name, as titlebarHtml writes them from brand.name";
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const IMAGES = new Set(['img', 'svg', 'picture', 'canvas']);
const TAG = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/g;
const CLASS = /(?:^|\s)class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
const BRAND_IMAGE = /(?<![\w-])im-brand-image(?![\w-])/g;

/** @param {Node} node @returns {node is Element} */
const isElement = (node) => 'name' in node;

/**
 * The elements and the text of some markup, as a tree. A closing tag closes the nearest open element of its name and
 * any left open inside it; what is still open at the end of the text is not closed (`closed: false`).
 * @param {string} text
 * @returns {Element}
 */
function parse(text) {
  /** @type {Element} */
  const root = { name: '#root', classes: [], at: 0, end: text.length, closed: true, children: [] };
  const stack = [root];
  let last = 0;
  const addText = (/** @type {number} */ from, /** @type {number} */ to) => {
    if (to > from) stack[stack.length - 1].children.push({ text: text.slice(from, to), at: from });
  };
  for (const match of text.matchAll(TAG)) {
    const at = match.index ?? 0;
    addText(last, at);
    last = at + match[0].length;
    const name = match[2].toLowerCase();
    if (match[1]) {
      const open = stack.findLastIndex((element) => element.name === name);
      if (open > 0) for (const element of stack.splice(open)) Object.assign(element, { closed: true, end: last });
      continue;
    }
    const attributes = CLASS.exec(match[3]);
    const classes = (attributes?.[1] ?? attributes?.[2] ?? attributes?.[3] ?? '').split(/\s+/).filter(Boolean);
    /** @type {Element} */
    const element = { name, classes, at, end: last, closed: false, children: [] };
    stack[stack.length - 1].children.push(element);
    if (VOID.has(name) || match[4]) element.closed = true;
    else stack.push(element);
  }
  addText(last, text.length);
  for (const element of stack.slice(1)) element.end = text.length;
  return root;
}

/** @param {Element} element @returns {Generator<Element>} every element inside, at any depth */
function* elementsIn(element) {
  for (const child of element.children) {
    if (!isElement(child)) continue;
    yield child;
    yield* elementsIn(child);
  }
}

/** @param {Element} element @returns {string} all the text inside, at any depth */
const textOf = (element) => element.children.map((child) => (isElement(child) ? textOf(child) : child.text)).join('');

/** @param {Element} element */
const tagOf = (element) => `<${element.name}${element.classes.length ? ` class="${element.classes.join(' ')}"` : ''}>`;

/**
 * What is wrong with one brand, in words; nothing when it is the mark and the name.
 * @param {Element} brand
 * @returns {string[]}
 */
function problemsOf(brand) {
  /** @type {Set<string>} */
  const problems = new Set();
  const inside = [...elementsIn(brand)];
  for (const element of inside) if (IMAGES.has(element.name)) problems.add(`an <${element.name}>`);
  if ([brand, ...inside].some((element) => element.classes.includes('im-brand-image'))) problems.add('the class im-brand-image');

  // A brand still open at the end of the text, or with markup built at run time among its children, is not complete
  // here: what is missing may be built elsewhere, so only what is there is judged.
  let complete = brand.closed;
  /** @type {Element[]} */
  const kids = [];
  for (const child of brand.children) {
    if (isElement(child)) {
      kids.push(child);
      continue;
    }
    if (child.text.includes(DYNAMIC)) complete = false;
    const words = child.text.replaceAll(DYNAMIC, '').trim();
    if (words) problems.add(`the text "${words}" outside im-wordmark`);
  }
  const marks = kids.filter((kid) => kid.classes.includes('im-mark'));
  const names = kids.filter((kid) => kid.classes.includes('im-wordmark'));
  for (const kid of kids) if (!marks.includes(kid) && !names.includes(kid) && !IMAGES.has(kid.name)) problems.add(tagOf(kid));
  if (complete) {
    if (!marks.length) problems.add('no im-mark');
    if (!names.length) problems.add('no im-wordmark');
  }
  if (marks.length > 1) problems.add(`${marks.length} im-mark`);
  if (names.length > 1) problems.add(`${names.length} im-wordmark`);
  if (marks.length && names.length && kids.indexOf(names[0]) < kids.indexOf(marks[0])) problems.add('im-wordmark before im-mark');

  for (const mark of marks) {
    const children = [...elementsIn(mark)];
    if (children.some((element) => IMAGES.has(element.name))) continue;
    if (children.length) problems.add('an element in im-mark');
    const text = textOf(mark);
    if (text.includes(DYNAMIC)) continue;
    const letter = text.trim().normalize('NFC');
    if (!letter) problems.add('an empty im-mark');
    else if (!/^\p{L}$/u.test(letter) || letter !== letter.toLocaleUpperCase()) problems.add(`"${letter}" in im-mark`);
  }
  return [...problems];
}

/**
 * The markup of a source, each piece with the line it starts on: a page's text (its comments, styles and scripts
 * blanked), and the strings and template literals of its scripts, with their escaped quotes read as quotes.
 * @param {Source} source
 * @returns {{ text: string, line: number }[]}
 */
function markupOf(source) {
  const pieces = source.kind === 'html' && source.code.length ? [{ text: source.code[0].text, line: source.code[0].line }] : [];
  for (const str of source.strings) {
    if (str.attribute === undefined) pieces.push({ text: str.text.replace(/\\(["'`])/g, ' $1').replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' ')), line: str.line });
  }
  return pieces;
}

/**
 * A call of titlebarHtml( that gives its brand an image (`brand: { name, image }`): brand.image is removed.
 * @param {Source} source
 * @returns {Finding[]}
 */
function brandImageOption(source) {
  /** @type {Finding[]} */
  const findings = [];
  for (const chunk of source.kind === 'script' ? source.code : source.code.slice(1)) {
    const code = chunk.text;
    for (const call of code.matchAll(/(?<![\w$])titlebarHtml\s*\(/g)) {
      const start = (call.index ?? 0) + call[0].length;
      const args = code.slice(start, closing(code, start - 1, '(', ')'));
      for (const brand of args.matchAll(/(?<![\w$])brand\s*:\s*\{/g)) {
        const open = (brand.index ?? 0) + brand[0].length - 1;
        const body = args.slice(open, closing(args, open, '{', '}'));
        const image = /(?<![\w$.])image\s*(?=[:,}])/.exec(body);
        if (!image) continue;
        findings.push({
          file: source.file, line: lineAt(code, start + open + image.index, chunk.line), rule: RULE,
          message: "brand.image is removed: the title bar shows the initial of brand.name in capitals and the name, not a picture; the app's logo stays what Windows shows (the icons of its executables)",
        });
      }
    }
  }
  return findings;
}

/** The index of the bracket that closes the one at `open`, or the end of the text. */
function closing(/** @type {string} */ text, /** @type {number} */ open, /** @type {string} */ left, /** @type {string} */ right) {
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === left) depth++;
    else if (text[k] === right && --depth === 0) return k;
  }
  return text.length;
}

/**
 * The brand of the title bar in an app: an element with the class im-brand whose content is not one im-mark holding one
 * capital letter followed by one im-wordmark (an image, an app's own mark, the name alone, "d." in the mark), the class
 * im-brand-image wherever it is written, and a titlebarHtml( call that gives its brand an image.
 * @param {Source} source
 * @returns {Finding[]}
 */
export function brandMark(source) {
  if (source.kind === 'css') return [];
  /** @type {Finding[]} */
  const findings = brandImageOption(source);
  for (const piece of markupOf(source)) {
    /** @type {[number, number][]} */
    const brands = [];
    for (const element of elementsIn(parse(piece.text))) {
      if (!element.classes.includes('im-brand')) continue;
      brands.push([element.at, element.end]);
      const problems = problemsOf(element);
      if (problems.length) {
        findings.push({ file: source.file, line: lineAt(piece.text, element.at, piece.line), rule: RULE, message: `im-brand holds ${problems.join(', ')}: ${SHAPE}` });
      }
    }
    for (const match of piece.text.matchAll(BRAND_IMAGE)) {
      const at = match.index ?? 0;
      if (brands.some(([from, to]) => at >= from && at < to)) continue;
      findings.push({ file: source.file, line: lineAt(piece.text, at, piece.line), rule: RULE, message: `im-brand-image is removed: ${SHAPE}` });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}
