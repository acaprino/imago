// The roles a part takes by name draw with Imago's own stylesheets: a role whose class no stylesheet styles would
// leave the app's view unstyled while its code reads as if it were.
//   node --experimental-strip-types --test tests/dom-parts.test.ts
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseCss, splitSelectors } from '../scripts/check/css.mjs';
import { UI_TRAITS } from '../ts/ui/dom-parts.ts';

const css = fileURLToPath(new URL('../css/', import.meta.url));
const sheets = readdirSync(css).filter((name) => name.endsWith('.css')).map((name) => readFileSync(join(css, name), 'utf8')).join('\n');

test('every role names classes that Imago\'s stylesheets draw', () => {
  const missing: string[] = [];
  for (const [role, classes] of Object.entries(UI_TRAITS)) {
    for (const name of classes.split(' ')) {
      if (!new RegExp(`\\.${name}(?![\\w-])`).test(sheets)) missing.push(`${role}: .${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the roles are Imago classes and nothing else', () => {
  for (const [role, classes] of Object.entries(UI_TRAITS)) {
    assert.match(classes, /^im-[a-z0-9-]+( im-[a-z0-9-]+)*$/, role);
  }
});

// A part Imago offers is drawn by Imago. The `parts` table of ts/ui/dom-parts.ts is read from its source (it is not exported).
const source = readFileSync(fileURLToPath(new URL('../ts/ui/dom-parts.ts', import.meta.url)), 'utf8');
const table = /const parts = \{([\s\S]*?)\} as const satisfies/.exec(source)?.[1] ?? '';
const partClasses = new Map<string, string>();
for (const [, kind, classes] of table.matchAll(/(\w+): \['[a-z0-9]+', '([^']*)'\]/g)) {
  for (const name of classes.split(' ').filter(Boolean)) if (!partClasses.has(name)) partClasses.set(name, kind);
}

/** The classes of the table that are semantics only, each with its reason: they name a role and lay nothing out. */
const SEMANTICS_ONLY = new Map([
  ['im-region', 'the name of a region of a view (fileWorkspace writes it too); the container lays out its own children'],
  ['im-text', 'a span that takes the text style of the element it is in: its size and colour are the context\'s'],
  ['im-list-item', 'the item of a list, drawn by the list it is in (im-stack-list, an aside, a dialog), never by a rule of its own'],
]);
const standalone = new Set<string>();
for (const rule of parseCss(sheets).rules) {
  for (const selector of splitSelectors(rule.selector)) {
    const match = /^(?:[a-z0-9]+)?\.(im-[a-z0-9-]+)$/.exec(selector.trim());
    if (match) standalone.add(match[1]);
  }
}

test('the table of parts is read (the check would pass on an empty table otherwise)', () => {
  assert.ok(partClasses.size >= 30, `only ${partClasses.size} classes read from the parts table`);
  assert.equal(partClasses.get('im-heading'), 'heading');
});

test('every class of a part has a rule in css/, or is listed as semantics only with its reason', () => {
  const bare = [...partClasses].filter(([name]) => !SEMANTICS_ONLY.has(name) && !new RegExp(`\\.${name}(?![\\w-])`).test(sheets));
  assert.deepEqual(bare.map(([name, kind]) => `${kind}: .${name}`), []);
});

test('the semantics-only list is true: each class is a part and has no rule of its own', () => {
  for (const [name, reason] of SEMANTICS_ONLY) {
    assert.ok(partClasses.has(name), `${name} is in the list but no part writes it`);
    assert.ok(reason.length > 20, `${name} has no reason`);
    assert.ok(!standalone.has(name), `${name} has a rule of its own in css/: take it out of the list`);
  }
});

test('no part is a native progress: im-progress draws a div with role="progressbar" (setProgress), not a progress element', () => {
  const source = readFileSync(fileURLToPath(new URL('../ts/ui/dom-parts.ts', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /\['progress',/);
  assert.doesNotMatch(source, /progress:/);
});
