// The roles a part takes by name draw with Imago's own stylesheets: a role whose class no stylesheet styles would
// leave the app's view unstyled while its code reads as if it were.
//   node --experimental-strip-types --test tests/dom-parts.test.ts
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
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
