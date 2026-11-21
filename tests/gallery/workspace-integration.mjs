import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Exercise the public controls in a fresh document, with the gallery's actual stylesheet.
async function fixture(page, url) {
  const css = await page.locator('link[rel=stylesheet]').first().evaluate(link => link.href);
  await page.route('**/workspace-test/*.ts', async route => {
    const file = new URL(route.request().url()).pathname.split('/').pop();
    const source = await readFile(new URL('../../ts/ui/' + file, import.meta.url), 'utf8');
    await route.fulfill({ contentType: 'text/javascript', body: stripTypeScriptTypes(source) });
  });
  const address = new URL('/workspace-test/fixture', url).href;
  await page.route(address, route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html data-im-look="smooth" data-im-theme="light" data-im-app="shinatama">' +
    '<link rel="stylesheet" href="' + css + '"><body><main></main></body></html>',
  }));
  return async () => {
    await page.goto(address);
    await page.evaluate(async () => {
      window.ui = await import('./index.ts');
      window.root = document.querySelector('main');
    });
  };
}

async function inspector(page) {
  await page.evaluate(() => {
    root.innerHTML = '<button>Open</button><section class="im-inspector" hidden></section>';
    const a = ui.inspector(root);
    const b = ui.inspector(root);
    const parent = document.createElement('button');
    parent.textContent = 'Edit details';
    const child = document.createElement('input');
    child.value = 'draft';
    const opener = root.firstElementChild;
    window.guard = { parent: 0, child: 0, allow: false };
    a.open(parent, opener);
    a.guard(() => true, async () => { guard.parent++; return false; });
    b.push(child, parent);
    b.guard(() => true, async () => { guard.child++; return guard.allow; });
    window.drawer = { a, parent, child, opener };
  });
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(() => [
    guard.child, drawer.a.isOpen(), document.activeElement === drawer.child, drawer.child.value,
  ]), [1, true, true, 'draft']);
  await page.evaluate(() => drawer.a.open(document.createElement('div')));
  assert.ok(await page.evaluate(() => guard.child === 2 && drawer.child.isConnected));
  await page.evaluate(() => { guard.allow = true; });
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => guard.child === 3 && !drawer.child.isConnected && document.activeElement === drawer.parent));
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => guard.parent === 1 && drawer.a.isOpen()));
}

async function docking(page) {
  await page.evaluate(() => {
    root.innerHTML = '<section data-im-pane="outer"><button data-im-dock-tab="outerTab">Outer</button><div id="inner">' +
      '<section data-im-pane="one"><div role="tablist"><button data-im-dock-tab="a">A</button>' +
      '<button data-im-dock-tab="b">B</button></div></section>' +
      '<section data-im-pane="two" style="width:300px;height:90px">Destination</section></div></section>';
    window.moves = [];
    window.selections = [];
    for (const host of [root, root.querySelector('#inner')]) {
      ui.dockTabs(host, {
        canMove: request => request.pane === 'two' || request.pane === 'outer',
        move: request => moves.push({ host: host.id, ...request }), describe: request => request.placement,
      });
    }
    ui.roving(root.querySelector('[role=tablist]'), {
      item: 'button', orientation: 'horizontal', onSelect: item => selections.push(item.textContent),
    });
  });
  const a = page.getByRole('button', { name: 'A', exact: true });
  const b = page.getByRole('button', { name: 'B', exact: true });
  const pane = page.locator('[data-im-pane=two]');
  await a.press('ArrowRight');
  assert.ok(await b.evaluate(el => el === document.activeElement));
  await b.press('ArrowLeft');
  await page.keyboard.down('Shift');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await page.keyboard.up('Shift');
  assert.equal(await pane.getAttribute('data-im-dock-target'), 'center');
  assert.deepEqual(await page.evaluate(() => moves), []);
  await page.keyboard.press('ArrowRight');
  assert.equal(await pane.getAttribute('data-im-dock-target'), 'left');
  assert.ok(await a.evaluate(el => el === document.activeElement));
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => moves), [{ host: 'inner', tab: 'a', pane: 'two', placement: 'left' }]);
  assert.deepEqual(await page.evaluate(() => selections), []);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => selections), ['B']);
  const source = await a.boundingBox();
  const dest = await pane.boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 4 });
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => moves.slice(1)), [{ host: 'inner', tab: 'a', pane: 'two', placement: 'center' }]);
  await page.getByText('Outer', { exact: true }).press('Shift+Enter');
  assert.equal(await page.locator('[data-im-dock-target]').count(), 0);

  for (const change of ['hide', 'remove', 'replace', 'rename']) {
    await a.press('Shift+Enter');
    assert.equal(await pane.getAttribute('data-im-dock-target'), 'center');
    await pane.evaluate((el, change) => {
      const clean = el.cloneNode(true);
      clean.removeAttribute('data-im-dock-target');
      const parent = el.parentNode;
      if (change === 'hide') el.hidden = true;
      if (change === 'remove') el.remove();
      if (change === 'replace') el.replaceWith(clean);
      if (change === 'rename') el.dataset.imPane = 'outer';
      window.restorePane = () => { el.remove(); parent.append(clean); };
    }, change);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => moves.length), 2, change);
    await page.evaluate(() => restorePane());
  }
}

