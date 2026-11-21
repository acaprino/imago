import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { emptyStateHtml } from '../ts/ui/markup.ts';
import { LOADING_DELAY_MS, panelStateHtml, setPanelState, showAfter, type PanelState, type PanelStateMarkup } from '../ts/ui/panel-state.ts';
import { installComputedStyle, StubDocument, type StubElement } from './dom-stub.ts';

// A clock the test moves by hand: a timer fires when the clock reaches its time.
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn: () => void, ms: number): unknown {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear(id: unknown): void {
      pending.delete(id as number);
    },
    advance(ms: number): void {
      now += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(id);
          timer.fn();
        }
      }
    },
    get pending(): number {
      return pending.size;
    },
  };
}

test('the loading delay is 300 ms', () => {
  assert.equal(LOADING_DELAY_MS, 300);
});

test('cancelling at 299 ms means show never runs', () => {
  const timers = fakeTimers();
  let shown = 0;
  const cancel = showAfter(LOADING_DELAY_MS, () => shown++, timers);
  timers.advance(299);
  assert.equal(shown, 0, 'nothing is shown before the delay');
  cancel();
  timers.advance(1000);
  assert.equal(shown, 0, 'a cancelled show never runs');
  assert.equal(timers.pending, 0, 'cancelling clears the timer');
});

test('at 300 ms show runs once', () => {
  const timers = fakeTimers();
  let shown = 0;
  showAfter(LOADING_DELAY_MS, () => shown++, timers);
  timers.advance(299);
  assert.equal(shown, 0);
  timers.advance(1);
  assert.equal(shown, 1);
  timers.advance(5000);
  assert.equal(shown, 1, 'show does not run again');
});

test('cancelling after show has run is harmless and runs nothing more', () => {
  const timers = fakeTimers();
  let shown = 0;
  const cancel = showAfter(300, () => shown++, timers);
  timers.advance(300);
  cancel();
  cancel();
  timers.advance(1000);
  assert.equal(shown, 1);
});

test('cancelling twice clears the timer once', () => {
  let cleared = 0;
  const cancel = showAfter(300, () => {}, { set: () => 7, clear: () => void cleared++ });
  cancel();
  cancel();
  assert.equal(cleared, 1);
});

test('without injected timers it uses the real clock and honours cancel', async () => {
  let shown = 0;
  const cancel = showAfter(20, () => shown++);
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(shown, 0, 'cancelled before the delay');

  showAfter(20, () => shown++);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(shown, 1, 'ran once after the delay');
});

// ---------- the layer, built by setPanelState and written by panelStateHtml ----------

let restore: () => void = () => {};
before(() => { restore = installComputedStyle(); });
after(() => restore());

/** A panel as an app writes it: a header, and a body with two rows of content. */
function panel(doc = new StubDocument()): StubElement {
  const element = doc.createElement('section');
  element.innerHTML = '<header class="im-panel-header"><h4 class="im-panel-title">Rooms</h4></header><div class="im-panel-body"><div class="im-row">One</div><div class="im-row">Two</div></div>';
  element.className = 'im-panel';
  doc.body.append(element);
  return element;
}
const bodyOf = (element: StubElement): StubElement => element.querySelector(':scope > .im-panel-body')!;
const layersOf = (element: StubElement): StubElement[] => bodyOf(element).querySelectorAll(':scope > [data-im-state-layer]');
const set = (element: StubElement, state: PanelState): void => setPanelState(element as unknown as HTMLElement, state);

// The button setPanelState makes for an action or a Retry, as markup: what an app writes in actionHtml or retryHtml to get
// the same layer. The listener is the one thing a string cannot carry.
const button = (label: string, keys?: string): string => `<button class="im-btn" type="button"><span>${label}</span>${keys ? `<kbd class="im-key">${keys}</kbd>` : ''}</button>`;
const run = (): void => {};

