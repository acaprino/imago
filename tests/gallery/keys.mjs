// Keyboard movement, in the browser: one tab stop per list, arrows inside it, F6 between the regions.
// The gallery mounts the keys on its live shell (gallery/mount/keys.ts); the scratch checks at the end use
// window.__imagoKeys on elements of their own.
import assert from 'node:assert/strict';

const SIDEBAR_ROWS = '.im-sidebar [role="listbox"] .im-row';
const TABS = '.im-titlebar .im-tabs .im-tab';
const TABLE_ROWS = '.im-content tbody tr';

const press = (page, ...keys) => keys.reduce((done, key) => done.then(() => page.keyboard.press(key)), Promise.resolve());

// How many of the items can be reached with Tab, and how many carry tabindex="0".
const tabbable = (page, selector) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((el) => el.tabIndex >= 0).length, selector);
const zeros = (page, selector) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((el) => el.getAttribute('tabindex') === '0').length, selector);
const total = (page, selector) => page.evaluate((s) => document.querySelectorAll(s).length, selector);
const activeIndex = (page, selector) => page.evaluate((s) => [...document.querySelectorAll(s)].indexOf(document.activeElement), selector);
const stopIndex = (page, selector) => page.evaluate((s) => [...document.querySelectorAll(s)].findIndex((el) => el.getAttribute('tabindex') === '0'), selector);

// Where focus is: the region of the shell it sits in, and what it is.
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    const region = ['im-titlebar', 'im-sidebar', 'im-content', 'im-inspector'].find((name) => el?.closest(`.${name}`)) ?? null;
    return { region, tag: el?.tagName ?? null, tabindex: el?.getAttribute('tabindex') ?? null, label: el?.textContent?.trim().slice(0, 24) ?? '' };
  });

const rendered = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }, selector);

async function width(page, px) {
  await page.evaluate((w) => window.__imago.set({ width: w }), px);
}

// One list: a single tab stop, arrows that clamp, Tab that leaves.
async function oneList(page, name, selector, { forward, back, across, startsOn }) {
  const count = await total(page, selector);
  assert.ok(count >= 3, `${name}: expected at least 3 items, found ${count}`);
  assert.equal(await zeros(page, selector), 1, `${name}: exactly one item has tabindex="0"`);
  assert.equal(await tabbable(page, selector), 1, `${name}: exactly one item can be reached with Tab`);
  if (startsOn !== undefined) assert.equal(await stopIndex(page, selector), startsOn, `${name}: the tab stop starts on the selected item`);

  await page.focus(`${selector}[tabindex="0"]`);
  await press(page, 'Home');
  assert.equal(await activeIndex(page, selector), 0, `${name}: Home goes to the first item`);
  await press(page, back);
  assert.equal(await activeIndex(page, selector), 0, `${name}: ${back} on the first item stays there`);
  await press(page, forward);
  assert.equal(await activeIndex(page, selector), 1, `${name}: ${forward} moves to the next item`);
  assert.equal(await stopIndex(page, selector), 1, `${name}: the tab stop follows the focus`);
  assert.equal(await zeros(page, selector), 1, `${name}: still exactly one tab stop`);
  await press(page, forward);
  assert.equal(await activeIndex(page, selector), 2, `${name}: ${forward} again`);
  await press(page, back);
  assert.equal(await activeIndex(page, selector), 1, `${name}: ${back} moves to the previous item`);
  await press(page, across);
  assert.equal(await activeIndex(page, selector), 1, `${name}: ${across} does nothing in this list`);
  await press(page, 'Control+' + forward);
  assert.equal(await activeIndex(page, selector), 1, `${name}: ${forward} with Ctrl is left alone`);
  await press(page, 'End');
  assert.equal(await activeIndex(page, selector), count - 1, `${name}: End goes to the last item`);
  await press(page, forward);
  assert.equal(await activeIndex(page, selector), count - 1, `${name}: ${forward} on the last item does not wrap`);
  await press(page, 'Home');
  assert.equal(await activeIndex(page, selector), 0);

  await press(page, 'Tab');
  assert.equal(await activeIndex(page, selector), -1, `${name}: Tab leaves the list`);
  await page.focus(`${selector}[tabindex="0"]`);
  await press(page, 'Shift+Tab');
  assert.equal(await activeIndex(page, selector), -1, `${name}: Shift+Tab leaves the list`);
}

