// The documents say what the code does: every name they write is read from the code, or from the installed Sigrid, never from
// a list kept by hand.
//   node --experimental-strip-types --test tests/docs.test.ts
// A name that is not in the code fails here. Fix the document; do not add the name to a list below unless it really is
// someone else's (the browser's, Tauri's, Windows').

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TAURI_PERMISSIONS } from '@acaprino/sigrid/tauri';
import { REMOVED } from '../scripts/check/removed.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');
/** The files directly in `dir` whose name ends in `ending`. */
const filesIn = (dir: string, ending: string): string[] => readdirSync(join(root, dir)).filter((name) => name.endsWith(ending)).map((name) => `${dir}/${name}`);

// ---------- what the documents are ----------

const DESIGN_FILE = 'docs/design-file.md';
const USING = 'docs/using-imago.md';
const ALL_DOCS = filesIn('docs', '.md');
const DOCS = [...ALL_DOCS, 'README.md'];

/** The body of a document without its fenced code blocks, and the fenced blocks apart. */
function split(text: string): { prose: string; fences: string[] } {
  const fences: string[] = [];
  const prose: string[] = [];
  let open: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      if (open) {
        fences.push(open.join('\n'));
        open = null;
      } else open = [];
    } else if (open) open.push(line);
    else prose.push(line);
  }
  return { prose: prose.join('\n'), fences };
}

/** The inline code spans of a document, fenced blocks left out. */
const spansOf = (text: string): string[] => [...split(text).prose.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);

const escapeRegExp = (text: string): string => text.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');

// The one table an app's migration reads: its first column, the old name, is what the code no longer has. It is a section of
// using-imago.md, from its heading to the next heading of its level; tests/check.test.ts compares it with removed.mjs.
const MOVING_HEADING = /^## (?:\d+\. )?Moving from 0\.4\.1\s*$/;

/**
 * A document as the name checks read it: in using-imago.md the first cell of each row of the table "Moving from 0.4.1" is
 * left out. What the row says to write instead is read as any text.
 */
function namesText(doc: string): string {
  const lines = read(doc).split(/\r?\n/);
  const first = doc === USING ? lines.findIndex((line) => MOVING_HEADING.test(line)) : -1;
  return lines.map((line, index) => (first !== -1 && index > first ? line.replace(/^\|[^|]*\|/, '| |') : line)).join('\n');
}

// ---------- what the code is ----------

const RUST_FILES = filesIn('crates/imago-shell/src', '.rs');
const RUST_TEXT = RUST_FILES.map(read).join('\n');
const CODE = [...filesIn('ts', '.ts').map(read), RUST_TEXT].join('\n');

/** What the root entry exports. */
const EXPORTS = new Set([...read('ts/index.ts').matchAll(/^export\s+(?:function|const|class|type|interface)\s+([A-Za-z_$][\w$]*)/gm)].map((match) => match[1]));

/** What each entry of the installed Sigrid exports, from the catalogue it comes with. */
type CatalogFile = { components?: { name: string }[]; types?: { name: string }[]; also?: string[] };
const catalog = JSON.parse(read('node_modules/@acaprino/sigrid/agents/catalog.json')) as { entries: { import: string; files: CatalogFile[] }[] };
const SIGRID = new Map(catalog.entries.map((entry) => [entry.import, new Set(entry.files.flatMap((file) => [
  ...(file.components ?? []).map(({ name }) => name), ...(file.types ?? []).map(({ name }) => name), ...(file.also ?? []),
]))]));
const isExport = (name: string): boolean => EXPORTS.has(name) || [...SIGRID.values()].some((names) => names.has(name));

/** Rust names that are public items of the crate: types, functions and constants, and the variants of its enums. */
const RUST_NAMES = new Set([...RUST_TEXT.matchAll(/^\s*pub(?:\([a-z]+\))?\s+(?:const\s+)?(?:fn|struct|enum|const|type|trait)\s+([A-Za-z_]\w*)/gm)].map((match) => match[1]));

/** The names the crate re-exports from its root: what an app can write after `use imago_shell::`. */
const CRATE_ROOT = [...read('crates/imago-shell/src/lib.rs').matchAll(/pub use [\w:]+::\{([^}]+)\}/g)]
  .flatMap((match) => match[1].split(',').map((part) => part.trim()).filter(Boolean));

