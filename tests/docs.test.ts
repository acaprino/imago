// The documents say what the code does: every name they write is read from the code, never from a list kept by hand.
//   node --experimental-strip-types --test tests/docs.test.ts
// A name that is not in the code fails here. Fix the document; do not add the name to a list below unless it really is
// someone else's (the browser's, Tauri's, Windows').

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');

/** Every file under `dir` (relative to the root) whose name ends in one of `endings`. */
function filesUnder(dir: string, endings: string[]): string[] {
  const found: string[] = [];
  const walk = (path: string): void => {
    for (const name of readdirSync(join(root, path))) {
      if (name === 'node_modules' || name === 'target' || name === 'dist' || name === '.git' || name === '.superpowers') continue;
      const child = `${path}/${name}`;
      if (statSync(join(root, child)).isDirectory()) walk(child);
      else if (endings.some((ending) => name.endsWith(ending))) found.push(child);
    }
  };
  walk(dir);
  return found;
}

const textOf = (files: string[]): string => files.map(read).join('\n');

// ---------- what the documents are ----------

// The design file cannot be docs/DESIGN.md: on Windows (and with core.ignorecase) that is the same path as docs/design.md, the approved design.
const DESIGN_FILE = 'docs/design-file.md';
const OWN_DOCS = [DESIGN_FILE, 'docs/desktop-shell.md', 'docs/using-imago.md'];
const ALL_DOCS = filesUnder('docs', ['.md']).filter((file) => file.split('/').length === 2); // docs/*.md, not docs/reference/
const DOCS_WITH_NAMES = [...new Set([...OWN_DOCS, 'README.md'])];

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

// ---------- what the code is ----------

const TOKENS_CSS = read('css/tokens.css');
const CSS_FILES = filesUnder('css', ['.css']);
const ALL_CSS = textOf(CSS_FILES);
const TS_FILES = filesUnder('ts', ['.ts']);
const RUST_FILES = filesUnder('crates/imago-shell/src', ['.rs']);
const CODE = textOf([...TS_FILES, ...RUST_FILES]);
const SCRIPT_AND_STYLE = textOf([...CSS_FILES, ...TS_FILES, ...filesUnder('gallery', ['.ts'])]);

/** Every name a module exports, following `export *` and `export { a, b as c } from`. */
function exportsOf(file: string, seen: Set<string> = new Set()): Set<string> {
  const names = new Set<string>();
  if (seen.has(file)) return names;
  seen.add(file);
  const text = read(file);
  for (const match of text.matchAll(/export\s+\*\s+from\s+'([^']+)'/g)) {
    for (const name of exportsOf(join(dirname(file), match[1]).replaceAll('\\', '/'), seen)) names.add(name);
  }
  for (const match of text.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const match of text.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|class|type|interface)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(match[1]);
  }
  return names;
}

const UI_EXPORTS = exportsOf('ts/ui/index.ts');
const SHELL_EXPORTS = exportsOf('ts/shell/index.ts');

/** Rust names that are public items of the crate: types, functions and constants, and the variants of its enums. */
const RUST_TEXT = textOf(RUST_FILES);
const RUST_NAMES = new Set<string>();
for (const file of RUST_FILES) {
  const text = read(file);
  for (const match of text.matchAll(/^\s*pub(?:\([a-z]+\))?\s+(?:const\s+)?(?:fn|struct|enum|const|type|trait)\s+([A-Za-z_]\w*)/gm)) RUST_NAMES.add(match[1]);
}

/** The names the crate re-exports from its root: what an app can write after `use imago_shell::`. */
function crateRootNames(): string[] {
  const names: string[] = [];
  for (const match of read('crates/imago-shell/src/lib.rs').matchAll(/pub use [\w:]+::\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) if (part.trim()) names.push(part.trim());
  }
  return names;
}

