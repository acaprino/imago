// imago-check: the rules of the design file that a program can judge, in an app.
//   node --experimental-strip-types --test tests/check.test.ts
// Each rule has a string it must find and one it must not; the edge cases are the reader's (comments, strings, a page) and
// the pins' (tags, commits, a workspace).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { REMOVED } from '../scripts/check/removed.mjs';
import * as rules from '../scripts/check/rules.mjs';
import { check, main } from '../scripts/check/cli.mjs';
import { parseSource } from '../scripts/check/source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'scripts', 'check', 'cli.mjs');

type Finding = { file: string; line: number; rule: string; message: string };

/** The names removed-name finds in one file, as "line name" strings. */
const removedIn = (text: string, file = 'src/app.css'): string[] =>
  rules.removedName(parseSource(file, text)).map((finding: Finding) => `${finding.line} ${finding.message.split(' was removed')[0]}`);

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

/** The package as an app has it installed. */
const INSTALLED = {
  'node_modules/@acaprino/imago/package.json': '{ "name": "@acaprino/imago", "version": "0.1.4" }\n',
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
  'package.json': manifest({ src: ['src'], cargo: 'src-tauri/Cargo.toml', app: 'shinatama', icons: ICONS }),
  'src-tauri/icons/icon.ico': 'ICO-OF-SHINATAMA',
  'src-tauri/icons/128x128@2x.png': 'PNG-256-OF-SHINATAMA',
  'src-tauri/Cargo.toml': cargo('tag = "v0.1.4"'),
  'src/main.tsx': "import { defineApp } from '@acaprino/imago';\nimport { Button } from '@acaprino/sigrid/primitives';\nexport const A = () => <Button>Save</Button>;\n",
  'src/app.ts': "export const id = 'shinatama';\n",
  'index.html': '<!doctype html><title>x</title>\n',
});

const runCli = (args: string[], cwd = root) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
// ---------- removed-name ----------

describe('removed-name', () => {
  test('finds a class, an attribute and a custom property of the families in CSS, and the stylesheet of the package', () => {
    const css = "@import '@acaprino/imago/css/imago.css';\n.im-btn:hover,\n.im-row--1 { color: var(--im-text); }\n[data-im-tone=\"ok\"] .mk-a { --im-accent: red; }\n";
    assert.deepEqual(removedIn(css), ['1 @acaprino/imago/css/imago.css', '2 im-btn', '3 im-row--1', '3 --im-text', '4 data-im-tone', '4 --im-accent']);
  });

  test('finds them in a class list, in markup, in a selector, in JSX and through dataset, also when built at run time', () => {
    const tsx = "el.className = 'im-row im-row--1';\nel.innerHTML = `<b class=\"im-btn\" data-im-tone=\"${tone}\">x</b>`;\nel.querySelector('.mk-a > .im-list');\nconst a = <div className=\"im-panel\" data-im-cat={n} style={{ '--im-level': 2 }} />;\nel.dataset.imSidebarOpen = '';\nel.classList.add(`im-text-${tone}`);\nel.classList.add('im-' + kind);\n";
    assert.deepEqual(removedIn(tsx, 'src/view.tsx'), [
      '1 im-row', '1 im-row--1', '2 im-btn', '2 data-im-tone', '3 im-list', '4 im-panel', '4 data-im-cat', '4 --im-level',
      '5 data-im-sidebar-open', '6 im-text-', '7 im-',
    ]);
  });

  test('finds an entry point wherever it is named: an import, a dynamic import, a mock, a page; one entry is not another', () => {
    const ts = "import { mountApp } from '@acaprino/imago/ui';\nconst g = await import('@acaprino/imago/graph');\nvi.mock('@acaprino/imago/graph-layout');\nimport type { Look } from \"@acaprino/imago/shell\";\n";
    assert.deepEqual(removedIn(ts, 'src/view.ts'), ['1 @acaprino/imago/ui', '2 @acaprino/imago/graph', '3 @acaprino/imago/graph-layout', '4 @acaprino/imago/shell']);
    const html = '<!doctype html>\n<!-- .im-btn -->\n<link rel="stylesheet" href="node_modules/@acaprino/imago/css/imago.css">\n<style>\n/* .im-b */ .im-a { color: red; }\n</style>\n<main class="im-shell" data-im-theme="dark"></main>\n<script>document.body.dataset.imLook = "oni";</script>\n';
    assert.deepEqual(removedIn(html, 'index.html'), ['3 @acaprino/imago/css/imago.css', '5 im-a', '7 im-shell', '7 data-im-theme', '8 data-im-look']);
  });

  test('leaves the package as it is now, a comment, a sentence, a longer name and the app\'s own names', () => {
    const ts = "import { defineApp } from '@acaprino/imago';\nconst icon = '@acaprino/imago/icons/muro/icon.svg';\n// the old im-btn and --im-text are gone\nconst say = 'The im-btn class is gone.';\nconst own = 'mk-im-row mim-a';\nel.dataset.important = '';\nconst u = '@acaprino/imago/uix';\n";
    assert.deepEqual(removedIn(ts, 'src/view.ts'), []);
    assert.deepEqual(removedIn('/* .im-btn */\n.mk-im-a { color: var(--mk-im-b); content: "/*"; }\n.im-a {}\n'), ['3 im-a']);
  });

  test('the message says what replaces the name', () => {
    const [finding] = rules.removedName(parseSource('src/app.css', '.im-btn {}\n'));
    assert.match(finding.message, /^im-btn was removed: .*@acaprino\/sigrid/);
  });

  test('a page, a template and a stylesheet of thousands of elements are read in linear time', () => {
    const rows = Array.from({ length: 4000 }, (_, i) => `<div class="im-row" data-im-tone="ok">${i}</div>\n`).join('');
    for (const [file, text] of [['index.html', `<!doctype html>\n${rows}`], ['src/view.ts', `el.innerHTML = \`${rows}\`;\n`], ['src/app.css', '.im-a { color: var(--im-b); }\n'.repeat(8000)]]) {
      const start = Date.now();
      assert.ok(removedIn(text, file).length >= 8000, file);
      assert.ok(Date.now() - start < 2000, `${file} took ${Date.now() - start} ms`);
    }
  });
});

