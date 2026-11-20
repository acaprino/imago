// The surfaces, in the browser: menu, sheet, dialog, notice, inspector and the command palette, and the one layer stack
// that decides what Escape closes. The gallery mounts them on its live shell (gallery/mount/surfaces.ts) and exposes
// window.__imagoSurfaces so this test can drive every surface directly, from anchors of its own.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const APPS = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];

const show = (page, state) => page.evaluate((s) => window.__imago.set({ glass: false, ...s }), state);
const press = async (page, ...keys) => {
  for (const key of keys) await page.keyboard.press(key);
};
const count = (page, selector) => page.evaluate((s) => document.querySelectorAll(s).length, selector);
const box = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
const active = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return { id: el?.id ?? '', text: el?.textContent?.trim() ?? '', tag: el?.tagName ?? '', cls: el?.className ?? '' };
  });
const log = (page) => page.evaluate(() => [...(window.__log ?? [])]);
// Is this element, or an ancestor, inert?
const inertAt = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? Boolean(el.closest('[inert]')) : null;
  }, selector);
const REGIONS = ['.im-sidebar', '.im-content', '.im-inspector', '.im-status', '.im-actions', '.im-footer'];
const inertRegions = (page) =>
  page.evaluate((list) => Object.fromEntries(list.map((s) => [s, document.querySelector(s) ? Boolean(document.querySelector(s).closest('[inert]')) : null])), REGIONS);

// A button of the test's own, placed inside the shell: the anchor of a menu or a sheet.
async function anchor(page, { id = 'anchor', left = 260, top = 120, text = 'Actions' } = {}) {
  await page.evaluate(({ id, left, top, text }) => {
    window.__log = [];
    document.getElementById(id)?.remove();
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 'im-btn';
    button.textContent = text;
    button.style.cssText = `position:absolute;left:${left}px;top:${top}px;z-index:2`;
    document.querySelector('.im-shell').append(button);
  }, { id, left, top, text });
}

// The sample menu: a command with a key, one more, a disabled one with its reason, a rule and a danger item.
async function menuOnClick(page, id = 'anchor') {
  await page.evaluate((id) => {
    const button = document.getElementById(id);
    const run = (name) => () => window.__log.push(name);
    button.addEventListener('click', () => {
      window.__imagoSurfaces.openMenu(button, [
        { label: 'Check now', keys: 'r', run: run('check') },
        { label: 'Import', keys: 'Ctrl+Shift+I', run: run('import') },
        { label: 'Rename', keys: 'F2', disabled: 'Select one item first', run: run('rename') },
        'separator',
        { label: 'Stop managing', danger: true, run: run('stop') },
      ]);
    });
  }, id);
}

// ---------------------------------------------------------------------------------------------------------------------
async function menus(page, look, theme) {
  const where = (text) => `${look} ${theme}: ${text}`;
  await show(page, { app: 'xiox', look, theme, width: 1160 });
  await anchor(page);
  await menuOnClick(page);

  // It opens under its anchor, takes focus on its first item and is named by it.
  await page.click('#anchor');
  assert.equal(await count(page, '.im-shell .im-menu'), 1, where('one menu is open'));
  const under = await box(page, '#anchor');
  const menu = await box(page, '.im-shell .im-menu');
  assert.ok(menu.top >= under.bottom - 0.5, where(`the menu (top ${menu.top}) is under its anchor (bottom ${under.bottom})`));
  assert.ok(Math.abs(menu.left - under.left) <= 1, where(`the menu starts at the anchor's left edge (${menu.left} vs ${under.left})`));
  assert.equal(await page.getAttribute('.im-shell .im-menu', 'role'), 'menu', where('role menu'));
  assert.equal(await page.getAttribute('#anchor', 'aria-expanded'), 'true', where('the anchor says it is expanded'));
  assert.equal((await active(page)).text.startsWith('Check now'), true, where('focus is on the first item'));
  assert.equal(await count(page, '.im-shell .im-menu .im-menu-item'), 4, where('four items, the rule is not one'));
  const caps = await page.evaluate(() => [...document.querySelectorAll('.im-shell .im-menu-item')].map((item) => [...item.querySelectorAll('.im-key')].map((k) => k.textContent)));
  assert.deepEqual(caps, [['R'], ['Ctrl', '⇧', 'I'], ['F2'], []], where('key caps come from the key grammar'));

  // Escape closes it and gives focus back to the anchor.
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('Escape closes the menu'));
  assert.equal((await active(page)).id, 'anchor', where('focus is back on the anchor'));
  assert.equal(await page.getAttribute('#anchor', 'aria-expanded'), 'false', where('the anchor says it is collapsed'));

  // A press outside closes it, and the press still reaches what was pressed.
  await page.evaluate(() => {
    window.__clicks = 0;
    document.querySelector('.im-actions .im-btn:not(.im-btn--primary)').addEventListener('click', () => window.__clicks++);
  });
  await page.click('#anchor');
  assert.equal(await count(page, '.im-shell .im-menu'), 1, where('open again'));
  await page.click('.im-actions .im-btn:not(.im-btn--primary)');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('a press outside closes the menu'));
  assert.equal(await page.evaluate(() => window.__clicks), 1, where('the press outside still clicked the other button'));

  // A press on the anchor of an open menu closes it and does not open it again.
  await page.click('#anchor');
  assert.equal(await count(page, '.im-shell .im-menu'), 1, where('open'));
  await page.click('#anchor');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('pressing the anchor again closes the menu'));
  await page.waitForTimeout(50);
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('and it does not come back'));

  // A disabled item is not run and says why in its tooltip.
  await page.click('#anchor');
  const disabled = page.locator('.im-shell .im-menu-item', { hasText: 'Rename' });
  assert.equal(await disabled.getAttribute('title'), 'Select one item first', where('the reason is the title'));
  assert.equal(await disabled.getAttribute('aria-disabled'), 'true', where('the item is aria-disabled'));
  await disabled.click({ force: true });
  assert.deepEqual(await log(page), [], where('a disabled item does not run'));
  assert.equal(await count(page, '.im-shell .im-menu'), 1, where('and the menu stays open'));

  // The arrows skip it; Home goes to the first item; Enter runs the item once and closes the menu.
  await page.focus('.im-shell .im-menu-item:first-child');
  await press(page, 'ArrowDown');
  assert.equal((await active(page)).text.startsWith('Import'), true, where('ArrowDown'));
  await press(page, 'ArrowDown');
  assert.equal((await active(page)).text.startsWith('Stop managing'), true, where('ArrowDown skips the disabled item'));
  await press(page, 'Home', 'Enter');
  assert.deepEqual(await log(page), ['check'], where('Enter runs the item exactly once'));
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('and closes the menu'));
  assert.equal((await active(page)).id, 'anchor', where('focus is on the anchor, where the command found it'));

  // A click runs an item; Space runs one; Tab closes the menu.
  await page.evaluate(() => (window.__log = []));
  await page.click('#anchor');
  await page.locator('.im-shell .im-menu-item', { hasText: 'Import' }).click();
  assert.deepEqual(await log(page), ['import'], where('a click runs the item'));
  await page.click('#anchor');
  await press(page, 'ArrowDown', 'ArrowDown', 'Space');
  assert.deepEqual(await log(page), ['import', 'stop'], where('Space runs the item'));
  await page.click('#anchor');
  await press(page, 'Tab');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('Tab closes the menu'));

  // One menu at a time, and a menu near the right edge stays inside the window.
  await page.click('#anchor');
  await page.evaluate(() => {
    const second = document.createElement('button');
    second.id = 'second';
    second.textContent = 'Far';
    second.style.cssText = 'position:absolute;right:4px;top:150px;z-index:2';
    document.querySelector('.im-shell').append(second);
    window.__imagoSurfaces.openMenu(second, [{ label: 'Far item', run() {} }]);
  });
  assert.equal(await count(page, '.im-shell .im-menu'), 1, where('opening a menu closes the one open'));
  const shell = await box(page, '.im-shell');
  const far = await box(page, '.im-shell .im-menu');
  assert.ok(far.right <= shell.right + 0.5 && far.left >= shell.left - 0.5, where('the menu stays inside the shell'));
  await press(page, 'Escape');
}