// The sidebar list, the title-bar tabs and the content table of the shell on show.
async function lists(page, { table }) {
  await oneList(page, 'sidebar list', SIDEBAR_ROWS, { forward: 'ArrowDown', back: 'ArrowUp', across: 'ArrowRight' });
  await oneList(page, 'title-bar tabs', TABS, { forward: 'ArrowRight', back: 'ArrowLeft', across: 'ArrowDown' });
  if (table) await oneList(page, 'content table', TABLE_ROWS, { forward: 'ArrowDown', back: 'ArrowUp', across: 'ArrowLeft' });
}

// F6 and Shift+F6 round sidebar, content, inspector.
async function cycle(page, { sidebar }) {
  const order = sidebar ? ['im-sidebar', 'im-content', 'im-inspector'] : ['im-content', 'im-inspector'];
  await page.focus(sidebar ? `${SIDEBAR_ROWS}[tabindex="0"]` : `${TABLE_ROWS}[tabindex="0"], .im-content button`);
  assert.equal((await focused(page)).region, order[0]);
  for (let step = 1; step <= order.length + 1; step++) {
    await press(page, 'F6');
    assert.equal((await focused(page)).region, order[step % order.length], `F6, step ${step}`);
  }
  for (let step = 1; step <= order.length + 1; step++) {
    await press(page, 'Shift+F6');
    assert.equal((await focused(page)).region, order[(order.length * 2 - step + 1) % order.length], `Shift+F6, step ${step}`);
  }
}

// Space and Enter do what a click does, once.
async function selecting(page) {
  await page.evaluate(() => {
    window.__clicks = [];
    document.addEventListener('click', (event) => window.__clicks.push(event.target));
  });
  const clicked = (selector) =>
    page.evaluate((s) => {
      const hit = window.__clicks.map((el) => [...document.querySelectorAll(s)].indexOf(el));
      window.__clicks = [];
      return hit;
    }, selector);
  for (const [selector, name] of [[SIDEBAR_ROWS, 'a sidebar row'], [TABS, 'a title-bar tab'], [TABLE_ROWS, 'a table row']]) {
    for (const key of ['Enter', 'Space']) {
      await page.focus(`${selector}[tabindex="0"]`);
      await press(page, 'ArrowDown', 'ArrowRight'); // off the first item, whichever arrow applies
      await page.evaluate(() => (window.__clicks = []));
      const index = await activeIndex(page, selector);
      await press(page, key);
      assert.deepEqual(await clicked(selector), [index], `${key} clicks ${name} once`);
    }
  }
}