const SAME: [string, PanelState, PanelStateMarkup][] = [
  ['loading, three rows', { kind: 'loading', rows: 3 }, { kind: 'loading', rows: 3 }],
  ['loading, more rows than bar widths', { kind: 'loading', rows: 5 }, { kind: 'loading', rows: 5 }],
  ['loading, no rows', { kind: 'loading', rows: 0 }, { kind: 'loading', rows: 0 }],
  ['loading, a fraction of a row', { kind: 'loading', rows: 2.7 }, { kind: 'loading', rows: 2.7 }],
  ['loading, rows that are not a number', { kind: 'loading', rows: Number.NaN }, { kind: 'loading', rows: Number.NaN }],
  ['loading, fewer than no rows', { kind: 'loading', rows: -2 }, { kind: 'loading', rows: -2 }],
  ['empty with an action and its keys', { kind: 'empty', text: 'No rooms <yet> & more', action: { label: 'New <room>', keys: 'N', run } }, { kind: 'empty', text: 'No rooms <yet> & more', actionHtml: button('New &lt;room&gt;', 'N') }],
  ['empty without an action', { kind: 'empty', text: 'Nothing here.' }, { kind: 'empty', text: 'Nothing here.' }],
  ['empty with a title', { kind: 'empty', title: 'No <rooms>', text: 'A room is where agents talk.', action: { label: 'New room', run } }, { kind: 'empty', title: 'No <rooms>', text: 'A room is where agents talk.', actionHtml: button('New room') }],
  ['error', { kind: 'error', text: 'Could not load the sessions <now>.', retry: { label: 'Retry', run } }, { kind: 'error', text: 'Could not load the sessions <now>.', retryHtml: button('Retry') }],
  ['error with its own word', { kind: 'error', text: 'Non riesco.', errorWord: 'Errore', retry: { label: 'Riprova', run } }, { kind: 'error', text: 'Non riesco.', errorWord: 'Errore', retryHtml: button('Riprova') }],
  ['error with an empty word', { kind: 'error', text: 'Failed.', errorWord: '', retry: { label: 'Retry', run } }, { kind: 'error', text: 'Failed.', errorWord: '', retryHtml: button('Retry') }],
];

for (const [name, state, markup] of SAME) {
  test(`panelStateHtml writes the layer setPanelState builds: ${name}`, () => {
    const element = panel();
    set(element, state);
    const [layer] = layersOf(element);
    assert.equal(panelStateHtml(markup), layer.outerHTML);
  });
}

test('the loading layer is decorative rows of flat bars; the empty and error layers say what they are', () => {
  assert.match(panelStateHtml({ kind: 'loading', rows: 1 }), /^<div aria-hidden="true" data-im-state-layer="loading"><div class="im-row"><span class="im-skeleton" style="[^"]+"><\/span><span class="im-row-text" style="[^"]+"><span class="im-skeleton" style="width: 62%;"><\/span><span class="im-skeleton" style="width: 40%; height: 8px;"><\/span><\/span><\/div><\/div>$/);
  assert.equal(panelStateHtml({ kind: 'empty', text: 'Nothing.' }), '<div class="im-empty" data-im-state-layer="empty"><span>Nothing.</span></div>');
  assert.equal(panelStateHtml({ kind: 'error', text: 'Failed.', retryHtml: '<button>Retry</button>' }), '<div class="im-failure" role="alert" data-im-state-layer="error"><b>Error</b><span>Failed.</span><button>Retry</button></div>');
});

test('emptyStateHtml writes the empty layer of setPanelState, its title in strong', () => {
  const element = panel();
  set(element, { kind: 'empty', title: 'No rooms', text: 'Add one.', action: { label: 'New room', keys: 'N', run } });
  assert.equal(emptyStateHtml('No rooms', 'Add one.', button('New room', 'N')), layersOf(element)[0].outerHTML);
  assert.equal(emptyStateHtml('No rooms', 'Add one.'), panelStateHtml({ kind: 'empty', title: 'No rooms', text: 'Add one.' }));
  assert.equal(emptyStateHtml('', 'Add one.'), '<div class="im-empty" data-im-state-layer="empty"><span>Add one.</span></div>', 'no title, no strong');
});

test('setPanelState finds, replaces and removes a layer an app wrote from a string', () => {
  const doc = new StubDocument();
  const element = panel(doc);
  const body = bodyOf(element);
  body.innerHTML = panelStateHtml({ kind: 'error', text: 'Failed.', retryHtml: button('Retry') });
  assert.equal(layersOf(element).length, 1);
  body.querySelector('button')!.focus();

  set(element, { kind: 'loading', rows: 2 });
  assert.deepEqual(layersOf(element).map((layer) => layer.getAttribute('data-im-state-layer')), ['loading'], 'the string layer is replaced, not stacked');
  assert.equal(doc.activeElement, body, "focus that was on the string layer's button goes to the panel body");
  assert.equal(element.getAttribute('aria-busy'), 'true');

  body.innerHTML = panelStateHtml({ kind: 'empty', text: 'Nothing.', actionHtml: button('Add one') });
  body.querySelector('button')!.focus();
  set(element, { kind: 'empty', text: 'Still nothing.', action: { label: 'Add', run } });
  assert.equal(layersOf(element).length, 1);
  assert.equal(doc.activeElement?.textContent, 'Add', "focus goes to the new layer's button");

  body.innerHTML = panelStateHtml({ kind: 'loading', rows: 3 });
  set(element, { kind: 'ready' });
  assert.equal(layersOf(element).length, 0, 'ready removes a layer that came from a string');
  assert.equal(element.getAttribute('aria-busy'), null);
});