// ---------------------------------------------------------------------------------------------------------------------
async function dialogs(page, look, theme) {
  const where = (text) => `${look} ${theme}: ${text}`;
  await show(page, { app: 'xiox', look, theme, width: 1160 });
  await page.evaluate(() => {
    window.__result = 'pending';
    window.__ask = (danger = true) => {
      window.__result = 'pending';
      return window.__imagoSurfaces
        .confirm(document.querySelector('.im-shell'), { title: 'Delete 8 items permanently?', body: '13.48 GB in 46,999 files will be deleted.', confirm: 'Delete 8 items', cancel: 'Cancel', danger })
        .then((value) => (window.__result = value));
    };
  });
  const opener = '.im-actions .im-btn:not(.im-btn--primary)';
  await page.focus(opener);
  await page.evaluate(() => void window.__ask());

  // Focus is on Cancel, everything under the title bar is inert, the title bar is not.
  assert.equal((await active(page)).text, 'Cancel', where('focus starts on Cancel'));
  const dialog = page.locator('.im-dialog');
  assert.equal(await dialog.getAttribute('role'), 'alertdialog', where('role alertdialog'));
  assert.equal(await dialog.getAttribute('aria-modal'), 'true', where('aria-modal'));
  assert.ok((await dialog.locator('.im-dialog-title').innerText()).startsWith('Delete 8 items'), where('the title'));
  const named = await dialog.evaluate((el) => [el.getAttribute('aria-labelledby'), el.getAttribute('aria-describedby')].map((id) => document.getElementById(id)?.textContent ?? ''));
  assert.ok(named[0].startsWith('Delete 8 items') && named[1].includes('46,999'), where('the dialog is named and described'));
  const inert = await inertRegions(page);
  for (const [region, value] of Object.entries(inert)) assert.notEqual(value, false, where(`${region} is inert`));
  assert.equal(inert['.im-sidebar'], true, where('the sidebar is inert'));
  assert.equal(inert['.im-content'], true, where('the content is inert'));
  assert.equal(inert['.im-inspector'], true, where('the inspector is inert'));
  assert.equal(await inertAt(page, '.im-titlebar'), false, where('the title bar is not inert'));
  assert.equal(await inertAt(page, '.im-titlebar .im-tab'), false, where('a title-bar tab is not inert'));
  assert.equal(await inertAt(page, '.im-dialog'), false, where('the dialog is not inert'));
  const scrim = await box(page, '.im-scrim');
  const titlebar = await box(page, '.im-titlebar');
  assert.ok(Math.abs(scrim.top - titlebar.bottom) <= 0.5, where('the layer starts under the title bar'));

  // The buttons: the verb given, the filled danger class on the confirming one, Cancel first.
  const buttons = await dialog.locator('button').evaluateAll((list) => list.map((b) => ({ text: b.textContent.trim(), cls: b.className })));
  assert.deepEqual(buttons.map((b) => b.text), ['Cancel', 'Delete 8 items'], where('Cancel then the verb'));
  assert.ok(buttons[1].cls.split(' ').includes('im-btn--confirm-danger'), where('the confirming button is the filled danger button'));
  assert.ok(!buttons[0].cls.includes('danger'), where('Cancel is not red'));

  // Tab stays inside: from the last button to the first, and Shift+Tab back.
  await press(page, 'Tab');
  assert.equal((await active(page)).text, 'Delete 8 items', where('Tab reaches the confirming button'));
  await press(page, 'Tab');
  assert.equal((await active(page)).text, 'Cancel', where('Tab from the last button goes to the first'));
  await press(page, 'Shift+Tab');
  assert.equal((await active(page)).text, 'Delete 8 items', where('Shift+Tab from the first goes to the last'));

  // A press on the dimmed page neither closes the dialog nor takes focus out of it.
  await page.mouse.click(scrim.left + 6, scrim.bottom - 6);
  assert.equal(await count(page, '.im-dialog'), 1, where('a press on the scrim does not close the dialog'));
  assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true, where('focus stays inside'));

  // The title bar stays usable, and the palette does not open over a dialog.
  await page.focus('.im-titlebar-command');
  assert.equal((await active(page)).cls.includes('im-titlebar-command'), true, where('the title bar takes focus while the dialog is open'));
  await page.click('.im-titlebar-command');
  assert.equal(await count(page, '.im-palette'), 0, where('the command button opens no palette over a dialog'));
  await page.focus('.im-dialog .im-btn');
  await press(page, 'Control+k');
  assert.equal(await count(page, '.im-palette'), 0, where('Ctrl+K while a dialog is open does not open the palette'));
  await press(page, 'a');
  assert.deepEqual(await count(page, '.im-notice'), 0, where('a single-letter command does not run under the dialog'));

  // A menu opened from inside the dialog: one Escape closes the menu and the dialog stays; a second closes the dialog.
  await page.evaluate(() => {
    window.__log = [];
    const cancel = document.querySelector('.im-dialog .im-btn');
    window.__imagoSurfaces.openMenu(cancel, [{ label: 'More', run() { window.__log.push('more'); } }]);
  });
  assert.equal(await count(page, '.im-shell .im-menu'), 1, where('a menu opens from inside the dialog'));
  assert.equal(await inertAt(page, '.im-shell .im-menu'), false, where('the menu is live'));
  assert.equal(await inertAt(page, '.im-dialog'), false, where('the dialog under the menu is live'));
  const menuBox = await box(page, '.im-shell .im-menu');
  const dlgBox = await box(page, '.im-dialog');
  assert.ok(menuBox.top >= dlgBox.top, where('the menu is over the dialog'));
  assert.equal(await page.evaluate(() => document.elementFromPoint(document.querySelector('.im-shell .im-menu-item').getBoundingClientRect().x + 4, document.querySelector('.im-shell .im-menu-item').getBoundingClientRect().y + 4).closest('.im-shell .im-menu') !== null), true, where('the menu is on top of the scrim'));
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('the first Escape closes the menu'));
  assert.equal(await count(page, '.im-dialog'), 1, where('and the dialog stays'));
  assert.equal(await page.evaluate(() => window.__result), 'pending', where('the dialog has not answered'));
  assert.equal((await active(page)).text, 'Cancel', where('focus is back on the dialog button that opened the menu'));
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-dialog'), 0, where('the second Escape closes the dialog'));
  await page.waitForFunction(() => window.__result !== 'pending');
  assert.equal(await page.evaluate(() => window.__result), false, where('Escape resolves false'));

  // The page is released and focus is back where it was.
  assert.deepEqual(Object.values(await inertRegions(page)).filter((v) => v === true), [], where('nothing is inert after Escape'));
  assert.equal(await count(page, '[inert]'), 0, where('no inert attribute is left'));
  assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(s), opener), true, where('focus is back on the button that asked'));

  // Cancel resolves false, the confirming button resolves true, and each releases the page.
  await page.evaluate(() => void window.__ask());
  await page.click('.im-dialog .im-btn:first-child');
  await page.waitForFunction(() => window.__result !== 'pending');
  assert.equal(await page.evaluate(() => window.__result), false, where('Cancel resolves false'));
  assert.equal(await count(page, '[inert]'), 0, where('Cancel releases the page'));
  await page.evaluate(() => void window.__ask());
  await page.click('.im-dialog .im-btn--confirm-danger');
  await page.waitForFunction(() => window.__result !== 'pending');
  assert.equal(await page.evaluate(() => window.__result), true, where('the confirming button resolves true'));
  assert.equal(await count(page, '[inert]'), 0, where('confirming releases the page'));
  assert.equal(await count(page, '.im-scrim'), 0, where('the layer is gone'));

  // A dialog that is not destructive confirms with the primary button.
  await page.evaluate(() => void window.__ask(false));
  assert.equal(await page.locator('.im-dialog .im-btn--confirm-danger').count(), 0, where('no danger class without danger'));
  assert.equal(await page.locator('.im-dialog .im-btn--primary').count(), 1, where('the primary button confirms'));
  await press(page, 'Escape');

  // Redrawing the gallery while a dialog is open leaves nothing behind in the new shell.
  await page.evaluate(() => void window.__ask());
  await show(page, { app: 'xiox', look, theme, width: 1160, glass: true });
  await page.waitForFunction(() => window.__result !== 'pending');
  assert.equal(await count(page, '[inert], .im-scrim'), 0, where('a redraw closes the dialog and releases the page'));
}

