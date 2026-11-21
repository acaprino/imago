import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iconMarkup, isIconName } from '../ts/ui/icon.ts';
import {
  escapeHtml, iconHtml, avatarHtml, initialsAvatarHtml, chipHtml, buttonHtml, iconButtonHtml,
  pageHeadingHtml, emptyStateHtml, switchHtml, segmentedHtml, textFieldHtml,
} from '../ts/ui/markup.ts';

test('component text and attribute values cannot become HTML or executable attributes', () => {
  const payload = '\"><img src=x onerror=alert(1)>';
  assert.equal(escapeHtml('<&\"\''), '&lt;&amp;&quot;&#39;');
  for (const html of [
    buttonHtml(payload, payload, { id: payload, cls: payload, attrs: { title: payload } }),
    switchHtml(false, payload, payload, payload),
    textFieldHtml(payload, payload, payload, { type: 'text', hint: payload, placeholder: payload }),
    segmentedHtml(payload, payload, [[payload, payload]], payload),
    avatarHtml(payload), chipHtml(payload, payload), iconHtml(payload, payload),
    pageHeadingHtml(payload, payload), emptyStateHtml(payload, payload),
  ]) {
    assert.ok(!html.includes('<img'), html);
    assert.ok(!html.includes('=""><'), html);
  }
});

test('extension attributes reject event handlers, malformed names and structural overrides', () => {
  for (const name of ['onclick', 'ONCLICK', 'style', 'type', 'data-action', 'data-id', 'x" onclick']) {
    assert.throws(() => buttonHtml('Go', 'go', { attrs: { [name]: 'bad' } }), TypeError);
  }
  assert.throws(() => textFieldHtml('Name', 'name', '', { attrs: { name: 'other' } }), TypeError);
  assert.throws(() => textFieldHtml('Name', 'name', '', { attrs: { 'aria-describedby': 'missing' } }), TypeError);
  assert.match(buttonHtml('Go', 'go', { attrs: { 'aria-label': 'Run now', 'data-native': 'p"1' } }), /data-native="p&quot;1"/);
});

test('native fields link hints and errors, preserve constraints and uniquely identify repeated names', () => {
  const html = textFieldHtml('Budget', 'budget', '2.5', {
    id: 'first-budget', hint: 'In dollars', required: true, type: 'number',
    attrs: { min: '0', step: '0.5', inputmode: 'decimal' },
  });
  assert.match(html, /id="first-budget"/);
  assert.match(html, /required aria-required="true"/);
  assert.match(html, /aria-describedby="hint-first-budget err-first-budget"/);
  assert.match(html, /min="0" step="0.5" inputmode="decimal"/);
  assert.match(html, /id="err-first-budget" role="alert"/);
  const repeated = textFieldHtml('Build', 'build', '', { error: false });
  assert.ok(!repeated.includes('err-build'));
  assert.ok(!repeated.includes('aria-describedby'));
});

test('segmented controls submit native radio values and select exactly the chosen option', () => {
  const html = segmentedHtml('policy', 'pinned', [['head', 'Latest'], ['pinned', 'Pinned']], 'Updates');
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.equal((html.match(/ checked/g) ?? []).length, 1);
  assert.match(html, /name="policy" value="pinned" checked/);
  assert.match(html, /role="radiogroup" aria-label="Updates"/);
  const settings = segmentedHtml('theme', 'dark', [['dark', 'Dark']], 'Theme', { attrs: { 'data-setting': 'theme"1' } });
  assert.match(settings, /data-setting="theme&quot;1"/);
  assert.throws(() => segmentedHtml('theme', 'dark', [], 'Theme', { attrs: { onclick: 'bad' } }), TypeError);
});

