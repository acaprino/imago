import assert from 'node:assert/strict';
import test from 'node:test';
import { stepList, stepProgress, stepProgressHtml } from '../ts/ui/progress.ts';
import { choiceRowsHtml, enterWizardStep, nextStepId, stepNavigationHtml, stepNavigationKey, stepPanelHtml, wizardActionsHtml, wizardHeadingHtml, wizardHtml } from '../ts/ui/wizard-markup.ts';
import { StubDocument, StubElement } from './dom-stub.ts';

test('wizard progress represents current and complete processes and rejects invalid positions', () => {
  const html = stepProgressHtml('Progress <label>', ['First', '<Second>', 'Third'], 1);
  assert.match(html, /aria-label="Progress &lt;label&gt;"/);
  assert.equal(html.match(/aria-current="step"/g)?.length, 1);
  assert.match(html, /data-im-step="now" aria-current="step".*&lt;Second&gt;/);
  assert.equal(stepProgressHtml('Done', ['One', 'Two'], 2).match(/data-im-step="done"/g)?.length, 2);
  assert.doesNotMatch(stepProgressHtml('Done', ['One'], 1), /aria-current/);
  for (const invalid of [-1, .5, 4, NaN]) assert.throws(() => stepProgressHtml('Progress', ['One'], invalid), RangeError);
});

test('linear progress preserves the DOM APIs and announces escaped completion text', () => {
  assert.equal(typeof stepProgress, 'function');
  assert.equal(typeof stepList, 'function');
  assert.match(stepProgressHtml('Work', ['One'], 1, '<Finished>'), /class="im-step-status" role="status">&lt;Finished&gt;<\/span>/);
  assert.match(stepProgressHtml('Work', ['One'], 0), /class="im-step-status" role="status"><\/span>/);
  assert.doesNotMatch(stepProgressHtml('Work', ['One'], 0), /All steps complete/);
});

test('wizard composition escapes text, references its progress, and leaves action component slots intact', () => {
  const content = wizardHeadingHtml('<Heading>', 'A & B', { id: 'heading', describedBy: ['count', 'failure'] }) + wizardActionsHtml('', '<button>Continue</button>');
  const html = wizardHtml(content, { headingId: 'heading', progressLabel: 'Process', steps: ['A', 'B'], current: 0, counter: 'Step 1 of 2', counterId: 'count' });
  assert.match(html, /class="im-wizard" aria-labelledby="heading"/);
  assert.match(html, /<small id="count">Step 1 of 2<\/small>/);
  assert.match(html, /<h1 id="heading" tabindex="-1" aria-describedby="count failure">&lt;Heading&gt;/);
  assert.match(html, /class="im-wizard-actions"><span><\/span><button>Continue<\/button>/);
});

test('choice rows use native labeled checkboxes and retain disabled and checked states', () => {
  const html = choiceRowsHtml([{ name: 'pick', value: 'x"', label: '<Item>', checked: true, disabled: true, hintHtml: '<code>component output</code>' }]);
  assert.match(html, /im-choice-rows/);
  assert.match(html, /<li><label class="im-option"><input type="checkbox" name="pick" value="x&quot;" checked disabled>/);
  assert.match(html, /<strong>&lt;Item&gt;<\/strong><small><code>component output<\/code><\/small>/);
});

test('interactive steps expose one tab stop and matching tabpanel relationships', () => {
  const html = stepNavigationHtml([{ id: 'a', label: '<A>', disabled: true }, { id: 'b', label: 'B', detail: '<detail>' }], 'a', { label: 'Work', action: 'step', tabIdPrefix: 'tab-', panelId: 'panel' });
  assert.equal(html.match(/tabindex="0"/g)?.length, 1);
  assert.match(html, /id="tab-b" aria-selected="true" aria-controls="panel" tabindex="0" aria-current="step"/);
  assert.match(html, /&lt;detail&gt;/);
  assert.match(stepPanelHtml('<p>Content</p>', 'panel', 'tab-b'), /role="tabpanel" id="panel" aria-labelledby="tab-b"/);
});

test('interactive steps are an im-steps list whose items hold a button, with the same item as stepList', () => {
  const html = stepNavigationHtml([{ id: 'a', label: '<A>', disabled: true }, { id: 'b', label: 'B', detail: '<detail>' }], 'b', { label: 'Work', action: 'step', tabIdPrefix: 'tab-', panelId: 'panel' });
  assert.equal(html,
    '<ol class="im-steps" role="tablist" aria-label="Work">'
    + '<li role="presentation"><button type="button" role="tab" id="tab-a" aria-selected="false" aria-controls="panel" tabindex="-1" data-action="step" data-id="a" disabled><span class="im-step-index" aria-hidden="true">1</span><span class="im-step-text">&lt;A&gt;</span></button></li>'
    + '<li role="presentation"><button type="button" role="tab" id="tab-b" aria-selected="true" aria-controls="panel" tabindex="0" aria-current="step" data-action="step" data-id="b"><span class="im-step-index" aria-hidden="true">2</span><span class="im-step-text">B<small class="im-step-sub">&lt;detail&gt;</small></span></button></li>'
    + '</ol>');
  assert.doesNotMatch(html, /im-step-nav/);

  // stepList writes the same list: an im-steps, an item per step, the index and the text inside the button of a step that can be opened.
  const doc = new StubDocument();
  const list = stepList(doc as unknown as Document, 'Work', [
    { label: '<A>', state: 'done', action: { id: 'one', activate: () => {} } },
    { label: 'B', detail: '<detail>', state: 'now', action: { activate: () => {} } },
    { label: 'C', state: 'todo' },
  ]) as unknown as StubElement;
  assert.equal(list.outerHTML,
    '<ol class="im-steps" aria-label="Work">'
    + '<li data-im-step="done"><button type="button" id="one"><span class="im-step-index" aria-hidden="true">✓</span><span class="im-step-text">&lt;A&gt;</span></button></li>'
    + '<li data-im-step="now" aria-current="step"><button type="button"><span class="im-step-index" aria-hidden="true">2</span><span class="im-step-text">B<small class="im-step-sub">&lt;detail&gt;</small></span></button></li>'
    + '<li data-im-step="todo"><span class="im-step-index" aria-hidden="true">3</span><span class="im-step-text">C</span></li>'
    + '</ol>');
});