// ---------------------------------------------------------------------------------------------------------------------
async function notices(page, url) {
  // A fresh context with a fake clock: the timeouts are 6 and more than 7 seconds.
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const timed = await context.newPage();
    await timed.goto(url);
    await timed.waitForFunction(() => Boolean(window.__imago?.ready && window.__imagoSurfaces));
    await timed.clock.install();
    await show(timed, { app: 'xiox', look: 'smooth', theme: 'dark', width: 1160 });

    // A plain notice: bottom centre above the footer, a status, no focus taken, gone after 6 seconds.
    await timed.focus('.im-actions .im-btn:not(.im-btn--primary)');
    const before = await active(timed);
    await timed.evaluate(() => window.__imagoSurfaces.notify(document.querySelector('.im-shell'), '8 items deleted'));
    assert.equal(await count(timed, '.im-notice'), 1, 'a notice is shown');
    assert.equal(await timed.getAttribute('.im-notice', 'role'), 'status', 'a plain notice is a status');
    assert.deepEqual(await active(timed), before, 'a notice does not move focus');
    const notice = await box(timed, '.im-notice');
    const shell = await box(timed, '.im-shell');
    const footer = await box(timed, '.im-footer');
    assert.ok(Math.abs((notice.left + notice.right) / 2 - (shell.left + shell.right) / 2) <= 1.5, 'the notice is at the bottom centre');
    assert.ok(notice.bottom <= footer.top, `the notice (bottom ${notice.bottom}) sits above the footer (top ${footer.top})`);
    await timed.clock.fastForward(5900);
    assert.equal(await count(timed, '.im-notice'), 1, 'still there before its timeout');
    await timed.clock.fastForward(200);
    assert.equal(await count(timed, '.im-notice'), 0, 'gone after its timeout');

    // A given timeout is honoured.
    await timed.evaluate(() => window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'Quick', { timeoutMs: 1000 }));
    await timed.clock.fastForward(1100);
    assert.equal(await count(timed, '.im-notice'), 0, 'timeoutMs');

    // An error never times out, starts with the word, and an alert; the dismiss button closes it.
    await timed.evaluate(() => window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'could not reach the MCP service', { tone: 'err' }));
    await timed.clock.fastForward(60000);
    assert.equal(await count(timed, '.im-notice'), 1, 'an error is still there after a minute');
    assert.equal(await timed.getAttribute('.im-notice', 'role'), 'alert', 'an error is an alert');
    assert.ok((await timed.locator('.im-notice').innerText()).startsWith('Error'), 'its text starts with Error');
    assert.equal(await timed.evaluate(() => document.querySelector('.im-notice').textContent.startsWith('Error:')), true, 'Error and the colon');
    await timed.click('.im-notice [aria-label="Dismiss"]');
    assert.equal(await count(timed, '.im-notice'), 0, 'dismissing closes the error');

    // The error word and the dismiss label are the app's.
    await timed.evaluate(() => window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'servizio non raggiungibile', { tone: 'err', errorWord: 'Errore', dismissLabel: 'Chiudi' }));
    assert.ok((await timed.locator('.im-notice').innerText()).startsWith('Errore'), 'errorWord');
    assert.equal(await count(timed, '.im-notice [aria-label="Chiudi"]'), 1, 'dismissLabel');
    await timed.click('.im-notice [aria-label="Chiudi"]');

    // The action runs once and closes the notice; so does a second call on the same notice.
    await timed.evaluate(() => {
      window.__log = [];
      window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'Room hop-review closed', { action: { label: 'Undo', run: () => window.__log.push('undo') } });
    });
    await timed.evaluate(() => {
      const button = document.querySelector('.im-notice button');
      button.click();
      button.click();
    });
    assert.deepEqual(await log(timed), ['undo'], 'the action runs once');
    assert.equal(await count(timed, '.im-notice'), 0, 'and closes the notice');

    // A new plain notice replaces the one on screen; an error is not replaced, and does not replace an Undo.
    await timed.evaluate(() => {
      const shell = document.querySelector('.im-shell');
      window.__imagoSurfaces.notify(shell, 'one', { action: { label: 'Undo', run() {} } });
      window.__imagoSurfaces.notify(shell, 'two');
    });
    assert.equal(await count(timed, '.im-notice'), 1, 'a plain notice replaces the plain one');
    await timed.evaluate(() => window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'bad', { tone: 'err' }));
    assert.equal(await count(timed, '.im-notice'), 2, 'an error shows beside it');
    await timed.evaluate(() => window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'three'));
    assert.equal(await count(timed, '.im-notice[role="alert"]'), 1, 'the error stays when a plain notice comes');
    assert.equal(await count(timed, '.im-notice[role="status"]'), 1, 'and the plain one was replaced');
    await timed.evaluate(() => {
      const shell = document.querySelector('.im-shell');
      for (const text of ['e2', 'e3', 'e4']) window.__imagoSurfaces.notify(shell, text, { tone: 'err' });
    });
    assert.equal(await count(timed, '.im-notice[role="alert"]'), 3, 'at most three errors');

    // The returned function closes it.
    await timed.evaluate(() => {
      window.__closeNotice = window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'x', { tone: 'err' });
      window.__closeNotice();
    });
    assert.equal(await count(timed, '.im-notice[role="alert"]'), 2, 'the returned function closes the notice');
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
async function inspectors(page, look, theme) {
  const where = (text) => `${look} ${theme}: ${text}`;
  await show(page, { app: 'xiox', look, theme, width: 1160 });
  const build = () =>
    page.evaluate(() => {
      const content = document.createElement('div');
      content.id = 'form';
      content.style.display = 'contents';
      content.innerHTML = '<header class="im-panel-header"><h4 class="im-panel-title">Rename</h4></header><div class="im-panel-body"><label class="im-field"><span class="im-field-label">Name</span><span class="im-input"><input id="name" type="text" value="Chrome"></span></label></div><div class="im-panel-foot"><button type="button" class="im-btn im-btn--ghost">Cancel</button><button type="button" id="save" class="im-btn im-btn--primary">Save</button></div>';
      window.__inspectorContent = content;
    });
  const opener = '.im-actions .im-btn:not(.im-btn--primary)';

  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), true, where('the inspector of the sample shell is open'));
  const wide = await box(page, '.im-content');
  await page.evaluate(() => window.__imagoSurfaces.inspector.close());
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), false, where('closed'));
  assert.equal(await count(page, '.im-inspector:not([hidden])'), 0, where('the region is hidden'));
  assert.ok((await box(page, '.im-content')).width > wide.width + 100, where('the content takes the room back'));

  // Opening it never makes the content inert; focus moves in when an opener is given.
  await build();
  await page.focus(opener);
  await page.evaluate((s) => window.__imagoSurfaces.inspector.open(window.__inspectorContent, document.querySelector(s)), opener);
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), true, where('open'));
  assert.equal(await count(page, '[inert]'), 0, where('nothing is inert while the inspector is open'));
  assert.equal(await page.evaluate(() => document.querySelector('.im-inspector').contains(document.activeElement)), true, where('focus moved into the inspector'));
  assert.equal((await active(page)).id, 'name', where('on its first control'));
  assert.equal(await count(page, '.im-inspector #form'), 1, where('the content is in the region'));
  const docked = await box(page, '.im-inspector');
  assert.ok(docked.width >= 300 && docked.width <= 360, where(`docked width ${docked.width}`));
  assert.ok(docked.left >= (await box(page, '.im-content')).right - 0.5, where('it pushes the content at 1160'));

  // Below 1000 it overlaps the content as a drawer, and the content stays live.
  await page.evaluate(() => window.__imago.set({ width: 990 }));
  const content = await box(page, '.im-content');
  const drawer = await box(page, '.im-inspector');
  assert.ok(drawer.left > content.left && drawer.left < content.right, where('at 990 the inspector overlaps the content'));
  assert.equal(await inertAt(page, '.im-content'), false, where('the content is not inert under the drawer'));
  await page.evaluate(() => window.__imago.set({ width: 1160 }));

  // Typing in a field of the content still works: the window keeps working.
  await page.fill('.im-content input', 'chrome');
  assert.equal(await page.inputValue('.im-content input'), 'chrome', where('the content takes input while the inspector is open'));

  // close() gives focus back to the opener.
  await page.focus('#name');
  await page.evaluate(() => window.__imagoSurfaces.inspector.close());
  assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(s), opener), true, where('close() returns focus to the opener'));
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), false, where('closed again'));

  // Escape closes it from inside; a dirty guard asks once and a "no" keeps it open.
  await build();
  await page.evaluate((s) => window.__imagoSurfaces.inspector.open(window.__inspectorContent, document.querySelector(s)), opener);
  await press(page, 'Escape');
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), false, where('Escape closes the inspector'));
  assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(s), opener), true, where('and returns focus'));

  await build();
  await page.evaluate((s) => {
    window.__asked = 0;
    window.__answer = false;
    window.__dirty = true;
    const api = window.__imagoSurfaces.inspector;
    api.open(window.__inspectorContent, document.querySelector(s));
    api.guard(() => window.__dirty, () => { window.__asked++; return Promise.resolve(window.__answer); });
    api.close();
    api.close();
  }, opener);
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => window.__asked), 1, where('close() asks once, even when pressed twice'));
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), true, where('and stays open when the answer is no'));
  await page.focus('#name');
  await press(page, 'Escape');
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => window.__asked), 2, where('Escape asks too'));
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), true, where('still open'));
  await page.evaluate(() => {
    window.__answer = true;
    window.__imagoSurfaces.inspector.close();
  });
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => window.__asked), 3, where('asked again, once'));
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), false, where('closes when the answer is yes'));

  // A clean form does not ask; replacing a dirty form asks first.
  await build();
  await page.evaluate((s) => {
    window.__asked = 0;
    const api = window.__imagoSurfaces.inspector;
    api.open(window.__inspectorContent, document.querySelector(s));
    api.guard(() => false, () => { window.__asked++; return Promise.resolve(false); });
    api.close();
  }, opener);
  assert.equal(await page.evaluate(() => window.__asked), 0, where('a clean inspector closes without asking'));
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), false, where('closed'));
  await build();
  await page.evaluate((s) => {
    window.__asked = 0;
    const api = window.__imagoSurfaces.inspector;
    api.open(window.__inspectorContent, document.querySelector(s));
    api.guard(() => true, () => { window.__asked++; return Promise.resolve(false); });
    const other = document.createElement('div');
    other.id = 'other';
    api.open(other);
  }, opener);
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => window.__asked), 1, where('replacing a dirty form asks'));
  assert.equal(await count(page, '.im-inspector #form'), 1, where('and keeps the form on a "no"'));
  assert.equal(await count(page, '.im-inspector #other'), 0, where('the other content did not replace it'));
  await page.evaluate(() => window.__imagoSurfaces.inspector.guard(() => false, async () => true));
}