async function liveShell(page) {
  for (const look of ['smooth', 'oni']) {
    await page.evaluate((value) => window.__imago.set({ app: 'xiox', look: value, theme: 'dark' }), look);
    await width(page, 1160);
    // The selected row, tab and table row are where the tab stop starts.
    const starts = await page.evaluate(() =>
      ['.im-sidebar [role="listbox"] .im-row', '.im-titlebar .im-tabs .im-tab', '.im-content tbody tr'].map((s) => {
        const items = [...document.querySelectorAll(s)];
        return [items.findIndex((el) => el.getAttribute('aria-selected') === 'true'), items.findIndex((el) => el.getAttribute('tabindex') === '0')];
      }),
    );
    for (const [selected, stop] of starts) assert.equal(stop, selected, `${look}: the tab stop starts on the selected item`);

    await lists(page, { table: true });
    await cycle(page, { sidebar: true });
  }

  // F6 lands on the roving stop of the content (its table row), else on the first control.
  await page.focus(`${SIDEBAR_ROWS}[tabindex="0"]`);
  await press(page, 'F6');
  const entered = await focused(page);
  assert.equal(entered.region, 'im-content');
  assert.equal(entered.tag, 'TR', 'F6 lands on the content table\'s tab stop');
  assert.equal(entered.tabindex, '0');
  await press(page, 'F6');
  assert.equal((await focused(page)).tag, 'BUTTON', 'F6 lands on the first control of the inspector');

  // Nothing focused: F6 goes to the first region, Shift+F6 to the last.
  await page.evaluate(() => document.activeElement?.blur());
  await press(page, 'F6');
  assert.equal((await focused(page)).region, 'im-sidebar', 'F6 from nothing goes to the sidebar');
  await page.evaluate(() => document.activeElement?.blur());
  await press(page, 'Shift+F6');
  assert.equal((await focused(page)).region, 'im-inspector', 'Shift+F6 from nothing goes to the inspector');

  // The rail (840) keeps its list; the window at 610 has no sidebar to enter.
  await width(page, 840);
  assert.ok(await rendered(page, '.im-sidebar'), 'the rail is visible at 840');
  await page.focus(`${SIDEBAR_ROWS}[tabindex="0"]`);
  await press(page, 'Home', 'ArrowDown');
  assert.equal(await activeIndex(page, SIDEBAR_ROWS), 1, 'the arrows work in the rail');

  await width(page, 610);
  assert.ok(!(await rendered(page, '.im-sidebar')), 'the sidebar is not visible at 610');
  assert.ok(await rendered(page, '.im-inspector'), 'the inspector is visible at 610');
  await page.focus(`${TABLE_ROWS}[tabindex="0"]`);
  const seen = [];
  for (let step = 0; step < 4; step++) {
    await press(page, 'F6');
    seen.push((await focused(page)).region);
  }
  assert.deepEqual(seen, ['im-inspector', 'im-content', 'im-inspector', 'im-content'], 'at 610 F6 skips the hidden sidebar');
  seen.length = 0;
  for (let step = 0; step < 4; step++) {
    await press(page, 'Shift+F6');
    seen.push((await focused(page)).region);
  }
  assert.deepEqual(seen, ['im-inspector', 'im-content', 'im-inspector', 'im-content'], 'at 610 Shift+F6 skips the hidden sidebar');

  // Back at 1160 the list is still one tab stop: nothing was lost while it was hidden.
  await width(page, 1160);
  assert.equal(await zeros(page, SIDEBAR_ROWS), 1);
}

async function otherApps(page) {
  // Muro has no sidebar: F6 goes between the content and the inspector, and the tabs still work.
  await page.evaluate(() => window.__imago.set({ app: 'muro', look: 'smooth', theme: 'dark' }));
  await width(page, 1160);
  assert.equal(await total(page, '.im-sidebar'), 0);
  await oneList(page, 'muro tabs', TABS, { forward: 'ArrowRight', back: 'ArrowLeft', across: 'ArrowUp' });
  await oneList(page, 'muro table', TABLE_ROWS, { forward: 'ArrowDown', back: 'ArrowUp', across: 'ArrowRight' });
  await cycle(page, { sidebar: false });

  // Shinatama's content has no table: its first control takes F6.
  await page.evaluate(() => window.__imago.set({ app: 'shinatama' }));
  await width(page, 1160);
  assert.equal(await total(page, TABLE_ROWS), 0);
  await oneList(page, 'shinatama list', SIDEBAR_ROWS, { forward: 'ArrowDown', back: 'ArrowUp', across: 'ArrowLeft', startsOn: 0 });
  await page.focus(`${SIDEBAR_ROWS}[tabindex="0"]`);
  await press(page, 'F6');
  const content = await focused(page);
  assert.equal(content.region, 'im-content');
  assert.equal(content.tag, 'BUTTON');
}

