import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Exercise delayed providers independently of the example data. These two modules have no runtime imports.
async function providerTests(page) {
  await page.route('**/test-controls/*.js', async route => {
    const file = new URL(route.request().url()).pathname.split('/').pop().replace('.js', '.ts');
    const source = await readFile(new URL('../../ts/ui/' + file, import.meta.url), 'utf8');
    await route.fulfill({ contentType: 'text/javascript', body: stripTypeScriptTypes(source) });
  });
  const result = await page.evaluate(async () => {
    const { searchPicker } = await import('/test-controls/search-picker.js');
    const { createFileTree } = await import('/test-controls/file-tree.js');
    const requests = [];
    const picker = searchPicker(document, {
      label: 'Projects', loading: 'Loading', empty: 'Empty', errorText: () => 'Failed',
      search: (query, signal) => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })),
      onChoose() {},
    });
    document.body.append(picker.element);
    const next = picker.refresh();
    requests[1].resolve([{ id: 'new', label: 'New result' }]);
    await next;
    requests[0].resolve([{ id: 'old', label: 'Obsolete result' }]);
    await Promise.resolve();
    const latest = picker.element.querySelector('[role=option]').textContent;
    const failure = picker.refresh();
    requests[2].reject(new Error('offline'));
    await failure;
    const failed = picker.element.querySelector('[role=status]').textContent;
    const last = picker.refresh();
    picker.destroy();
    requests[3].resolve([]);
    await last;

    let loads = 0;
    let errors = 0;
    let resolveListing;
    const tree = createFileTree(document, [{ id: 'root', name: 'Root', lazy: true }], {
      label: 'Tree', onLoadError() { errors++; },
      async loadChildren() {
        loads++;
        if (loads === 1) throw new Error('offline');
        return new Promise(resolve => { resolveListing = resolve; });
      },
    });
    document.body.append(tree.element);
    const path = ['root', 'file'];
    const firstFailed = !await tree.reveal(path);
    const first = tree.reveal(path);
    const second = tree.reveal(path);
    await Promise.resolve();
    resolveListing([{ id: 'file', name: 'file' }]);
    const revealed = await Promise.all([first, second]);
    const selected = tree.element.querySelector('[aria-selected=true]').textContent;
    const cached = await tree.reveal(path);
    tree.destroy();
    return { latest, failed, aborted: requests[3].signal.aborted, firstFailed, revealed, selected, cached, errors, loads };
  });
  assert.equal(result.latest, 'New result');
  assert.equal(result.failed, 'Failed');
  assert.ok(result.aborted && result.firstFailed && result.cached);
  assert.deepEqual(result.revealed, [false, true]);
  assert.match(result.selected, /file/);
  assert.equal(result.errors, 1);
  assert.equal(result.loads, 2);
}