// ---------------------------------------------------------------------------------------------------------------------
async function palettes(page, look, theme) {
  const where = (text) => `${look} ${theme}: ${text}`;
  await show(page, { app: 'xiox', look, theme, width: 1160 });
  const opener = '.im-actions .im-btn:not(.im-btn--primary)';
  const commands = await page.evaluate(() => window.__imagoSurfaces.registry.list().map((c) => c.title));
  assert.deepEqual(commands.slice(0, 4), ['Views: Cleanup', 'Views: Registry', 'Views: Services & RAM', 'Views: Developers'], where('one Views command per title-bar tab'));
  assert.ok(commands.includes('Clean 8 items') && commands.includes('Analyze'), where('the primary and secondary actions are commands'));

  // Ctrl+K opens it, over the title bar's layer, with focus in the field; it lists the registry.
  await page.focus(opener);
  await press(page, 'Control+k');
  assert.equal(await count(page, '.im-palette'), 1, where('Ctrl+K opens the palette'));
  assert.equal((await active(page)).cls.includes('im-palette-input'), true, where('focus is in the field'));
  const options = () => page.locator('.im-palette-list [role="option"]').evaluateAll((list) => list.map((o) => o.textContent.replace(/\s+/g, ' ').trim()));
  const listed = await options();
  assert.equal(listed.length, commands.filter((title) => title !== 'Commands').length, where('it lists the registry (not itself)'));
  assert.ok(listed[0].startsWith('Views: Cleanup'), where('in registry order'));
  const analyze = listed.find((text) => text.startsWith('Analyze'));
  assert.ok(analyze && analyze.endsWith('A'), where(`a command shows its key cap (${analyze})`));
  assert.equal(await page.getAttribute('.im-palette-list [role="option"]', 'aria-selected'), 'true', where('the first is highlighted'));
  const inert = await inertRegions(page);
  assert.equal(inert['.im-content'], true, where('the content is inert under the palette'));
  assert.equal(await inertAt(page, '.im-titlebar'), false, where('the title bar is live'));
  const shellBox = await box(page, '.im-shell');
  const pal = await box(page, '.im-palette');
  assert.ok(Math.abs((pal.left + pal.right) / 2 - (shellBox.left + shellBox.right) / 2) <= 1.5, where('the palette is centred'));
  assert.ok(pal.top >= (await box(page, '.im-titlebar')).bottom, where('under the title bar'));

  // Ctrl+K again does not open a second one.
  await press(page, 'Control+k');
  assert.equal(await count(page, '.im-palette'), 1, where('Ctrl+K inside the palette opens no second palette'));

  // Typing filters; nothing matching shows the empty text.
  await page.keyboard.type('regi');
  assert.deepEqual((await options()).map((t) => t.replace(/\s+/g, ' ')), ['Views: Registry'], where('typing filters the list'));
  await page.fill('.im-palette-input', '');
  await page.keyboard.type('zzzz');
  assert.equal(await count(page, '.im-palette-list [role="option"]'), 0, where('nothing matches'));
  assert.equal((await page.locator('.im-palette-empty').innerText()).trim(), 'No command matches', where('the empty text'));
  assert.equal(await page.locator('.im-palette-empty').isVisible(), true, where('and it is visible'));
  await page.fill('.im-palette-input', '');
  assert.equal(await page.locator('.im-palette-empty').isVisible(), false, where('the empty text goes when the list is back'));
  assert.equal((await options()).length, listed.length, where('the whole list is back'));

  // Arrows move the highlight, Enter runs the highlighted one and closes the palette.
  await page.fill('.im-palette-input', 'views');
  await press(page, 'ArrowDown');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.im-palette-list [role="option"]')].findIndex((o) => o.getAttribute('aria-selected') === 'true')), 1, where('ArrowDown moves the highlight'));
  assert.equal(await page.evaluate(() => document.querySelector('.im-palette-input').getAttribute('aria-activedescendant') === [...document.querySelectorAll('.im-palette-list [role="option"]')][1].id), true, where('aria-activedescendant follows'));
  await press(page, 'ArrowUp', 'ArrowUp');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.im-palette-list [role="option"]')].findIndex((o) => o.getAttribute('aria-selected') === 'true')), 0, where('the highlight stops at the first'));

  // Enter during IME composition is not Enter.
  await page.evaluate(() => {
    const input = document.querySelector('.im-palette-input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
  });
  assert.equal(await count(page, '.im-palette'), 1, where('Enter while composing does not run a command'));

  await page.fill('.im-palette-input', 'reg');
  await press(page, 'Enter');
  assert.equal(await count(page, '.im-palette'), 0, where('Enter closes the palette'));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.im-titlebar .im-tab')].map((t) => t.getAttribute('aria-selected')).join()), 'false,true,false,false', where('Enter ran the first match: the Registry view'));
  assert.equal(await page.evaluate(() => document.querySelector('.im-notice')?.textContent ?? ''), 'Ran: Views: Registry', where('and the command said so'));
  assert.equal(await count(page, '[inert]'), 0, where('the page is released'));
  assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(s), opener), true, where('focus is back where it was'));

  // Escape closes it and returns focus; clicking the page behind it closes it too.
  await press(page, 'Control+k', 'Escape');
  assert.equal(await count(page, '.im-palette'), 0, where('Escape closes the palette'));
  assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(s), opener), true, where('and returns focus'));
  assert.equal(await count(page, '[inert]'), 0, where('and releases the page'));
  await press(page, 'Control+k');
  await page.mouse.click(shellBox.left + 8, shellBox.bottom - 8);
  assert.equal(await count(page, '.im-palette'), 0, where('a press on the page behind closes it'));
  assert.equal(await count(page, '[inert]'), 0, where('and releases the page'));

  // A click runs a command too; the title bar's own command button opens the palette.
  await page.click('.im-titlebar-command');
  assert.equal(await count(page, '.im-palette'), 1, where('the title bar button opens the palette'));
  await page.locator('.im-palette-list [role="option"]', { hasText: 'Developers' }).click();
  assert.equal(await count(page, '.im-palette'), 0, where('a click on a command closes the palette'));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.im-titlebar .im-tab')].map((t) => t.getAttribute('aria-selected')).join()), 'false,false,false,true', where('and runs it'));

  // A menu or a sheet open under Ctrl+K is closed, not left behind.
  await anchor(page);
  await menuOnClick(page);
  await page.click('#anchor');
  assert.equal(await count(page, '.im-shell .im-menu'), 1, where('a menu is open'));
  await press(page, 'Control+k');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('Ctrl+K closes the menu'));
  assert.equal(await count(page, '.im-palette'), 1, where('and opens the palette'));
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-palette'), 0, where('closed'));

  // The commands' keys come from the registry: `a` runs Analyze outside a field and not inside one.
  const lastNotice = () => page.evaluate(() => document.querySelector('.im-notice')?.textContent ?? '');
  const earlier = await lastNotice();
  await page.fill('.im-content input', '');
  await press(page, 'a');
  assert.equal(await lastNotice(), earlier, where('a single letter typed in a field runs no command'));
  assert.equal(await page.inputValue('.im-content input'), 'a', where('it is typed'));
  await page.fill('.im-content input', '');
  await page.evaluate(() => document.activeElement.blur());
  await press(page, 'a');
  assert.equal(await page.evaluate(() => document.querySelector('.im-notice')?.textContent ?? ''), 'Ran: Analyze', where('outside a field it runs the command'));
}

