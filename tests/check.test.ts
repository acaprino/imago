// imago-check: the rules of the design file that a program can judge, in an app and in the package's own css/.
//   node --experimental-strip-types --test tests/check.test.ts
// Each rule has a string it must find and one it must not; the edge cases are the reader's (comments, strings, nesting,
// a declaration over lines) and the pins' (tags, commits, a workspace).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classesOf, parseCss, valueTokens } from '../scripts/check/css.mjs';
import { packageNames, namesUsed } from '../scripts/check/names.mjs';
import { ELSEWHERE, KEPT, REMOVED } from '../scripts/check/removed.mjs';
import * as rules from '../scripts/check/rules.mjs';
import { check, main } from '../scripts/check/cli.mjs';
import { parseSource } from '../scripts/check/source.mjs';
import { VALUES } from '../scripts/check/values.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'scripts', 'check', 'cli.mjs');

type Finding = { file: string; line: number; rule: string; message: string };
type Names = { classes: Set<string>; attributes: Set<string>; properties: Set<string> };

/** The findings of a rule on one file, as "line rule" strings. */
function found(rule: (source: any, ...rest: any[]) => Finding[], text: string, file = 'src/app.css', ...rest: any[]): string[] {
  return rule(parseSource(file, text), ...rest).map((finding) => `${finding.line} ${finding.rule}`);
}

// ---------- fixtures on disk ----------

const made: string[] = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A folder with these files (paths relative to it, forward slashes). */
function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'imago-check-'));
  made.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const SHA = '1c5ffa2005a613eeb64a63dbebb528ad93b4c608';
const OTHER_SHA = '964266f0000000000000000000000000000000aa';

/** The package as an app has it installed: what its css/ and ts/ define. */
const INSTALLED = {
  'node_modules/@acaprino/imago/package.json': '{ "name": "@acaprino/imago", "version": "0.1.4" }\n',
  'node_modules/@acaprino/imago/css/imago.css': '.im-btn { color: var(--im-text); }\n.im-btn--primary { color: var(--im-accent-on); }\n[data-im-tone="ok"] { color: var(--im-ok); }\n',
  'node_modules/@acaprino/imago/ts/ui/keys.ts': "export const find = (el: Element) => el.querySelector('.im-content');\nexport const mark = (el: HTMLElement) => { el.dataset.imLayer = 'x'; };\n",
  'node_modules/@acaprino/imago/docs/design-file.md': '# The design file\n',
  // The icon files of the app "shinatama" (the bytes do not matter: the rule compares them as they are).
  'node_modules/@acaprino/imago/icons/shinatama/icon.ico': 'ICO-OF-SHINATAMA',
  'node_modules/@acaprino/imago/icons/shinatama/256x256.png': 'PNG-256-OF-SHINATAMA',
  'node_modules/@acaprino/imago/icons/xiox/icon.ico': 'ICO-OF-XIOX',
};

const AGENTS = {
  'AGENTS.md': 'Before UI work, read node_modules/@acaprino/imago/docs/design-file.md and the files it references.\n',
  'CLAUDE.md': 'For UI work, apply the design file.\n\n@node_modules/@acaprino/imago/docs/design-file.md\n',
};

const manifest = (imago: object, spec = 'github:acaprino/imago#v0.1.4'): string =>
  `${JSON.stringify({ name: 'app', private: true, dependencies: { '@acaprino/imago': spec }, imago }, null, 2)}\n`;

const cargo = (pin: string): string => `[package]\nname = "app"\n\n[dependencies]\ntauri = "2.12"\nimago-shell = { git = "https://github.com/acaprino/imago", ${pin} }\n`;

/** The "icons" of the "imago" block: where a file sits in the app, and its name in icons/<app>/ of the package. */
const ICONS = { 'src-tauri/icons/icon.ico': 'icon.ico', 'src-tauri/icons/128x128@2x.png': '256x256.png' };

/** An app that keeps every rule: the check has nothing to say about it. */
const cleanApp = (): Record<string, string> => ({
  ...INSTALLED,
  ...AGENTS,
  'package.json': manifest({ src: ['src'], cargo: 'src-tauri/Cargo.toml', entry: 'src/main.ts', app: 'shinatama', icons: ICONS }),
  'src-tauri/icons/icon.ico': 'ICO-OF-SHINATAMA',
  'src-tauri/icons/128x128@2x.png': 'PNG-256-OF-SHINATAMA',
  'src-tauri/Cargo.toml': cargo('tag = "v0.1.4"'),
  'src/main.ts': "import { boot } from './boot.js';\nboot();\n",
  'src/boot.ts': "import { mountApp } from '@acaprino/imago/ui';\nexport function boot(): void {\n  const shell = document.querySelector('.im-content');\n  shell?.classList.add('im-btn', 'im-btn--primary');\n  mountApp(shell, registry, { search() {} });\n}\n",
  'src/app.css': '.mk-lane {\n  padding: var(--im-s-2) var(--im-s-3);\n  color: var(--im-text);\n  border-radius: var(--im-r-control);\n}\n',
  'index.html': '<!doctype html><title>x</title>\n',
});

const runCli = (args: string[], cwd = root) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
const FINDING_LINE = /^[^\s:]+:\d+ {2}[a-z]+(?:-[a-z]+)* {2}\S.*$/;

/** The findings the program prints first: the lines up to the first that is not a finding. */
function leadingFindings(lines: string[]): string[] {
  const end = lines.findIndex((line) => !FINDING_LINE.test(line));
  return end === -1 ? lines : lines.slice(0, end);
}

// ---------- the CSS reader ----------

describe('the CSS reader', () => {
  test('braces and quotes in a comment open nothing, and the lines after it stay right', () => {
    const sheet = parseCss('/* .a { color: red; } it\'s "x */\n.b {\n  color: var(--im-text);\n}\n');
    assert.deepEqual(sheet.rules.map((rule: any) => [rule.selector, rule.line]), [['.b', 2]]);
    assert.deepEqual(sheet.rules[0].declarations.map((d: any) => [d.property, d.line]), [['color', 3]]);
    assert.equal(sheet.comments[0].line, 1);
  });

  test('a string with braces and a semicolon stays inside its value', () => {
    const [rule] = parseCss('.a::before { content: "} ; {"; color: var(--im-text) }').rules;
    assert.deepEqual(rule.declarations.map((d: any) => [d.property, d.value]), [['content', '"} ; {"'], ['color', 'var(--im-text)']]);
  });

  test('a declaration over three lines has the line of its property and ends on its last line', () => {
    const [rule] = parseCss('.a {\n  padding:\n    var(--im-s-2)\n    13px;\n}\n').rules;
    assert.deepEqual(rule.declarations.map((d: any) => [d.property, d.value, d.line, d.endLine]), [['padding', 'var(--im-s-2) 13px', 2, 4]]);
  });

  test('a @container nested in @media (forced-colors: active) keeps both at-rules, outermost first', () => {
    const sheet = parseCss('@media (forced-colors: active) {\n  @container im-shell (width < 620px) {\n    .a { border-color: ButtonText; }\n  }\n}\n.b { color: var(--im-text); }\n');
    const [a, b] = sheet.rules;
    assert.deepEqual(a.atRules.map((at: any) => [at.name, at.prelude, at.line]), [['media', '(forced-colors: active)', 1], ['container', 'im-shell (width < 620px)', 2]]);
    assert.equal(a.line, 3);
    assert.deepEqual(b.atRules, [], 'the rule after the closed blocks is at the top level again');
    assert.equal(b.line, 6);
  });

  test('a nested rule knows the selectors it is nested in', () => {
    const sheet = parseCss('.a {\n  color: var(--im-text);\n  &:disabled { opacity: .5; }\n}\n');
    assert.deepEqual(sheet.rules.map((rule: any) => [rule.selector, rule.parents, rule.line]), [['.a', [], 1], ['&:disabled', ['.a'], 3]]);
  });

  test('an unquoted url may hold a semicolon', () => {
    const [rule] = parseCss('.a { mask: url(data:image/svg+xml;utf8,x); color: var(--im-text); }').rules;
    assert.deepEqual(rule.declarations.map((d: any) => d.property), ['mask', 'color']);
  });

  test('an escaped semicolon or brace is part of its selector', () => {
    assert.deepEqual(parseCss('.a\\;b { padding: 0; }\n.c\\{ { padding: 0; }\n').rules.map((rule: any) => [rule.selector, rule.line]), [['.a\\;b', 1], ['.c\\{', 2]]);
  });

  test('CRLF line endings count one line each', () => {
    const [rule] = parseCss('.a {\r\n  color: var(--im-text);\r\n  padding: 0;\r\n}\r\n').rules;
    assert.deepEqual(rule.declarations.map((d: any) => d.line), [2, 3]);
  });

  test('a selector list splits at its top-level commas, and classes skip attribute values and strings', () => {
    const [rule] = parseCss('.im-a:is(.b, .c), .d[data-x=".e"] { color: var(--im-text); }').rules;
    assert.deepEqual(rule.selectors, ['.im-a:is(.b, .c)', '.d[data-x=".e"]']);
    assert.deepEqual(classesOf(rule.selector), ['im-a', 'b', 'c', 'd']);
  });

  test('a custom property whose value holds braces is one declaration, and the rules after it stay right', () => {
    const sheet = parseCss(':root {\n  --mk-mixin: { padding: 3px; };\n  color: var(--im-text);\n}\n.b { padding: 0; }\n');
    assert.deepEqual(sheet.rules.map((rule: any) => [rule.selector, rule.line]), [[':root', 1], ['.b', 5]]);
    assert.deepEqual(sheet.rules[0].declarations.map((d: any) => [d.property, d.value, d.line]), [['--mk-mixin', '{ padding: 3px; }', 2], ['color', 'var(--im-text)', 3]]);
    assert.deepEqual(found(rules.literalSpace, ':root {\n  --mk-mixin: { padding: 3px; };\n}\n.b { padding: 5px; }\n'), ['4 literal-space']);
  });

  test('a declaration without a final semicolon ends on its own last line', () => {
    const [rule] = parseCss('.a {\n  color: var(--im-text);\n  padding:\n    var(--im-s-2)\n}\n').rules;
    assert.deepEqual(rule.declarations.map((d: any) => [d.property, d.line, d.endLine]), [['color', 2, 2], ['padding', 3, 4]]);
  });

  test('a value is read into tokens that know the functions round them', () => {
    const tokens = valueTokens('var(--im-fs-body, 13px) calc(100% - 2px) #fff url(#clip) "x"');
    const length = tokens.find((token: any) => token.text === '13px');
    assert.equal(length.type, 'dimension');
    assert.deepEqual(length.fns.map((fn: any) => [fn.name, fn.arg]), [['var', '--im-fs-body']]);
    assert.deepEqual(tokens.filter((token: any) => ['hash', 'url', 'string'].includes(token.type)).map((token: any) => token.type), ['hash', 'url', 'string']);
  });
});

// ---------- the rules ----------