async function picker(page) {
  await page.evaluate(() => {
    root.innerHTML = '<form><button type="submit">Apply</button></form>';
    const form = root.querySelector('form');
    window.submits = 0;
    window.choices = [];
    form.onsubmit = event => { event.preventDefault(); submits++; };
    window.pick = ui.searchPicker(document, {
      label: 'Projects', empty: 'Empty', loading: 'Loading', errorText: () => 'Failed',
      search: () => new Promise((resolve, reject) => { window.search = { resolve, reject }; }),
      onChoose: item => choices.push(item.id),
    });
    form.prepend(pick.element);
    pick.input.focus();
  });
  const input = page.getByRole('combobox');
  await input.press('Enter');
  await page.evaluate(() => search.resolve([]));
  await input.press('Enter');
  await page.evaluate(async () => { const pending = pick.refresh(); search.reject(new Error('offline')); await pending; });
  await input.press('Enter');
  await page.evaluate(async () => { const pending = pick.refresh(); search.resolve([{ id: 'p', label: 'P' }]); await pending; });
  await input.press('Enter');
  assert.deepEqual(await page.evaluate(() => [submits, choices]), [0, ['p']]);
  await input.press('Escape');
  await input.press('Enter');
  assert.equal(await page.evaluate(() => submits), 1);

  await page.evaluate(() => {
    root.className = 'im-shell';
    root.innerHTML = '<button id="open">Projects</button>';
    ui.attachLayers(root);
    window.pick = ui.searchPicker(document, {
      label: 'Find', empty: 'Empty', loading: 'Wait', errorText: String,
      search: async () => [{ id: 'p', label: 'P' }], onChoose() {},
      mark: { label: 'Pin', checked: () => false, toggle() {} },
    });
    ui.openSheet(root.firstElementChild, pick.element);
    // A more recent layer still owns Escape even if focus is left on the picker underneath.
    const menu = document.createElement('div');
    root.append(menu);
    const pop = ui.pushLayer({ el: menu, kind: 'menu', close() { pop(); menu.remove(); } }, pick.input);
    pick.input.focus();
  });
  await page.keyboard.press('Escape');
  assert.equal(await input.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => ui.topLayer().kind), 'sheet');
  await input.press('Escape');
  assert.equal(await input.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => ui.topLayer().kind), 'sheet');
  await input.press('ArrowDown');
  await page.getByRole('button', { name: /Pin/ }).press('Escape');
  assert.equal(await input.getAttribute('aria-expanded'), 'false');
  assert.ok(await input.evaluate(el => el === document.activeElement));
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => !ui.topLayer() && document.activeElement.id === 'open'));
}