async function everyApp(page) {
  for (const app of APPS) {
    await show(page, { app, look: 'smooth', theme: 'dark', width: 1160 });
    const where = (text) => `${app}: ${text}`;
    await press(page, 'Control+k');
    assert.equal(await count(page, '.im-palette'), 1, where('Ctrl+K opens the palette'));
    const expected = await page.evaluate(() => document.querySelectorAll('.im-titlebar .im-tab').length);
    const views = await page.locator('.im-palette-list [role="option"]', { hasText: /^(Views|Viste):/ }).count();
    assert.equal(views, expected, where('one Views command per tab'));
    if (app === 'daodan') {
      assert.equal(await page.getAttribute('.im-palette-input', 'placeholder'), 'Digita un comando', where('the palette speaks the app\'s language'));
      await page.fill('.im-palette-input', 'zzz');
      assert.equal((await page.locator('.im-palette-empty').innerText()).trim(), 'Nessun comando corrisponde', where('and so does its empty text'));
    }
    await press(page, 'Escape');
    assert.equal(await count(page, '[inert], .im-palette'), 0, where('Escape closes it'));
  }

  // The destructive action of an app: its button, the dialog, the verb, a notice with the result.
  await show(page, { app: 'xiox', look: 'smooth', theme: 'dark', width: 1160 });
  await page.click('.im-actions .im-btn--primary');
  assert.equal(await count(page, '.im-dialog'), 1, 'the destructive action asks first');
  assert.equal((await active(page)).text, 'Cancel', 'focus starts on Cancel');
  assert.equal((await page.locator('.im-dialog .im-btn--confirm-danger').innerText()).trim(), 'Delete 8 items', 'the button carries the verb and the object');
  await page.click('.im-dialog .im-btn--confirm-danger');
  assert.equal(await count(page, '.im-dialog'), 0, 'closed');
  assert.equal((await page.locator('.im-notice').innerText()).trim(), '8 items deleted', 'the notice says the result');
  await page.click('.im-actions .im-btn--primary');
  await press(page, 'Escape');
  assert.equal((await page.locator('.im-notice').innerText()).trim(), 'Cancelled', 'Escape says it was cancelled');

  // An undoable action shows a notice with Undo, and Undo says so.
  await show(page, { app: 'mukade', look: 'smooth', theme: 'dark', width: 1160 });
  await page.click('.im-inspector .im-btn--danger');
  assert.equal(await count(page, '.im-dialog'), 0, 'an undoable action asks nothing');
  assert.equal((await page.locator('.im-notice').innerText()).startsWith('Room hop-review closed'), true, 'it says what happened');
  await page.click('.im-notice .im-btn');
  assert.equal((await page.locator('.im-notice').innerText()).trim(), 'Undone', 'Undo undoes it, once');
  assert.equal(await count(page, '.im-notice'), 1, 'and replaces the notice');

  // The sample menu of a [data-im-act="menu"] hook offers a destructive item that goes through the dialog.
  await page.evaluate(() => {
    const hook = document.createElement('button');
    hook.id = 'menu-hook';
    hook.dataset.imAct = 'menu';
    hook.textContent = 'More';
    hook.style.cssText = 'position:absolute;left:300px;top:100px;z-index:2';
    document.querySelector('.im-shell').append(hook);
  });
  await page.click('#menu-hook');
  assert.equal(await count(page, '.im-shell .im-menu'), 1, 'the menu hook opens the sample menu');
  assert.equal(await page.locator('.im-shell .im-menu-item[data-im-tone="danger"]').count(), 1, 'its danger item is marked');
  await page.click('.im-shell .im-menu-item[data-im-tone="danger"]');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, 'running the item closes the menu');
  assert.equal(await count(page, '.im-dialog'), 1, 'and the dialog opens');
  assert.equal((await active(page)).text, 'Cancel', 'with focus on Cancel');
  await press(page, 'Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-hook', 'focus returns to the menu\'s anchor');
}

