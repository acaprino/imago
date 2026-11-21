import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { selectHtml, selectFieldHtml, checkboxOptionHtml, formGroupHtml, formHeaderHtml, formFooterHtml, fieldErrorHtml, settingsRowHtml, inputHtml, settingInputHtml } from '../ts/ui/form-markup.ts';
import { choiceRowsHtml } from '../ts/ui/wizard-markup.ts';
import { uiInput, uiPart, uiSelect, uiTextarea } from '../ts/ui/dom-parts.ts';
import { segmentedControl } from '../ts/ui/segmented.ts';

test('selects preserve unknown choices supplied by the app and escape all plain text', () => {
  const html = selectHtml({ name: 'provider"', value: 'other', options: [['a', '<A>'], ['other', 'Other & custom']], label: '<Provider>', attrs: { disabled: true, 'data-setting': 'provider' } });
  assert.match(html, /name="provider&quot;"/);
  assert.match(html, /<option value="other" selected>Other &amp; custom<\/option>/);
  assert.match(html, /aria-label="&lt;Provider&gt;" disabled>/);
  assert.doesNotMatch(html, /<A>|<Provider>/);
  assert.match(selectFieldHtml('Device', 'device', [['a', 'A']], 'a'), /<label class="im-field">.*<select class="im-select" name="device">/);
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

// ---------- one drawing for each control ----------

test('the renderers write the class of the one drawing: input.im-check, span.im-input > input, select.im-select', () => {
  assert.match(checkboxOptionHtml({ name: 'keep', checked: false, label: 'Keep' }), /^<label class="im-option"><input type="checkbox" class="im-check" name="keep"><span>Keep<\/span><\/label>$/);
  assert.match(choiceRowsHtml([{ name: 'pick', checked: true, label: 'Item' }]), /<li><label class="im-option"><input type="checkbox" class="im-check" name="pick" checked>/);
  assert.match(selectHtml({ name: 'harness', value: 'a', options: [['a', 'A']] }), /^<select class="im-select" name="harness">/);
  assert.match(selectHtml({ name: 'harness', value: 'a', options: [['a', 'A']], attrs: { class: 'wide' } }), /^<select class="im-select wide" name="harness">/);
  assert.match(selectFieldHtml('Device', 'device', [['a', 'A']], 'a'), /^<label class="im-field"><span>Device<\/span><select class="im-select" name="device">/);
  assert.match(inputHtml({ name: 'model', label: 'Model', value: 'x' }), /^<span class="im-input"><input name="model" aria-label="Model" value="x"><\/span>$/);
  assert.match(settingInputHtml({ name: 'model', label: 'Model', value: 'x' }), /^<span class="im-input"><input [^>]*data-setting="model"[^>]*><\/span>$/);
});

/** Just enough of a document for the DOM builders: elements that record their tag, class, children and properties. */
class FakeElement {
  tagName: string;
  className = '';
  type = '';
  name = '';
  value = '';
  textContent = '';
  defaultChecked = false;
  disabled = false;
  children: FakeElement[] = [];
  onchange: (() => void) | null = null;
  constructor(tag: string) { this.tagName = tag; }
  append(...nodes: (FakeElement | string)[]) {
    for (const node of nodes) this.children.push(typeof node === 'string' ? Object.assign(new FakeElement('#text'), { textContent: node }) : node);
  }
  setAttribute() {}
}
const fakeDocument = { createElement: (tag: string) => new FakeElement(tag) } as unknown as Document;

test('the DOM builders write the same classes as the renderers', () => {
  const global = globalThis as { document?: Document };
  global.document = fakeDocument;
  try {
    // Every input is returned itself, with the class of its drawing on it: the field's box goes on a text input too.
    const input = (control: HTMLInputElement) => { const el = control as unknown as FakeElement; return [el.tagName, el.type, el.className]; };
    assert.deepEqual(input(uiInput()), ['input', 'text', 'im-input']);
    assert.deepEqual(input(uiInput('email')), ['input', 'email', 'im-input']);
    assert.deepEqual(input(uiInput('checkbox')), ['input', 'checkbox', 'im-check']);
    assert.deepEqual(input(uiInput('radio')), ['input', 'radio', 'im-radio']);
    assert.equal(uiSelect([['a', 'A']], 'a').className, 'im-select');
    assert.equal(uiTextarea().className, 'im-textarea');
    assert.equal(uiPart('dialog').className, 'im-content-dialog');
  } finally {
    delete global.document;
  }
  const { element, inputs } = segmentedControl(fakeDocument, { label: 'View', value: 'b', onChange: () => {}, choices: [{ value: 'a', label: 'Graph' }, { value: 'b', label: 'Lanes', disabled: true }] });
  const group = element as unknown as FakeElement;
  assert.equal(group.className, 'im-seg');
  const labels = group.children.filter((child) => child.tagName === 'label');
  assert.equal(labels.length, 2);
  for (const label of labels) assert.deepEqual(label.children.map((child) => [child.tagName, child.type]), [['input', 'radio'], ['span', '']]);
  assert.deepEqual(labels.map((label) => label.children[1].textContent), ['Graph', 'Lanes']);
  assert.deepEqual([inputs.get('b')?.defaultChecked, inputs.get('b')?.disabled], [true, true]);
});

const read = (dir: string): string => readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true }).map(String)
  .filter((file) => /\.(css|ts)$/.test(file))
  .map((file) => readFileSync(new URL(`../${dir}/${file.replaceAll('\\', '/')}`, import.meta.url), 'utf8')).join('\n');
const CSS = read('css');
const SOURCE = read('ts');

// The second drawings of a control that 0.1.2 to 0.1.4 added (docs/superpowers/moving/task-4.md): one drawing is left.
const REMOVED = ['im-native-controls', 'im-native-input', 'im-native-select', 'im-native-textarea', 'im-native-check', 'im-native-radio',
  'im-native-choice', 'im-seg--native', 'im-seg--choice', 'im-switch-knob'];

test('one drawing for each control: no rule or renderer is left for the second drawings', () => {
  for (const name of REMOVED) {
    assert.doesNotMatch(CSS, new RegExp('\\.' + name + '(?![\\w-])'), `css/ still draws .${name}`);
    assert.doesNotMatch(SOURCE, new RegExp(name + '(?![\\w-])'), `ts/ still writes ${name}`);
  }
  assert.doesNotMatch(CSS, /accent-color/, 'a native check or radio is drawn by im-check and im-radio, not by the browser in the accent');
  assert.doesNotMatch(CSS, /textarea\.im-input|\.im-input:is\(input, textarea\)/, 'a text area is im-textarea, and the bare input is drawn by the rules of im-input');
  assert.doesNotMatch(CSS, /\.im-picker-mark[^{]*::before|data-im-checked/, 'the mark of a picker row is an im-check');
  assert.doesNotMatch(SOURCE, /data-im-checked|imChecked/, 'the mark of a picker row says its state with aria-checked on its im-check');
  assert.doesNotMatch(CSS, /\.im-choice-row\[aria-selected/, 'a choice row is selected as every im-btn is');
  assert.doesNotMatch(CSS, /\.im-row\[aria-(?:pressed|current)/, 'a row is selected the same whatever attribute says it');
});