async function tree(page) {
  const mutations = await page.evaluate(async () => {
    const folders = Array.from({ length: 128 }, (_, i) => ({ id: String(i), name: 'Folder ' + i, lazy: true }));
    const view = ui.createFileTree(document, folders, {
      label: 'Files', expanded: folders.map(f => f.id),
      loadChildren: async f => [{ id: f.id + '-c', name: 'Child' }],
    });
    root.append(view.element);
    const row = view.element.firstElementChild;
    row.focus();
    let inserted = 0, removed = 0;
    const observer = new MutationObserver(records => {
      for (const r of records) { inserted += r.addedNodes.length; removed += r.removedNodes.length; }
    });
    observer.observe(view.element, { childList: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    const result = [inserted, removed, view.element.childElementCount, document.activeElement === row];
    observer.disconnect();
    view.destroy();
    return result;
  });
  assert.deepEqual(mutations, [128, 0, 256, true]);
  const staggered = await page.evaluate(async () => {
    const reads = {};
    const folders = ['a', 'b', 'c'].map(id => ({ id, name: id, lazy: true }));
    const view = ui.createFileTree(document, folders, {
      label: 'Folders', expanded: ['a', 'b', 'c'],
      loadChildren: entry => new Promise(resolve => { reads[entry.id] = resolve; }),
    });
    root.append(view.element);
    const c = view.element.lastElementChild;
    c.focus();
    await Promise.resolve();
    for (const id of ['c', 'a', 'b']) {
      reads[id]([{ id: id + '1', name: id + '1' }]);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const ids = () => [...view.element.children].map(el => el.dataset.imEntry);
    const expanded = ids();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    const collapsed = ids();
    const focused = document.activeElement === c;
    view.destroy();
    return { expanded, collapsed, focused };
  });
  assert.deepEqual(staggered, { expanded: ['a', 'a1', 'b', 'b1', 'c', 'c1'], collapsed: ['a', 'a1', 'b', 'b1', 'c'], focused: true });
  for (const moveFocus of [true, false]) {
    await page.evaluate(() => {
      root.innerHTML = '<button>Show file</button><input id="other">';
      window.view = ui.createFileTree(document, [{ id: 'src', name: 'Source', lazy: true }], {
        label: 'Files', loadChildren: () => new Promise(resolve => { window.listing = resolve; }),
      });
      root.append(view.element);
      root.querySelector('button').onclick = () => { window.revealed = view.reveal(['src', 'file'], true); };
    });
    await page.getByText('Show file').click();
    if (moveFocus) await page.locator('#other').fill('ab');
    assert.ok(await page.evaluate(async () => { listing([{ id: 'file', name: 'File' }]); return revealed; }));
    const file = page.getByRole('treeitem', { name: 'File', exact: true });
    assert.equal(await file.getAttribute('aria-selected'), 'true');
    if (moveFocus) {
      await page.keyboard.type('c');
      assert.equal(await page.locator('#other').inputValue(), 'abc');
    } else assert.ok(await file.evaluate(el => el === document.activeElement));
    await page.evaluate(() => view.destroy());
  }
}

async function splits(page) {
  await page.evaluate(() => {
    const make = axis => ui.splitView(document.createElement('div'), document.createElement('div'), {
      axis, label: axis, minFirst: 64, minSecond: 64,
    });
    const columns = make('columns'), rows = make('rows');
    columns.element.style.cssText = 'width:400px;height:300px;box-sizing:border-box;padding:10px 20px;gap:4px';
    columns.element.firstElementChild.append(rows.element);
    rows.element.style.cssText = 'height:240px;box-sizing:border-box;padding:12px 0;gap:2px';
    root.append(columns.element);
  });
  for (const [axis, size] of [['columns', 'width'], ['rows', 'height']]) {
    const separator = page.getByRole('separator', { name: axis });
    await page.waitForFunction(axis => +document.querySelector('[aria-label="' + axis + '"]').getAttribute('aria-valuemax') > 64, axis);
    await separator.press('End');
    assert.equal(await separator.evaluate((el, size) => el.nextElementSibling.getBoundingClientRect()[size], size), 64);
  }
  const separator = page.getByRole('separator', { name: 'columns' });
  for (const direction of ['ltr', 'rtl']) {
    await page.evaluate(value => { root.dir = value; }, direction);
    await separator.press('Home');
    // Leave room for a physical move in either direction.
    for (let i = 0; i < 3; i++) await separator.press(direction === 'rtl' ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
    const box = await separator.boundingBox();
    await separator.press('ArrowRight');
    assert.equal((await separator.boundingBox()).x - box.x, 8, direction);
    await separator.press('ArrowLeft');
    assert.equal((await separator.boundingBox()).x, box.x, direction);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 4 });
    await page.mouse.up();
    assert.equal((await separator.boundingBox()).x - box.x, 40, direction);
  }
}

async function breadcrumbs(page) {
  const result = await page.evaluate(() => {
    const frame = document.createElement('iframe');
    root.append(frame);
    const doc = frame.contentDocument;
    const form = doc.createElement('form');
    let submits = 0;
    form.onsubmit = event => { event.preventDefault(); submits++; };
    const path = [];
    form.append(ui.breadcrumbs(doc, 'Path', [{ id: 'root', label: 'Root' }, { id: 'leaf', label: 'Leaf' }], id => path.push(id)));
    doc.body.append(form);
    form.querySelector('button').click();
    return { path, current: [...form.querySelectorAll('[aria-current]')].map(el => el.textContent), submits };
  });
  assert.deepEqual(result, { path: ['root'], current: ['Leaf'], submits: 0 });
}

export default async function workspaceIntegration(page, url) {
  const reset = await fixture(page, url);
  for (const scenario of [inspector, docking, picker, tree, splits, breadcrumbs]) {
    await reset();
    await scenario(page);
  }
}
