// Panel states, in the browser: a panel that is empty, loading or failed keeps its header and frame.
// The gallery mounts three panels (gallery/mount/panel-state.ts) and exposes window.__imagoPanelState.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];

// Picks the look and the theme the way the gallery's pickers do; the page draws again and mounts again.
async function pick(page, look, theme) {
  await page.evaluate(([l, th]) => window.__imago.set({ look: l, theme: th }), [look, theme]);
  await page.waitForFunction(
    ([l, th]) => {
      const box = document.getElementById('im-gallery-panel-states');
      return box?.getAttribute('data-im-look') === l && box.getAttribute('data-im-theme') === th && Boolean(window.__imagoPanelState);
    },
    [look, theme],
  );
}

// Everything runs in the page: the panels are live elements there.
async function inPage(page, fn, arg) {
  return page.evaluate(fn, arg);
}

async function frames(page) {
  // The header of every panel keeps its place and size in every state, the panel keeps its place and width.
  return inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    const box = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
    };
    const states = [
      { kind: 'ready' },
      { kind: 'loading', rows: 3 },
      { kind: 'empty', text: 'Nothing here yet.', action: { label: 'Add one', keys: 'N', run() {} } },
      { kind: 'error', text: 'It failed.', retry: { label: 'Retry', run() {} } },
      { kind: 'ready' },
    ];
    const out = [];
    for (const [name, panel] of Object.entries(panels)) {
      const header = () => panel.querySelector(':scope > .im-panel-header');
      const before = { header: box(header()), panel: box(panel) };
      for (const state of states) {
        setPanelState(panel, state);
        const now = header();
        out.push({
          name,
          state: state.kind,
          hasHeader: Boolean(now),
          headerBox: now ? box(now) : null,
          panelBox: box(panel),
          before,
        });
      }
    }
    return out;
  });
}

export default async function (page) {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      await pick(page, look, theme);
      const label = `${look}/${theme}`;
      await check(page, label);
    }
  }
}