/** The ids of the rules of imago-check, as scripts/check/rules.mjs names them. */
const RULE_IDS = new Set([...read('scripts/check/rules.mjs').matchAll(/(?:finding\((?:[^()]|\([^()]*\))*?|const id = )'([a-z]+(?:-[a-z]+)+)'/g)].map((match) => match[1]));

// Names that belong to someone else. Each entry is a name a document uses on purpose; nothing else goes here.
const THEIRS_TS = new Set(['build', 'getBoundingClientRect', 'setTheme', 'showModal']);
const APP_OWNED_RUST = new Set(['set_window_theme', 'window_caption_maximize']); // the two commands an app registers (see desktop-shell.md)
const THEIRS_RUST = new Set(['from_config']);
const THEIRS_CAMEL = new Set(['WebView2', 'WebviewWindowBuilder', 'ExitRequested', 'SetWindowCompositionAttribute']);

// ---------- the tests ----------

describe('the documents exist', () => {
  for (const doc of [DESIGN_FILE, 'docs/desktop-shell.md', USING, 'docs/verification.md', 'README.md']) {
    test(`${doc} exists and is not empty`, () => assert.ok(read(doc).trim().length > 200, `${doc} is empty`));
  }
});

describe('names', () => {
  test('the lists the tests read are not empty', () => {
    assert.ok(EXPORTS.has('defineApp'), 'ts/index.ts does not export defineApp');
    assert.ok(SIGRID.get('@acaprino/sigrid/layout')?.has('AppShell'), 'the catalogue of Sigrid does not list AppShell');
    assert.ok(SIGRID.get('@acaprino/sigrid/tauri')?.has('useZoom'), 'the catalogue of Sigrid does not list useZoom');
    for (const name of ['glass_window_config', 'install_snap_layouts', 'recovery_action', 'SnapLayouts', 'Recovery']) assert.ok(CRATE_ROOT.includes(name), `lib.rs does not re-export ${name}`);
  });

  for (const doc of DOCS) {
    test(`every import from Imago or Sigrid in ${doc} is a real export`, () => {
      const problems: string[] = [];
      for (const block of split(namesText(doc)).fences) {
        for (const match of block.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](@acaprino\/(?:imago|sigrid)[^'"]*)['"]/g)) {
          const available = match[2] === '@acaprino/imago' ? EXPORTS : SIGRID.get(match[2]);
          if (!available) problems.push(`import from ${match[2]}: unknown module`);
          for (const part of available ? match[1].split(',') : []) {
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
            if (name && !available!.has(name)) problems.push(`${name} is not exported by ${match[2]}`);
          }
        }
      }
      assert.deepEqual(problems, []);
    });

    test(`every function, hook and Type::name written as code in ${doc} is in the code, in Sigrid or someone else's`, () => {
      const problems: string[] = [];
      for (const span of spansOf(namesText(doc))) {
        const call = /^([A-Za-z_$][\w$]*)\(/.exec(span)?.[1];
        const hook = /^use[A-Z]\w*$/.exec(span)?.[0];
        const method = /^([A-Z]\w*)::(\w+)/.exec(span);
        if (method) {
          if (!CODE.includes(method[1]) && !THEIRS_CAMEL.has(method[1])) problems.push(`${span}: no ${method[1]} in the code`);
          // Type::name is a function or constant of the crate, or a variant of one of its enums (a word in its sources).
          if (!RUST_NAMES.has(method[2]) && !THEIRS_RUST.has(method[2]) && !new RegExp(`\\b${method[2]}\\b`).test(RUST_TEXT)) problems.push(`${span}: no ${method[2]} in crates/imago-shell`);
        } else if (call?.includes('_')) {
          if (!RUST_NAMES.has(call) && !APP_OWNED_RUST.has(call) && !THEIRS_RUST.has(call)) problems.push(`${span}: no pub ${call} in crates/imago-shell`);
        } else if (call ?? hook) {
          const name = (call ?? hook)!;
          if (!isExport(name) && !THEIRS_TS.has(name)) problems.push(`${span}: ${name} is exported neither by the package nor by Sigrid`);
        }
      }
      assert.deepEqual(problems, []);
    });

    test(`every CamelCase name in backticks in ${doc} is in the code or in Sigrid`, () => {
      const problems = spansOf(namesText(doc))
        .filter((span) => /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/.test(span))
        .filter((span) => !new RegExp(`\\b${span}\\b`).test(CODE) && !isExport(span) && !THEIRS_CAMEL.has(span));
      assert.deepEqual(problems, []);
    });
  }

  test('every export of the package is written as code in a document', () => {
    const code = DOCS.flatMap((doc) => [...spansOf(namesText(doc)), ...split(namesText(doc)).fences]).join('\n');
    assert.deepEqual([...EXPORTS].filter((name) => !new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`).test(code)), []);
  });

  test('docs/desktop-shell.md names every item the crate re-exports from its root', () => {
    const text = read('docs/desktop-shell.md');
    assert.deepEqual(CRATE_ROOT.filter((name) => !new RegExp(`\`(?:[A-Za-z]+::)?${name}\\b`).test(text)), []);
  });

  test('every rule of imago-check is in the design file', () => {
    assert.ok(RULE_IDS.size >= 4, `only ${[...RULE_IDS].join(', ')} read from scripts/check/rules.mjs`);
    assert.deepEqual([...RULE_IDS].filter((id) => !read(DESIGN_FILE).includes(`\`${id}\``)), []);
  });

  test('no document writes a removed name outside the table "Moving from 0.4.1"', () => {
    const patterns = (REMOVED as { old: string }[]).map(({ old }) => new RegExp(`(?<![\\w-])${old.endsWith('*') ? `${escapeRegExp(old.slice(0, -1))}[a-z0-9][\\w-]*` : `${escapeRegExp(old)}(?![\\w-])`}`, 'g'));
    const problems = [...DOCS, 'AGENTS.md'].flatMap((doc) => patterns.flatMap((pattern) => [...namesText(doc).matchAll(pattern)].map((match) => `${doc}: ${match[0]}`)));
    assert.deepEqual(problems, [], 'write what replaces each name (the table says it), or leave the name to the table');
  });

  test('every name in the lists at the top of this file is written in a document, so no entry outlives its use', () => {
    const written = DOCS.map(read).join('\n');
    assert.deepEqual([...THEIRS_TS, ...APP_OWNED_RUST, ...THEIRS_RUST, ...THEIRS_CAMEL].filter((name) => !written.includes(name)), []);
  });
});

describe('the package', () => {
  const manifest = JSON.parse(read('package.json')) as { exports: Record<string, string>; scripts: Record<string, string> };

  for (const doc of DOCS) {
    test(`every @acaprino/imago/... path in ${doc} resolves through "exports", and is a file of this repository`, () => {
      const text = namesText(doc);
      const inside = [...text.matchAll(/node_modules\/@acaprino\/imago\/([A-Za-z0-9_./-]+)/g)].map((match) => match[1].replace(/[.,;:]+$/, ''));
      const exported = [...text.matchAll(/(?<!node_modules\/)@acaprino\/imago\/([A-Za-z0-9_./-]+)/g)].map((match) => match[1].replace(/[.,;:]+$/, ''));
      assert.deepEqual(inside.filter((path) => !existsSync(join(root, path))), []);
      assert.deepEqual(exported.filter((path) => !Object.keys(manifest.exports).some((key) => key.endsWith('/*') && `./${path}`.startsWith(key.slice(0, -1)) && existsSync(join(root, path)))), []);
    });
  }

  test('every `npm run` script named in README.md is a script of package.json, and every script a person runs is named there', () => {
    const named = [...read('README.md').matchAll(/npm run ([a-z:]+)/g)].map((match) => match[1]);
    assert.deepEqual(named.filter((name) => !(name in manifest.scripts)), []);
    const byNpm = ['test', 'pretest', 'prepare', 'build:package'];
    assert.deepEqual(Object.keys(manifest.scripts).filter((name) => !byNpm.includes(name) && !named.includes(name)), []);
  });

  test('every folder in the "What is where" table of README.md exists', () => {
    const section = /## What is where([\s\S]*?)(?=\n## )/.exec(read('README.md'));
    assert.ok(section, 'README.md has no "What is where" section');
    const folders = [...section[1].matchAll(/^\|\s*`([^`]+\/)`/gm)].map((match) => match[1]);
    assert.ok(folders.length >= 6, 'the table names fewer folders than the package has');
    assert.deepEqual(folders.filter((folder) => !existsSync(join(root, folder))), []);
  });
});

describe('the capabilities', () => {
  // The permissions the wiring needs are the ones of the demo's capability file, the working example the documents point at.
  const FILE = 'examples/demo/src-tauri/capabilities/default.json';
  const granted = (JSON.parse(read(FILE)) as { permissions: string[] }).permissions;
  const named = (text: string): string[] => [...new Set([...text.matchAll(/core:[a-z]+:[a-z-]+/g)].map((match) => match[0]))];

  test('the demo grants what Sigrid\'s hooks need', () => {
    assert.deepEqual(TAURI_PERMISSIONS.basics.filter((name: string) => !granted.includes(name)), []);
  });

  test('docs/using-imago.md points at the file and writes exactly the permissions it grants', () => {
    assert.ok(read(USING).includes(FILE), `${USING} does not point at ${FILE}`);
    assert.deepEqual(named(read(USING)).sort(), [...granted].sort());
  });

  test('docs/desktop-shell.md says what each of them is for', () => {
    const written = named(read('docs/desktop-shell.md'));
    assert.deepEqual(granted.filter((name) => !written.includes(name)), []);
  });
});

describe('links', () => {
  for (const doc of DOCS) {
    test(`every relative link in ${doc} points at a file that exists`, () => {
      const targets = [...split(read(doc)).prose.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1].split('#')[0]).filter((target) => target && !/^[a-z]+:/i.test(target));
      assert.deepEqual(targets.filter((target) => !existsSync(join(root, dirname(doc), target))), []);
    });
  }

  test('README.md links the documents of docs/, and design-file.md links every other one', () => {
    const readme = read('README.md');
    const design = read(DESIGN_FILE);
    assert.deepEqual(ALL_DOCS.filter((doc) => !readme.includes(`](${doc})`)), []);
    assert.deepEqual(ALL_DOCS.filter((doc) => doc !== DESIGN_FILE && !design.includes(`](${doc.slice('docs/'.length)})`)), []);
  });
});