test('the switch, the segmented control and the text field write the one drawing of each', () => {
  assert.equal(switchHtml(true, 'Sync', 'sync', 'p1'),
    '<button type="button" class="im-switch" role="switch" aria-checked="true" aria-label="Sync" data-action="sync" data-id="p1"></button>');
  assert.match(segmentedHtml('view', 'b', [['a', 'Graph'], ['b', 'Lanes']], 'View'),
    /^<div class="im-seg" role="radiogroup" aria-label="View"><label><input type="radio" name="view" value="a"><span>Graph<\/span><\/label><label><input type="radio" name="view" value="b" checked><span>Lanes<\/span><\/label><\/div>$/);
  assert.match(textFieldHtml('Name', 'name', 'x'), /^<label class="im-field"><span class="im-field-label">Name<\/span><span class="im-input"><input name="name" value="x" type="text"[^>]*><\/span><small class="im-field-error"/);
  const mono = textFieldHtml('Folder', 'folder', 'C:/', { mono: true });
  assert.match(mono, /<span class="im-input im-input--code"><input name="folder" value="C:\/" type="text"[^>]*><\/span>/);
  assert.doesNotMatch(mono, /<input[^>]*class=/, 'the input has no class of its own: its box draws it');
});

test('switches and busy buttons retain accessible state and action identity', () => {
  assert.match(switchHtml(true, 'Auto update', 'toggle', 'p1', true), /aria-checked="true".*data-action="toggle".*data-id="p1" disabled/);
  const html = buttonHtml('Saving', 'save', { busy: true, disabled: true, icon: 'plus' });
  assert.match(html, /im-spinner/);
  assert.ok(!html.includes('<svg'));
  assert.match(html, /disabled/);
  assert.match(html, /<span>Saving<\/span>/);
  const compact = iconButtonHtml('Remove "item"', 'remove', 'x', { disabled: true, id: 'one' });
  assert.match(compact, /class="im-icon-btn"/);
  assert.match(compact, /aria-label="Remove &quot;item&quot;"/);
  assert.match(compact, /data-id="one" disabled/);
  assert.throws(() => iconButtonHtml('Remove', 'remove', 'x', { attrs: { 'aria-label': 'override' } }), TypeError);
});

test('icons do not resolve inherited property names and avatars keep whole Unicode characters', () => {
  assert.equal(iconHtml('constructor'), iconHtml('box'));
  assert.equal(iconHtml('__proto__'), iconHtml('box'));
  assert.match(iconHtml('check', 'Complete'), /role="img" aria-label="Complete"/);
  assert.ok(!iconHtml('check', 'Complete').includes('aria-hidden'));
  assert.match(initialsAvatarHtml('😀a'), />😀A<\/span>/);
});

test('both icon APIs use one registry and preserve legacy aliases', () => {
  for (const name of ['graph', 'copy', 'document', 'box', 'sync', 'sliders', 'folder', 'spark', 'back', 'spinner'] as const) {
    assert.equal(isIconName(name), true);
    assert.equal(iconHtml(name), iconMarkup(name));
  }
  for (const [legacy, current] of [['x', 'close'], ['alert', 'warning'], ['chev', 'chevron']] as const) {
    assert.equal(iconMarkup(legacy), iconMarkup(current));
    assert.equal(iconHtml(legacy), iconHtml(current));
  }
  assert.equal(isIconName('constructor'), false);
  assert.equal(isIconName('__proto__'), false);
  assert.match(iconHtml('spinner', '<Loading>'), /role="img" aria-label="&lt;Loading&gt;"/);
});

test('shared layouts accept explicitly trusted component slots while escaping their text', () => {
  const action = buttonHtml('Add', 'add');
  const heading = pageHeadingHtml('Title <', 'Details &', action);
  assert.match(heading, /class="im-page-heading"/);
  assert.match(heading, /class="im-action-row"/);
  assert.ok(heading.includes(action));
  assert.ok(heading.includes('Title &lt;'));
  assert.ok(emptyStateHtml('Empty', 'Add an item', action).includes(action));
  assert.equal(emptyStateHtml('Empty <', 'Add an item &', action), `<div class="im-empty" data-im-state-layer="empty"><strong>Empty &lt;</strong><span>Add an item &amp;</span>${action}</div>`);
  assert.equal(chipHtml('Ready', 'ok'), '<span class="im-chip" data-im-tone="ok">Ready</span>');
  assert.equal(chipHtml('Unknown', 'custom' as never), '<span class="im-chip">Unknown</span>');
});