/** What a `--im-*` custom property is called, as tokens.css declares it. */
const TOKEN_NAMES = new Set([...TOKENS_CSS.matchAll(/^\s*(--im-[a-z0-9-]+)\s*:/gm)].map((match) => match[1]));

// Names that belong to someone else. Each entry is a name a document uses on purpose; nothing else goes here.
const THEIRS_TS = new Set([
  'getCurrentWindow', 'getCurrentWebview', 'setZoom', 'setTheme', 'build', 'matchMedia', 'getBoundingClientRect', 'oklch', 'showModal',
]);
const APP_OWNED_RUST = new Set(['set_window_theme', 'window_caption_maximize']); // the two commands an app registers (see desktop-shell.md)
const THEIRS_RUST = new Set(['from_config']);
const THEIRS_CAMEL = new Set(['WebView2', 'WebviewWindowBuilder', 'ExitRequested', 'SetWindowCompositionAttribute']);

/** Methods and function-valued members the TypeScript sources declare (`register(`, `onOsHover(`, `open(`): a document may call them on the object it got. */
const MEMBER_NAMES = new Set(TS_FILES.flatMap((file) => [...read(file).matchAll(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\(/gm)].map((match) => match[1])));

// ---------- the tests ----------

describe('the documents exist', () => {
  for (const doc of [...OWN_DOCS, 'README.md', 'docs/design.md']) {
    test(`${doc} exists and is not empty`, () => {
      assert.ok(existsSync(join(root, doc)), `${doc} is missing`);
      assert.ok(read(doc).trim().length > 200, `${doc} is empty`);
    });
  }
});

describe('custom properties', () => {
  test('tokens.css declares the names the test reads (the test would pass on an empty list otherwise)', () => {
    for (const name of ['--im-accent', '--im-text', '--im-h-control', '--im-hue', '--im-font-text']) assert.ok(TOKEN_NAMES.has(name), `${name} is not in css/tokens.css`);
  });

  for (const doc of ALL_DOCS.filter((file) => existsSync(join(root, file)))) {
    test(`every --im-* name in ${doc} is declared in css/tokens.css`, () => {
      const written = new Set([...read(doc).matchAll(/--im-[a-z0-9]+(?:-[a-z0-9]+)*/g)].map((match) => match[0]));
      const missing = [...written].filter((name) => !TOKEN_NAMES.has(name));
      assert.deepEqual(missing, [], `${doc} names custom properties that css/tokens.css does not declare`);
    });
  }
});

describe('classes and attributes', () => {
  // A class a script selects by but no stylesheet styles: the shell's content region, which regions() (F6) looks for.
  // Delete the entry the day a stylesheet defines the class, and the check on css/ is the strict one again.
  const HOOK_CLASSES: Record<string, string> = { 'im-content': 'ts/ui/keys.ts' };
  const styled = (name: string): boolean => new RegExp(`\\.${name}(?![\\w-])`).test(ALL_CSS);
  const hooked = (name: string): boolean => name in HOOK_CLASSES && read(HOOK_CLASSES[name]).includes(`'.${name}'`);

  test('a hook class is still not styled by any file under css/', () => {
    for (const [name, file] of Object.entries(HOOK_CLASSES)) {
      assert.ok(read(file).includes(`'.${name}'`), `${file} no longer selects .${name}`);
      assert.ok(!styled(name), `css/ now styles .${name}: delete it from HOOK_CLASSES in tests/docs.test.ts`);
    }
  });

  const classesIn = (text: string): Set<string> => new Set([...text.matchAll(/(?<![\w-])im-[a-z0-9]+(?:-[a-z0-9]+)*/g)].map((match) => match[0]));

  for (const doc of DOCS_WITH_NAMES.filter((file) => existsSync(join(root, file)))) {
    test(`every im- class in ${doc} is a class in css/`, () => {
      const missing = [...classesIn(read(doc))].filter((name) => !styled(name) && !hooked(name));
      assert.deepEqual(missing, [], `${doc} names classes that no file under css/ defines`);
    });

    test(`every data-im-* attribute in ${doc} is read or written by the code`, () => {
      const written = new Set([...read(doc).matchAll(/data-im-[a-z0-9]+(?:-[a-z0-9]+)*/g)].map((match) => match[0]));
      const missing = [...written].filter((name) => !SCRIPT_AND_STYLE.includes(name));
      assert.deepEqual(missing, [], `${doc} names attributes that nothing under css/, ts/ or gallery/ uses`);
    });
  }
});

describe('exports', () => {
  test('the index files export what the test looks for (the test would pass on empty sets otherwise)', () => {
    for (const name of ['createRegistry', 'openMenu', 'confirm', 'notify', 'setPanelState']) assert.ok(UI_EXPORTS.has(name), `ts/ui/index.ts does not export ${name}`);
    for (const name of ['applyLook', 'mountWindowControls', 'mountZoom', 'guardDesktop']) assert.ok(SHELL_EXPORTS.has(name), `ts/shell/index.ts does not export ${name}`);
  });

  for (const doc of OWN_DOCS.filter((file) => existsSync(join(root, file)))) {
    test(`every import from @acaprino/imago in ${doc} is a real export`, () => {
      const problems: string[] = [];
      for (const block of split(read(doc)).fences) {
        for (const match of block.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+'(@acaprino\/imago\/[^']+)'/g)) {
          const [, list, from] = match;
          const available = from === '@acaprino/imago/ui' ? UI_EXPORTS : from === '@acaprino/imago/shell' ? SHELL_EXPORTS : null;
          if (!available) {
            problems.push(`import from ${from}: only /ui and /shell have names to import`);
            continue;
          }
          for (const part of list.split(',')) {
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
            if (!name) continue;
            if (!available.has(name)) problems.push(`${name} is not exported by ${from}`);
          }
        }
      }
      assert.deepEqual(problems, []);
    });

    test(`every function written as name(...) in ${doc} is an export, a Rust name or someone else's`, () => {
      const problems: string[] = [];
      for (const span of spansOf(read(doc))) {
        const call = /^([A-Za-z_$][\w$]*)\(/.exec(span);
        const method = /^([A-Z]\w*)::(\w+)/.exec(span);
        if (method) {
          if (!CODE.includes(method[1]) && !THEIRS_CAMEL.has(method[1])) problems.push(`${span}: no ${method[1]} in the code`);
          // Type::name is a function or constant of the crate, or a variant of one of its enums (a word in its sources).
          if (!RUST_NAMES.has(method[2]) && !THEIRS_RUST.has(method[2]) && !new RegExp(`\\b${method[2]}\\b`).test(RUST_TEXT)) problems.push(`${span}: no ${method[2]} in crates/imago-shell`);
        } else if (call) {
          const name = call[1];
          if (name.includes('_')) {
            if (!RUST_NAMES.has(name) && !APP_OWNED_RUST.has(name) && !THEIRS_RUST.has(name)) problems.push(`${span}: no pub ${name} in crates/imago-shell`);
          } else if (!UI_EXPORTS.has(name) && !SHELL_EXPORTS.has(name) && !THEIRS_TS.has(name) && !MEMBER_NAMES.has(name)) {
            problems.push(`${span}: ${name} is not exported by ts/ui or ts/shell`);
          }
        }
      }
      assert.deepEqual(problems, []);
    });

    test(`every CamelCase name in backticks in ${doc} is in the code`, () => {
      const problems = spansOf(read(doc))
        .filter((span) => /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/.test(span))
        .filter((span) => !new RegExp(`\\b${span}\\b`).test(CODE) && !THEIRS_CAMEL.has(span));
      assert.deepEqual(problems, []);
    });
  }
});

