import assert from 'node:assert/strict';
import test from 'node:test';
import { selectHtml, selectFieldHtml, checkboxOptionHtml, formGroupHtml, formHeaderHtml, formFooterHtml, fieldErrorHtml, settingsRowHtml, inputHtml, settingInputHtml } from '../ts/ui/form-markup.ts';

test('selects preserve unknown choices supplied by the app and escape all plain text', () => {
  const html = selectHtml({ name: 'provider"', value: 'other', options: [['a', '<A>'], ['other', 'Other & custom']], label: '<Provider>', attrs: { disabled: true, 'data-setting': 'provider' } });
  assert.match(html, /name="provider&quot;"/);
  assert.match(html, /<option value="other" selected>Other &amp; custom<\/option>/);
  assert.match(html, /aria-label="&lt;Provider&gt;" disabled>/);
  assert.doesNotMatch(html, /<A>|<Provider>/);
  assert.match(selectFieldHtml('Device', 'device', [['a', 'A']], 'a'), /<label class="im-field">.*<select name="device">/);
});

test('checkbox choices keep form values and visible labels without trusting them as markup', () => {
  const html = checkboxOptionHtml({ name: 'items', checked: true, value: '"><x>', label: '<Label>', hint: 'A & B', disabled: true, top: true });
  assert.match(html, /value="&quot;&gt;&lt;x&gt;" checked disabled/);
  assert.match(html, /<strong>&lt;Label&gt;<\/strong><small>A &amp; B<\/small>/);
  assert.doesNotMatch(html, /<x>|<Label>/);
});

test('form chrome escapes text while composition slots retain shared markup', () => {
  const controls = formGroupHtml('<Options>', '<input name="x">', '<Hint>');
  assert.match(controls, /<legend>&lt;Options&gt;<\/legend>/);
  assert.match(controls, /<input name="x">/);
  assert.match(formHeaderHtml('<Title>', '<Subtitle>', true, 'title"'), /id="title&quot;">&lt;Title&gt;/);
  assert.match(formHeaderHtml('Title', '', true), /aria-label="Close" disabled/);
  assert.match(formFooterHtml({ submit: '<Save>', disabled: true, leadingHtml: '<small>Pending</small>' }), /<small>Pending<\/small>/);
  assert.match(fieldErrorHtml('error"', '<Rejected>'), /id="error&quot;" role="alert">&lt;Rejected&gt;/);
});

test('settings rows and fields share hint/error associations and native attributes', () => {
  const html = settingsRowHtml({ title: 'Model', field: 'model', hintHtml: '<b>Choose</b>', controlHtml: settingInputHtml({ name: 'model', label: 'Model', value: '<bad>', invalid: true }), error: '<Required>' });
  assert.match(html, /id="hint-model"/);
  assert.match(html, /id="err-model" role="alert">&lt;Required&gt;/);
  assert.match(html, /aria-describedby="hint-model err-model" aria-invalid="true"/);
  assert.match(html, /data-setting="model"/);
  assert.match(html, /value="&lt;bad&gt;"/);
});

test('attribute extensions cannot add script handlers, URLs or override field identity', () => {
  const options = { name: 'x', label: 'X', value: '' };
  for (const attrs of [{ onclick: 'bad()' }, { formaction: 'javascript:bad()' }, { name: 'other' }, { value: 'other' }, { style: 'display:none' }]) assert.throws(() => inputHtml({ ...options, attrs }));
});
