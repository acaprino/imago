// imago-check, rule brand-mark: the title bar's brand is the one titlebarHtml writes, the initial of the product's name
// in capitals in im-mark and the name in im-wordmark (docs/superpowers/specs/2026-11-21-one-canon-design.md, "The
// mark at the top left").
//   node --experimental-strip-types --test tests/check-brand.test.ts

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { brandMark } from '../scripts/check/brand.mjs';
import { check } from '../scripts/check/cli.mjs';
import { parseSource } from '../scripts/check/source.mjs';
import { titlebarHtml } from '../ts/ui/shell-markup.ts';

type Finding = { file: string; line: number; rule: string; message: string };

/** The findings of the rule on one file, as "line rule" strings. */
const found = (text: string, file = 'index.html'): string[] => brandMark(parseSource(file, text)).map((each: Finding) => `${each.line} ${each.rule}`);
const messages = (text: string, file = 'index.html'): string[] => brandMark(parseSource(file, text)).map((each: Finding) => each.message);

/** The brand titlebarHtml writes for a name. */
const written = (name: string): string => /<div class="im-brand"[^]*?<\/div>/.exec(titlebarHtml({ brand: { name } }))?.[0] ?? '';

describe('brand-mark', () => {
  test('finds an image in the brand: an <img>, and Muro\'s logo through the removed brand.image', () => {
    assert.deepEqual(found('<header class="im-titlebar">\n  <div class="im-brand"><img class="im-brand-image" src="/muro-logo.png" alt="Muro"></div>\n</header>\n'), ['2 brand-mark']);
    const ts = "import { titlebarHtml } from '@acaprino/imago/ui';\nexport const bar = titlebarHtml({\n  brand: { name: 'Muro', image: '/muro-logo.png' },\n  windowControls: true,\n});\n";
    assert.deepEqual(found(ts, 'src/views.ts'), ['3 brand-mark']);
    assert.match(messages(ts, 'src/views.ts')[0], /brand\.image/);
  });

  test('finds brand.image however the brand object writes it: shorthand, last, first, quoted, over lines', () => {
    const call = (args: string): string => `import { titlebarHtml } from '@acaprino/imago/ui';\nexport const bar = titlebarHtml(${args});\n`;
    const cases = [
      '{ brand: { name, image } }', '{ brand: {name,image} }', '{ brand: { name: n, image } }', '{ windowControls: true, brand: { name, image } }',
      '{ brand: { image, name } }', '{ brand: { name, image, } }', '{ brand: { name, image: x } }', "{ brand: { name, 'image': x } }",
      '{ brand: { name: "Muro", "image": "/muro-logo.png" } }',
    ];
    for (const args of cases) assert.deepEqual(found(call(args), 'src/views.ts'), ['2 brand-mark'], args);
    assert.deepEqual(found(call('{\n  windowControls: true,\n  brand: {\n    name,\n    image\n  }\n}'), 'src/views.ts'), ['6 brand-mark'], 'the shorthand over several lines');
    assert.deepEqual(found(call('{\n  brand: {\n    name,\n    image,\n  },\n}'), 'src/views.ts'), ['5 brand-mark'], 'with a trailing comma over several lines');
    assert.deepEqual(found(call('{ brand: { name: image } }'), 'src/views.ts'), [], 'a name held in a variable called image is not the key');
    assert.deepEqual(found(call("{ brand: { name: 'image' } }"), 'src/views.ts'), [], 'nor is the name image');
  });

  test('finds an <svg> in the brand, and an app\'s own class standing in for the mark', () => {
    const mukade = '<div class="im-brand" data-tauri-drag-region>\n  <svg class="brand-mark icon" aria-hidden="true"><use href="#i-mark"/></svg>\n  <span class="im-wordmark">Mukade</span>\n</div>\n';
    assert.deepEqual(found(mukade), ['1 brand-mark']);
    assert.match(messages(mukade)[0], /<svg>/);
    assert.match(messages(mukade)[0], /no im-mark/);
    assert.deepEqual(found('<div class="im-brand"><i class="brand-mark"></i><span class="im-wordmark">Xiox</span></div>'), ['1 brand-mark']);
    assert.match(messages('<div class="im-brand"><i class="brand-mark"></i><span class="im-wordmark">Xiox</span></div>')[0], /<i class="brand-mark">/);
  });

  test('finds a mark that is not one capital letter, and a brand that is the name alone', () => {
    const daodan = '<div class="im-brand"><span class="im-mark" aria-hidden="true">d.</span><strong class="im-wordmark">Daodan</strong></div>';
    assert.deepEqual(found(daodan), ['1 brand-mark']);
    assert.match(messages(daodan)[0], /"d\." in im-mark/);
    assert.deepEqual(found('<div class="im-brand"><span class="im-mark">d</span><span class="im-wordmark">Daodan</span></div>'), ['1 brand-mark'], 'a small letter');
    assert.deepEqual(found('<div class="im-brand"><span class="im-wordmark">Shinatama</span></div>'), ['1 brand-mark'], 'the name alone');
    assert.deepEqual(found('<div class="im-brand"><span class="im-mark">S</span></div>'), ['1 brand-mark'], 'the mark alone');
    assert.deepEqual(found('<div class="im-brand"><span class="im-wordmark">Muro</span><span class="im-mark">M</span></div>'), ['1 brand-mark'], 'the name before the mark');
    assert.deepEqual(found('<div class="im-brand"><span class="im-mark">M</span>Muro</div>'), ['1 brand-mark'], 'the name outside im-wordmark');
  });

  test('finds the class im-brand-image wherever it is written', () => {
    assert.deepEqual(found("const logo = document.createElement('img');\nlogo.className = 'im-brand-image';\n", 'src/brand.ts'), ['2 brand-mark']);
  });

  test('finds a brand written in a script\'s markup, on the line of the brand', () => {
    const ts = "export const bar = `<header class=\"im-titlebar\">\n  <div class=\"im-brand\"><span class=\"im-mark\">${mark}</span><span class=\"im-wordmark\">${name}</span></div>\n  <div class=\"im-brand\"><span class=\"im-mark\">x.</span><span class=\"im-wordmark\">${name}</span></div>\n</header>`;\n";
    assert.deepEqual(found(ts, 'src/bar.ts'), ['3 brand-mark']);
  });

  test('leaves the brand titlebarHtml writes, for every app, in a page and in a script', () => {
    for (const name of ['Shinatama', 'Xiox', 'Mukade', 'Muro', 'Daodan', 'élan']) {
      assert.deepEqual(found(`<header class="im-titlebar" data-tauri-drag-region>${written(name)}</header>\n`), [], name);
      assert.deepEqual(found(`export const brand = '${written(name)}';\n`, 'src/brand.ts'), [], `${name} in a script`);
    }
    assert.deepEqual(found(`<div class="im-brand">\n  <span class="im-mark" aria-hidden="true">M</span>\n  <span class="im-wordmark">Muro</span>\n</div>\n`), [], 'written over lines');
    assert.deepEqual(found(written('Muro').replace('M</span>', '${initial}</span>').replace('>Muro<', '>${name}<').replace(/^/, 'export const brand = `') + '`;\n', 'src/brand.ts'), [], 'a letter and a name built at run time');
    assert.deepEqual(found("const brand = '<div class=\"im-brand\">' + markHtml + '</div>';\n", 'src/brand.ts'), [], 'a brand whose content is built elsewhere');
    assert.deepEqual(found("bar.querySelectorAll('.im-brand *');\nshell.querySelector('.im-brand .im-mark');\n", 'src/window.ts'), [], 'a selector is not a brand');
    assert.deepEqual(found("titlebarHtml({ brand: { name: 'Muro' }, statusHtml: image(state) });\n", 'src/views.ts'), [], 'an image elsewhere in the call');
    assert.deepEqual(found('<!-- <div class="im-brand"><img src="/old.png"></div> -->\n<p>Brand</p>\n'), [], 'a comment');
    assert.deepEqual(found('.mk-logo { color: var(--im-text); }\n', 'src/app.css'), [], 'a stylesheet');
  });

  test('reads the brand a React title bar writes in JSX: className, over lines, with a string in braces', () => {
    const bar = (brand: string): string => `export const Bar = () => (\n  <header className="im-titlebar">\n${brand}\n  </header>\n);\n`;
    const good = '    <div className="im-brand">\n      <span className="im-mark" aria-hidden="true">D</span>\n      <span className="im-wordmark">Daodan</span>\n    </div>';
    assert.deepEqual(found(bar(good), 'src/Bar.tsx'), [], 'the brand of titlebarHtml, as JSX');
    assert.deepEqual(found(bar(good.replaceAll('className="', "className={'").replaceAll('" aria', "'} aria").replace('im-brand"', "im-brand'}").replace('im-wordmark"', "im-wordmark'}")), 'src/Bar.tsx'), [], 'a string in braces is the same class');
    assert.deepEqual(found(bar(good), 'src/Bar.jsx'), []);
    assert.deepEqual(found(bar(good.replace('>D<', '>{initial}<').replace('>Daodan<', '>{name}<')), 'src/Bar.tsx'), [], 'a letter and a name built at run time');
    assert.deepEqual(found(bar('    <div className="im-brand"><Logo /><span className="im-wordmark">Daodan</span></div>'), 'src/Bar.tsx'), [], 'a component is not markup the rule can read');
    assert.deepEqual(found(bar('    <div className={cn(\'im-brand\', hidden)}><span className="im-wordmark">Daodan</span></div>'), 'src/Bar.tsx'), [], 'a class built by a call is not read');

    assert.deepEqual(found(bar('    <div className="im-brand">\n      <span className="im-wordmark">Daodan</span>\n    </div>'), 'src/Bar.tsx'), ['3 brand-mark'], 'the name alone, on the line of the brand');
    assert.match(messages(bar('    <div className="im-brand"><span className="im-wordmark">Daodan</span></div>'), 'src/Bar.tsx')[0], /no im-mark/);
    assert.deepEqual(found(bar(good.replace('>D<', '>d.<')), 'src/Bar.tsx'), ['3 brand-mark'], 'a mark that is not one capital');
    assert.match(messages(bar(good.replace('>D<', '>d.<')), 'src/Bar.tsx')[0], /"d\." in im-mark/);
    assert.deepEqual(found(bar('    <div className="im-brand"><img className="im-brand-image" src={logo} alt="" /></div>'), 'src/Bar.tsx'), ['3 brand-mark'], 'an image, said once');
    assert.deepEqual(found(bar('    <div className="im-brand"><svg viewBox="0 0 8 8"><path d="M0 0" /></svg><span className="im-wordmark">Daodan</span></div>'), 'src/Bar.tsx'), ['3 brand-mark']);
    assert.deepEqual(found(bar('    <div className="im-brand"><i className="brand-mark" /><span className="im-wordmark">Daodan</span></div>'), 'src/Bar.tsx'), ['3 brand-mark'], 'an own class standing in for the mark');
    assert.deepEqual(found(bar(good), 'src/bar.ts'), [], 'a .ts file holds no JSX: what looks like a tag there is a comparison');
  });

  test('says a brand in a string of a .tsx once, though the strings and the JSX both read it', () => {
    const tsx = "export const bar = '<div class=\"im-brand\"><span class=\"im-wordmark\">Muro</span></div>';\n";
    assert.deepEqual(found(tsx, 'src/bar.tsx'), ['1 brand-mark']);
  });

  test('judges the capital of the mark without the locale of the machine', () => {
    const brand = written('Istanbul');
    const original = String.prototype.toLocaleUpperCase;
    String.prototype.toLocaleUpperCase = function (): string {
      throw new Error('the rule read the locale of the machine');
    };
    try {
      assert.deepEqual(found(brand), []);
      assert.deepEqual(found('<div class="im-brand"><span class="im-mark">i</span><span class="im-wordmark">istanbul</span></div>'), ['1 brand-mark']);
    } finally {
      String.prototype.toLocaleUpperCase = original;
    }
  });
});