async function check(page, label) {
  const at = (what) => `${label}: ${what}`;

  // The three panels are mounted, each in the state the gallery gave it.
  const initial = await inPage(page, () => {
    const { panels } = window.__imagoPanelState;
    return Object.fromEntries(
      Object.entries(panels).map(([name, panel]) => [
        name,
        panel.querySelector(':scope > .im-panel-body > [data-im-state-layer]')?.getAttribute('data-im-state-layer') ?? null,
      ]),
    );
  });
  assert.deepEqual(initial, { empty: 'empty', loading: 'loading', error: 'error' }, at('the gallery starts the panels empty, loading and failed'));

  // 1. Header and frame stay in every state.
  for (const frame of await frames(page)) {
    const where = at(`${frame.name} panel, state ${frame.state}`);
    assert.ok(frame.hasHeader, `${where}: the panel header is gone`);
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(frame.headerBox[key] - frame.before.header[key]) < 0.01, `${where}: the header's ${key} changed from ${frame.before.header[key]} to ${frame.headerBox[key]}`);
    }
    for (const key of ['x', 'y', 'width']) {
      assert.ok(Math.abs(frame.panelBox[key] - frame.before.panel[key]) < 0.01, `${where}: the panel's ${key} changed`);
    }
  }

  // 2. Loading: aria-busy, `rows` skeleton rows at --im-h-row-2, flat bars, nothing animated, the real content out of the way.
  const loading = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    const panel = panels.loading;
    const body = panel.querySelector(':scope > .im-panel-body');
    const probe = (css) => {
      const element = document.createElement('div');
      element.style.cssText = `position:absolute;visibility:hidden;${css}`;
      body.append(element);
      const style = getComputedStyle(element);
      const result = { height: element.getBoundingClientRect().height, background: style.backgroundColor };
      element.remove();
      return result;
    };
    const rowHeight = probe('height:var(--im-h-row-2)').height;
    const skeletonColor = probe('background:var(--im-skeleton)').background;
    const measure = (rows) => {
      setPanelState(panel, { kind: 'loading', rows });
      const layer = body.querySelector(':scope > [data-im-state-layer="loading"]');
      const rowElements = layer ? [...layer.querySelectorAll(':scope > .im-row')] : [];
      const bars = layer ? [...layer.querySelectorAll('.im-skeleton')] : [];
      const everyElement = [panel, ...panel.querySelectorAll('*')];
      return {
        ariaBusy: panel.getAttribute('aria-busy'),
        layers: body.querySelectorAll(':scope > [data-im-state-layer]').length,
        rowHeights: rowElements.map((row) => row.getBoundingClientRect().height),
        barCount: bars.length,
        barColors: [...new Set(bars.map((bar) => getComputedStyle(bar).backgroundColor))],
        barImages: [...new Set(bars.map((bar) => getComputedStyle(bar).backgroundImage))],
        animatedNames: [...new Set(everyElement.map((element) => getComputedStyle(element).animationName))],
        runningAnimations: panel.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length,
        contentDisplay: [...body.querySelectorAll(':scope > .im-row')].map((row) => getComputedStyle(row).display),
        layerAriaHidden: layer?.getAttribute('aria-hidden') ?? null,
      };
    };
    return { rowHeight, skeletonColor, three: measure(3), five: measure(5), none: measure(0) };
  });
  assert.ok(loading.rowHeight > 0, at('--im-h-row-2 has a height'));
  assert.equal(loading.three.ariaBusy, 'true', at('loading sets aria-busy="true" on the panel'));
  assert.equal(loading.three.rowHeights.length, 3, at('loading renders `rows` skeleton rows'));
  for (const height of loading.three.rowHeights) {
    assert.ok(Math.abs(height - loading.rowHeight) < 0.01, at(`a skeleton row is ${height}px tall, --im-h-row-2 is ${loading.rowHeight}px`));
  }
  assert.equal(loading.five.rowHeights.length, 5, at('rows: 5 renders five rows'));
  assert.equal(loading.none.rowHeights.length, 0, at('rows: 0 renders none'));
  assert.equal(loading.three.layers, 1, at('one state layer at a time'));
  assert.ok(loading.three.barCount >= 3, at('the rows are made of skeleton bars'));
  assert.deepEqual(loading.three.barColors, [loading.skeletonColor], at('the bars are one flat colour, --im-skeleton'));
  assert.deepEqual(loading.three.barImages, ['none'], at('the bars have no gradient (no shimmer)'));
  assert.deepEqual(loading.three.animatedNames, ['none'], at('no element in the panel has an animation'));
  assert.equal(loading.three.runningAnimations, 0, at('no animation is running in the panel'));
  assert.deepEqual(loading.three.contentDisplay, ['none', 'none', 'none'], at('the real rows are out of the way while loading'));
  assert.equal(loading.three.layerAriaHidden, 'true', at('the bars are decorative for assistive technology'));

  // 3. Nothing moves when the data lands: loading -> ready keeps the panel's height, and the aria-busy goes.
  const landing = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    const panel = panels.loading;
    const body = panel.querySelector(':scope > .im-panel-body');
    setPanelState(panel, { kind: 'loading', rows: 3 });
    const during = panel.getBoundingClientRect().height;
    const bodyDuring = body.getBoundingClientRect().height;
    setPanelState(panel, { kind: 'ready' });
    return {
      during,
      after: panel.getBoundingClientRect().height,
      bodyDuring,
      bodyAfter: body.getBoundingClientRect().height,
      ariaBusy: panel.getAttribute('aria-busy'),
      layers: body.querySelectorAll('[data-im-state-layer]').length,
      contentDisplay: [...body.querySelectorAll(':scope > .im-row')].map((row) => getComputedStyle(row).display),
    };
  });
  assert.ok(Math.abs(landing.during - landing.after) < 0.01, at(`the panel is ${landing.during}px tall loading and ${landing.after}px ready`));
  assert.ok(Math.abs(landing.bodyDuring - landing.bodyAfter) < 0.01, at(`the panel body is ${landing.bodyDuring}px loading and ${landing.bodyAfter}px ready`));
  assert.equal(landing.ariaBusy, null, at('ready removes aria-busy'));
  assert.equal(landing.layers, 0, at('ready removes the state layer'));
  assert.deepEqual(landing.contentDisplay.map((display) => display !== 'none'), [true, true, true], at('ready shows the real rows again'));

  // 4. Error: the word "Error", the text, a Retry that calls retry.run; it stays inside the panel that failed.
  const failure = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    window.__retry = 0;
    const neighbours = [panels.empty, panels.loading].map((panel) => panel.innerHTML);
    setPanelState(panels.error, { kind: 'error', text: "Couldn't load the sessions.", retry: { label: 'Retry now', run: () => void window.__retry++ } });
    const layer = panels.error.querySelector(':scope > .im-panel-body > [data-im-state-layer="error"]');
    const box = layer.getBoundingClientRect();
    const frame = panels.error.getBoundingClientRect();
    const header = panels.error.querySelector(':scope > .im-panel-header').getBoundingClientRect();
    const button = layer.querySelector('button');
    return {
      text: layer.textContent,
      word: layer.querySelector('b')?.textContent ?? null,
      buttonLabel: button?.textContent ?? null,
      buttonType: button?.type ?? null,
      inside: box.left >= frame.left && box.right <= frame.right && box.top >= header.bottom && box.bottom <= frame.bottom,
      neighboursUntouched: [panels.empty, panels.loading].every((panel, index) => panel.innerHTML === neighbours[index]),
      ariaBusy: panels.error.getAttribute('aria-busy'),
      role: layer.getAttribute('role'),
    };
  });
  assert.equal(failure.word, 'Error', at('the error says "Error" in words'));
  assert.ok(failure.text.includes("Couldn't load the sessions."), at('the error shows its text'));
  assert.equal(failure.buttonLabel, 'Retry now', at('the error has a retry button'));
  assert.equal(failure.buttonType, 'button', at('the retry button never submits a form'));
  assert.ok(failure.inside, at('the error sits inside the panel that failed, below its header'));
  assert.ok(failure.neighboursUntouched, at('the other panels are untouched by one panel failing'));
  assert.equal(failure.ariaBusy, null, at('an error is not busy'));
  assert.equal(failure.role, 'alert', at('the error is announced'));
  await page.locator('#im-gallery-panel-states [data-g-panel="error"]').getByRole('button', { name: 'Retry now' }).click();
  assert.equal(await page.evaluate(() => window.__retry), 1, at('clicking Retry calls retry.run once'));
  const localized = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    setPanelState(panels.error, { kind: 'error', text: 'Non riesco a caricare le sessioni.', errorWord: 'Errore', retry: { label: 'Riprova', run() {} } });
    return panels.error.querySelector('[data-im-state-layer] b').textContent;
  });
  assert.equal(localized, 'Errore', at('errorWord replaces the word'));

  // 5. Empty: the text and the action sit where the rows would be.
  const empty = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    window.__acted = 0;
    const panel = panels.empty;
    const body = panel.querySelector(':scope > .im-panel-body');
    setPanelState(panel, { kind: 'ready' });
    const firstRow = body.querySelector(':scope > .im-row').getBoundingClientRect();
    setPanelState(panel, { kind: 'empty', text: 'No rooms yet.', action: { label: 'New room', keys: 'N', run: () => void window.__acted++ } });
    const layer = body.querySelector(':scope > [data-im-state-layer="empty"]');
    const box = layer.getBoundingClientRect();
    const header = panel.querySelector(':scope > .im-panel-header').getBoundingClientRect();
    const button = layer.querySelector('button');
    const withoutAction = (() => {
      setPanelState(panel, { kind: 'empty', text: 'Nothing yet.' });
      return panel.querySelectorAll('[data-im-state-layer] button').length;
    })();
    return {
      text: layer.textContent,
      buttonLabel: button?.querySelector('span')?.textContent ?? null,
      key: button?.querySelector('kbd.im-key')?.textContent ?? null,
      belowHeader: box.top >= header.bottom,
      startsWhereRowsStart: box.top >= firstRow.top && box.top < firstRow.bottom,
      withoutAction,
    };
  });
  assert.ok(empty.text.includes('No rooms yet.'), at('empty shows its text'));
  assert.equal(empty.buttonLabel, 'New room', at('empty shows the action'));
  assert.equal(empty.key, 'N', at('the action shows its keys in an im-key'));
  assert.ok(empty.belowHeader, at('empty sits below the header'));
  assert.ok(empty.startsWhereRowsStart, at('empty starts where the first row would'));
  assert.equal(empty.withoutAction, 0, at('empty without an action has no button'));
  await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    setPanelState(panels.empty, { kind: 'empty', text: 'No rooms yet.', action: { label: 'New room', keys: 'N', run: () => void window.__acted++ } });
  });
  await page.locator('#im-gallery-panel-states [data-g-panel="empty"]').getByRole('button', { name: 'New room' }).click();
  assert.equal(await page.evaluate(() => window.__acted), 1, at('clicking the action calls its run once'));

  // 6. The layer is replaced, never stacked; content hidden by the page itself stays hidden; a panel without a body throws.
  const housekeeping = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    const panel = panels.loading;
    const body = panel.querySelector(':scope > .im-panel-body');
    const kept = document.createElement('div');
    kept.hidden = true;
    kept.dataset.kept = '';
    body.append(kept);
    for (const state of [{ kind: 'loading', rows: 2 }, { kind: 'loading', rows: 4 }, { kind: 'empty', text: 'x' }, { kind: 'loading', rows: 1 }]) setPanelState(panel, state);
    const layers = body.querySelectorAll(':scope > [data-im-state-layer]').length;
    const first = body.firstElementChild?.hasAttribute('data-im-state-layer') ?? false;
    setPanelState(panel, { kind: 'ready' });
    const stillHidden = kept.hidden;
    kept.remove();
    let message = null;
    try {
      setPanelState(document.createElement('section'), { kind: 'loading', rows: 1 });
    } catch (error) {
      message = error.message;
    }
    return { layers, first, stillHidden, message };
  });
  assert.equal(housekeeping.layers, 1, at('the state layer is replaced, never stacked'));
  assert.ok(housekeeping.first, at('the state layer is the first child of the body'));
  assert.ok(housekeeping.stillHidden, at('ready does not show what the page itself hid'));
  assert.match(housekeeping.message ?? '', /im-panel-body/, at('a panel without a body says so'));

  // 7. Out of order: loading, error, loading, empty, ready. Whatever the path, aria-busy is set only while loading, one layer
  // shows, and the page's own inline display (grid here) comes back exactly, with no marker left behind.
  const sequence = await inPage(page, () => {
    const { setPanelState } = window.__imagoPanelState;
    const panel = document.createElement('section');
    panel.className = 'im-panel';
    const header = document.createElement('header');
    header.className = 'im-panel-header';
    const body = document.createElement('div');
    body.className = 'im-panel-body';
    const child = document.createElement('div');
    child.setAttribute('style', 'display:grid');
    child.textContent = 'content';
    body.append(child);
    panel.append(header, body);
    document.getElementById('im-gallery-panel-states').append(panel);
    const snapshot = (step) => ({
      step,
      ariaBusy: panel.getAttribute('aria-busy'),
      layers: [...body.querySelectorAll('[data-im-state-layer]')].map((layer) => layer.getAttribute('data-im-state-layer')),
      childDisplay: child.style.display,
      childComputed: getComputedStyle(child).display,
      markers: body.querySelectorAll('[data-im-state-hidden]').length,
    });
    const run = () => {};
    const steps = [
      ['loading', { kind: 'loading', rows: 2 }],
      ['error', { kind: 'error', text: 'Failed.', retry: { label: 'Retry', run } }],
      ['loading', { kind: 'loading', rows: 2 }],
      ['empty', { kind: 'empty', text: 'Nothing.', action: { label: 'Add', run } }],
      ['ready', { kind: 'ready' }],
    ];
    const seen = [snapshot('before')];
    for (const [name, state] of steps) {
      setPanelState(panel, state);
      seen.push(snapshot(name));
    }
    panel.remove();
    return seen;
  });
  assert.equal(sequence.length, 6, at('the sequence ran every step'));
  assert.equal(sequence[0].childDisplay, 'grid', at('the child starts with display:grid'));
  sequence.slice(1).forEach((seen, index) => {
    const where = at(`step ${index + 1} (${seen.step}) of loading, error, loading, empty, ready`);
    assert.equal(seen.ariaBusy, seen.step === 'loading' ? 'true' : null, `${where}: aria-busy is set only while loading`);
    assert.deepEqual(seen.layers, seen.step === 'ready' ? [] : [seen.step], `${where}: exactly the layer of the state, and none when ready`);
    if (seen.step === 'ready') {
      assert.equal(seen.childDisplay, 'grid', `${where}: the content's own inline display comes back exactly`);
      assert.equal(seen.childComputed, 'grid', `${where}: the content is laid out again`);
      assert.equal(seen.markers, 0, `${where}: no data-im-state-hidden is left behind`);
    } else {
      assert.equal(seen.childComputed, 'none', `${where}: the content is out of the layout`);
      assert.equal(seen.markers, 1, `${where}: the content is marked once`);
    }
  });

  // 8. Text is text: markup in `text`, `label`, `keys` and `errorWord` is shown literally and never becomes elements.
  const literal = await inPage(page, async () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    window.__injected = 0;
    const image = '<img src=x onerror="window.__injected++">';
    const bold = '<b>x</b>';
    const run = () => {};
    const read = (panel, kind) => {
      const layer = panel.querySelector(`:scope > .im-panel-body > [data-im-state-layer="${kind}"]`);
      return {
        images: layer.querySelectorAll('img').length,
        bolds: layer.querySelectorAll('b').length,
        nestedBolds: layer.querySelectorAll('b b').length,
        texts: [...layer.querySelectorAll('span, b, kbd')].map((node) => node.textContent),
      };
    };
    setPanelState(panels.error, { kind: 'error', text: image, errorWord: bold, retry: { label: bold, run } });
    const error = read(panels.error, 'error');
    setPanelState(panels.empty, { kind: 'empty', text: image, action: { label: bold, keys: bold, run } });
    const empty = read(panels.empty, 'empty');
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { error, empty, injected: window.__injected, image, bold };
  });
  assert.equal(literal.injected, 0, at('markup in a text never runs'));
  // The error layer has exactly one <b>: the word's own element. It holds the text "<b>x</b>" and no second <b> inside it.
  assert.equal(literal.error.images, 0, at('error: no img element is made from the text'));
  assert.equal(literal.error.bolds, 1, at("error: the only <b> is the word's own element"));
  assert.equal(literal.error.nestedBolds, 0, at('error: errorWord markup is not parsed'));
  assert.deepEqual(literal.error.texts, [literal.bold, literal.image, literal.bold], at('error: the word, the text and the retry label are shown literally'));
  assert.equal(literal.empty.images, 0, at('empty: no img element is made from the text'));
  assert.equal(literal.empty.bolds, 0, at('empty: no b element is made from the label or the keys'));
  assert.deepEqual(literal.empty.texts, [literal.image, literal.bold, literal.bold], at('empty: the text, the label and the keys are shown literally'));

  // 9. The word "Error" is always there: a missing or empty errorWord falls back to it.
  const fallback = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    return [undefined, ''].map((errorWord) => {
      setPanelState(panels.error, { kind: 'error', text: 'Failed.', errorWord, retry: { label: 'Retry', run() {} } });
      return panels.error.querySelector('[data-im-state-layer] b').textContent;
    });
  });
  assert.deepEqual(fallback, ['Error', 'Error'], at('a missing or empty errorWord still says "Error"'));

  // 10. Focus does not fall to <body> when the layer that holds it is replaced. Retry, then loading, then ready is the main
  // error flow: the pressed Retry goes with the error layer, so focus goes to the new layer's button, or to the panel body.
  const pressed = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    const panel = panels.error;
    window.__retried = 0;
    setPanelState(panel, {
      kind: 'error',
      text: 'Failed.',
      retry: { label: 'Retry now', run: () => { window.__retried++; setPanelState(panel, { kind: 'loading', rows: 2 }); } },
    });
    panel.querySelector('[data-im-state-layer] button').focus();
    return document.activeElement.textContent;
  });
  assert.equal(pressed, 'Retry now', at('the Retry button takes focus'));
  await page.keyboard.press('Enter'); // the keyboard presses Retry: run() puts the panel in loading
  const afterRetry = await inPage(page, () => {
    const body = window.__imagoPanelState.panels.error.querySelector(':scope > .im-panel-body');
    return {
      retried: window.__retried,
      layer: body.querySelector(':scope > [data-im-state-layer]')?.getAttribute('data-im-state-layer') ?? null,
      onDocumentBody: document.activeElement === document.body,
      onPanelBody: document.activeElement === body,
      tabindex: body.getAttribute('tabindex'),
    };
  });
  assert.equal(afterRetry.retried, 1, at('Enter on the focused Retry calls retry.run once'));
  assert.equal(afterRetry.layer, 'loading', at('the panel is loading after Retry'));
  assert.equal(afterRetry.onDocumentBody, false, at('pressing Retry does not drop focus to the document body'));
  assert.equal(afterRetry.onPanelBody, true, at('a loading layer has no button: focus is on the panel body'));
  assert.equal(afterRetry.tabindex, '-1', at('the panel body is focusable by script only'));
  const afterReady = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    setPanelState(panels.error, { kind: 'ready' });
    const body = panels.error.querySelector(':scope > .im-panel-body');
    return { onPanelBody: document.activeElement === body, onDocumentBody: document.activeElement === document.body };
  });
  assert.equal(afterReady.onPanelBody, true, at('focus stays on the panel body when the data lands'));
  assert.equal(afterReady.onDocumentBody, false, at('the data landing does not drop focus either'));

  const replaced = await inPage(page, () => {
    const { setPanelState, panels } = window.__imagoPanelState;
    const panel = panels.error;
    const body = panel.querySelector(':scope > .im-panel-body');
    const run = () => {};
    const active = () => {
      const element = document.activeElement;
      if (element === document.body) return 'document body';
      if (element === body) return 'panel body';
      return `${element.tagName.toLowerCase()}:${element.textContent}`;
    };
    const seen = {};
    setPanelState(panel, { kind: 'error', text: 'Failed.', retry: { label: 'Retry', run } });
    panel.querySelector('[data-im-state-layer] button').focus();
    setPanelState(panel, { kind: 'error', text: 'Failed again.', retry: { label: 'Retry again', run } });
    seen.errorToError = active();
    setPanelState(panel, { kind: 'empty', text: 'Nothing.', action: { label: 'Add one', run } });
    seen.errorToEmptyWithAction = active();
    setPanelState(panel, { kind: 'empty', text: 'Nothing at all.' });
    seen.emptyToEmptyWithoutAction = active();
    setPanelState(panel, { kind: 'error', text: 'Failed.', retry: { label: 'Retry', run } });
    seen.fromThePanelBody = active();

    // Focus that is not in the layer is left where it is.
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    panel.after(outside);
    outside.focus();
    setPanelState(panel, { kind: 'loading', rows: 1 });
    setPanelState(panel, { kind: 'ready' });
    seen.outside = active();
    outside.remove();

    // A panel body the app made focusable itself keeps its own tabindex.
    const own = document.createElement('section');
    own.className = 'im-panel';
    const ownBody = document.createElement('div');
    ownBody.className = 'im-panel-body';
    ownBody.tabIndex = 0;
    own.append(document.createElement('header'), ownBody);
    panel.after(own);
    setPanelState(own, { kind: 'error', text: 'Failed.', retry: { label: 'Retry', run } });
    own.querySelector('[data-im-state-layer] button').focus();
    setPanelState(own, { kind: 'loading', rows: 1 });
    seen.ownTabindex = ownBody.getAttribute('tabindex');
    seen.ownHoldsFocus = document.activeElement === ownBody;
    own.remove();
    return seen;
  });
  assert.equal(replaced.errorToError, 'button:Retry again', at('a new error layer: focus goes to its Retry'));
  assert.equal(replaced.errorToEmptyWithAction, 'button:Add one', at('an empty layer with an action: focus goes to the action'));
  assert.equal(replaced.emptyToEmptyWithoutAction, 'panel body', at('a layer without a button: focus goes to the panel body'));
  assert.equal(replaced.fromThePanelBody, 'panel body', at('focus on the panel body stays there when a layer arrives'));
  assert.equal(replaced.outside, 'button:Outside', at('focus outside the panel is never taken'));
  assert.equal(replaced.ownTabindex, '0', at('a panel body that already had a tabindex keeps it'));
  assert.equal(replaced.ownHoldsFocus, true, at('and holds the focus'));
}