describe('im-selector', () => {
  test('finds a package class in a selector and a --im- property the app sets', () => {
    assert.deepEqual(found(rules.imSelector, '.im-btn:hover {\n  color: var(--im-text);\n}\n:root {\n  --im-accent: var(--mk-accent);\n}\n'), ['1 im-selector', '5 im-selector']);
  });

  test('leaves the app\'s own classes that read tokens and the package\'s attributes', () => {
    assert.deepEqual(found(rules.imSelector, '[data-im-theme="dark"] .mk-lane { color: var(--im-text); --mk-gap: var(--im-s-2); }'), []);
  });

  test('leaves a --im- property written inline from a script: that is how --im-level and --im-progress are set', () => {
    assert.deepEqual(found(rules.imSelector, 'el.innerHTML = `<li style="--im-level: 2">x</li>`;', 'src/tree.ts'), []);
  });
});

describe('literal-color', () => {
  test('finds hex, rgb(, hsl(, oklch(, a named colour and a color-mix( over a literal', () => {
    const css = '.a { color: #fff; }\n.b { background: rgb(0 0 0 / 50%); }\n.c { color: hsl(20 50% 50%); }\n.d { color: oklch(0.5 0.1 20); }\n.e { border-color: white; }\n.f { background: color-mix(in srgb, #123456 20%, var(--im-sheet)); }\n.g { color: var(--im-text, #000); }\n';
    assert.deepEqual(found(rules.literalColor, css), [1, 2, 3, 4, 5, 6, 7].map((line) => `${line} literal-color`));
  });

  test('leaves #fff inside a string and inside url(#clip), and the keywords that are not colours of their own', () => {
    const css = '.a::before { content: "#fff"; }\n.b { clip-path: url(#clip); }\n.c { color: transparent; background: currentColor; border-color: inherit; outline: none; }\n.d { background: color-mix(in srgb, var(--im-err) 40%, var(--im-line)); }\n.e { background: color-mix(in oklch, var(--im-accent) 20%, transparent); }\n';
    assert.deepEqual(found(rules.literalColor, css), []);
  });

  test('leaves the system colours inside forced-colors', () => {
    const css = '@media (forced-colors: active) {\n  .a { border-color: ButtonText; background: Highlight; color: HighlightText; outline-color: SelectedItem; }\n  .b { color: CanvasText; background: Canvas; }\n}\n';
    assert.deepEqual(found(rules.literalColor, css), []);
  });

  test('finds a colour in the style a script writes: .style.x =, setProperty, a style attribute, cssText and setAttribute(\'style\')', () => {
    const ts = "el.style.color = '#ff0000';\nel.style.setProperty('background', 'rgb(0, 0, 0)');\nel.innerHTML = `<span style=\"color: oklch(0.5 0.1 20)\">${label}</span>`;\nel.style.cssText = 'border-color: #fffa';\nel.setAttribute('style', 'color: #123456');\n";
    assert.deepEqual(found(rules.literalColor, ts, 'src/view.ts'), [1, 2, 3, 4, 5].map((line) => `${line} literal-color`));
  });

  test('finds a colour in a React style object and in <meta name="theme-color">', () => {
    assert.deepEqual(found(rules.literalColor, "export const A = () => <div style={{ color: '#fff', padding: 0 }}>x</div>;\n", 'src/a.tsx'), ['1 literal-color']);
    const html = '<!doctype html>\n<meta name="theme-color" content="#1e1e1e">\n<meta name="description" content="#1 of the apps">\n';
    assert.deepEqual(found(rules.literalColor, html, 'index.html'), ['2 literal-color']);
    assert.deepEqual(found(rules.literalColor, "head.innerHTML = '<meta name=\"theme-color\" content=\"rgb(0 0 0)\">';\n", 'src/head.ts'), ['1 literal-color']);
  });

  test('finds a colour in the presentation attributes of SVG, in markup, in JSX and in a page, and on a canvas context', () => {
    const ts = "el.innerHTML = '<svg><path fill=\"#fff\" stroke=\"#1c3563\"/></svg>';\nel.innerHTML = `<stop offset=\"0\" stop-color=\"red\"/><feFlood flood-color=\"#000\"/>`;\nctx.fillStyle = '#f00';\nctx.strokeStyle = 'rgb(0 0 0)';\nctx.shadowColor = 'black';\n";
    assert.deepEqual(found(rules.literalColor, ts, 'src/graph.ts'), [1, 1, 2, 2, 3, 4, 5].map((line) => `${line} literal-color`), 'one finding per attribute');
    const tsx = 'export const Mark = () => (\n  <svg>\n    <path d={d} fill="#fff" />\n    <stop stopColor="#123456" />\n    <text color={\'#abc\'}>x</text>\n  </svg>\n);\n';
    assert.deepEqual(found(rules.literalColor, tsx, 'src/mark.tsx'), ['3 literal-color', '4 literal-color', '5 literal-color']);
    const html = '<!doctype html>\n<svg><path fill="#123456"/><feDiffuseLighting lighting-color="white"/></svg>\n<font color="red">x</font>\n';
    assert.deepEqual(found(rules.literalColor, html, 'index.html'), ['2 literal-color', '2 literal-color', '3 literal-color']);
  });

  test('finds a JSX colour attribute however far it is from the opening of its tag', () => {
    const lines = 'export const A = () => (\n  <path\n    d={`M0 ${x}`}\n    onClick={() => go(1, 2)}\n    className="mk-a mk-b"\n    fill="#abc"\n  />\n);\n';
    assert.deepEqual(found(rules.literalColor, lines, 'src/a.tsx'), ['6 literal-color'], 'a tag over several lines, the colour fourth');
    const long = `const b = <path d="M12 2L2 7l10 5 10-5-10-5z${' M2 17l10 5 10-5'.repeat(7)}" className="a" fill="#fff" />;\n`;
    assert.deepEqual(found(rules.literalColor, long, 'src/b.tsx'), ['1 literal-color'], 'a long d before the colour');
    const huge = `const c = <rect ${Array.from({ length: 40 }, (_, k) => `data-k${k}={values[${k}]}`).join(' ')} title="x" stroke="#123456" />;\n`;
    assert.ok(huge.length > 600, `${huge.length} characters`);
    assert.deepEqual(found(rules.literalColor, huge, 'src/c.tsx'), ['1 literal-color'], 'a tag of several hundred characters');
  });

  test('reads JSX colours only in files that can hold JSX: .tsx, .jsx, .js, .mjs and the scripts of a page, not .ts', () => {
    const jsx = 'const a = <path d={d} fill="#fff" />;\n';
    for (const file of ['src/a.tsx', 'src/a.jsx', 'src/a.js', 'src/a.mjs']) assert.deepEqual(found(rules.literalColor, jsx, file), ['1 literal-color'], file);
    assert.deepEqual(found(rules.literalColor, `<script type="module">\n${jsx}</script>\n`, 'index.html'), ['2 literal-color']);
    assert.deepEqual(found(rules.literalColor, 'for (let i = 0; i<n; i++) total += i\nlet x = a <b\ncolor = \'#fff\'\n', 'src/loop.ts'), [], 'a comparison in TypeScript is not a tag');
  });

  test('reading JSX colours is linear: five thousand bare assignments without semicolons take well under a second', () => {
    const js = `let color\n${"color = '#abc'\n".repeat(5000)}`;
    const started = performance.now();
    assert.deepEqual(found(rules.literalColor, js, 'src/many.js'), []);
    const took = performance.now() - started;
    assert.ok(took < 1000, `took ${Math.round(took)} ms`);
  });

  test('leaves a fill that is not the attribute of a tag: a variable, a default, an assignment in an expression', () => {
    const tsx = "const fill = '#fff';\nconst draw = ({ fill = '#fff', color = 'red' }) => fill + color;\nconst a = <div>{items.map((item) => { const stroke = '#000'; return item; })}</div>;\nconst b = <path d={d} />; let color = 'red';\nif (a <b) color = '#fff';\n";
    assert.deepEqual(found(rules.literalColor, tsx, 'src/d.tsx'), []);
  });

  test('leaves none, currentColor, a url(#…), a token, and a variable that is not an attribute', () => {
    const ts = "el.innerHTML = '<svg><path fill=\"none\" stroke=\"currentColor\"/><rect fill=\"url(#g)\" stroke=\"var(--im-line)\"/></svg>';\nconst fill = '#fff';\nlet color = 'red';\nctx.fillStyle = gradient;\nif (i <n) { const stroke = '#000'; }\n";
    assert.deepEqual(found(rules.literalColor, ts, 'src/graph.ts'), []);
    const tsx = 'const a = <path fill="none" stroke="currentColor" />;\nconst b = <rect fill="url(#g)" stroke="var(--im-accent)" />;\n';
    assert.deepEqual(found(rules.literalColor, tsx, 'src/mark.tsx'), []);
    assert.deepEqual(found(rules.literalColor, '<svg><path fill="none" stroke="currentColor"/><use href="#fff"/></svg>\n', 'index.html'), []);
  });

  test('leaves a hex or a colour function in a string that is not style: an issue number, a hash, a constant', () => {
    const ts = "const title = 'Issue #123 closed';\nlocation.hash = '#bad';\nconst fill = \"rgb(0, 0, 0)\";\nconst ring = `0 0 0 2px #fffa`;\n";
    assert.deepEqual(found(rules.literalColor, ts, 'src/view.ts'), []);
  });

  test('judges a colour word only in a property that takes a colour; a hex is a colour in any property', () => {
    const css = '.a { animation: red 1s; }\n.b { color: red; }\n.c { animation-name: white; }\n.d { --mk-word: white; }\n.e { border: 1px solid white; }\n.f { --mk-fill: #fff; }\n';
    assert.deepEqual(found(rules.literalColor, css), ['2 literal-color', '5 literal-color', '6 literal-color']);
  });

  test('leaves an anchor, an id selector, a character reference, a comment and a colour named by a token in a script', () => {
    const ts = "// the old colour was #fff\nconst link = `<a href=\"#fade\">Skip</a>`;\nconst bed = document.querySelector('#bed');\nconst cafe = el.closest('#cafe');\nconst clip = 'url(#face)';\nconst space = '&#160;';\nconst id = '#' + name;\nel.style.color = 'var(--im-text)';\n";
    assert.deepEqual(found(rules.literalColor, ts, 'src/view.ts'), []);
  });

  test('reads the attributes of a page: a hex in style=, but not in href=', () => {
    const html = '<!doctype html>\n<a href="#fade">Skip</a>\n<div style="color: #123456">x</div>\n<style>\n  .mk-a { color: #abc; }\n</style>\n';
    assert.deepEqual(found(rules.literalColor, html, 'index.html'), ['3 literal-color', '5 literal-color']);
  });
});

describe('literal-font-size', () => {
  test('finds a length in font-size and in the size of the font shorthand', () => {
    const css = '.a { font-size: 13px; }\n.b { font: 600 15px/1.45 var(--im-font-head); }\n.c { font-size: clamp(1rem, 2vw, 2rem); }\n.d { font-size: .8rem; }\n.e { font-size: small; }\n';
    assert.deepEqual(found(rules.literalFontSize, css), [1, 2, 3, 4, 5].map((line) => `${line} literal-font-size`));
  });

  test('leaves a type token, inherit, and a line-height after the slash', () => {
    const css = '.a { font-size: var(--im-fs-body); }\n.b { font: 600 var(--im-fs-title)/1.45 var(--im-font-head); }\n.c { font: inherit; }\n.d { font: 500 var(--im-fs-body)/calc(var(--im-h-control) - 2px) var(--im-font-head); }\n.e { font-size: 0; }\n';
    assert.deepEqual(found(rules.literalFontSize, css), []);
  });

  test('finds a literal size in a style written from a script', () => {
    assert.deepEqual(found(rules.literalFontSize, "el.style.fontSize = '15px';\nel.style.fontSize = 'var(--im-fs-body)';\n", 'src/view.ts'), ['1 literal-font-size']);
  });
});