// ---------------------------------------------------------------------------------------------------------------------
async function sheets(page, look, theme) {
  const where = (text) => `${look} ${theme}: ${text}`;
  await show(page, { app: 'xiox', look, theme, width: 1160 });
  await anchor(page, { id: 'anchor', left: 260, top: 120, text: 'Rename' });
  await page.evaluate(() => {
    const button = document.getElementById('anchor');
    button.addEventListener('click', () => {
      const form = document.createElement('div');
      form.className = 'im-stack';
      form.innerHTML = '<label class="im-field"><span class="im-field-label">Rename thread</span><span class="im-input"><input id="sheet-name" type="text" value="Tax rounding bug"></span></label><div class="im-sheet-actions"><button type="button" id="sheet-cancel" class="im-btn im-btn--ghost im-btn--sm">Cancel</button><button type="button" id="sheet-ok" class="im-btn im-btn--primary im-btn--sm">Rename</button></div>';
      window.__closeSheet = window.__imagoSurfaces.openSheet(button, form);
    });
  });

  // It opens under its anchor, takes focus on its first field, and Escape returns it.
  await page.click('#anchor');
  assert.equal(await count(page, '.im-sheet'), 1, where('a sheet is open'));
  const under = await box(page, '#anchor');
  const sheet = await box(page, '.im-sheet');
  assert.ok(sheet.top >= under.bottom - 0.5 && Math.abs(sheet.left - under.left) <= 1, where('the sheet is docked under its control'));
  assert.equal((await active(page)).id, 'sheet-name', where('focus is on its first field'));
  assert.equal(await count(page, '[inert]'), 0, where('a sheet makes nothing inert'));
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-sheet'), 0, where('Escape closes the sheet'));
  assert.equal((await active(page)).id, 'anchor', where('focus is back on the control'));

  // A press outside closes it; a press inside does not; the control toggles it.
  await page.click('#anchor');
  await page.click('#sheet-name');
  assert.equal(await count(page, '.im-sheet'), 1, where('a press inside keeps it'));
  await page.click('.im-titlebar .im-brand');
  assert.equal(await count(page, '.im-sheet'), 1, where('a press on the title bar (moving the window) keeps it'));
  await page.click('.im-status');
  assert.equal(await count(page, '.im-sheet'), 0, where('a press outside closes it'));
  await page.click('#anchor');
  await page.click('#anchor');
  assert.equal(await count(page, '.im-sheet'), 0, where('the control closes it again'));

  // Tab stays inside the sheet: Escape is the way out.
  await page.click('#anchor');
  await press(page, 'Tab', 'Tab');
  assert.equal((await active(page)).id, 'sheet-ok', where('Tab goes through its controls'));
  await press(page, 'Tab');
  assert.equal((await active(page)).id, 'sheet-name', where('and round to the first'));
  await press(page, 'Shift+Tab');
  assert.equal((await active(page)).id, 'sheet-ok', where('Shift+Tab goes back'));

  // One at a time: opening another closes the first.
  await page.evaluate(() => {
    const second = document.createElement('div');
    second.id = 'second';
    second.textContent = 'Second';
    window.__imagoSurfaces.openSheet(document.getElementById('anchor'), second);
  });
  assert.equal(await count(page, '.im-sheet'), 1, where('opening one sheet closes the other'));
  assert.equal(await count(page, '#second'), 1, where('and it is the new one'));
  await press(page, 'Escape');

  // It follows its anchor when the layout moves it.
  await page.click('#anchor');
  await page.evaluate(() => (document.getElementById('anchor').style.left = '420px'));
  await page.waitForFunction(() => Math.abs(document.querySelector('.im-sheet').getBoundingClientRect().left - document.getElementById('anchor').getBoundingClientRect().left) <= 1);
  await press(page, 'Escape');

  // A sheet over a dialog's page: the dialog makes it inert, and Escape closes the dialog first.
  await page.click('#anchor');
  await page.evaluate(() => void window.__imagoSurfaces.confirm(document.querySelector('.im-shell'), { title: 'Sure?', body: 'Really.', confirm: 'Yes', cancel: 'No' }));
  assert.equal(await inertAt(page, '.im-sheet'), true, where('a sheet under a dialog is inert'));
  assert.equal(await count(page, '.im-sheet'), 1, where('but it stays on screen'));
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-dialog'), 0, where('Escape closes the dialog first'));
  assert.equal(await count(page, '.im-sheet'), 1, where('the sheet is still there'));
  assert.equal(await inertAt(page, '.im-sheet'), false, where('and live again'));
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-sheet'), 0, where('the second Escape closes the sheet'));

  // Placement on a pane: the top of the pane, or its bottom.
  const content = await box(page, '.im-content');
  await page.evaluate(() => {
    const pane = document.querySelector('.im-content');
    window.__imagoSurfaces.openSheet(pane, Object.assign(document.createElement('div'), { textContent: 'On the pane' }), { placement: 'pane-top' });
  });
  const top = await box(page, '.im-sheet');
  assert.ok(Math.abs(top.top - content.top) <= 1, where('pane-top starts at the top of the pane'));
  assert.ok(top.left >= content.left - 0.5 && top.right <= content.right + 0.5, where('and sits inside it'));
  await press(page, 'Escape');
  await page.evaluate(() => {
    const pane = document.querySelector('.im-content');
    window.__imagoSurfaces.openSheet(pane, Object.assign(document.createElement('div'), { textContent: 'On the pane' }), { placement: 'pane-bottom' });
  });
  const bottom = await box(page, '.im-sheet');
  assert.ok(Math.abs(bottom.bottom - content.bottom) <= 1, where(`pane-bottom ends at the bottom of the pane (${bottom.bottom} vs ${content.bottom})`));
  assert.ok(Math.abs(bottom.left - content.left) <= 1.5 && bottom.width >= 240, where('and fills its width'));
  await press(page, 'Escape');
}

