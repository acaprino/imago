import assert from 'node:assert/strict';
import test from 'node:test';
import { stepList, stepProgress, stepProgressHtml } from '../ts/ui/progress.ts';
import { choiceRowsHtml, enterWizardStep, nextStepId, stepNavigationHtml, stepNavigationKey, stepPanelHtml, wizardActionsHtml, wizardHeadingHtml, wizardHtml } from '../ts/ui/wizard-markup.ts';

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
  class FakeElement {
    disabled = false;
    dataset: { action: string; id: string };
    parentElement: { querySelectorAll: () => FakeElement[] } | null = null;
    constructor(id: string) { this.dataset = { action: 'navigate', id }; }
    closest() { return this; }
    focus() { calls.push('focus:' + this.dataset.id); }
  }
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
  try {
    const buttons = ['a', 'b', 'c'].map(id => new FakeElement(id));
    buttons[1].disabled = true;
    for (const button of buttons) button.parentElement = { querySelectorAll: () => buttons };
    const event = { target: buttons[0], key: 'ArrowRight', ctrlKey: false, altKey: false, metaKey: false, preventDefault: () => calls.push('prevent') };
    const options = { ids: ['a', 'b', 'c'], action: 'navigate', onSelect: (id: string) => calls.push('select:' + id) };
    assert.equal(stepNavigationKey(event as unknown as KeyboardEvent, options), true);
    assert.deepEqual(calls, ['prevent', 'focus:c', 'select:c']);
    calls.length = 0;
    assert.equal(stepNavigationKey({ ...event, ctrlKey: true } as unknown as KeyboardEvent, options), false);
    assert.equal(stepNavigationKey(event as unknown as KeyboardEvent, { ...options, action: 'other' }), false);
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
