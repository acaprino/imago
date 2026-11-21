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
  const operations = await page.evaluate(async () => {
    let choices = 0;
    let marks = 0;
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const control = ui.searchPicker(document, {
      label: 'Async selection', empty: 'Empty', loading: 'Wait', errorText: String,
      search: async () => [{ id: 'broken', label: 'Unavailable', disabled: true }, { id: 'ok', label: 'Ready' }],
      onChoose: async () => { choices++; },
      mark: { label: 'List', available: item => !item.disabled, checked: () => marks > 0,
        toggle: async () => { await pending; marks++; } },
    });
    root.append(control.element);
    await control.refresh();
    const rows = control.element.querySelectorAll('[role=option]');
    rows[0].click();
    const marker = rows[1].querySelector('.im-picker-mark');
    marker.click();
    marker.click();
    rows[1].click();
    finish();
    await new Promise(resolve => setTimeout(resolve, 0));
    rows[1].click();
    const result = [choices, marks, marker.querySelector('.im-check').getAttribute('aria-checked'), rows[0].getAttribute('aria-disabled')];
    control.destroy();
    return result;
  });
  assert.deepEqual(operations, [1, 1, 'true', 'true']);
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

async function nativeForms(page) {
  await page.evaluate(() => {
    root.className = 'im-shell';
    root.innerHTML = '<button id="open">Open</button><button id="command">Run</button><dialog><input></dialog>';
    ui.attachLayers(root);
    const anchor = root.querySelector('#open');
    const command = root.querySelector('#command');
    const dialog = root.querySelector('dialog');
    window.runs = 0;
    command.onclick = () => { runs++; };
    ui.openMenu(anchor, [{ label: 'Run', control: command, run: () => command.click() }]);
    window.show = () => ui.openDialogSheet(dialog, { anchor: () => anchor, placement: 'below', lightDismiss: () => false });
    window.lock = true;
    dialog.oncancel = event => { if (lock) event.preventDefault(); };
  });
  await page.getByRole('menuitem', { name: 'Run' }).click();
  assert.deepEqual(await page.evaluate(() => [runs, root.querySelector('#command').parentElement === root]), [1, true]);
  assert.equal(await page.evaluate(() => show()), true);
  await page.locator('dialog input').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').isVisible(), true);
  await page.locator('#command').click();
  assert.equal(await page.locator('dialog').isVisible(), true);
  await page.evaluate(() => { lock = false; });
  await page.locator('dialog input').press('Escape');
  assert.equal(await page.locator('dialog').isVisible(), false);
  assert.equal(await page.evaluate(() => ui.topLayer()), undefined);
}

