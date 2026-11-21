// The four tones of docs/design-file.md ("Status"): ok, warn, err, info. A tone outside them is a type error in TypeScript,
// and, from an app in plain JavaScript, is written as no tone: no data-im-tone attribute, no tone class.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { actionChipHtml, summaryHtml } from '../ts/ui/content-markup.ts';
import { settingsMessageHtml, statusTextHtml } from '../ts/ui/form-markup.ts';
import { graphLegendHtml } from '../ts/ui/graph-legend.ts';
import { chipHtml } from '../ts/ui/markup.ts';
import { noteHtml, statusButtonHtml } from '../ts/ui/shell-markup.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FOUR = ['ok', 'warn', 'err', 'info'] as const;
// What an app in plain JavaScript can pass: the tones 0.1.4 had and the package no longer has, and anything else.
const OUTSIDE = ['accent', 'danger', 'good', 'bad', 'custom', '"><img src=x>', 'OK', ' ok'] as never[];

test('a tone outside the four is a type error (tsc on tests/types/tones.ts)', () => {
  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  const args = [tsc, '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'es2022', '--module', 'esnext',
    '--moduleResolution', 'bundler', '--allowImportingTsExtensions', '--lib', 'es2022,dom,dom.iterable', join(root, 'tests', 'types', 'tones.ts')];
  try {
    execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    assert.fail(`tsc found that a tone outside the four compiles, or that one of the four does not:\n${stdout}${stderr}`);
  }
});

test('each of the four tones is written as data-im-tone', () => {
  for (const tone of FOUR) {
    const attribute = `data-im-tone="${tone}"`;
    assert.ok(chipHtml('Open', tone).includes(attribute), `chipHtml ${tone}`);
    assert.ok(actionChipHtml('Open', 'open', { tone }).includes(attribute), `actionChipHtml ${tone}`);
    assert.ok(summaryHtml({ label: 'State', title: 'Ready', tone }).includes(attribute), `summaryHtml ${tone}`);
    assert.ok(statusButtonHtml({ label: 'Ready', accessibleLabel: 'Status', action: 'status', tone }).includes(attribute), `statusButtonHtml ${tone}`);
    assert.ok(noteHtml({ message: 'Saved', tone }).includes(attribute), `noteHtml ${tone}`);
    assert.ok(graphLegendHtml([{ label: 'Calls', tone }]).includes(attribute), `graphLegendHtml ${tone}`);
    assert.equal(statusTextHtml('Ready', tone), `<span class="im-text-${tone}">Ready</span>`, `statusTextHtml ${tone}`);
    assert.match(settingsMessageHtml('Saved', [], { icon: 'check', tone }), new RegExp(`<span class="im-text-${tone}"><svg`), `settingsMessageHtml ${tone}`);
  }
});

test('at run time a tone outside the four is written as no tone', () => {
  for (const tone of OUTSIDE) {
    const where = (name: string): string => `${name} with the tone ${JSON.stringify(tone)}`;
    for (const [name, html] of [
      ['chipHtml', chipHtml('Open', tone)],
      ['actionChipHtml', actionChipHtml('Open', 'open', { tone })],
      ['summaryHtml', summaryHtml({ label: 'State', title: 'Ready', tone })],
      ['statusButtonHtml', statusButtonHtml({ label: 'Ready', accessibleLabel: 'Status', action: 'status', tone })],
      ['noteHtml', noteHtml({ message: 'Saved', tone })],
      ['graphLegendHtml', graphLegendHtml([{ label: 'Calls', tone }])],
      ['settingsMessageHtml', settingsMessageHtml('Saved', [], { icon: 'check', tone })],
    ] as const) {
      assert.ok(!html.includes('data-im-tone'), where(name));
      assert.ok(!html.includes('im-text-'), where(name));
      assert.ok(!html.includes('<img'), where(name));
    }
    assert.equal(statusTextHtml('Ready', tone), 'Ready', where('statusTextHtml'));
    assert.equal(chipHtml('Open', tone), '<span class="im-chip">Open</span>', where('chipHtml'));
  }
});

test('no tone is no attribute: a chip without a tone is the neutral chip', () => {
  assert.equal(chipHtml('Closed'), '<span class="im-chip">Closed</span>');
  assert.equal(chipHtml('Closed', ''), '<span class="im-chip">Closed</span>');
  assert.equal(actionChipHtml('Open', 'open'), '<button type="button" class="im-chip" data-action="open">Open</button>');
  assert.doesNotMatch(summaryHtml({ label: 'State', title: 'Ready' }), /data-im-tone/);
  assert.equal(statusTextHtml('Ready'), 'Ready');
  assert.match(noteHtml({ message: 'Saved' }), /^<div class="im-note" role="status">/);
});
