// imago-check: the rules of the design file that a program can judge, in an app and in the package's own css/.
//   node --experimental-strip-types --test tests/check.test.ts
// Each rule has a string it must find and one it must not; the edge cases are the reader's (comments, strings, nesting,
// a declaration over lines) and the pins' (tags, commits, a workspace).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classesOf, parseCss, valueTokens } from '../scripts/check/css.mjs';
import { packageNames, namesUsed } from '../scripts/check/names.mjs';
import * as rules from '../scripts/check/rules.mjs';
import { check } from '../scripts/check/cli.mjs';
import { parseSource } from '../scripts/check/source.mjs';

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
};

const AGENTS = {
  'AGENTS.md': 'Before UI work, read node_modules/@acaprino/imago/docs/design-file.md and the files it references.\n',
  'CLAUDE.md': 'For UI work, apply the design file.\n\n@node_modules/@acaprino/imago/docs/design-file.md\n',
};

const manifest = (imago: object, spec = 'github:acaprino/imago#v0.1.4'): string =>
  `${JSON.stringify({ name: 'app', private: true, dependencies: { '@acaprino/imago': spec }, imago }, null, 2)}\n`;

const cargo = (pin: string): string => `[package]\nname = "app"\n\n[dependencies]\ntauri = "2.12"\nimago-shell = { git = "https://github.com/acaprino/imago", ${pin} }\n`;

/** An app that keeps every rule: the check has nothing to say about it. */
const cleanApp = (): Record<string, string> => ({
  ...INSTALLED,
  ...AGENTS,
  'package.json': manifest({ src: ['src'], cargo: 'src-tauri/Cargo.toml', entry: 'src/main.ts' }),
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

  test('finds a hex colour or rgb( in a quoted string or a template literal of a script', () => {
    const ts = "el.style.color = '#ff0000';\nconst fill = \"rgb(0, 0, 0)\";\nel.innerHTML = `<span style=\"color: oklch(0.5 0.1 20)\">${label}</span>`;\nconst ring = `0 0 0 2px #fffa`;\n";
    assert.deepEqual(found(rules.literalColor, ts, 'src/view.ts'), ['1 literal-color', '2 literal-color', '3 literal-color', '4 literal-color']);
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
    const ts = "el.innerHTML = `<button class=\"im-btnn\">x</button>`;\nel.classList.add('im-banner');\nel.className = 'im-btn im-btn--ghost';\nel.setAttribute('data-im-nope', '');\nel.dataset.imGone = 'x';\n";
    assert.deepEqual(found(rules.unknownName, ts, 'src/view.ts', defined), [1, 2, 3, 4, 5].map((line) => `${line} unknown-name`));
    assert.deepEqual(found(rules.unknownName, '.mk-a .im-gone { color: var(--im-text); }\n[data-im-nope] .mk-b { color: var(--im-text); }\n', 'src/app.css', defined), ['1 unknown-name', '2 unknown-name']);
    assert.deepEqual(found(rules.unknownName, '<div class="im-row im-zero-state" data-im-tone="ok">x</div>\n', 'index.html', defined), ['1 unknown-name']);
  });

  test('reads the class names after a JSX closing tag, which is not a regular expression', () => {
    const tsx = 'const a = <div className="im-gone">x</div>; const b = <span className="im-also-gone">y</span>;\n';
    assert.deepEqual(found(rules.unknownName, tsx, 'src/view.tsx', defined), ['1 unknown-name', '1 unknown-name']);
  });

  test('leaves the names the package defines and the names built at run time', () => {
    const ts = "el.innerHTML = `<button class=\"im-btn im-btn--primary\" data-im-tone=\"${tone}\">x</button>`;\nconst cls = `im-text-${tone}`;\nconst other = 'im-' + kind;\nel.querySelector('.im-row[aria-selected=\"true\"]');\nel.dataset.imTone = 'ok';\n";
    assert.deepEqual(found(rules.unknownName, ts, 'src/view.ts', defined), []);
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
  test('finds a file that lacks the path of the design file, and a file that is missing', () => {
    const findings = rules.agentRules([{ file: 'AGENTS.md', text: 'Be careful.\n' }, { file: 'CLAUDE.md', text: null }]);
    assert.deepEqual(findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['AGENTS.md:1 agent-rules', 'CLAUDE.md:1 agent-rules']);
  });

  test('leaves files that name it', () => {
    assert.deepEqual(rules.agentRules(Object.entries(AGENTS).map(([file, text]) => ({ file, text }))), []);
  });
});

describe('mount-app', () => {
  test('finds an entry that, with what it imports, never calls mountApp(', () => {
    const entry = parseSource('src/main.ts', "import './app.ts';\n");
    const app = parseSource('src/app.ts', "// mountApp(shell) is for later\nexport const x = 'mountApp(';\n");
    assert.deepEqual(rules.mountApp([entry, app]).map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src/main.ts:1 mount-app']);
  });

  test('leaves an entry whose import calls it, under its own name or another', () => {
    assert.deepEqual(rules.mountApp([parseSource('src/main.ts', "import './boot';\n"), parseSource('src/boot.ts', 'mountApp(shell, registry, { search });\n')]), []);
    assert.deepEqual(rules.mountApp([parseSource('src/main.ts', "import { mountApp as mount } from '@acaprino/imago/ui';\nmount(shell, registry, { search });\n")]), []);
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
    assert.equal(notes.length, 2);
    assert.ok(notes.some((note: string) => /pin-mismatch/.test(note) && /skipped/.test(note)));
    assert.ok(notes.some((note: string) => /mount-app/.test(note) && /skipped/.test(note)));
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
    files['src/view.ts'] = "export const html = '<div class=\"im-content im-workbench\"></div>';\n";
    assert.deepEqual(check({ root: folder(files), packageMode: false }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src/view.ts:1 unknown-name']);
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