describe('a React style object', () => {
  const tsx = "export const A = () => <div style={{ padding: '12px', margin: 0 }}>x</div>;\nexport const B = () => <p style={{\n  fontSize: 15,\n  cursor: 'pointer',\n  gap: 'var(--im-s-2)',\n}}>y</p>;\n";

  test('literal-space, literal-font-size and cursor-pointer read its values, a number as React writes it, in pixels', () => {
    assert.deepEqual(found(rules.literalSpace, tsx, 'src/view.tsx'), ['1 literal-space']);
    assert.deepEqual(found(rules.literalFontSize, tsx, 'src/view.tsx'), ['3 literal-font-size']);
    assert.deepEqual(found(rules.cursorPointer, tsx, 'src/view.tsx'), ['4 cursor-pointer']);
  });

  test('leaves an object built from tokens, a style given as a variable and a value computed at run time', () => {
    const clean = "const a = <div style={{ padding: 'var(--im-s-3)', fontSize: 'var(--im-fs-body)', '--mk-w': width }} />;\nconst b = <div style={styles.box} />;\nconst c = <div style={{ margin: gap + 'px', ...rest }} />;\n";
    for (const rule of [rules.literalSpace, rules.literalFontSize, rules.cursorPointer, rules.literalColor]) assert.deepEqual(found(rule, clean, 'src/view.tsx'), []);
  });
});