// ---------------------------------------------------------------------------------------------------------------------
// Under 620 the title-bar tabs are one "Views" menu: a menu under its button, whose items select the views.
async function viewsMenu(page) {
  await show(page, { app: 'shinatama', look: 'smooth', theme: 'dark', width: 610 });
  await page.click('.im-views-menu');
  assert.equal(await count(page, '.im-shell .im-menu'), 1, 'the Views button opens a menu');
  const button = await box(page, '.im-views-menu');
  const menu = await box(page, '.im-shell .im-menu');
  assert.ok(menu.top >= button.bottom - 0.5, 'under the button');
  assert.equal(await count(page, '.im-shell .im-menu .im-menu-item'), 5, 'one item per view');
  await page.click('.im-titlebar .im-brand');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, 'a press on the title bar closes a menu');
  await page.click('.im-views-menu');
  await page.locator('.im-shell .im-menu-item', { hasText: 'Files' }).click();
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.im-titlebar .im-tab')].findIndex((t) => t.getAttribute('aria-selected') === 'true')), 3, 'an item selects its view');
  assert.equal(await page.evaluate(() => document.activeElement.className.includes('im-views-menu')), true, 'focus is back on the button');
  await show(page, { app: 'xiox', look: 'smooth', theme: 'dark', width: 1160 });
}

// ---------------------------------------------------------------------------------------------------------------------
export default async (page, url) => {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      await menus(page, look, theme);
      await dialogs(page, look, theme);
      await sheets(page, look, theme);
      await inspectors(page, look, theme);
      await palettes(page, look, theme);
    }
  }
  await everyApp(page);
  await viewsMenu(page);
  await notices(page, url);
};