test('stepProgress builds the list stepProgressHtml writes, at every step and when complete', () => {
  const steps = ['Scan', '<Analyze>', 'Union & join'];
  for (const current of [0, 1, 2, 3]) {
    const doc = new StubDocument();
    const progress = stepProgress(doc as unknown as Document, 'Analysis <steps>', steps, current, 'All <done>');
    assert.equal((progress.element as unknown as StubElement).outerHTML, stepProgressHtml('Analysis <steps>', steps, current, 'All <done>'), `at step ${current}`);
  }
  const doc = new StubDocument();
  const moving = stepProgress(doc as unknown as Document, 'Analysis', steps, 0);
  moving.setCurrent(2);
  assert.equal((moving.element as unknown as StubElement).outerHTML, stepProgressHtml('Analysis', steps, 2), 'setCurrent gives the list of that step');
});

test('nextStepId wraps around and ignores other keys and stale identifiers', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(nextStepId(ids, 'a', 'ArrowLeft'), 'c');
  assert.equal(nextStepId(ids, 'c', 'ArrowRight'), 'a');
  assert.equal(nextStepId(ids, 'b', 'Home'), 'a');
  assert.equal(nextStepId(ids, 'b', 'End'), 'c');
  assert.equal(nextStepId(ids, 'missing', 'Home'), null);
  assert.equal(nextStepId(ids, 'a', 'Enter'), null);
  assert.equal(nextStepId([], 'a', 'Home'), null);
});

test('step keyboard navigation skips disabled tabs, focuses before selection, and ignores other actions or modifiers', () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'Element');
  const calls: string[] = [];
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: StubElement });
  try {
    // The list stepNavigationHtml writes, each tab inside its item.
    const doc = new StubDocument();
    doc.body.innerHTML = stepNavigationHtml([{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true }, { id: 'c', label: 'C' }], 'a', { label: 'Work', action: 'navigate', tabIdPrefix: 'tab-', panelId: 'panel' });
    const tab = (id: string): StubElement => doc.body.querySelector(`button[data-id="${id}"]`)!;
    const press = (target: StubElement, key: string, extra: Partial<KeyboardEvent> = {}) => ({ target, key, ctrlKey: false, altKey: false, metaKey: false, preventDefault: () => calls.push('prevent'), ...extra }) as unknown as KeyboardEvent;
    const options = { ids: ['a', 'b', 'c'], action: 'navigate', onSelect: (id: string) => calls.push(`select:${id} focus:${doc.activeElement?.getAttribute('data-id')}`) };
    assert.equal(stepNavigationKey(press(tab('a'), 'ArrowRight'), options), true);
    assert.deepEqual(calls, ['prevent', 'select:c focus:c'], 'the disabled tab is skipped, and the next tab has focus when it is selected');
    calls.length = 0;
    assert.equal(stepNavigationKey(press(tab('a').querySelector('span')!, 'ArrowLeft'), options), true, 'a key on the text inside a tab moves from that tab');
    assert.deepEqual(calls, ['prevent', 'select:c focus:c']);
    calls.length = 0;
    assert.equal(stepNavigationKey(press(tab('a'), 'ArrowRight', { ctrlKey: true }), options), false);
    assert.equal(stepNavigationKey(press(tab('a'), 'ArrowRight'), { ...options, action: 'other' }), false);
    assert.equal(stepNavigationKey(press(tab('b'), 'ArrowRight'), options), false, 'a disabled tab does nothing');
    assert.deepEqual(calls, []);
  } finally {
    if (before) Object.defineProperty(globalThis, 'Element', before);
    else Reflect.deleteProperty(globalThis, 'Element');
  }
});

test('entering a wizard step scrolls its content and then focuses the heading', () => {
  const calls: string[] = [];
  const doc = { getElementById: (id: string) => id === 'scroll' ? { scrollTo: (x: number, y: number) => calls.push(`scroll:${x},${y}`) } : id === 'heading' ? { focus: () => calls.push('focus') } : null };
  enterWizardStep(doc as unknown as Document, 'heading', 'scroll');
  assert.deepEqual(calls, ['scroll:0,0', 'focus']);
  assert.doesNotThrow(() => enterWizardStep(undefined, 'heading', 'scroll'));
  assert.doesNotThrow(() => enterWizardStep(doc as unknown as Document, 'missing', 'missing'));
});