// The app repaints its whole frame from strings while a dialog is open and the inspector holds a form the person typed in:
// the dialog stays and still answers, the inspector and its values stay, a region that went is removed and comes back,
// and what sidebarDrawer, sidebarCollapse and sidebarResize wired keeps working.
async function frame(page) {
  await page.evaluate(() => {
    const shell = document.createElement('div');
    shell.className = 'im-shell';
    shell.style.cssText = 'width:1100px;height:600px';
    root.append(shell);
    const paint = (n, options = {}) => ui.shellFrameHtml({
      titlebarHtml: ui.titlebarHtml({ brand: { name: 'App ' + n }, navigationHtml: options.sidebar === false ? '' : '<button type="button" class="im-icon-btn im-sidebar-toggle" aria-label="Threads" title="Threads" aria-expanded="false" aria-controls="side">T</button>', windowControls: true }),
      sidebarHtml: options.sidebar === false ? undefined : ui.sidebarHtml({ id: 'side', label: 'Threads', rowsHtml: `<div class="im-row" role="option" tabindex="0" aria-selected="true" title="Row ${n}"><span class="im-avatar im-rail-item" aria-hidden="true">R</span><span class="im-row-text"><span class="im-row-title">Row ${n}</span></span></div>`, collapse: { collapse: 'Collapse sidebar', expand: 'Expand sidebar' } }),
      statusHtml: options.status === false ? undefined : `<span class="im-status-text">Status ${n}</span>`,
      contentHtml: `<button type="button" id="opener">Delete item ${n}</button>`,
      contentLabel: 'Items', skipLabel: 'Skip to content', inspectorLabel: 'Details',
      actionsHtml: '<button type="button" class="im-btn im-btn--primary">Apply</button>', footerHtml: `<span class="im-footer-text">Footer ${n}</span>`,
    });
    ui.renderShellFrame(shell, paint(1));
    const stops = [ui.attachLayers(shell), ui.sidebarDrawer(shell), ui.sidebarCollapse(shell), ui.sidebarResize(shell, { label: 'Sidebar width' })];
    const form = document.createElement('form');
    form.innerHTML = '<label class="im-field"><span class="im-field-label">Name</span><span class="im-input"><input name="name" aria-label="Name"></span></label>';
    ui.inspector(shell).open(form);
    window.frameTest = { shell, paint, stops, form, inspector: shell.querySelector('.im-inspector'), sidebar: shell.querySelector('.im-sidebar') };
  });
  await page.getByRole('textbox', { name: 'Name' }).fill('Typed before the repaint');
  await page.evaluate(() => {
    frameTest.answer = ui.confirm(frameTest.shell, { title: 'Delete item?', body: 'This cannot be undone.', confirm: 'Delete item', cancel: 'Cancel', danger: true });
  });
  const during = await page.evaluate(() => {
    const { shell, paint } = frameTest;
    ui.renderShellFrame(shell, paint(2, { status: false }));
    return {
      dialog: !!shell.querySelector('[role="alertdialog"]'), bodyInert: shell.querySelector('.im-body').inert,
      inspector: shell.querySelector('.im-inspector') === frameTest.inspector, open: !frameTest.inspector.hidden,
      form: frameTest.inspector.contains(frameTest.form), value: frameTest.form.elements.name.value,
      status: shell.querySelector('.im-status'), content: shell.querySelector('.im-content').textContent, sidebar: shell.dataset.imSidebar,
    };
  });
  assert.deepEqual(during, {
    dialog: true, bodyInert: true, inspector: true, open: true, form: true, value: 'Typed before the repaint',
    status: null, content: 'Delete item 2', sidebar: 'on',
  }, 'a repaint under a dialog keeps the dialog, the inert body and the inspector with what was typed');
  await page.getByRole('alertdialog', { name: 'Delete item?' }).getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.evaluate(() => frameTest.answer), false, 'the dialog still answers after the repaint');
  assert.equal(await page.evaluate(() => frameTest.shell.querySelector('.im-body').inert), false, 'closing it releases the body');

  // The status row comes back above the columns; the sidebar and its button go and come back as the elements the
  // modules were wired to once, at the first paint: nothing is wired again.
  const regions = await page.evaluate(() => {
    const { shell, paint } = frameTest;
    const toggle = shell.querySelector('.im-sidebar-toggle');
    ui.renderShellFrame(shell, paint(3));
    const work = [...shell.querySelector('.im-work').children].map(el => el.className);
    ui.renderShellFrame(shell, paint(4, { sidebar: false }));
    const without = { sidebar: shell.querySelector('.im-sidebar'), toggle: shell.querySelector('.im-sidebar-toggle'), off: shell.dataset.imSidebar };
    ui.renderShellFrame(shell, paint(5));
    return {
      work, without, body: [...shell.querySelector('.im-body').children].map(el => el.className), on: shell.dataset.imSidebar,
      sameSidebar: shell.querySelector('.im-sidebar') === frameTest.sidebar, sameToggle: shell.querySelector('.im-sidebar-toggle') === toggle,
      rows: shell.querySelector('.im-sidebar .im-row-title').textContent,
    };
  });
  assert.deepEqual(regions, {
    work: ['im-status', 'im-columns', 'im-actions', 'im-footer'], without: { sidebar: null, toggle: null, off: 'off' },
    body: ['im-panel im-sidebar', 'im-work'], on: 'on', sameSidebar: true, sameToggle: true, rows: 'Row 5',
  }, 'the sidebar and its button come back as the same elements, with the new rows');
  await page.evaluate(() => ui.renderShellFrame(frameTest.shell, frameTest.paint(6)));
  assert.equal(await page.evaluate(() => frameTest.shell.querySelector('.im-sidebar') === frameTest.sidebar), true, 'a repaint keeps the sidebar element');
  const fold = page.getByRole('button', { name: 'Collapse sidebar' });
  await fold.click();
  assert.equal(await page.evaluate(() => frameTest.shell.dataset.imSidebarCollapsed), 'true', 'the fold button still folds after a repaint');
  await page.evaluate(() => ui.renderShellFrame(frameTest.shell, frameTest.paint(7)));
  assert.equal(await page.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded'), 'false', 'a repaint keeps the folded state of the button');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  assert.equal(await page.evaluate(() => frameTest.shell.dataset.imSidebarCollapsed), undefined, 'and it unfolds');
  const splitter = page.getByRole('separator', { name: 'Sidebar width' });
  await splitter.press('ArrowRight');
  assert.equal(await page.evaluate(() => frameTest.shell.style.getPropertyValue('--im-w-sidebar')), '240px', 'the splitter still resizes after a repaint');
  await page.evaluate(() => { frameTest.shell.style.width = '600px'; });
  await page.getByRole('button', { name: 'Threads' }).click();
  assert.equal(await page.evaluate(() => frameTest.shell.dataset.imSidebarOpen), 'true', 'the sidebar button still opens the drawer after the sidebar came back');
  assert.deepEqual(await page.evaluate(() => {
    const active = document.activeElement;
    return { inSidebar: active?.closest('.im-sidebar') === frameTest.sidebar, connected: frameTest.sidebar.isConnected, rendered: !!active?.getClientRects().length };
  }), { inSidebar: true, connected: true, rendered: true }, 'focus goes into the sidebar on screen');
  await page.locator('.im-sidebar .im-panel-title').click();
  assert.equal(await page.evaluate(() => frameTest.shell.dataset.imSidebarOpen), 'true', 'a press inside the sidebar that came back keeps the drawer open');
  await page.locator('.im-sidebar .im-row').click();
  assert.equal(await page.evaluate(() => frameTest.shell.dataset.imSidebarOpen), 'true', 'and so does a press on one of its rows');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => frameTest.shell.dataset.imSidebarOpen), undefined, 'and Escape closes it');
  await page.evaluate(() => {
    for (const stop of frameTest.stops) stop();
    frameTest.shell.remove();
    delete window.frameTest;
  });
}

export default async function workspaceIntegration(page, url) {
  const reset = await fixture(page, url);
  for (const scenario of [inspector, docking, picker, tree, splits, breadcrumbs, nativeForms, frame]) {
    await reset();
    await scenario(page);
  }
}
