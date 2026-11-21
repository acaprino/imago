// The tones of docs/design-file.md ("Status"): ok, warn, err, info, the status tones. A chip, a dot and a summary may also
// carry the accent, the mark of data; a message (a note, a status text, a settings message) takes the status tones only.
// A tone outside its set is a type error in TypeScript and, from an app in plain JavaScript, is written as no tone: no
// data-im-tone attribute, no tone class.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { actionChipHtml, summaryHtml } from '../ts/ui/content-markup.ts';
import { settingsMessageHtml, statusTextHtml } from '../ts/ui/form-markup.ts';
import { chipHtml } from '../ts/ui/markup.ts';
import { noteHtml, statusButtonHtml } from '../ts/ui/shell-markup.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FOUR = ['ok', 'warn', 'err', 'info'] as const;
// What an app in plain JavaScript can pass: the tones 0.1.4 had and the package no longer has, and anything else.
const OUTSIDE = ['danger', 'good', 'bad', 'custom', '"><img src=x>', 'OK', ' ok', 'ACCENT'] as never[];

// The renderers of a mark of data, which take a status tone or the accent, and those of a message, which take a status tone.
const marks = (tone: never) => [
  ['chipHtml', chipHtml('Open', tone)],
  ['actionChipHtml', actionChipHtml('Open', 'open', { tone })],
  ['summaryHtml', summaryHtml({ label: 'State', title: 'Ready', tone })],
  ['statusButtonHtml', statusButtonHtml({ label: 'Ready', accessibleLabel: 'Status', action: 'status', tone })],
] as const;
const messages = (tone: never) => [
  ['noteHtml', noteHtml({ message: 'Saved', tone })],
  ['statusTextHtml', statusTextHtml('Ready', tone)],
  ['settingsMessageHtml', settingsMessageHtml('Saved', [], { icon: 'check', tone })],
] as const;

test('a tone outside its set is a type error (tsc on tests/types/tones.ts)', () => {
  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  const args = [tsc, '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'es2022', '--module', 'esnext',
    '--moduleResolution', 'bundler', '--allowImportingTsExtensions', '--lib', 'es2022,dom,dom.iterable', join(root, 'tests', 'types', 'tones.ts')];
  try {
    execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    assert.fail(`tsc found that a tone outside its set compiles, or that one inside it does not:\n${stdout}${stderr}`);
  }
});

test('each of the four status tones is written as data-im-tone, or as the im-text class of a status text', () => {
  for (const tone of FOUR) {
    for (const [name, html] of [...marks(tone as never), ['noteHtml', noteHtml({ message: 'Saved', tone })]] as const) {
      assert.ok(html.includes(`data-im-tone="${tone}"`), `${name} ${tone}`);
    }
    assert.equal(statusTextHtml('Ready', tone), `<span class="im-text-${tone}">Ready</span>`, `statusTextHtml ${tone}`);
    assert.match(settingsMessageHtml('Saved', [], { icon: 'check', tone }), new RegExp(`<span class="im-text-${tone}"><svg`), `settingsMessageHtml ${tone}`);
  }
});

test('a chip, a dot and a summary carry the accent, the mark of data', () => {
  assert.equal(chipHtml('Demo', 'accent'), '<span class="im-chip" data-im-tone="accent">Demo</span>');
  assert.match(actionChipHtml('Demo', 'open', { tone: 'accent' }), /^<button type="button" class="im-chip" data-im-tone="accent" data-action="open">/);
  assert.match(summaryHtml({ label: 'State', title: 'Demo', tone: 'accent' }), /^<section class="im-summary" data-im-tone="accent" aria-label="State">/);
  assert.match(statusButtonHtml({ label: 'Demo', accessibleLabel: 'Status', action: 'status', tone: 'accent' }), /<i class="im-dot" data-im-tone="accent" aria-hidden="true"><\/i>/);
});

test('a message takes a status tone only: the accent on a note, a status text or a settings message is written as no tone', () => {
  for (const [name, html] of messages('accent' as never)) {
    assert.ok(!html.includes('data-im-tone'), name);
    assert.ok(!html.includes('im-text-'), name);
  }
  assert.equal(noteHtml({ message: 'Saved', tone: 'accent' as never }), '<div class="im-note" role="status"><div><span>Saved</span></div></div>');
  assert.equal(statusTextHtml('Ready', 'accent' as never), 'Ready');
});

test('at run time a tone outside its set is written as no tone', () => {
  for (const tone of OUTSIDE) {
    const where = (name: string): string => `${name} with the tone ${JSON.stringify(tone)}`;
    for (const [name, html] of [...marks(tone), ...messages(tone)]) {
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
  assert.match(statusButtonHtml({ label: 'Ready', accessibleLabel: 'Status', action: 'status', tone: '' }), /<i class="im-dot" aria-hidden="true"><\/i>/);
  assert.equal(statusTextHtml('Ready'), 'Ready');
  assert.match(noteHtml({ message: 'Saved' }), /^<div class="im-note" role="status">/);
});