// What the shell cannot show: items that come later, items that become disabled or hidden, a control inside an item,
// regions with nothing to focus or that are a tab stop themselves.
async function scratch(page) {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'scratch';
    host.innerHTML = `
      <div id="list">
        <button class="it" id="a" type="button">A</button>
        <button class="it" id="b" type="button" aria-disabled="true">B</button>
        <button class="it" id="c" type="button">C</button>
        <div class="it" id="d" tabindex="3">D</div>
      </div>
      <div id="nested"><div class="it" id="row" tabindex="-1"><input id="field" type="text" value="abc"></div><div class="it" id="row2" tabindex="-1">row 2</div></div>
      <input id="outside" type="text">
      <div id="mini">
        <section class="im-sidebar"><button id="s1" type="button">s1</button></section>
        <section class="im-content"><p>text only</p></section>
        <section class="im-inspector"><button id="i1" type="button">i1</button><button id="i2" type="button" tabindex="0">i2</button></section>
      </div>
      <div id="mini2">
        <section class="im-sidebar"><button id="m1" type="button">m1</button></section>
        <section class="im-content" id="region" tabindex="0"><button id="inside" type="button">inside</button></section>
      </div>
      <div id="stoplist">
        <button class="st" id="x1" type="button">x1</button>
        <button class="st" id="x2" type="button">x2</button>
        <button class="st" id="x3" type="button">x3</button>
      </div>`;
    document.body.append(host);
    window.__scratch = {
      list: window.__imagoKeys.roving(document.getElementById('list'), { item: '.it', orientation: 'vertical' }),
      nested: window.__imagoKeys.roving(document.getElementById('nested'), { item: '.it', orientation: 'vertical' }),
      mini: window.__imagoKeys.regions(document.getElementById('mini')),
      mini2: window.__imagoKeys.regions(document.getElementById('mini2')),
      stoplist: window.__imagoKeys.roving(document.getElementById('stoplist'), { item: '.st', orientation: 'vertical' }),
    };
  });
  const activeId = () => page.evaluate(() => document.activeElement?.id ?? '');
  const attr = (id) => page.evaluate((i) => document.getElementById(i).getAttribute('tabindex'), id);

  // One stop even though the buttons are tabbable by nature; a disabled item is skipped.
  assert.equal(await tabbable(page, '#list .it'), 1, 'native buttons give up their own tab stop');
  assert.equal(await attr('a'), '0');
  assert.equal(await attr('b'), '-1');
  await page.focus('#a');
  await press(page, 'ArrowDown');
  assert.equal(await activeId(), 'c', 'ArrowDown skips the aria-disabled item');
  await press(page, 'ArrowDown');
  assert.equal(await activeId(), 'd');
  await press(page, 'ArrowUp', 'ArrowUp');
  assert.equal(await activeId(), 'a', 'ArrowUp skips it going back');

  // With no onSelect the item keeps its own Enter and Space.
  await page.evaluate(() => {
    window.__hits = 0;
    document.getElementById('a').addEventListener('click', () => window.__hits++);
  });
  await press(page, 'Enter');
  assert.equal(await page.evaluate(() => window.__hits), 1, 'Enter on a button without onSelect still clicks it');

  // An item added later joins the list.
  await page.evaluate(() => {
    const extra = document.createElement('button');
    extra.className = 'it';
    extra.id = 'e';
    extra.type = 'button';
    extra.textContent = 'E';
    document.getElementById('list').append(extra);
  });
  await page.waitForFunction(() => document.getElementById('e').getAttribute('tabindex') === '-1');
  assert.equal(await tabbable(page, '#list .it'), 1, 'a late item does not add a tab stop');
  await page.focus('#d');
  await press(page, 'ArrowDown');
  assert.equal(await activeId(), 'e', 'a late item can be reached');
  assert.equal(await attr('d'), '-1');
  assert.equal(await attr('e'), '0');

  // A control inside an item keeps its keys.
  await page.focus('#field');
  await press(page, 'ArrowDown', 'Home');
  assert.equal(await activeId(), 'field', 'arrows and Home inside a field are the field\'s');
  await page.focus('#row');
  await press(page, 'ArrowDown');
  assert.equal(await activeId(), 'row2');

  // F6 skips a region with nothing to focus, and enters a region at its tab stop.
  await page.focus('#s1');
  await press(page, 'F6');
  assert.equal(await activeId(), 'i2', 'F6 skips the content (nothing to focus) and lands on the inspector\'s tab stop, not its first button');
  await press(page, 'F6');
  assert.equal(await activeId(), 's1');
  await press(page, 'Shift+F6');
  assert.equal(await activeId(), 'i2');
  await page.evaluate(() => (document.querySelector('#mini .im-sidebar').style.visibility = 'hidden'));
  await press(page, 'F6');
  assert.equal(await activeId(), 'i2', 'with the sidebar hidden and the content empty F6 stays on the only region');
  await page.evaluate(() => (document.querySelector('#mini .im-sidebar').style.visibility = ''));

  // A region that is itself a tab stop takes the focus, not the control inside it.
  await page.focus('#m1');
  await press(page, 'F6');
  assert.equal(await activeId(), 'region', 'F6 lands on a region that has tabindex="0" itself');
  await press(page, 'F6');
  assert.equal(await activeId(), 'm1');

  // The tab stop leaves an item that becomes disabled or hidden, and comes back when one can take it.
  const stops = () => page.evaluate(() => [...document.querySelectorAll('#stoplist .st')].map((el) => el.getAttribute('tabindex')));
  const waitStops = (expected) =>
    page.waitForFunction((want) => JSON.stringify([...document.querySelectorAll('#stoplist .st, #stoplist .st-late')].map((el) => el.getAttribute('tabindex'))) === JSON.stringify(want), expected);
  assert.deepEqual(await stops(), ['0', '-1', '-1']);
  // While the whole list is hidden (a breakpoint) a change inside it does not take the stop away.
  await page.evaluate(() => {
    const list = document.getElementById('stoplist');
    list.style.display = 'none';
    const late = document.createElement('button');
    late.className = 'st-late st';
    late.type = 'button';
    list.append(late);
  });
  await waitStops(['0', '-1', '-1', '-1']);
  await page.evaluate(() => {
    document.getElementById('stoplist').style.display = '';
    document.querySelector('#stoplist .st-late').remove();
  });
  await waitStops(['0', '-1', '-1']);
  await page.evaluate(() => (document.getElementById('x1').disabled = true));
  await waitStops(['-1', '0', '-1']);
  assert.equal(await tabbable(page, '#stoplist .st'), 1, 'a disabled stop leaves exactly one item reachable with Tab');
  await page.evaluate(() => (document.getElementById('x2').hidden = true));
  await waitStops(['-1', '-1', '0']);
  await page.evaluate(() => document.getElementById('x3').setAttribute('aria-disabled', 'true'));
  await waitStops(['-1', '-1', '-1']);
  await page.evaluate(() => (document.getElementById('x1').disabled = false));
  await waitStops(['0', '-1', '-1']);

  // F6 from a field outside any shell is not ours.
  await page.focus('#outside');
  await press(page, 'F6');
  assert.equal(await activeId(), 'outside');

  // Stopping puts the items back as they were and the keys go back to the page.
  await page.evaluate(() => {
    window.__scratch.list();
    window.__scratch.nested();
    window.__scratch.mini();
    window.__scratch.mini2();
    window.__scratch.stoplist();
  });
  assert.deepEqual(
    await page.evaluate(() => ['a', 'b', 'c', 'd', 'e', 'row', 'row2'].map((id) => document.getElementById(id).getAttribute('tabindex'))),
    [null, null, null, '3', null, '-1', '-1'],
    'stopping restores each item\'s own tabindex',
  );
  await page.focus('#a');
  await press(page, 'ArrowDown');
  assert.equal(await activeId(), 'a', 'after stopping the arrows do nothing');
  await page.focus('#s1');
  await press(page, 'F6');
  assert.equal(await activeId(), 's1', 'after stopping F6 does nothing');
  await page.evaluate(() => document.getElementById('scratch').remove());
}

export default async function (page) {
  await liveShell(page);
  await selecting(page);
  await otherApps(page);
  await scratch(page);
}