// ---------- in the program: the rule runs on an app's sources, and its exception is honoured ----------

const made: string[] = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'imago-check-brand-'));
  made.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const app = (page: string): Record<string, string> => ({
  'node_modules/@acaprino/imago/package.json': '{ "name": "@acaprino/imago", "version": "0.1.4" }\n',
  'node_modules/@acaprino/imago/css/imago.css': '.im-titlebar, .im-brand, .im-mark, .im-wordmark { color: var(--im-text); }\n',
  'package.json': `${JSON.stringify({ name: 'app', private: true, dependencies: { '@acaprino/imago': 'github:acaprino/imago#v0.1.4' }, imago: { src: ['src'] } }, null, 2)}\n`,
  'AGENTS.md': 'Read node_modules/@acaprino/imago/docs/design-file.md.\n',
  'CLAUDE.md': '@node_modules/@acaprino/imago/docs/design-file.md\n',
  'src/index.html': page,
});

describe('brand-mark in imago-check', () => {
  test('an app whose brand is not the mark and the name has the finding; one with the brand of titlebarHtml has none', () => {
    const rule = (page: string) => check({ root: folder(app(page)), packageMode: false }).findings.filter((each: Finding) => each.rule === 'brand-mark').map((each: Finding) => `${each.file}:${each.line}`);
    assert.deepEqual(rule('<header class="im-titlebar">\n<div class="im-brand"><span class="im-wordmark">Shinatama</span></div>\n</header>\n'), ['src/index.html:2']);
    assert.deepEqual(rule(`<header class="im-titlebar">\n${written('Shinatama')}\n</header>\n`), []);
  });

  test('an exception with a reason, on the line above the brand, allows it', () => {
    const result = check({ root: folder(app('<header class="im-titlebar">\n<!-- imago-check: allow brand-mark — the name alone until the owner approves the mark -->\n<div class="im-brand"><span class="im-wordmark">Shinatama</span></div>\n</header>\n')), packageMode: false });
    assert.deepEqual(result.findings.filter((each: Finding) => each.rule === 'brand-mark'), []);
    assert.deepEqual(result.accepted.map((each: { line: number; rule: string }) => `${each.line} ${each.rule}`), ['2 brand-mark']);
  });
});