export default async function workspace(page) {
  for (const look of ['smooth', 'oni']) {
    await page.evaluate(look => window.__imago.set({ app: 'shinatama', look }), look);
    const demo = page.getByRole('region', { name: 'Interactive workspace' });
    const source = demo.getByRole('treeitem', { name: 'src', exact: true });
    await source.press('ArrowRight');
    const file = demo.getByRole('treeitem', { name: 'main.ts' });
    await file.waitFor();
    await source.press('m');
    assert.ok(await file.evaluate(el => el === document.activeElement));
    await demo.getByRole('navigation', { name: 'File location' }).getByText('src').click();
    assert.equal(await source.getAttribute('aria-selected'), 'true');
    const input = demo.getByRole('combobox');
    await input.fill('muk');
    await demo.getByRole('option', { name: 'Mukade' }).waitFor();
    await input.press('Shift+Enter');
    assert.equal(await demo.getByRole('button', { name: 'Show in sidebar · Mukade' }).getAttribute('aria-pressed'), 'true');
    const mark = demo.getByRole('option', { name: 'Mukade' }).locator('.im-picker-mark');
    assert.equal(await mark.getAttribute('data-im-checked'), 'true');
    await mark.click();
    assert.equal(await mark.getAttribute('data-im-checked'), 'false');
    assert.ok(await input.evaluate(el => el === document.activeElement));
    await input.press('Enter');
    assert.equal(await demo.locator('output').textContent(), 'Opened Mukade');
    await input.press('Escape');
    assert.equal(await input.getAttribute('aria-expanded'), 'false');

    const opener = demo.getByRole('button', { name: 'Session details', exact: true });
    await opener.click();
    await demo.getByLabel('Session name').fill('Unsaved');
    const inspect = demo.getByRole('button', { name: 'Inspect event' });
    await inspect.click();
    assert.equal(await inspect.count(), 0);
    await demo.getByRole('button', { name: 'Back to session' }).press('Escape');
    assert.equal(await demo.getByLabel('Session name').inputValue(), 'Unsaved');
    assert.ok(await inspect.evaluate(el => el === document.activeElement));
    await inspect.press('Escape');
    assert.ok(await opener.evaluate(el => el === document.activeElement));

    const separator = demo.getByRole('separator', { name: 'Resize panes' });
    await separator.press('Home');
    await separator.press('Shift+ArrowRight');
    assert.equal(await separator.getAttribute('aria-valuenow'), '96');
    const preview = demo.locator('[data-im-dock-tab="Preview"]');
    const sourcePane = await preview.evaluate(el => el.closest('[data-im-pane]').dataset.imPane);
    await preview.press('Shift+Enter');
    await preview.press('Escape');
    assert.equal(await preview.evaluate(el => el.closest('[data-im-pane]').dataset.imPane), sourcePane);
    await preview.press('Shift+Enter');
    await preview.press('Enter');
    assert.equal(await demo.locator('[data-im-pane]').count(), 1);
    const files = demo.locator('[data-im-dock-tab="Files"]');
    await files.scrollIntoViewIfNeeded();
    const tabBox = await files.boundingBox();
    const paneBox = await demo.locator('[data-im-pane]').boundingBox();
    await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height - 5, { steps: 6 });
    assert.equal(await demo.locator('[data-im-dock-target="bottom"]').count(), 1);
    await page.mouse.up();
    assert.equal(await demo.locator('[data-im-pane]').count(), 2);
    const horizontal = demo.locator('[role=separator][aria-orientation=horizontal]');
    await horizontal.press('End');
    await horizontal.press('ArrowUp');
    assert.equal(Number(await horizontal.getAttribute('aria-valuenow')), Number(await horizontal.getAttribute('aria-valuemax')) - 8);
  }
  await providerTests(page);
  const guarded = await page.evaluate(async () => {
    const api = window.__imagoSurfaces.inspector;
    const shell = document.querySelector('.im-shell');
    const opener = shell.querySelector('.im-titlebar-command');
    const parent = document.createElement('div');
    const next = document.createElement('button');
    parent.append(next);
    api.open(parent, opener);
    let parentQuestions = 0;
    api.guard(() => true, async () => { parentQuestions++; return false; });
    const child = document.createElement('button');
    api.push(child, next);
    let childQuestions = 0;
    let answer;
    api.guard(() => true, () => { childQuestions++; return new Promise(resolve => { answer = resolve; }); });
    api.close();
    api.close();
    api.push(document.createElement('button'));
    answer(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    const refused = child.isConnected && !child.closest('[data-im-covered]');
    api.close();
    answer(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    const restored = !child.isConnected && document.activeElement === next;
    opener.focus();
    api.close();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { parentQuestions, childQuestions, refused, restored, stillOpen: api.isOpen(), externalFocus: document.activeElement === opener };
  });
  assert.deepEqual(guarded, { parentQuestions: 1, childQuestions: 2, refused: true, restored: true, stillOpen: true, externalFocus: true });
}