describe('the crate', () => {
  test('lib.rs re-exports names the test can read', () => {
    const names = crateRootNames();
    for (const name of ['glass_window_config', 'install_snap_layouts', 'recovery_action', 'SnapLayouts', 'Recovery']) assert.ok(names.includes(name), `lib.rs does not re-export ${name}`);
  });

  test('docs/desktop-shell.md names every item the crate re-exports from its root', () => {
    const text = read('docs/desktop-shell.md');
    const missing = crateRootNames().filter((name) => !new RegExp(`\`(?:[A-Za-z]+::)?${name}\\b`).test(text));
    assert.deepEqual(missing, [], 'docs/desktop-shell.md does not name these items of imago-shell');
  });
});

describe('the package', () => {
  const manifest = JSON.parse(read('package.json')) as { exports: Record<string, string>; scripts: Record<string, string> };

  /** Where `@acaprino/imago/<sub>` points, through the "exports" of package.json; undefined when it points nowhere. */
  function resolveEntry(sub: string): string | undefined {
    const direct = manifest.exports[`./${sub}`];
    if (direct) return direct;
    for (const [key, target] of Object.entries(manifest.exports)) {
      if (!key.endsWith('/*')) continue;
      const prefix = key.slice(0, -1);
      if (`./${sub}`.startsWith(prefix)) return target.replace('*', `./${sub}`.slice(prefix.length)).replace(/\*$/, '');
    }
    return undefined;
  }

  for (const doc of [...OWN_DOCS, 'README.md'].filter((file) => existsSync(join(root, file)))) {
    test(`every @acaprino/imago/... path in ${doc} resolves through "exports"`, () => {
      const problems: string[] = [];
      for (const match of read(doc).matchAll(/(?<!node_modules\/)@acaprino\/imago\/([A-Za-z0-9_./-]+)/g)) {
        const sub = match[1].replace(/[.,;:]+$/, '');
        const target = resolveEntry(sub);
        if (!target || !existsSync(join(root, target))) problems.push(`@acaprino/imago/${sub} does not resolve (exports: ${target ?? 'no entry'})`);
      }
      assert.deepEqual(problems, []);
    });

    test(`every node_modules/@acaprino/imago/... path in ${doc} is a file of this repository`, () => {
      const problems = [...read(doc).matchAll(/node_modules\/@acaprino\/imago\/([A-Za-z0-9_./-]+)/g)]
        .map((match) => match[1].replace(/[.,;:]+$/, ''))
        .filter((path) => !existsSync(join(root, path)));
      assert.deepEqual(problems, []);
    });
  }

  test('every `npm run` script named in README.md is a script of package.json', () => {
    const problems = [...read('README.md').matchAll(/npm run ([a-z:]+)/g)].map((match) => match[1]).filter((name) => !(name in manifest.scripts));
    assert.deepEqual(problems, []);
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

  test('the demo capability file lists the permissions the test reads (the test would pass on an empty list otherwise)', () => {
    assert.ok(granted.length >= 9 && granted.every((name) => /^core:[a-z]+:[a-z-]+$/.test(name)), `${FILE} lost permissions, or the test lost its pattern`);
    assert.ok(read('docs/using-imago.md').includes(FILE), `docs/using-imago.md does not point at ${FILE}`);
  });

  test('docs/using-imago.md writes exactly the permissions the demo grants', () => {
    assert.deepEqual(named(read('docs/using-imago.md')).sort(), [...granted].sort());
  });

  test('docs/desktop-shell.md says what each of them is for', () => {
    const written = named(read('docs/desktop-shell.md'));
    assert.deepEqual(granted.filter((name) => !written.includes(name)), [], 'docs/desktop-shell.md does not name these permissions');
  });
});

describe('links', () => {
  for (const doc of [...ALL_DOCS, 'README.md'].filter((file) => existsSync(join(root, file)))) {
    test(`every relative link in ${doc} points at a file that exists`, () => {
      const problems: string[] = [];
      for (const match of split(read(doc)).prose.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^[a-z]+:/i.test(target)) continue;
        if (!existsSync(join(root, dirname(doc), target))) problems.push(`${target} (from ${relative(root, join(root, doc))})`);
      }
      assert.deepEqual(problems, []);
    });
  }

  test('README.md links the three documents an app reads', () => {
    const text = read('README.md');
    for (const doc of [DESIGN_FILE, 'docs/desktop-shell.md', 'docs/using-imago.md', 'docs/verification.md']) assert.ok(text.includes(`](${doc})`), `README.md does not link ${doc}`);
  });

  test('desktop-shell.md links verification.md for what is not verified on a real window', () => {
    assert.ok(read('docs/desktop-shell.md').includes('](verification.md)'), 'docs/desktop-shell.md does not link verification.md');
  });
});

describe('the design file says what tokens.css says', () => {
  const design = (): string => read(DESIGN_FILE);
  const block = (selector: string): string => {
    const start = TOKENS_CSS.indexOf(`${selector} {`);
    assert.ok(start !== -1, `css/tokens.css has no block ${selector}`);
    return TOKENS_CSS.slice(start, TOKENS_CSS.indexOf('}', start));
  };
  const valueIn = (selector: string, name: string): string | undefined => new RegExp(`${name}:\\s*([^;]+);`).exec(block(selector))?.[1].trim();
  /** The rows of every markdown table whose first cell is exactly one backticked name. */
  const rowsByName = (text: string): Map<string, string[]> => {
    const rows = new Map<string, string[]>();
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      const name = /^`([^`]+)`$/.exec(cells[0] ?? '')?.[1];
      if (name) rows.set(name, cells);
    }
    return rows;
  };

  test('the measures table gives each --im-h, --im-r and --im-cut token the value tokens.css gives it, in both looks', () => {
    const rows = rowsByName(design());
    const measured = [...block('[data-im-look="smooth"]').matchAll(/(--im-(?:h|r|cut)-[a-z0-9-]+):/g)].map((match) => match[1]);
    assert.ok(measured.length >= 14, 'tokens.css lost measures, or the test lost its pattern');
    const problems: string[] = [];
    for (const name of measured) {
      const row = rows.get(name);
      if (!row) {
        problems.push(`${name} is not in the measures table`);
        continue;
      }
      for (const [column, look] of [[2, 'smooth'], [3, 'oni']] as const) {
        const expected = valueIn(`[data-im-look="${look}"]`, name);
        if (row[column] !== expected?.replace('px', '')) problems.push(`${name} in ${look}: the table says ${row[column]}, tokens.css says ${expected}`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test('the widths table gives the sidebar, the rail and the inspector the values of tokens.css', () => {
    const rows = rowsByName(design());
    const problems: string[] = [];
    for (const name of ['--im-w-sidebar', '--im-w-rail', '--im-w-inspector']) {
      const expected = valueIn('[data-im-look]', name)?.replace('px', '');
      const row = rows.get(name);
      if (!row) problems.push(`${name} is not in a table`);
      else if (row[2] !== expected) problems.push(`${name}: the table says ${row[2]}, tokens.css says ${expected}`);
    }
    assert.deepEqual(problems, []);
  });

  test('the hue table gives each app the hue of tokens.css', () => {
    const rows = new Map<string, string>();
    for (const line of design().split(/\r?\n/)) {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.length >= 2 && /^[a-z]+$/.test(cells[0]) && /^\d+$/.test(cells[1])) rows.set(cells[0], cells[1]);
    }
    const apps = ['xiox', 'shinatama', 'mukade', 'muro', 'daodan'];
    assert.deepEqual([...rows.keys()].filter((app) => apps.includes(app)).sort(), [...apps].sort(), 'the hue table does not list the five apps');
    for (const app of apps) assert.equal(rows.get(app), valueIn(`[data-im-app="${app}"]`, '--im-hue'), `hue of ${app}`);
  });

  test('the accent formulas are the ones tokens.css uses', () => {
    const text = design();
    for (const formula of ['oklch(0.82 0.12 H)', 'oklch(0.2 0.04 H)', 'oklch(0.9 0.08 H)', 'oklch(0.47 0.13 H)']) {
      assert.ok(text.includes(formula), `${DESIGN_FILE} does not write ${formula}`);
      assert.ok(TOKENS_CSS.includes(formula.replace(' H)', ' var(--im-hue))')), `tokens.css does not use ${formula}`);
    }
  });

  test('the focus ring rule gives each distance', () => {
    const text = design();
    for (const phrase of ['2px wide', '2px outside', '1px outside', '2px inside', '5px inside']) assert.ok(text.includes(phrase), `${DESIGN_FILE} does not say "${phrase}"`);
    assert.ok(ALL_CSS.includes('outline-offset: 2px;') && ALL_CSS.includes('outline-offset: 1px;') && ALL_CSS.includes('outline-offset: -2px;') && ALL_CSS.includes('outline-offset: -5px;'), 'css/ no longer draws the four distances');
  });

  test('the three breakpoints are the ones primitives.css uses', () => {
    const text = design();
    const css = read('css/primitives.css');
    for (const query of ['width < 1000px', '620px <= width < 850px', 'width < 620px']) assert.ok(css.includes(`@container im-shell (${query})`), `primitives.css has no @container im-shell (${query})`);
    for (const phrase of ['under 1000', '620 to under 850', 'under 620']) assert.ok(text.toLowerCase().includes(phrase), `${DESIGN_FILE} does not say "${phrase}"`);
  });

  test('the fonts are the three local stacks of tokens.css', () => {
    const text = design();
    for (const font of ['Segoe UI Variable Text', 'Bahnschrift', 'Cascadia Mono']) {
      assert.ok(text.includes(font), `${DESIGN_FILE} does not name ${font}`);
      assert.ok(TOKENS_CSS.includes(font), `tokens.css does not use ${font}`);
    }
  });
});

describe('docs/design.md carries the corrections made after the build', () => {
  const text = (): string => read('docs/design.md');

  test('it has a dated section at the end', () => {
    const at = text().indexOf('## Corrections after the build');
    assert.ok(at !== -1, 'docs/design.md has no "Corrections after the build" section');
    assert.ok(text().slice(at).includes('2026-11-20'), 'the section does not carry the date 2026-11-20');
  });

  test('the ONI dark muted colour is the one tokens.css has', () => {
    const muted = /\[data-im-look="oni"\]\[data-im-theme="dark"\] \{[^}]*--im-muted:\s*(#[0-9A-Fa-f]{6})/.exec(TOKENS_CSS)?.[1];
    assert.ok(muted, 'tokens.css has no --im-muted for ONI dark');
    assert.ok(text().includes(muted), `docs/design.md does not write ${muted}`);
  });

  test('the corrected lines are in the text above the section, not only listed in it', () => {
    const body = text().slice(0, text().indexOf('## Corrections after the build'));
    for (const phrase of ['2px wide', 'ONI shows the app', 'under 1000', '620 to under 850', 'under 620', 'Reload', 'rebuilding']) assert.ok(body.includes(phrase), `docs/design.md does not say "${phrase}" in its body`);
  });
});

describe('the lists of other people\'s names at the top of this file', () => {
  test('every name in them is written in one of the documents, so no entry outlives its use', () => {
    const written = textOf([...OWN_DOCS, 'README.md'].filter((file) => existsSync(join(root, file))));
    const stale = [...THEIRS_TS, ...APP_OWNED_RUST, ...THEIRS_RUST, ...THEIRS_CAMEL].filter((name) => !written.includes(name));
    assert.deepEqual(stale, [], 'delete these from the lists in tests/docs.test.ts');
  });
});