describe('the app\'s own custom properties', () => {
  /** The findings of a rule over several files, with the app's own custom properties of all of them. */
  const judged = (rule: (source: any, vars: any) => Finding[], files: Record<string, string>): Finding[] => {
    const sources = Object.entries(files).map(([file, text]) => parseSource(file, text));
    const vars = rules.customProperties(sources);
    return sources.flatMap((source) => rule(source, vars));
  };
  const where = (findings: Finding[]) => findings.map((f) => `${f.file}:${f.line} ${f.rule}`);

  test('--fs-md: 13.5px then font-size: var(--fs-md) is found where it is used, and the finding names the line that defines it', () => {
    const findings = judged(rules.literalFontSize, { 'src/tokens.css': ':root {\n  --fs-md: 13.5px;\n}\n', 'src/app.css': '.mk-row {\n  font-size: var(--fs-md);\n}\n' });
    assert.deepEqual(where(findings), ['src/app.css:2 literal-font-size']);
    assert.match(findings[0].message, /13\.5px/);
    assert.ok(findings[0].message.includes('--fs-md') && findings[0].message.includes('src/tokens.css:2'), findings[0].message);
  });

  test('through as many var() steps as it takes; a property set to a token, or one the app never defines, is not judged', () => {
    const css = ':root {\n  --fs-a: var(--fs-b);\n  --fs-b: 15px;\n  --fs-ok: var(--im-fs-body);\n  --fs-loop: var(--fs-loop);\n}\n.a { font-size: var(--fs-a); }\n.b { font-size: var(--fs-ok); }\n.c { font-size: var(--nowhere); }\n.d { font: 600 var(--fs-a)/1.4 var(--im-font-head); }\n.e { font-size: var(--fs-loop); }\n';
    const findings = judged(rules.literalFontSize, { 'src/app.css': css });
    assert.deepEqual(where(findings), ['src/app.css:7 literal-font-size', 'src/app.css:10 literal-font-size']);
    assert.ok(findings[0].message.includes('src/app.css:3'), `the line that holds the literal: ${findings[0].message}`);
  });

  test('a space or a radius behind an app\'s property, and a colour word behind one in a property that takes a colour', () => {
    const css = ':root {\n  --mk-gap: 12px;\n  --mk-hair: 1px;\n  --mk-red: red;\n}\n.a { gap: var(--mk-gap); border-radius: var(--mk-hair); }\n.b { color: var(--mk-red); }\n.c { animation: var(--mk-red) 1s; }\n';
    assert.deepEqual(where(judged(rules.literalSpace, { 'src/app.css': css })), ['src/app.css:6 literal-space']);
    assert.deepEqual(where(judged(rules.literalColor, { 'src/app.css': css })), ['src/app.css:7 literal-color']);
  });

  test('a chain of properties that doubles at each step resolves at once, still reports the literal, and says where it stopped', () => {
    const chain = Array.from({ length: 20 }, (_, k) => `  --c${k + 1}: var(--c${k}) var(--c${k});`).join('\n');
    const files = { ...cleanApp(), 'src/chain.css': `:root {\n  --c0: 13px;\n${chain}\n}\n.mk-a { padding: var(--c20); }\n` };
    const started = performance.now();
    const { findings, notes } = check({ root: folder(files), packageMode: false });
    const took = performance.now() - started;
    assert.ok(took < 1000, `took ${Math.round(took)} ms`);
    assert.deepEqual(findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src/chain.css:24 literal-space']);
    assert.ok(findings[0].message.includes('13px') && findings[0].message.includes('src/chain.css:2'), findings[0].message);
    assert.ok(notes.some((note: string) => note.includes('--c20') && /\b1000\b/.test(note)), notes.join('\n'));
  });

  test('a property defined in two rules reports both values at each use, each naming the line that sets it', () => {
    const css = ':root { --mk-gap: 12px; }\n.mk-dense { --mk-gap: 14px; }\n.mk-a { gap: var(--mk-gap); }\n.mk-b { padding: var(--mk-gap); }\n';
    const findings = judged(rules.literalSpace, { 'src/app.css': css });
    assert.deepEqual(where(findings), ['src/app.css:3 literal-space', 'src/app.css:3 literal-space', 'src/app.css:4 literal-space', 'src/app.css:4 literal-space']);
    for (const line of [3, 4]) {
      const messages = findings.filter((f) => f.line === line).map((f) => f.message).join('\n');
      assert.ok(/12px from --mk-gap \(src\/app\.css:1\)/.test(messages) && /14px from --mk-gap \(src\/app\.css:2\)/.test(messages), messages);
    }
  });

  test('a hex in an app\'s property is found once, where it is defined', () => {
    assert.deepEqual(where(judged(rules.literalColor, { 'src/app.css': ':root { --mk-bg: #1e1e1e; }\n.a { background: var(--mk-bg); }\n' })), ['src/app.css:1 literal-color']);
  });

  test('an exception on the line that defines the property allows the findings where it is used', () => {
    const files = { 'src/tokens.css': ':root {\n  /* imago-check: allow literal-font-size — the cell of the terminal */\n  --mk-cell: 13.5px;\n}\n', 'src/app.css': '.mk-term { font-size: var(--mk-cell); }\n' };
    const sources = Object.entries(files).map(([file, text]) => parseSource(file, text));
    const findings = sources.flatMap((source) => rules.literalFontSize(source, rules.customProperties(sources)));
    const { findings: kept, accepted } = rules.applyExceptions(findings, sources.flatMap((source) => rules.exceptionsIn(source)));
    assert.deepEqual(kept, []);
    assert.deepEqual(accepted.map((e: any) => `${e.file}:${e.line}`), ['src/tokens.css:2']);
  });
});

describe('literal-space', () => {
  test('finds a literal space or radius outside the allowed ones', () => {
    const css = '.a { padding: 12px 14px; }\n.b { gap: 2px 18px; }\n.c { margin: clamp(var(--im-s-3), 2.5vw, 2.5rem); }\n.d { border-radius: 999px; }\n.e { padding-inline: calc(100% - 32px); }\n.f { margin-block-start: var(--im-s-2, 8px); }\n.g { border-top-left-radius: 3px; }\n.h { row-gap: 6px; }\n';
    assert.deepEqual(found(rules.literalSpace, css), [1, 2, 3, 4, 5, 6, 7, 8].map((line) => `${line} literal-space`));
  });

  test('leaves 0, 1px, 2px, a percentage, auto, inherit, tokens, calc over tokens, and other properties', () => {
    const css = '.a { padding: 0 var(--im-s-3); }\n.b { margin: auto; gap: 1px; }\n.c { border-radius: 50%; }\n.d { padding: calc(var(--im-s-2) - 1px) 2px; }\n.e { margin: inherit; }\n.f { width: 13px; height: 7px; inset: 3px; }\n.g { gap: calc(var(--im-s-1) * 2); }\n.h { margin: 0px; }\n';
    assert.deepEqual(found(rules.literalSpace, css), []);
  });

  test('finds a literal space in a style attribute written from a script', () => {
    assert.deepEqual(found(rules.literalSpace, 'el.innerHTML = `<div style="padding: 12px; margin: ${gap}px">x</div>`;\n', 'src/view.ts'), ['1 literal-space']);
  });
});

describe('cursor-pointer', () => {
  test('finds a hand cursor', () => {
    assert.deepEqual(found(rules.cursorPointer, '.a {\n  cursor: pointer;\n}\n'), ['2 cursor-pointer']);
  });

  test('leaves the arrow', () => {
    assert.deepEqual(found(rules.cursorPointer, '.a { cursor: default; }\n.b { cursor: text; }\n'), []);
  });
});

describe('disabled-opacity', () => {
  test('finds an opacity on a disabled selector, by pseudo-class, attribute or aria, or inside a nested rule', () => {
    const css = '.a:disabled { opacity: .5; }\n.b[aria-disabled="true"] { opacity: .4; }\nlabel:has(:disabled) { opacity: .65; }\n.c[disabled] { color: var(--im-muted); opacity: 0.6; }\n.d { &:disabled { opacity: .5; } }\n';
    assert.deepEqual(found(rules.disabledOpacity, css), ['1 disabled-opacity', '2 disabled-opacity', '3 disabled-opacity', '4 disabled-opacity', '5 disabled-opacity']);
  });

  test('leaves an opacity on another state, a negated disabled, and a disabled state drawn without opacity', () => {
    const css = '.a:hover { opacity: .8; }\n.b:not(:disabled):hover { opacity: .8; }\n.c:disabled { color: var(--im-muted); border-style: dashed; }\n.d:disabled { opacity: 1; }\n';
    assert.deepEqual(found(rules.disabledOpacity, css), []);
  });
});

describe('media-width', () => {
  test('finds a @media on a width', () => {
    assert.deepEqual(found(rules.mediaWidth, '@media (max-width: 760px) { .a { flex-wrap: wrap; } }\n@media screen and (width < 600px) { .b { display: none; } }\n'), ['1 media-width', '2 media-width']);
  });

  test('leaves forced colours, reduced motion and the container queries of the shell', () => {
    assert.deepEqual(found(rules.mediaWidth, '@media (forced-colors: active) { .a { outline: 1px solid ButtonText; } }\n@media (prefers-reduced-motion: reduce) { .b { transition: none; } }\n@container im-shell (width < 620px) { .c { display: none; } }\n'), []);
  });

  test('finds matchMedia( on a width in a script, and leaves one on anything else', () => {
    const ts = "const narrow = window.matchMedia('(max-width: 899px)');\nconst dark = matchMedia('(prefers-color-scheme: dark)');\nconst wide = matchMedia(`(min-width: ${breakpoint}px)`);\n";
    assert.deepEqual(found(rules.mediaWidth, ts, 'src/view.ts'), ['1 media-width', '3 media-width']);
  });
});

describe('literal-case', () => {
  test('finds capitals or spacing typed in CSS and in the style a script writes', () => {
    const css = '.a { text-transform: uppercase; }\n.b { letter-spacing: 0.06em; }\n.c { text-transform: var(--mk-case); }\n';
    assert.deepEqual(found(rules.literalCase, css), ['1 literal-case', '2 literal-case', '3 literal-case']);
    assert.deepEqual(found(rules.literalCase, "el.style.textTransform = 'uppercase';\nconst a = <b style={{ letterSpacing: 1 }}>x</b>;\n", 'src/view.tsx'), ['1 literal-case', '2 literal-case']);
  });

  test('leaves none, 0, normal and the tokens of the look', () => {
    const css = '.a { text-transform: none; letter-spacing: 0; }\n.b { text-transform: var(--im-case); letter-spacing: var(--im-track); }\n.c { letter-spacing: normal; }\n.d { letter-spacing: 0px; }\n';
    assert.deepEqual(found(rules.literalCase, css), []);
  });
});

describe('own-keydown', () => {
  test('finds a key handler of the app on the document, the window or the body', () => {
    const ts = "document.addEventListener('keydown', onKey);\nwindow.addEventListener(\"keyup\", onKey, true);\ndocument.body.addEventListener('keypress', onKey);\nwindow.onkeydown = onKey;\ndocument.onkeyup = (event) => {};\n";
    assert.deepEqual(found(rules.ownKeydown, ts, 'src/keys.ts'), [1, 2, 3, 4, 5].map((line) => `${line} own-keydown`));
  });

  test('leaves a key handler on an element, another event, a string, a comment and a comparison', () => {
    const ts = "input.addEventListener('keydown', onKey);\ndocument.addEventListener('click', onClick);\nconst text = \"document.addEventListener('keydown')\";\n// document.addEventListener('keydown', x)\nif (window.onkeydown === null) {}\n";
    assert.deepEqual(found(rules.ownKeydown, ts, 'src/keys.ts'), []);
  });

  test('the message says what to do instead: a handler the app keeps calls claimKey(event) when it answers a key', () => {
    const [finding] = rules.ownKeydown(parseSource('src/keys.ts', "document.addEventListener('keydown', onKey);\n"));
    assert.ok(finding.message.includes('claimKey(event)') && finding.message.includes('@acaprino/imago/ui'), finding.message);
  });

  test('a widget that runs its own keys carries the exception comment', () => {
    const source = parseSource('src/terminal.ts', "// imago-check: allow own-keydown — the terminal runs its own keys\ndocument.addEventListener('keydown', onKey);\n");
    const { findings, accepted } = rules.applyExceptions(rules.ownKeydown(source), rules.exceptionsIn(source));
    assert.deepEqual(findings, []);
    assert.equal(accepted.length, 1);
  });
});

describe('unknown-value', () => {
  test('finds a value outside the set, in a page, in markup, in setAttribute, in dataset, in a selector and in JSX', () => {
    assert.deepEqual(found(rules.unknownValue, '<span class="im-chip" data-im-tone="good">x</span>\n<html data-im-theme="system">\n', 'index.html'), ['1 unknown-value', '2 unknown-value']);
    const ts = "el.innerHTML = '<span data-im-tone=\"good\">x</span>';\nel.setAttribute('data-im-look', 'glass');\nel.dataset.imSidebar = 'rail';\ndocument.querySelector('[data-im-step=blocked]');\n";
    assert.deepEqual(found(rules.unknownValue, ts, 'src/view.ts'), [1, 2, 3, 4].map((line) => `${line} unknown-value`));
    assert.deepEqual(found(rules.unknownValue, 'const a = <span data-im-tone="bad">x</span>;\n', 'src/view.tsx'), ['1 unknown-value']);
    assert.deepEqual(found(rules.unknownValue, '[data-im-surface="card"] .mk-a { color: var(--im-text); }\n'), ['1 unknown-value']);
    const [finding] = rules.unknownValue(parseSource('index.html', '<b data-im-tone="good">x</b>\n'));
    assert.ok(finding.message.includes('ok, warn, err, info'), finding.message);
  });

  test('leaves the values of the set, a value built at run time and an attribute without a set', () => {
    const ts = "el.innerHTML = `<span data-im-tone=\"${tone}\">x</span>`;\nel.innerHTML = '<span data-im-tone=\"accent\">x</span>';\nel.dataset.imTheme = 'light';\nel.setAttribute('data-im-app', 'xiox');\nel.innerHTML = '<div data-im-other=\"x\" data-im-inspector=\"wide\"></div>';\n";
    assert.deepEqual(found(rules.unknownValue, ts, 'src/view.ts'), []);
    assert.deepEqual(found(rules.unknownValue, '[data-im-tone="ok"] .mk-a { color: var(--im-text); }\n[data-im-tone] .mk-b { color: var(--im-text); }\n[data-im-look^="o"] .mk-c { color: var(--im-text); }\n'), []);
  });

  test('values.mjs holds the sets of the brief, and the failed and skipped steps the package draws', () => {
    assert.deepEqual(VALUES['data-im-tone'], ['ok', 'warn', 'err', 'info', 'accent']);
    assert.deepEqual(VALUES['data-im-surface'], ['ground', 'sheet', 'dense', 'float']);
    assert.deepEqual(VALUES['data-im-step'], ['done', 'now', 'todo', 'failed', 'skipped']);
    assert.deepEqual(VALUES['data-im-cat'], ['1', '2', '3', '4', '5', '6', '7', '8']);
    assert.deepEqual(Object.keys(VALUES).sort(), ['data-im-app', 'data-im-cat', 'data-im-inspector', 'data-im-look', 'data-im-sidebar', 'data-im-step', 'data-im-surface', 'data-im-theme', 'data-im-tone']);
    assert.deepEqual(found(rules.unknownValue, '<li class="im-row" data-im-cat="3" data-im-badge>a</li>\n<li class="im-row" data-im-cat="9">b</li>\n<li class="im-row" data-im-cat="red">c</li>\n', 'index.html'), ['2 unknown-value', '3 unknown-value']);
    assert.deepEqual(found(rules.unknownValue, '<ol class="im-steps"><li data-im-step="failed">a</li><li data-im-step="skipped">b</li></ol>\n', 'index.html'), []);
  });

  test('every value the package\'s css/ matches for an attribute of values.mjs is in its set', () => {
    const css = readdirSync(join(root, 'css'), { recursive: true }).map(String).filter((name) => name.endsWith('.css'));
    for (const name of css) {
      const sheet = parseCss(readFileSync(join(root, 'css', name), 'utf8'));
      for (const rule of sheet.rules) {
        for (const match of rule.selector.matchAll(/\[\s*(data-im-[a-z0-9-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*\]/g)) {
          const set = VALUES[match[1]];
          const value = match[2] ?? match[3] ?? match[4];
          if (set) assert.ok(set.includes(value), `css/${name}:${rule.line} draws ${match[1]}="${value}", which values.mjs does not list`);
        }
      }
    }
  });
});

describe('removed-name', () => {
  const removed = [
    { old: 'wm-drop-preview', kind: 'class', now: 'im-tiling-drop-preview' },
    { old: 'im-main', kind: 'class', now: 'main.im-panel.im-content' },
    { old: 'data-im-badge', kind: 'attribute', now: 'im-count' },
    { old: '--im-nav-width', kind: 'property', now: '--im-w-sidebar' },
    { old: 'applyShinatamaPalette', kind: 'export', now: 'Shinatama\'s own overrides of tokens' },
  ];

  test('finds wm-drop-preview, a name without the im- prefix, in a test file, and the message gives the replacement', () => {
    const ts = "import { test } from 'vitest';\ntest('drop', () => {\n  expect(root.querySelector('.wm-drop-preview')).toBeTruthy();\n  el.classList.add('wm-drop-preview');\n});\n";
    const findings = rules.removedName(parseSource('tests/tiling.test.ts', ts), removed);
    assert.deepEqual(findings.map((f: Finding) => `${f.line} ${f.rule}`), ['3 removed-name', '4 removed-name']);
    assert.ok(findings[0].message.includes('im-tiling-drop-preview'), findings[0].message);
  });

  test('finds a class, an attribute, a custom property and an export of the list, in CSS and in script', () => {
    const css = '.wm-drop-preview, .im-main { width: var(--im-nav-width); }\n[data-im-badge] .mk-a { color: var(--im-text); }\n';
    assert.deepEqual(found(rules.removedName, css, 'src/app.css', removed), ['1 removed-name', '1 removed-name', '1 removed-name', '2 removed-name']);
    const ts = "import { applyShinatamaPalette, mountZoom } from '@acaprino/imago/shell';\nel.style.setProperty('--im-nav-width', '240px');\nel.dataset.imBadge = '3';\nimport * as shell from '@acaprino/imago/shell';\nshell.applyShinatamaPalette(root);\n";
    assert.deepEqual(found(rules.removedName, ts, 'src/view.ts', removed), [1, 2, 3, 5].map((line) => `${line} removed-name`));
  });

  test('leaves a longer name, a comment, a name built at run time and an app\'s own function of the name', () => {
    const ts = "// the old im-main is gone\nconst a = 'im-main-x wm-drop-preview-old';\nfunction applyShinatamaPalette() {}\napplyShinatamaPalette();\nel.className = `im-main${suffix}`;\n";
    assert.deepEqual(found(rules.removedName, ts, 'src/view.ts', removed), []);
  });

  test('--im-item-color set by the app is a finding that names data-im-cat; read with var(), it is not; data-im-badge is the package\'s again', () => {
    const css = '.mk-thread { --im-item-color: #4a8; }\n.mk-mark { background: var(--im-item-color); }\n';
    const findings = rules.removedName(parseSource('src/app.css', css));
    assert.deepEqual(findings.map((f: Finding) => `${f.line} ${f.rule}`), ['1 removed-name']);
    assert.ok(findings[0].message.includes('data-im-cat'), findings[0].message);
    const ts = "el.innerHTML = '<li class=\"im-row\" style=\"--im-item-color: red\" data-im-badge>x</li>';\nel.style.setProperty('--im-item-color', color);\nconst a = <li style={{ '--im-item-color': 'red' }} />;\nconst ink = getComputedStyle(el).getPropertyValue('--im-item-color');\nel.dataset.imBadge = '';\n";
    assert.deepEqual(found(rules.removedName, ts, 'src/rows.tsx'), ['1 removed-name', '2 removed-name', '3 removed-name']);
    assert.deepEqual(found(rules.imSelector, css), [], 'removed-name owns the custom property the app sets: im-selector leaves it');
    assert.deepEqual(found(rules.imSelector, '.mk-a { --im-accent: red; }\n'), ['1 im-selector'], 'im-selector still reports the others');
  });

  test('the names of the canon\'s latest tables: the native controls of task 4', () => {
    const html = '<form class="im-native-controls"><input class="im-native-input"><span class="im-switch-knob"></span></form>\n';
    assert.deepEqual(found(rules.removedName, html, 'index.html'), ['1 removed-name', '1 removed-name', '1 removed-name']);
  });
});

describe('removed.mjs', () => {
  // The table "Moving from 0.1.4" of docs/using-imago.md, the one table of what the canon removed: the lines of its
  // section, from its heading to the next heading of its level (tests/docs.test.ts reads the same section).
  const USING = join(root, 'docs', 'using-imago.md');
  function movingSection(): string[] {
    const lines = readFileSync(USING, 'utf8').split(/\r?\n/);
    const first = lines.findIndex((line) => /^## (?:\d+\. )?Moving from 0\.1\.4\s*$/.test(line));
    if (first === -1) return [];
    const next = lines.findIndex((line, index) => index > first && /^## /.test(line));
    return lines.slice(first, next === -1 ? lines.length : next);
  }
  /** The kind of a name as the check reads it. */
  const kindOf = (name: string): string => (name.startsWith('--') ? 'property' : name.startsWith('data-') ? 'attribute' : /^[a-z][a-z0-9]*(?:-{1,2}[a-z0-9]+)+$/.test(name) ? 'class' : 'export');
  const NAME = /^(?:--[a-z0-9-]+|data-[a-z0-9-]+|[a-z][a-z0-9]*(?:-{1,2}[a-z0-9]+)+|[A-Za-z_$][\w$]*)$/;

  /** The first cells of the table: their names when the cell is only names, or the cell itself when it describes a change of behaviour. */
  function rows(): { names: string[][]; skipped: string[] } {
    const names: string[][] = [];
    const skipped: string[] = [];
    for (const path of [USING]) {
      for (const line of movingSection()) {
        const cells = /^\|(.*?)\|(.*)\|\s*$/.exec(line);
        if (!cells || /^\s*-+\s*$/.test(cells[1]) || /^\s*Old name\s*$/.test(cells[1])) continue;
        const cell = cells[1].trim().replace(/\s+from\s+`@acaprino\/imago[^`]*`$/, '');
        const spans = [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
        const rest = cell.replace(/`[^`]+`/g, '').replace(/,|\band\b/g, '').trim();
        if (spans.length && !rest && spans.every((span) => NAME.test(span))) names.push(spans);
        else skipped.push(`${path.slice(root.length + 1).replaceAll('\\', '/')}: ${cells[1].trim()}`);
      }
    }
    return { names, skipped };
  }

  test('holds every name of the mapping tables, with its kind, but those a later table brings back; the rows that describe a change of behaviour are skipped', (t) => {
    const { names, skipped } = rows();
    const byName = new Map(REMOVED.map((entry: any) => [entry.old, entry]));
    const kept = new Set(KEPT.map((entry: any) => entry.old));
    const missing = names.flat().filter((name) => !kept.has(name) && byName.get(name)?.kind !== kindOf(name));
    t.diagnostic(`rows read as a change of behaviour, not a name (${skipped.length}):\n${skipped.join('\n')}`);
    assert.deepEqual(missing, [], `names of the tables missing from scripts/check/removed.mjs, or of another kind: ${missing.join(', ')}\nRows skipped:\n${skipped.join('\n')}`);
    assert.ok(names.flat().length >= 50, `only ${names.flat().length} names read from the tables`);
    for (const entry of KEPT as { old: string; why: string }[]) {
      assert.ok(names.flat().includes(entry.old), `${entry.old} is kept, and no table names it`);
      assert.ok(!byName.has(entry.old), `${entry.old} is both kept and removed`);
      assert.ok(entry.why.trim().length > 2, `${entry.old} says not why it is kept`);
    }
  });

  test('every entry is a name of its kind, once, with what replaces it', () => {
    assert.equal(new Set(REMOVED.map((entry: any) => entry.old)).size, REMOVED.length, 'a name listed twice');
    for (const entry of REMOVED as { old: string; kind: string; now: string; when?: string }[]) {
      assert.ok(NAME.test(entry.old), `${entry.old} is not a name`);
      assert.equal(entry.kind, kindOf(entry.old), `${entry.old}`);
      assert.ok(entry.now.trim().length > 2, `${entry.old} gives no replacement`);
      assert.ok(entry.when === undefined || (entry.when === 'set' && entry.kind === 'property'), `${entry.old}: "when" is "set", on a custom property`);
    }
    for (const entry of ELSEWHERE as { old: string; rule: string }[]) assert.ok(!REMOVED.some((other: any) => other.old === entry.old), `${entry.old} is reported by ${entry.rule}, not by removed-name`);
  });

  test('no removed name is one the package still defines or exports; a name the app must not set, a kept name, is the package\'s', () => {
    const names = packageNames(root);
    const has = (name: string) => names.classes.has(name) || names.attributes.has(name) || names.properties.has(name);
    const sources = [join(root, 'ts'), join(root, 'react')].flatMap((dir) => readdirSync(dir, { recursive: true }).map(String).filter((name) => /\.(ts|js)$/.test(name)).map((name) => readFileSync(join(dir, name), 'utf8'))).join('\n');
    for (const entry of REMOVED as { old: string; kind: string; when?: string }[]) {
      if (entry.when === 'set') assert.ok(has(entry.old), `${entry.old} is the package's, which the app must not set: the package does not define it`);
      else if (entry.kind === 'export') assert.ok(!new RegExp(`(?<![\\w$])${entry.old}(?![\\w$])`).test(sources), `${entry.old} is still in ts/ or react/`);
      else assert.ok(!has(entry.old), `${entry.old} is still defined by the package`);
    }
    for (const entry of KEPT as { old: string }[]) assert.ok(has(entry.old), `${entry.old} is kept, and the package does not define it`);
    for (const entry of ELSEWHERE as { old: string }[]) assert.ok(!has(entry.old), `${entry.old} is still defined by the package`);
  });
});

describe('show-modal', () => {
  test('finds showModal( in a script', () => {
    assert.deepEqual(found(rules.showModal, 'const d = document.querySelector("dialog");\nd.showModal();\n', 'src/view.ts'), ['2 show-modal']);
  });

  test('leaves a comment, a string and show()', () => {
    assert.deepEqual(found(rules.showModal, '// never showModal(): it makes the title bar inert\nconst word = "showModal(";\nd.show();\n', 'src/view.ts'), []);
  });
});

describe('unknown-name', () => {
  const defined: Names = { classes: new Set(['im-btn', 'im-btn--primary', 'im-row']), attributes: new Set(['data-im-tone']), properties: new Set() };

  test('finds a class or an attribute the package does not define, in markup, script and CSS; a modifier is a name of its own', () => {
    const ts = "el.innerHTML = `<button class=\"im-btnn\">x</button>`;\nel.classList.add('im-ribbon');\nel.className = 'im-btn im-btn--ghost';\nel.setAttribute('data-im-nope', '');\nel.dataset.imGone = 'x';\n";
    assert.deepEqual(found(rules.unknownName, ts, 'src/view.ts', defined), [1, 2, 3, 4, 5].map((line) => `${line} unknown-name`));
    assert.deepEqual(found(rules.unknownName, '.mk-a .im-gone { color: var(--im-text); }\n[data-im-nope] .mk-b { color: var(--im-text); }\n', 'src/app.css', defined), ['1 unknown-name', '2 unknown-name']);
    assert.deepEqual(found(rules.unknownName, '<div class="im-row im-null-state" data-im-tone="ok">x</div>\n', 'index.html', defined), ['1 unknown-name']);
  });

  test('reads the class names after a JSX closing tag, which is not a regular expression', () => {
    const tsx = 'const a = <div className="im-gone">x</div>; const b = <span className="im-also-gone">y</span>;\n';
    assert.deepEqual(found(rules.unknownName, tsx, 'src/view.tsx', defined), ['1 unknown-name', '1 unknown-name']);
  });

  test('leaves the names the package defines and the names built at run time', () => {
    const ts = "el.innerHTML = `<button class=\"im-btn im-btn--primary\" data-im-tone=\"${tone}\">x</button>`;\nconst cls = `im-text-${tone}`;\nconst other = 'im-' + kind;\nel.querySelector('.im-row[aria-selected=\"true\"]');\nel.dataset.imTone = 'ok';\n";
    assert.deepEqual(found(rules.unknownName, ts, 'src/view.ts', defined), []);
  });

  test('leaves a name the canon removed to removed-name, which says what replaces it', () => {
    assert.deepEqual(found(rules.unknownName, "el.classList.add('im-main', 'im-banner');\nel.dataset.imCompact = '';\n", 'src/view.ts', defined), []);
    assert.deepEqual(found(rules.removedName, "el.classList.add('im-main', 'im-banner');\nel.dataset.imCompact = '';\n", 'src/view.ts'), ['1 removed-name', '1 removed-name', '2 removed-name']);
  });
});

describe('class-prefix', () => {
  test('finds a class of the package that does not start with im-', () => {
    assert.deepEqual(found(rules.classPrefix, '.wm-pane { display: grid; }\n.im-a .wm-tab:hover { color: var(--im-text); }\n', 'css/tiling.css'), ['1 class-prefix', '2 class-prefix']);
  });

  test('leaves im- classes, keyframe selectors and dots inside strings and comments', () => {
    assert.deepEqual(found(rules.classPrefix, '/* see .old */\n.im-pane { display: grid; }\n@keyframes im-spin { from { rotate: 0; } 12.5% { rotate: 45deg; } to { rotate: 1turn; } }\n.im-a::before { content: ".x"; }\n@import "./tokens.css";\n', 'css/tiling.css'), []);
  });
});

describe('pin-mismatch', () => {
  const npm = (spec: string) => ({ file: 'package.json', text: manifest({}, spec) });
  const crate = (pin: string) => ({ file: 'src-tauri/Cargo.toml', text: cargo(pin) });
  const pins = (input: object) => rules.pinMismatch({ workspace: null, npmLock: null, cargoLock: null, ...input });

  test('a tag in npm and the same tag in Cargo agree', () => {
    assert.deepEqual(pins({ npm: npm('github:acaprino/imago#v0.1.4'), cargo: crate('tag = "v0.1.4"') }), { findings: [], notes: [] });
  });

  test('two different tags are a finding', () => {
    const { findings } = pins({ npm: npm('github:acaprino/imago#v0.1.4'), cargo: crate('tag = "v0.1.3"') });
    assert.deepEqual(findings.map((f: Finding) => f.rule), ['pin-mismatch']);
    assert.match(findings[0].message, /v0\.1\.3/);
  });

  test('a tag in npm and a rev in Cargo cannot be compared offline: a note, not a finding', () => {
    const { findings, notes } = pins({ npm: npm('github:acaprino/imago#v0.1.4'), cargo: crate(`rev = "${SHA}"`) });
    assert.deepEqual(findings, []);
    assert.equal(notes.length, 1);
    assert.match(notes[0], /cannot compare offline/);
  });

  test('a tag and a rev are compared through the lock file when it says which commit the tag installed', () => {
    const npmLock = JSON.stringify({ packages: { 'node_modules/@acaprino/imago': { resolved: `git+ssh://git@github.com/acaprino/imago.git#${OTHER_SHA}` } } });
    const { findings, notes } = pins({ npm: npm('github:acaprino/imago#v0.1.4'), cargo: crate(`rev = "${SHA}"`), npmLock });
    assert.deepEqual(notes, []);
    assert.deepEqual(findings.map((f: Finding) => f.rule), ['pin-mismatch']);
  });

  test('a commit in npm and the same commit, written short, in Cargo agree', () => {
    assert.deepEqual(pins({ npm: npm(`git+https://github.com/acaprino/imago.git#${SHA}`), cargo: crate(`rev = "${SHA.slice(0, 7)}"`) }), { findings: [], notes: [] });
  });

  test('two different commits are a finding, and so is a pin that is not a tag or a commit', () => {
    assert.equal(pins({ npm: npm(`github:acaprino/imago#${SHA}`), cargo: crate(`rev = "${OTHER_SHA}"`) }).findings.length, 1);
    assert.equal(pins({ npm: npm('github:acaprino/imago'), cargo: crate('tag = "v0.1.4"') }).findings.length, 1);
    assert.equal(pins({ npm: npm('github:acaprino/imago#v0.1.4'), cargo: crate('branch = "develop"') }).findings.length, 1);
  });

  test('imago-shell.workspace = true is resolved through the root Cargo.toml', () => {
    const member = { file: 'apps/desktop/src-tauri/Cargo.toml', text: '[package]\nname = "app"\n\n[dependencies]\nimago-shell.workspace = true\n' };
    const workspace = (pin: string) => ({ file: 'Cargo.toml', text: `[workspace]\nmembers = ["apps/desktop/src-tauri"]\n\n[workspace.dependencies]\nimago-shell = { git = "https://github.com/acaprino/imago", ${pin} }\n` });
    assert.deepEqual(pins({ npm: npm(`github:acaprino/imago#${SHA}`), cargo: member, workspace: workspace(`rev = "${SHA}"`) }), { findings: [], notes: [] });
    const { findings } = pins({ npm: npm(`github:acaprino/imago#${SHA}`), cargo: member, workspace: workspace(`rev = "${OTHER_SHA}"`) });
    assert.deepEqual(findings.map((f: Finding) => f.rule), ['pin-mismatch']);
    assert.match(findings[0].message, /Cargo\.toml:5/, 'the finding says where the workspace pins it');
  });

  test('the table form [dependencies.imago-shell] and { workspace = true } are read too', () => {
    const table = { file: 'src-tauri/Cargo.toml', text: '[dependencies.imago-shell]\ngit = "https://github.com/acaprino/imago"\ntag = "v0.1.4"\n' };
    assert.deepEqual(pins({ npm: npm('github:acaprino/imago#v0.1.4'), cargo: table }), { findings: [], notes: [] });
    const inline = { file: 'src-tauri/Cargo.toml', text: '[dependencies]\nimago-shell = { workspace = true }\n' };
    const workspace = { file: 'Cargo.toml', text: '[workspace.dependencies.imago-shell]\ngit = "https://github.com/acaprino/imago"\ntag = "v0.1.4"\n' };
    assert.deepEqual(pins({ npm: npm('github:acaprino/imago#v0.1.4'), cargo: inline, workspace }), { findings: [], notes: [] });
  });
});

describe('agent-rules', () => {
  const DESIGN = 'node_modules/@acaprino/imago/docs/design-file.md';
  /** The agent files of an app whose package has its design file at `design`: a path exists when it is that file. */
  const agents = (files: { file: string; text: string | null }[], design = DESIGN) =>
    rules.agentRules(files, { designFile: design, resolves: (file: string, path: string) => [path, `${dirname(file)}/${path}`.replace(/^\.\//, '')].includes(design) })
      .map((f: Finding) => `${f.file}:${f.line} ${f.rule}`);

  test('finds a file that lacks the path of the design file, and a file that is missing', () => {
    assert.deepEqual(agents([{ file: 'AGENTS.md', text: 'Be careful.\n' }, { file: 'CLAUDE.md', text: null }]), ['AGENTS.md:1 agent-rules', 'CLAUDE.md:1 agent-rules']);
  });

  test('leaves files that name it', () => {
    assert.deepEqual(agents(Object.entries(AGENTS).map(([file, text]) => ({ file, text }))), []);
  });

  test('an agent file whose path does not exist is a finding on its line, and the message says the path that does', () => {
    const design = 'viewer/node_modules/@acaprino/imago/docs/design-file.md';
    assert.deepEqual(agents([{ file: 'AGENTS.md', text: `Intro.\n${AGENTS['AGENTS.md']}` }], design), ['AGENTS.md:2 agent-rules']);
    const [finding] = rules.agentRules([{ file: 'AGENTS.md', text: AGENTS['AGENTS.md'] }], { designFile: design, resolves: () => false });
    assert.ok(finding.message.includes(design), finding.message);
    assert.deepEqual(agents([{ file: 'AGENTS.md', text: `Read ${design}.\n` }, { file: 'CLAUDE.md', text: `@${design}\n` }], design), []);
    assert.deepEqual(agents([{ file: 'viewer/AGENTS.md', text: 'Read node_modules/@acaprino/imago/docs/design-file.md.\n' }], design), [], 'a path from the folder of the agent file');
  });
});

describe('mount-app', () => {
  const lines = (sources: any[]) => rules.mountApp(sources).map((f: Finding) => `${f.file}:${f.line} ${f.rule}`);

  test('finds an entry that, with what it imports, never calls mountApp(', () => {
    const entry = parseSource('src/main.ts', "import './app.ts';\n");
    const app = parseSource('src/app.ts', "// mountApp(shell) is for later\nexport const x = 'mountApp(';\n");
    assert.deepEqual(lines([entry, app]), ['src/main.ts:1 mount-app']);
  });

  test('leaves an entry whose import calls it, under its own name, another or through a namespace', () => {
    assert.deepEqual(lines([parseSource('src/main.ts', "import './boot';\n"), parseSource('src/boot.ts', "import {\n  confirm,\n  mountApp,\n} from '@acaprino/imago/ui';\nmountApp(shell, registry, { search });\n")]), []);
    assert.deepEqual(lines([parseSource('src/main.ts', "import { mountApp as mount } from '@acaprino/imago/ui';\nmount(shell, registry, { search });\n")]), []);
    assert.deepEqual(lines([parseSource('src/main.ts', "import * as ui from '@acaprino/imago/ui';\nui.mountApp(shell, registry, { search });\n")]), []);
    assert.deepEqual(lines([parseSource('src/main.ts', "const { mountApp } = await import('@acaprino/imago/ui');\nmountApp(shell, registry, { search });\n")]), []);
  });

  test('an app\'s own function mountApp() does not pass: the call is of the binding imported from @acaprino/imago/ui', () => {
    assert.deepEqual(lines([parseSource('src/main.ts', 'function mountApp(): void {}\nmountApp();\n')]), ['src/main.ts:1 mount-app']);
    assert.deepEqual(lines([parseSource('src/main.ts', "import { mountApp } from './mount.ts';\nmountApp(shell);\n")]), ['src/main.ts:1 mount-app']);
    assert.deepEqual(lines([parseSource('src/main.ts', "import { mountApp } from '@acaprino/imago/ui';\nexport { mountApp };\n")]), ['src/main.ts:1 mount-app'], 'imported and never called');
    assert.deepEqual(lines([parseSource('src/main.ts', "import { mountApp } from '@acaprino/imago/ui';\n"), parseSource('src/boot.ts', 'mountApp(shell);\n')]), ['src/main.ts:1 mount-app'], 'imported in one file and an own name called in another');
  });
});

describe('app-icon', () => {
  // A PNG starts with bytes that a text reading would change: a line ending is a byte of the file.
  const packaged = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
  const entry = (have: Buffer | null) => ({ file: 'src-tauri/icons/icon.ico', name: 'icon.ico', have, want: packaged });
  const lines = (...items: ReturnType<typeof entry>[]) => rules.appIcon('muro', items, 'node_modules/@acaprino/imago').map((f: Finding) => `${f.file}:${f.line} ${f.rule}`);

  test('a file that is the package\'s file, byte for byte, passes', () => {
    assert.deepEqual(lines(entry(Buffer.from(packaged))), []);
  });

  test('a changed byte is a finding on the app\'s file, and the message names the package\'s file', () => {
    const changed = Buffer.from(packaged);
    changed[9] = 0x02;
    assert.deepEqual(lines(entry(changed)), ['src-tauri/icons/icon.ico:1 app-icon']);
    const [finding] = rules.appIcon('muro', [entry(changed)], 'node_modules/@acaprino/imago');
    assert.ok(finding.message.includes('node_modules/@acaprino/imago/icons/muro/icon.ico'), finding.message);
  });

  test('a line ending is a byte: a file with CRLF where the package has LF, or a file one byte longer, is a finding', () => {
    assert.deepEqual(lines(entry(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]))), ['src-tauri/icons/icon.ico:1 app-icon']);
    assert.deepEqual(lines(entry(Buffer.concat([packaged, Buffer.from([0x00])]))), ['src-tauri/icons/icon.ico:1 app-icon']);
    assert.deepEqual(lines(entry(packaged.subarray(0, 9))), ['src-tauri/icons/icon.ico:1 app-icon']);
  });

  test('a file the app does not have is a finding that says where to copy it from', () => {
    const [finding] = rules.appIcon('muro', [entry(null)], 'node_modules/@acaprino/imago');
    assert.equal(finding.file, 'src-tauri/icons/icon.ico');
    assert.match(finding.message, /does not exist/);
    assert.ok(finding.message.includes('node_modules/@acaprino/imago/icons/muro/icon.ico'), finding.message);
  });

  test('every listed file is judged, in the order given', () => {
    const other = { file: 'assets/a.ico', name: 'favicon.ico', have: Buffer.from('x'), want: Buffer.from('y') };
    assert.deepEqual(lines(entry(Buffer.from(packaged)), other, entry(null)), ['assets/a.ico:1 app-icon', 'src-tauri/icons/icon.ico:1 app-icon']);
  });
});

describe('exceptions', () => {
  const allowed = (css: string) => {
    const source = parseSource('src/app.css', css);
    return rules.applyExceptions(rules.literalSpace(source), rules.exceptionsIn(source));
  };

  test('a comment on the line above with a reason allows the finding, and the exception is kept to be printed', () => {
    const { findings, accepted } = allowed(".a {\n  /* imago-check: allow literal-space — the icon's box */\n  padding: 3px;\n}\n");
    assert.deepEqual(findings, []);
    assert.deepEqual(accepted.map((e: any) => [e.file, e.line, e.rule, e.reason]), [['src/app.css', 2, 'literal-space', "the icon's box"]]);
  });

  test('a comment on the same line, with a hyphen for the dash, allows it too', () => {
    assert.deepEqual(allowed('.a { padding: 3px; } /* imago-check: allow literal-space - the icon box */\n').findings, []);
  });

  test('an exception without a reason allows nothing, and the finding says why', () => {
    const { findings, accepted } = allowed('.a {\n  /* imago-check: allow literal-space */\n  padding: 3px;\n}\n');
    assert.deepEqual(findings.map((f: Finding) => `${f.line} ${f.rule}`), ['3 literal-space']);
    assert.match(findings[0].message, /no reason/);
    assert.deepEqual(accepted, []);
  });

  test('an exception for another rule, or two lines above, allows nothing', () => {
    assert.equal(allowed('/* imago-check: allow literal-color — not this one */\n.a { padding: 3px; }\n').findings.length, 1);
    assert.equal(allowed('/* imago-check: allow literal-space — too far */\n\n.a { padding: 3px; }\n').findings.length, 1);
  });

  test('an exception covers a declaration over lines from the line above its property', () => {
    assert.deepEqual(allowed('.a {\n  /* imago-check: allow literal-space — the icon box */\n  padding:\n    var(--im-s-2)\n    3px;\n}\n').findings, []);
  });
});

// ---------- the names the package defines ----------

describe('names', () => {
  test('the package defines the classes of its css/, the classes and attributes its scripts write, and its custom properties', () => {
    const names = packageNames(root);
    for (const name of ['im-btn', 'im-btn--primary', 'im-shell', 'im-content']) assert.ok(names.classes.has(name), `${name} is not among the classes`);
    for (const name of ['data-im-tone', 'data-im-look', 'data-im-layer', 'data-im-sidebar']) assert.ok(names.attributes.has(name), `${name} is not among the attributes`);
    for (const name of ['--im-accent', '--im-s-2', '--im-level']) assert.ok(names.properties.has(name), `${name} is not among the properties`);
    assert.ok(![...names.classes].some((name) => !name.startsWith('im-') || name.endsWith('-')), 'only whole im- names are classes');
  });

  test('a name used in a script is read with its line', () => {
    const used = namesUsed(parseSource('src/a.ts', "const a = 1;\nel.classList.toggle('im-row', on);\nel.dataset.imSidebarOpen = '';\n"));
    assert.deepEqual(used.classes.map((use: any) => [use.name, use.line]), [['im-row', 2]]);
    assert.deepEqual(used.attributes.map((use: any) => [use.name, use.line]), [['data-im-sidebar-open', 3]]);
  });
});

// ---------- the program ----------

describe('imago-check on an app', () => {
  test('an app that keeps every rule has no finding and no note', () => {
    const result = check({ root: folder(cleanApp()), packageMode: false });
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.notes, []);
  });

  test('findings carry the path from the root with forward slashes, in order', () => {
    const dir = folder({ ...cleanApp(), 'src/styles/app.css': '.im-btn { padding: 12px; }\n.mk-a { cursor: pointer; }\n' });
    assert.deepEqual(check({ root: dir, packageMode: false }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), [
      'src/styles/app.css:1 im-selector', 'src/styles/app.css:1 literal-space', 'src/styles/app.css:2 cursor-pointer',
    ]);
  });

  test('without "cargo" and "entry" their rules are skipped, and the program says so', () => {
    const files = cleanApp();
    files['package.json'] = manifest({});
    const { findings, notes } = check({ root: folder(files), packageMode: false });
    assert.deepEqual(findings, []);
    assert.equal(notes.length, 3);
    assert.ok(notes.some((note: string) => /pin-mismatch/.test(note) && /skipped/.test(note)));
    assert.ok(notes.some((note: string) => /mount-app/.test(note) && /skipped/.test(note)));
    assert.ok(notes.some((note: string) => /app-icon/.test(note) && /skipped/.test(note) && /"icons"/.test(note)));
  });

  test('a Cargo.toml that takes imago-shell from the workspace is compared with the root Cargo.toml', () => {
    const files = cleanApp();
    files['package.json'] = manifest({ src: ['src'], cargo: 'src-tauri/Cargo.toml', entry: 'src/main.ts' }, `git+https://github.com/acaprino/imago.git#${SHA}`);
    files['src-tauri/Cargo.toml'] = '[package]\nname = "app"\n\n[dependencies]\nimago-shell.workspace = true\n';
    files['Cargo.toml'] = `[workspace]\nmembers = ["src-tauri"]\n\n[workspace.dependencies]\nimago-shell = { git = "https://github.com/acaprino/imago", rev = "${OTHER_SHA}" }\n`;
    assert.deepEqual(check({ root: folder(files), packageMode: false }).findings.map((f: Finding) => `${f.file} ${f.rule}`), ['package.json pin-mismatch']);
  });

  test('an entry that never reaches mountApp( is a finding on the entry', () => {
    const files = cleanApp();
    files['src/boot.ts'] = 'export function boot(): void {}\n';
    assert.deepEqual(check({ root: folder(files), packageMode: false }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src/main.ts:1 mount-app']);
  });

  test('a class the installed package does not define is a finding, one it writes from a script is not', () => {
    const files = cleanApp();
    files['src/view.ts'] = "export const html = '<div class=\"im-content im-workbnch\"></div>';\n";
    assert.deepEqual(check({ root: folder(files), packageMode: false }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src/view.ts:1 unknown-name']);
  });

  test('an icon file that is not the package\'s is a finding on the app\'s file; the ones that are equal are not', () => {
    const files = cleanApp();
    files['src-tauri/icons/icon.ico'] = 'ICO-OF-XIOX';
    const { findings, notes } = check({ root: folder(files), packageMode: false });
    assert.deepEqual(findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src-tauri/icons/icon.ico:1 app-icon']);
    assert.deepEqual(notes, []);
  });

  test('an icon file the app does not have is a finding on the path the app listed', () => {
    const files = cleanApp();
    delete files['src-tauri/icons/128x128@2x.png'];
    assert.deepEqual(check({ root: folder(files), packageMode: false }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src-tauri/icons/128x128@2x.png:1 app-icon']);
  });

  test('"app" says whose icons they are: another app\'s file is another file', () => {
    const files = cleanApp();
    files['package.json'] = manifest({ src: ['src'], cargo: 'src-tauri/Cargo.toml', entry: 'src/main.ts', app: 'xiox', icons: { 'src-tauri/icons/icon.ico': 'icon.ico' } });
    files['src-tauri/icons/icon.ico'] = 'ICO-OF-XIOX';
    assert.deepEqual(check({ root: folder(files), packageMode: false }).findings, []);
  });

  test('"icons" without "app", an app the package has no icons for, a file name it does not have, or a path in the name all stop the program', () => {
    const attempt = (block: object) => {
      const files = cleanApp();
      files['package.json'] = manifest({ src: ['src'], ...block });
      return () => check({ root: folder(files), packageMode: false });
    };
    assert.throws(attempt({ icons: ICONS }), /"imago\.icons".*"imago\.app"/);
    assert.throws(attempt({ app: 'ethel', icons: ICONS }), /ethel.*shinatama, xiox/);
    assert.throws(attempt({ app: '../icons/xiox', icons: ICONS }), /"imago\.app"/);
    assert.throws(attempt({ app: 'xiox', icons: { 'a.png': 'ghost.png' } }), /ghost\.png.*xiox/);
    assert.throws(attempt({ app: 'xiox', icons: { 'a.ico': '../shinatama/icon.ico' } }), /a file name/);
    assert.doesNotThrow(attempt({ app: 'xiox', icons: { 'a.ico': 'icon.ico' } }));
  });

  test('"app" is one of the folders of the package\'s icons/, exactly: "..", "." and another case stop the program, with "icons" or without', () => {
    for (const app of ['..', '.', 'Xiox', 'icons', 'xiox/']) {
      for (const block of [{ app }, { app, icons: { 'a.ico': 'icon.ico' } }]) {
        const files = cleanApp();
        files['package.json'] = manifest({ src: ['src'], ...block });
        assert.throws(() => check({ root: folder(files), packageMode: false }), /"imago\.app"/, JSON.stringify(block));
      }
    }
  });

  test('the app\'s own custom properties are resolved across its files, and the finding is where the property is used', () => {
    const files = { ...cleanApp(), 'src/tokens.css': ':root {\n  --fs-md: 13.5px;\n  --mk-pad: 12px 14px;\n}\n', 'src/row.css': '.mk-row {\n  font-size: var(--fs-md);\n  padding: var(--mk-pad);\n}\n' };
    const findings = check({ root: folder(files), packageMode: false }).findings;
    assert.deepEqual(findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src/row.css:2 literal-font-size', 'src/row.css:3 literal-space']);
    assert.ok(findings[0].message.includes('src/tokens.css:2'), findings[0].message);
  });

  test('a removed name in a folder of "tests" is found; the installed copy of the package and the other rules do not read it', () => {
    const files = cleanApp();
    files['package.json'] = manifest({ src: ['src'], tests: ['tests'], cargo: 'src-tauri/Cargo.toml', entry: 'src/main.ts', app: 'shinatama', icons: ICONS });
    files['tests/shell.test.ts'] = "expect(document.querySelector('.im-main')).toBeNull();\nconst pad = '<div style=\"padding: 3px\"></div>';\ndocument.addEventListener('keydown', onKey);\nel.classList.add('im-gone');\n";
    files['node_modules/@acaprino/imago/css/old.css'] = '.im-main { color: var(--im-text); }\n';
    assert.deepEqual(check({ root: folder(files), packageMode: false }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['tests/shell.test.ts:1 removed-name', 'tests/shell.test.ts:4 unknown-name']);
  });

  test('with "package" the check reads the package where it is installed, and never reads that copy as a source of the app', () => {
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(cleanApp())) files[path.replace('node_modules/@acaprino/imago/', 'vendor/imago/')] = text;
    files['package.json'] = manifest({ src: ['.'], package: 'vendor/imago', entry: 'src/main.ts', app: 'shinatama', icons: ICONS });
    files['AGENTS.md'] = 'Before UI work, read vendor/imago/docs/design-file.md.\n';
    files['CLAUDE.md'] = '@vendor/imago/docs/design-file.md\n';
    files['vendor/imago/css/old.css'] = '.im-main { padding: 3px; }\n';
    const { findings } = check({ root: folder(files), packageMode: false });
    assert.deepEqual(findings, []);
    const missing = { ...files, 'package.json': manifest({ src: ['src'], package: 'nowhere/imago' }) };
    assert.throws(() => check({ root: folder(missing), packageMode: false }), /nowhere/);
  });

  test('Daodan: the package is under viewer/node_modules and the agent files at the root; a path the agent file writes must exist', () => {
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(INSTALLED)) files[`viewer/${path}`] = text;
    files['package.json'] = `${JSON.stringify({ name: 'daodan', private: true, imago: { src: ['viewer/src'], app: 'shinatama' } }, null, 2)}\n`;
    files['viewer/package.json'] = manifest({});
    files['viewer/src/app.css'] = '.dd-a { padding: var(--im-s-2); }\n';
    files['AGENTS.md'] = AGENTS['AGENTS.md'];
    files['CLAUDE.md'] = '@viewer/node_modules/@acaprino/imago/docs/design-file.md\n';
    const dir = folder(files);
    const { findings } = check({ root: dir, packageMode: false });
    assert.deepEqual(findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['AGENTS.md:1 agent-rules']);
    assert.ok(findings[0].message.includes('viewer/node_modules/@acaprino/imago/docs/design-file.md'), findings[0].message);
    writeFileSync(join(dir, 'AGENTS.md'), 'Before UI work, read viewer/node_modules/@acaprino/imago/docs/design-file.md.\n');
    assert.deepEqual(check({ root: dir, packageMode: false }).findings, []);
  });

  test('mount-app follows a re-export of the package\'s mountApp through the app\'s own files, to any depth', () => {
    const mounts = (files: Record<string, string>) => {
      const app = cleanApp();
      delete app['src/boot.ts'];
      return check({ root: folder({ ...app, ...files }), packageMode: false }).findings.filter((f: Finding) => f.rule === 'mount-app').length;
    };
    const call = 'mountApp(shell, registry, { search() {} });\n';
    assert.equal(mounts({ 'src/main.ts': `import { mountApp } from './ui.ts';\n${call}`, 'src/ui.ts': "export { mountApp } from '@acaprino/imago/ui';\n" }), 0, 'export { mountApp } from');
    assert.equal(mounts({ 'src/main.ts': "import { mount } from './ui';\nmount(shell, registry, {});\n", 'src/ui.ts': "export { confirm, mountApp as mount } from '@acaprino/imago/ui';\n" }), 0, 'export { mountApp as x } from');
    assert.equal(mounts({ 'src/main.ts': `import { mountApp } from './ui.js';\n${call}`, 'src/ui.ts': "export * from '@acaprino/imago/ui';\n" }), 0, 'export * from');
    assert.equal(mounts({ 'src/main.ts': `import { mountApp } from './app';\n${call}`, 'src/app/index.ts': "export * from '../ui.ts';\n", 'src/ui.ts': "export { mountApp } from '@acaprino/imago/ui';\n" }), 0, 'two files deep');
    assert.equal(mounts({ 'src/main.ts': "import * as ui from './ui.ts';\nui.mountApp(shell, registry, {});\n", 'src/ui.ts': "export * from '@acaprino/imago/ui';\n" }), 0, 'through a namespace');
    assert.equal(mounts({ 'src/main.ts': `import { mountApp } from './ui.ts';\n${call}`, 'src/ui.ts': "import { mountApp } from '@acaprino/imago/ui';\nexport { mountApp };\n" }), 0, 'imported, then exported');
    assert.equal(mounts({ 'src/main.ts': `import { mountApp } from './ui.ts';\n${call}`, 'src/ui.ts': 'export function mountApp(): void {}\n' }), 1, 'an own function of that name');
    assert.equal(mounts({ 'src/main.ts': `import { mountApp } from './a.ts';\n${call}`, 'src/a.ts': "export * from './b.ts';\n", 'src/b.ts': "export * from './a.ts';\n" }), 1, 'a cycle ends, and passes nothing');
    assert.equal(mounts({ 'src/main.ts': "import { mountApp } from './ui.ts';\n", 'src/ui.ts': "export { mountApp } from '@acaprino/imago/ui';\n" }), 1, 'a re-export imported and never called');
    assert.equal(mounts({ 'src/main.ts': `import { mountApp } from './ui.ts';\n${call}`, 'src/ui.ts': "export { other as mountApp } from './x.ts';\n", 'src/x.ts': 'export function other(): void {}\n' }), 1, 'the app\'s own function exported under the name');
  });

  test('mount-app gives the same answer in any order of the imports when a cycle of barrels holds the real export', () => {
    const app = cleanApp();
    delete app['src/boot.ts'];
    const barrels = {
      'src/a.ts': "export * from './b.ts';\n",
      'src/b.ts': "export * from './a.ts';\nexport * from './c.ts';\n",
      'src/c.ts': "export { mountApp } from '@acaprino/imago/ui';\n",
    };
    for (const main of ["import './b.ts';\nimport { mountApp } from './a.ts';\nmountApp(shell);\n", "import { mountApp } from './a.ts';\nimport './b.ts';\nmountApp(shell);\n"]) {
      const { findings } = check({ root: folder({ ...app, ...barrels, 'src/main.ts': main }), packageMode: false });
      assert.deepEqual(findings.filter((f: Finding) => f.rule === 'mount-app'), [], main);
    }
    // Twelve barrels that each export all the others: the answer comes at once, whichever file holds the export.
    const dense: Record<string, string> = { 'src/main.ts': "import { mountApp } from './b0.ts';\nmountApp(shell);\n" };
    for (let k = 0; k < 12; k++) dense[`src/b${k}.ts`] = Array.from({ length: 12 }, (_, j) => (j === k ? '' : `export * from './b${j}.ts';\n`)).join('') + (k === 11 ? "export { mountApp } from '@acaprino/imago/ui';\n" : '');
    const started = performance.now();
    const { findings } = check({ root: folder({ ...app, ...dense }), packageMode: false });
    assert.deepEqual(findings.filter((f: Finding) => f.rule === 'mount-app'), []);
    assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)} ms`);
  });

  test('reading no source file is exit 2, with the folders it looked in; the summary says how many files of each kind it read', () => {
    const empty = cleanApp();
    empty['package.json'] = manifest({ src: [] });
    const none = runCli(['--root', folder(empty)]);
    assert.equal(none.status, 2, none.stdout + none.stderr);
    assert.match(none.stderr, /no source file/);
    const docs = { ...cleanApp(), 'package.json': manifest({ src: ['docs'] }), 'docs/readme.md': '# x\n' };
    const result = runCli(['--root', folder(docs)]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /no source file.*\bdocs\b/);
    const clean = runCli(['--root', folder(cleanApp())]);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.match(clean.stdout, /^imago-check: no findings in 3 files \(1 css, 2 script\)\.$/m);
    assert.deepEqual(check({ root: folder(cleanApp()), packageMode: false }).read, { css: 1, script: 2, html: 0 });
  });

  test('im-brand-image is brand-mark\'s to report: neither unknown-name nor removed-name says it again on its line', () => {
    const files = { ...cleanApp(), 'src/brand.ts': "const logo = document.createElement('img');\nlogo.className = 'im-brand-image';\n" };
    assert.deepEqual(check({ root: folder(files), packageMode: false }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src/brand.ts:2 brand-mark']);
  });

  test('a dangling symlink in src is skipped with a note: no stack, and no exit 1 of its own', () => {
    const dir = folder(cleanApp());
    const target = mkdtempSync(join(tmpdir(), 'imago-check-gone-'));
    symlinkSync(target, join(dir, 'src', 'gone'), 'junction');
    rmSync(target, { recursive: true, force: true });
    const { findings, notes } = check({ root: dir, packageMode: false });
    assert.deepEqual(findings, []);
    assert.ok(notes.some((note: string) => note.includes('src/gone') && /skipped/.test(note)), notes.join('\n'));
    const result = runCli(['--root', dir]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /\n\s+at /, 'no stack');
    assert.match(result.stdout, /src\/gone/);
  });
});

describe('imago-check, the command', () => {
  test('a bad argument exits 2', () => {
    assert.equal(runCli(['--bogus']).status, 2);
    assert.equal(runCli(['--root']).status, 2);
    assert.equal(runCli(['--root', join(tmpdir(), 'imago-check-no-such-folder')]).status, 2);
  });

  test('an app without package.json, or with an "imago" block it cannot read, exits 2', () => {
    assert.equal(runCli(['--root', folder({ 'src/a.css': '' })]).status, 2);
    const files = cleanApp();
    files['package.json'] = manifest({ sources: ['src'] });
    assert.equal(runCli(['--root', folder(files)]).status, 2);
  });

  test('an "app" that is not a name, or "icons" that is not a map from paths to file names, exits 2', () => {
    const blocks = [{ app: 3 }, { app: '' }, { app: 'xiox', icons: ['icon.ico'] }, { app: 'xiox', icons: {} }, { app: 'xiox', icons: { 'a.ico': 3 } }, { app: 'xiox', icons: { 'a.ico': '' } }];
    for (const block of blocks) {
      const files = cleanApp();
      files['package.json'] = manifest(block);
      const result = runCli(['--root', folder(files)]);
      assert.equal(result.status, 2, `${JSON.stringify(block)}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /"imago\.(app|icons)"/);
    }
  });

  test('"package" that is not a path, "tests" that is not a list of folders, or a folder of "tests" that does not exist, exits 2', () => {
    const blocks = [{ package: 3 }, { package: '' }, { tests: 'tests' }, { tests: [3] }, { tests: ['no-such-folder'] }];
    for (const block of blocks) {
      const files = cleanApp();
      files['package.json'] = manifest(block);
      const result = runCli(['--root', folder(files)]);
      assert.equal(result.status, 2, `${JSON.stringify(block)}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /"imago\.(package|tests)"/);
    }
  });

  test('any other system error is one line on stderr and exit 2, never a stack and never exit 1', () => {
    const errors: string[] = [];
    const broken = () => {
      throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    };
    const status = main(['--root', folder(cleanApp())], { out: broken, err: (text: string) => errors.push(text) });
    assert.equal(status, 2);
    const text = errors.join('');
    assert.equal(text.trimEnd().split('\n').length, 1, text);
    assert.match(text, /^imago-check: .*EPIPE/);
  });

  test('a clean app exits 0, an app with findings exits 1 and prints file:line  rule  message', () => {
    assert.equal(runCli(['--root', folder(cleanApp())]).status, 0);
    const dirty = runCli(['--root', folder({ ...cleanApp(), 'src/app.css': '.mk-a {\n  color: #fff;\n}\n' })]);
    assert.equal(dirty.status, 1);
    assert.match(dirty.stdout, /^src\/app\.css:2 {2}literal-color {2}\S/m);
  });

  test('--package checks css/ of the package, with tokens.css exempt from the literal rules and the exceptions printed after the findings', () => {
    const dir = folder({
      'package.json': '{ "name": "@acaprino/imago" }\n',
      'css/tokens.css': ':root { --im-s-2: 8px; --im-text: #eee; }\n',
      'css/tiling.css': '.wm-pane { padding: 3px; }\n.im-a {\n  /* imago-check: allow literal-color — the white of a mark */\n  color: #fff;\n}\n',
    });
    const result = runCli(['--package', '--root', dir]);
    assert.equal(result.status, 1);
    const lines = result.stdout.split(/\r?\n/);
    assert.deepEqual(leadingFindings(lines).map((line) => line.split('  ').slice(0, 2).join(' ')), ['css/tiling.css:1 class-prefix', 'css/tiling.css:1 literal-space']);
    const exceptions = lines.findIndex((line) => /^exceptions accepted/i.test(line));
    assert.ok(exceptions > 2, 'the exceptions come after the findings');
    assert.equal(lines[exceptions + 1], 'css/tiling.css:3  literal-color  the white of a mark');
  });

  test('--package runs on this repository and prints only well-formed findings', () => {
    const result = runCli(['--package']);
    assert.ok(result.status === 0 || result.status === 1, `exit ${result.status}: ${result.stderr}`);
    const lines = result.stdout.split(/\r?\n/);
    const findings = leadingFindings(lines);
    assert.equal(result.status === 1, findings.length > 0, 'exit 1 exactly when there are findings');
    assert.match(lines[findings.length], /^$|^exceptions accepted|^imago-check:/i, `a line that is not a finding: ${lines[findings.length]}`);
    assert.ok(findings.every((line) => line.startsWith('css/') && !line.startsWith('css/tokens.css')), 'only css/, and tokens.css has nothing a non-literal rule finds');
  });
});
