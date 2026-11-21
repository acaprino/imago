// The package obeys its own check: the rules of imago-check --package over css/ find nothing. A value the rules cannot
// judge (the box of a drawing, a position) carries an exception comment with its reason, or is in scripts/check/allowed.mjs.
//   node --experimental-strip-types --test tests/package-css.test.ts
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { check } from '../scripts/check/cli.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('imago-check --package finds nothing in css/', () => {
  const { findings, accepted, read } = check({ root, packageMode: true });
  assert.ok(read.css >= 19, `only ${read.css} stylesheets read`);
  const lines = findings.map((f: { file: string; line: number; rule: string; message: string }) => `${f.file}:${f.line}  ${f.rule}  ${f.message}`);
  assert.deepEqual(lines, [], `${findings.length} findings:\n${lines.join('\n')}`);
  for (const exception of accepted as { file: string; line: number; rule: string; reason: string }[]) {
    assert.ok(exception.reason.trim().length > 10, `${exception.file}:${exception.line}: an exception says why`);
  }
});

test('no class of the tiling workspace keeps the wm- prefix', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['css/tiling-workspace.css', 'ts/ui/tiling-workspace.ts']) {
    const text = readFileSync(join(root, file), 'utf8');
    // A name: wm- and a letter. The ids the workspace makes (`wm-${…}`) and its attribute data-wm-key are not classes.
    const left = [...text.matchAll(/(?<![\w-])wm-[a-z][a-z-]*/g)].map((match) => match[0]);
    assert.deepEqual(left, [], `${file} still writes ${left.join(', ')}`);
  }
});