describe('removed.mjs', () => {
  // The table "Moving from 0.4.1" of docs/using-imago.md: its lines, from its heading to the next heading of its level
  // (tests/docs.test.ts reads the same section).
  const NAME = /^(?:--[a-z0-9-]+\*?|data-[a-z0-9-]+\*?|@[a-z]+\/[a-z]+\/[a-z/-]+\*?|[a-z][a-z0-9]*(?:-{1,2}[a-z0-9]+)*-\*)$/;
  const kindOf = (name: string): string => (name.startsWith('--') ? 'property' : name.startsWith('data-') ? 'attribute' : name.startsWith('@') ? 'entry' : 'class');

  /** The names of the first column: those of a cell that holds names only. A cell that describes a change of behaviour has none. */
  function tableNames(): string[] {
    const lines = readFileSync(join(root, 'docs', 'using-imago.md'), 'utf8').split(/\r?\n/);
    const first = lines.findIndex((line) => /^## (?:\d+\. )?Moving from 0\.4\.1\s*$/.test(line));
    assert.ok(first !== -1, 'docs/using-imago.md has no section "Moving from 0.4.1"');
    const next = lines.findIndex((line, index) => index > first && /^## /.test(line));
    return lines.slice(first, next === -1 ? lines.length : next).flatMap((line) => {
      const cell = /^\|(.*?)\|/.exec(line)?.[1] ?? '';
      const spans = [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      const rest = cell.replace(/`[^`]+`/g, '').replace(/,|\band\b/g, '').trim();
      return !rest && spans.every((span) => NAME.test(span)) ? spans : [];
    });
  }

  test('holds every name of the table and no other, with its kind and what replaces it', () => {
    assert.deepEqual((REMOVED as { old: string }[]).map((entry) => entry.old).sort(), tableNames().sort());
    for (const entry of REMOVED as { old: string; kind: string; now: string }[]) {
      assert.equal(entry.kind, kindOf(entry.old), entry.old);
      assert.ok(entry.now.trim().length > 2, `${entry.old} gives no replacement`);
    }
  });

  test('no removed entry point is still exported, and the package itself writes no removed name', () => {
    const { exports } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { exports: Record<string, string> };
    for (const entry of Object.keys(exports)) assert.deepEqual(removedIn(`import '@acaprino/imago${entry.slice(1)}';\n`, 'a.ts'), [], entry);
    for (const file of ['ts/index.ts', 'examples/demo/src/main.tsx', 'examples/demo/index.html']) assert.deepEqual(removedIn(readFileSync(join(root, file), 'utf8'), file), [], file);
  });
});

// ---------- the other rules ----------

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

  test('a CLAUDE.md that only imports AGENTS.md names what AGENTS.md names', () => {
    assert.deepEqual(agents([{ file: 'AGENTS.md', text: AGENTS['AGENTS.md'] }, { file: 'CLAUDE.md', text: '@AGENTS.md\n\nNever run cargo here.\n' }]), []);
    assert.deepEqual(agents([{ file: 'AGENTS.md', text: 'Be careful.\n' }, { file: 'CLAUDE.md', text: '@AGENTS.md\n' }]), ['AGENTS.md:1 agent-rules', 'CLAUDE.md:1 agent-rules'], 'the import names nothing when the file imported names nothing');
    assert.deepEqual(agents([{ file: 'AGENTS.md', text: '@CLAUDE.md\n' }, { file: 'CLAUDE.md', text: '@AGENTS.md\n' }]), ['AGENTS.md:1 agent-rules', 'CLAUDE.md:1 agent-rules'], 'a cycle of imports ends');
  });

  test('a design-file.md that exists and is not the installed package\'s is a finding', () => {
    const own = [{ file: 'AGENTS.md', text: 'Read docs/design-file.md before UI work.\n' }];
    const exists = (file: string, path: string) => true;
    const found = rules.agentRules(own, { designFile: DESIGN, resolves: exists });
    assert.deepEqual(found.map((f: Finding) => `${f.line} ${f.rule}`), ['1 agent-rules']);
    assert.match(found[0].message, /is not the design file of the installed/);
    assert.ok(found[0].message.includes(DESIGN));
    assert.deepEqual(rules.agentRules([{ file: 'AGENTS.md', text: `Read docs/design-file.md and ./${DESIGN}.\n` }], { designFile: DESIGN, resolves: exists }), [], 'one of the paths is the package\'s');
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
    return rules.applyExceptions(rules.removedName(source), rules.exceptionsIn(source));
  };

  test('a comment on the line above with a reason allows the finding, and the exception is kept to be printed', () => {
    const { findings, accepted } = allowed("/* imago-check: allow removed-name — the old page's own file */\n.im-a { color: red; }\n");
    assert.deepEqual(findings, []);
    assert.deepEqual(accepted.map((e: any) => [e.file, e.line, e.rule, e.reason]), [['src/app.css', 1, 'removed-name', "the old page's own file"]]);
  });

  test('a comment on the same line, with a hyphen for the dash, allows it too', () => {
    assert.deepEqual(allowed('.im-a { color: red; } /* imago-check: allow removed-name - the old page */\n').findings, []);
  });

  test('an exception without a reason allows nothing, and the finding says why', () => {
    const { findings, accepted } = allowed('/* imago-check: allow removed-name */\n.im-a { color: red; }\n');
    assert.deepEqual(findings.map((f: Finding) => `${f.line} ${f.rule}`), ['2 removed-name']);
    assert.match(findings[0].message, /no reason/);
    assert.deepEqual(accepted, []);
  });

  test('an exception for another rule, or two lines above, allows nothing', () => {
    assert.equal(allowed('/* imago-check: allow app-icon — not this one */\n.im-a { color: red; }\n').findings.length, 1);
    assert.equal(allowed('/* imago-check: allow removed-name — too far */\n\n.im-a { color: red; }\n').findings.length, 1);
  });

  test('a block comment that wraps its reason covers the line under its last line', () => {
    const { findings, accepted } = allowed('/* imago-check: allow removed-name — the old page,\n   which goes with\n   its window */\n.im-a { color: red; }\n');
    assert.deepEqual(findings, []);
    assert.deepEqual(accepted.map((e: any) => [e.line, e.reason]), [[1, 'the old page,']]);
  });
});

// ---------- the program ----------

describe('imago-check on an app', () => {
  test('an app that keeps every rule has no finding and no note', () => {
    const result = check({ root: folder(cleanApp()) });
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.notes, []);
  });

  test('findings carry the path from the root with forward slashes, in order', () => {
    const dir = folder({ ...cleanApp(), 'src/styles/app.css': '.im-btn { padding: var(--im-s-2); }\n.mk-a { color: red; }\n.im-a { color: red; }\n' });
    assert.deepEqual(check({ root: dir }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), [
      'src/styles/app.css:1 removed-name', 'src/styles/app.css:1 removed-name', 'src/styles/app.css:3 removed-name',
    ]);
  });

  test('without "cargo" and "icons" their rules are skipped, and the program says so', () => {
    const files = cleanApp();
    files['package.json'] = manifest({});
    const { findings, notes } = check({ root: folder(files) });
    assert.deepEqual(findings, []);
    assert.equal(notes.length, 2);
    assert.ok(notes.some((note: string) => /pin-mismatch/.test(note) && /skipped/.test(note)));
    assert.ok(notes.some((note: string) => /app-icon/.test(note) && /skipped/.test(note) && /"icons"/.test(note)));
  });

  test('a Cargo.toml that takes imago-shell from the workspace is compared with the root Cargo.toml', () => {
    const files = cleanApp();
    files['package.json'] = manifest({ src: ['src'], cargo: 'src-tauri/Cargo.toml' }, `git+https://github.com/acaprino/imago.git#${SHA}`);
    files['src-tauri/Cargo.toml'] = '[package]\nname = "app"\n\n[dependencies]\nimago-shell.workspace = true\n';
    files['Cargo.toml'] = `[workspace]\nmembers = ["src-tauri"]\n\n[workspace.dependencies]\nimago-shell = { git = "https://github.com/acaprino/imago", rev = "${OTHER_SHA}" }\n`;
    assert.deepEqual(check({ root: folder(files) }).findings.map((f: Finding) => `${f.file} ${f.rule}`), ['package.json pin-mismatch']);
  });

  test('an icon file that is not the package\'s is a finding on the app\'s file; the ones that are equal are not', () => {
    const files = cleanApp();
    files['src-tauri/icons/icon.ico'] = 'ICO-OF-XIOX';
    const { findings, notes } = check({ root: folder(files) });
    assert.deepEqual(findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src-tauri/icons/icon.ico:1 app-icon']);
    assert.deepEqual(notes, []);
  });

  test('an icon file the app does not have is a finding on the path the app listed', () => {
    const files = cleanApp();
    delete files['src-tauri/icons/128x128@2x.png'];
    assert.deepEqual(check({ root: folder(files) }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['src-tauri/icons/128x128@2x.png:1 app-icon']);
  });

  test('"app" says whose icons they are: another app\'s file is another file', () => {
    const files = cleanApp();
    files['package.json'] = manifest({ src: ['src'], cargo: 'src-tauri/Cargo.toml', app: 'xiox', icons: { 'src-tauri/icons/icon.ico': 'icon.ico' } });
    files['src-tauri/icons/icon.ico'] = 'ICO-OF-XIOX';
    assert.deepEqual(check({ root: folder(files) }).findings, []);
  });

  test('"icons" without "app", an app the package has no icons for, a file name it does not have, or a path in the name all stop the program', () => {
    const attempt = (block: object) => {
      const files = cleanApp();
      files['package.json'] = manifest({ src: ['src'], ...block });
      return () => check({ root: folder(files) });
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
        assert.throws(() => check({ root: folder(files) }), /"imago\.app"/, JSON.stringify(block));
      }
    }
  });

  test('a removed name in a folder of "tests" is found; the installed copy of the package is not read', () => {
    const files = cleanApp();
    files['package.json'] = manifest({ src: ['src'], tests: ['tests'], cargo: 'src-tauri/Cargo.toml', app: 'shinatama', icons: ICONS });
    files['tests/shell.test.ts'] = "expect(document.querySelector('.im-main')).toBeNull();\n";
    files['node_modules/@acaprino/imago/css/old.css'] = '.im-main { color: var(--im-text); }\n';
    assert.deepEqual(check({ root: folder(files) }).findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['tests/shell.test.ts:1 removed-name']);
  });

  test('with "package" the check reads the package where it is installed, and never reads that copy as a source of the app', () => {
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(cleanApp())) files[path.replace('node_modules/@acaprino/imago/', 'vendor/imago/')] = text;
    files['package.json'] = manifest({ src: ['.'], package: 'vendor/imago', app: 'shinatama', icons: ICONS });
    files['AGENTS.md'] = 'Before UI work, read vendor/imago/docs/design-file.md.\n';
    files['CLAUDE.md'] = '@vendor/imago/docs/design-file.md\n';
    files['vendor/imago/css/old.css'] = '.im-main { padding: 3px; }\n';
    const { findings } = check({ root: folder(files) });
    assert.deepEqual(findings, []);
    const missing = { ...files, 'package.json': manifest({ src: ['src'], package: 'nowhere/imago' }) };
    assert.throws(() => check({ root: folder(missing) }), /nowhere/);
  });

  test('Daodan: the package is under viewer/node_modules and the agent files at the root; a path the agent file writes must exist', () => {
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(INSTALLED)) files[`viewer/${path}`] = text;
    files['package.json'] = `${JSON.stringify({ name: 'daodan', private: true, imago: { src: ['viewer/src'], app: 'shinatama' } }, null, 2)}\n`;
    files['viewer/package.json'] = manifest({});
    files['viewer/src/app.ts'] = "export const id = 'daodan';\n";
    files['AGENTS.md'] = AGENTS['AGENTS.md'];
    files['CLAUDE.md'] = '@viewer/node_modules/@acaprino/imago/docs/design-file.md\n';
    const dir = folder(files);
    const { findings } = check({ root: dir });
    assert.deepEqual(findings.map((f: Finding) => `${f.file}:${f.line} ${f.rule}`), ['AGENTS.md:1 agent-rules']);
    assert.ok(findings[0].message.includes('viewer/node_modules/@acaprino/imago/docs/design-file.md'), findings[0].message);
    writeFileSync(join(dir, 'AGENTS.md'), 'Before UI work, read viewer/node_modules/@acaprino/imago/docs/design-file.md.\n');
    assert.deepEqual(check({ root: dir }).findings, []);
  });

  test('Daodan: the app root is viewer/ and the agent files are at ../: the path the agent file writes from its folder is accepted, and the expected one is printed from that folder', () => {
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(INSTALLED)) files[`viewer/${path}`] = text;
    files['viewer/package.json'] = manifest({ src: ['src'], app: 'shinatama', agents: ['../AGENTS.md', '../CLAUDE.md'] });
    files['viewer/src/app.ts'] = "export const id = 'daodan';\n";
    files['AGENTS.md'] = 'Before UI work, read viewer/node_modules/@acaprino/imago/docs/design-file.md.\n';
    files['CLAUDE.md'] = '@AGENTS.md\n';
    const dir = folder(files);
    const viewer = join(dir, 'viewer');
    const lines = () => check({ root: viewer }).findings.filter((f: Finding) => f.rule === 'agent-rules');
    assert.deepEqual(lines(), [], 'viewer/node_modules/@acaprino/… from the repository root is the installed design file');

    writeFileSync(join(dir, 'AGENTS.md'), 'Read node_modules/@acaprino/imago/docs/design-file.md.\n');
    assert.deepEqual(lines(), [], 'a path from the root of the app is accepted too');

    // Another design-file.md that exists beside the agent file: the finding names the right one, from the agent file's folder.
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'design-file.md'), '# not the package\n');
    writeFileSync(join(dir, 'AGENTS.md'), 'Read docs/design-file.md.\n');
    const found = lines().filter((f: Finding) => f.file === '../AGENTS.md');
    assert.deepEqual(found.map((f: Finding) => `${f.file}:${f.line}`), ['../AGENTS.md:1'], 'the file is named from the root of the app');
    assert.match(found[0].message, /is not the design file of the installed/);
    assert.ok(found[0].message.endsWith('it is viewer/node_modules/@acaprino/imago/docs/design-file.md'), found[0].message);
    assert.ok(!found[0].message.includes('it is node_modules/'), 'not the path from the root of the app');

    // A file that names nothing: the expected path is the one to write in that file.
    writeFileSync(join(dir, 'AGENTS.md'), 'Be careful.\n');
    const none = lines();
    assert.ok(none.some((f: Finding) => f.file === '../AGENTS.md' && f.message.includes('viewer/node_modules/@acaprino/imago/docs/design-file.md')), none.map((f: Finding) => f.message).join('\n'));
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
    assert.match(clean.stdout, /^imago-check: no findings in 2 files \(2 script\)\.$/m);
    assert.deepEqual(check({ root: folder(cleanApp()) }).read, { css: 0, script: 2, html: 0 });
  });

  test('a dangling symlink in src is skipped with a note: no stack, and no exit 1 of its own', () => {
    const dir = folder(cleanApp());
    const target = mkdtempSync(join(tmpdir(), 'imago-check-gone-'));
    symlinkSync(target, join(dir, 'src', 'gone'), 'junction');
    rmSync(target, { recursive: true, force: true });
    const { findings, notes } = check({ root: dir });
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
    const dirty = runCli(['--root', folder({ ...cleanApp(), 'src/app.css': '.mk-a,\n.im-a {\n  color: red;\n}\n' })]);
    assert.equal(dirty.status, 1);
    assert.match(dirty.stdout, /^src\/app\.css:2 {2}removed-name {2}\S/m);
  });

});
