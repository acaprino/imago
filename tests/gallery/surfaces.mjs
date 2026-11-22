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

  // A radio choice can change a later command's context without closing the menu.
  await page.evaluate(() => {
    let value = 'First';
    const choices = ['First', 'Second'].map(label => ({
      label, checked: () => value === label, run() { value = label; },
    }));
    window.__imagoSurfaces.openMenu(document.getElementById('anchor'), [
      ...choices, { label: 'Open', initialFocus: true, run() { window.__radioResult = value; } },
    ]);
  });
  assert.equal((await active(page)).text, 'Open');
  await page.getByRole('menuitemradio', { name: 'Second' }).click();
  assert.equal(await page.getByRole('menuitemradio', { name: 'First' }).getAttribute('aria-checked'), 'false');
  assert.equal(await page.getByRole('menuitemradio', { name: 'Second' }).getAttribute('aria-checked'), 'true');
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__radioResult), 'Second');
  assert.equal(await count(page, '.im-shell .im-menu'), 0);

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

  // A press that never clicks (released elsewhere, cancelled) leaves nothing behind: the next click on the anchor,
  // from the keyboard, opens the menu.
  await page.click('#anchor');
  await page.evaluate(() => {
    const button = document.getElementById('anchor');
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  });
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('a press on the anchor closed the menu'));
  await page.waitForTimeout(40);
  await page.evaluate(() => document.getElementById('anchor').click());
  assert.equal(await count(page, '.im-shell .im-menu'), 1, where('the click that came later, with no press before it, is not swallowed'));
  await press(page, 'Escape');

  // A disabled item is not run and says why in its tooltip.
  await page.click('#anchor');
  const disabled = page.locator('.im-shell .im-menu-item', { hasText: 'Rename' });
  const edge = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.im-shell .im-menu-item')].find((el) => el.textContent.includes('Rename'));
    const probe = document.createElement('span');
    probe.style.color = 'var(--im-muted)';
    item.append(probe);
    const muted = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(item);
    return { borderStyle: style.borderTopStyle, borderWidth: style.borderTopWidth, color: style.color, muted, opacity: style.opacity };
  });
  assert.equal(edge.borderStyle, 'dashed', where('a disabled item has the dashed edge of every disabled control'));
  assert.equal(edge.borderWidth, '1px', where('one pixel wide'));
  assert.equal(edge.color, edge.muted, where('its text stays at the muted colour'));
  assert.equal(edge.opacity, '1', where('and is never faded'));
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
// Every dialog is one drawing, in the middle of the layer under the title bar. The only side panel is the inspector.
async function assertCentred(page, selector, text) {
  const offset = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const d = el.getBoundingClientRect(), z = el.closest('.im-scrim').getBoundingClientRect();
    return [(d.left + d.right - z.left - z.right) / 2, (d.top + d.bottom - z.top - z.bottom) / 2];
  }, selector);
  assert.ok(offset.every((n) => Math.abs(n) <= 1.5), `${text} is off the middle of its layer by ${offset.map(Math.round)}`);
}

// A form dialog, wide or not, with a short body or a long one, is centred and stays inside its layer.
async function formDialogPlacement(page, look, theme) {
  const where = (text) => `${look} ${theme}: ${text}`;
  await show(page, { app: 'xiox', look, theme, width: 1160 });
  for (const [name, wide, lines] of [['short', false, 1], ['wide', true, 3], ['long', false, 200]]) {
    await page.evaluate(([name, wide, lines]) => {
      const form = window.__imagoSurfaces.openFormDialog(document.querySelector('.im-shell'), { title: `Form ${name}`, closeLabel: 'Close', wide });
      for (let i = 0; i < lines; i++) form.body.append(Object.assign(document.createElement('p'), { textContent: `Line ${i}` }));
      window.__placed = form;
    }, [name, wide, lines]);
    assert.equal(await page.getByRole('dialog', { name: `Form ${name}` }).count(), 1, where(`the ${name} form is open`));
    await assertCentred(page, '.im-form-dialog', where(`the ${name} form dialog`));
    assert.equal(await page.evaluate(() => /drawer/.test(document.querySelector('.im-form-dialog').className)), false, where('a form dialog is not a drawer'));
    assert.ok((await box(page, '.im-form-dialog')).height <= (await box(page, '.im-scrim')).height, where(`the ${name} form stays inside its layer`));
    if (name === 'short') {
      // Locked while it writes: drawn as a disabled control is (the muted text colour, a dashed edge), never faded.
      const read = () => page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--im-muted)';
        document.querySelector('.im-form-dialog').append(probe);
        const muted = getComputedStyle(probe).color;
        probe.remove();
        const body = document.querySelector('.im-form-dialog-body');
        const text = getComputedStyle(body.querySelector('p'));
        const foot = getComputedStyle(document.querySelector('.im-form-dialog-foot'));
        return {
          busy: document.querySelector('.im-form-dialog').getAttribute('aria-busy'),
          muted, text: text.color, opacity: getComputedStyle(body).opacity, footEdge: foot.borderTopStyle,
        };
      });
      const rest = await read();
      await page.evaluate(() => window.__placed.lock(true));
      const locked = await read();
      assert.equal(locked.busy, 'true', where('a locked form dialog is aria-busy'));
      assert.equal(locked.text, locked.muted, where('its body text is the muted colour'));
      assert.notEqual(rest.text, rest.muted, where('and the text of an unlocked dialog is not'));
      assert.equal(locked.footEdge, 'dashed', where('its foot has the dashed edge'));
      assert.equal(locked.opacity, '1', where('and its body is never faded'));
      await page.evaluate(() => window.__placed.lock(false));
      assert.equal((await read()).footEdge, 'solid', where('unlocked, the edge is solid again'));
    }
    await page.evaluate(() => window.__placed.close());
    assert.equal(await count(page, '.im-scrim'), 0, where(`the ${name} form is gone`));
  }
}

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
  await assertCentred(page, '.im-dialog', where('the confirm dialog'));

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
  await page.focus('#g-window .im-titlebar-command');
  assert.equal((await active(page)).cls.includes('im-titlebar-command'), true, where('the title bar takes focus while the dialog is open'));
  await page.click('#g-window .im-titlebar-command');
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

    // An empty word still says "Error": the colour alone must not carry it.
    await timed.evaluate(() => window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'nothing to say', { tone: 'err', errorWord: '', dismissLabel: '' }));
    assert.ok((await timed.locator('.im-notice').innerText()).startsWith('Error:'), 'an empty errorWord falls back to Error');
    assert.equal(await count(timed, '.im-notice [aria-label="Dismiss"]'), 1, 'and an empty dismissLabel to Dismiss');
    await timed.click('.im-notice [aria-label="Dismiss"]');

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

  // A key is answered once: with a command of the app bound to Escape, the Escape that closes the inspector does not
  // also run it; the next Escape, pressed where focus went back, does.
  await build();
  await page.evaluate((s) => {
    window.__escapes = 0;
    window.__unbindEscape = window.__imagoSurfaces.registry.register({ id: 'test:escape', title: 'Clear the selection', keys: 'Escape', run: () => void window.__escapes++ });
    window.__imagoSurfaces.inspector.open(window.__inspectorContent, document.querySelector(s));
  }, opener);
  assert.equal((await active(page)).id, 'name', where('focus is in the inspector'));
  await press(page, 'Escape');
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), false, where('one Escape closes the inspector'));
  assert.equal(await page.evaluate(() => window.__escapes), 0, where('and does not run the command bound to Escape'));
  await press(page, 'Escape');
  assert.equal(await page.evaluate(() => window.__escapes), 1, where('a second Escape runs it'));

  // A held Escape too: the press closes the inspector, and its repeats, which reach the opener once focus is back
  // there, run no command until the key goes up.
  await build();
  await page.evaluate((s) => {
    window.__escapes = 0;
    window.__imagoSurfaces.inspector.open(window.__inspectorContent, document.querySelector(s));
  }, opener);
  await page.keyboard.down('Escape');
  await page.keyboard.down('Escape'); // a repeat: Playwright marks every down after the first as one
  await page.keyboard.down('Escape');
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), false, where('a held Escape closes the inspector'));
  assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(s), opener), true, where('focus is back on the opener'));
  assert.equal(await page.evaluate(() => window.__escapes), 0, where('its repeats run no command'));
  await page.keyboard.up('Escape');
  await press(page, 'Escape');
  assert.equal(await page.evaluate(() => window.__escapes), 1, where('after the keyup a new Escape runs it'));
  await page.evaluate(() => window.__unbindEscape());

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
  assert.deepEqual(commands.slice(0, 3), ['Views: Cleanup', 'Views: Registry', 'Views: Developers'], where('one Views command per title-bar tab: the three Xiox has'));
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
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#g-window .im-titlebar .im-tab')].map((t) => t.getAttribute('aria-selected')).join()), 'false,true,false', where('Enter ran the first match: the Registry view'));
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

  // A click runs a command too; the title bar's own command button runs the palette command that mountApp registered,
  // the same one Ctrl+K runs (so the palette has the words given to mountApp, and no second copy of them).
  await page.evaluate(() => {
    const palette = window.__imagoSurfaces.registry.get('imago.palette');
    const run = palette.run;
    window.__paletteRuns = 0;
    palette.run = () => {
      window.__paletteRuns++;
      return run();
    };
  });
  await page.click('#g-window .im-titlebar-command');
  assert.equal(await count(page, '.im-palette'), 1, where('the title bar button opens the palette'));
  assert.equal(await page.evaluate(() => window.__paletteRuns), 1, where('through the registered command'));
  await page.locator('.im-palette-list [role="option"]', { hasText: 'Developers' }).click();
  assert.equal(await count(page, '.im-palette'), 0, where('a click on a command closes the palette'));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#g-window .im-titlebar .im-tab')].map((t) => t.getAttribute('aria-selected')).join()), 'false,false,true', where('and runs it'));

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
    const expected = await page.evaluate(() => document.querySelectorAll('#g-window .im-titlebar .im-tab').length);
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
  assert.equal(await page.locator('.im-shell .im-menu-item[data-im-tone="err"]').count(), 1, 'its danger item is marked with the err tone');
  await page.click('.im-shell .im-menu-item[data-im-tone="err"]');
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
  await page.click('#g-window .im-titlebar .im-brand');
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
  await page.click('#g-window .im-views-menu');
  assert.equal(await count(page, '.im-shell .im-menu'), 1, 'the Views button opens a menu');
  const button = await box(page, '#g-window .im-views-menu');
  const menu = await box(page, '.im-shell .im-menu');
  assert.ok(menu.top >= button.bottom - 0.5, 'under the button');
  assert.equal(await count(page, '.im-shell .im-menu .im-menu-item'), 5, 'one item per view');
  await page.click('#g-window .im-titlebar .im-brand');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, 'a press on the title bar closes a menu');
  await page.click('#g-window .im-views-menu');
  await page.locator('.im-shell .im-menu-item', { hasText: 'Files' }).click();
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#g-window .im-titlebar .im-tab')].findIndex((t) => t.getAttribute('aria-selected') === 'true')), 3, 'an item selects its view');
  assert.equal(await page.evaluate(() => document.activeElement.className.includes('im-views-menu')), true, 'focus is back on the button');
  await show(page, { app: 'xiox', look: 'smooth', theme: 'dark', width: 1160 });
}

// ---------------------------------------------------------------------------------------------------------------------
const fresh = async (page) => {
  await show(page, { app: 'daodan', look: 'smooth', theme: 'dark', width: 1160 });
  await show(page, { app: 'xiox', look: 'smooth', theme: 'dark', width: 1160 });
};

// A sheet docked to a pane: a press in the pane outside the sheet closes the sheet and still reaches what was pressed.
async function paneSheets(page) {
  await fresh(page);
  await page.evaluate(() => {
    window.__rowClicks = 0;
    document.querySelector('.im-content tbody tr:nth-child(4)').addEventListener('click', () => window.__rowClicks++);
  });
  for (const placement of ['pane-top', 'pane-bottom']) {
    const where = (text) => `${placement}: ${text}`;
    await page.evaluate((placement) => {
      window.__rowClicks = 0;
      window.__imagoSurfaces.openSheet(document.querySelector('.im-content'), Object.assign(document.createElement('div'), { textContent: 'On the pane' }), { placement });
    }, placement);
    assert.equal(await count(page, '.im-sheet'), 1, where('the sheet is open'));
    await page.click('.im-content tbody tr:nth-child(4)');
    assert.equal(await count(page, '.im-sheet'), 0, where('a press in the pane closes the sheet'));
    assert.equal(await page.evaluate(() => window.__rowClicks), 1, where('and the row was clicked once, at the first press'));
  }

  // A sheet under its control still toggles: the control closes it and its click does not open it again.
  await anchor(page, { id: 'anchor', left: 260, top: 120, text: 'Rename' });
  await page.evaluate(() => {
    const button = document.getElementById('anchor');
    button.addEventListener('click', () => window.__imagoSurfaces.openSheet(button, Object.assign(document.createElement('div'), { textContent: 'Below' })));
  });
  await page.click('#anchor');
  await page.click('#anchor');
  await page.waitForTimeout(50);
  assert.equal(await count(page, '.im-sheet'), 0, 'a sheet below its control is toggled by the control');

  // The control the sheet hangs from leaves the document: the sheet goes with it.
  await page.click('#anchor');
  assert.equal(await count(page, '.im-sheet'), 1, 'open');
  await page.evaluate(() => document.getElementById('anchor').remove());
  await page.waitForFunction(() => !document.querySelector('.im-shell .im-sheet'));
  assert.equal(await count(page, '.im-sheet'), 0, 'a sheet whose anchor is gone closes');
  await press(page, 'Escape'); // nothing is left on the stack: no error
  await anchor(page, { id: 'again', left: 260, top: 120, text: 'Again' });
  await page.evaluate(() => {
    const button = document.getElementById('again');
    window.__imagoSurfaces.openSheet(button, Object.assign(document.createElement('div'), { textContent: 'Another' }));
  });
  assert.equal(await count(page, '.im-sheet'), 1, 'and a new sheet opens normally afterwards');
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-sheet'), 0, 'and closes with Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'again', 'giving focus back to its control');
}

// Where focus goes when a sheet closes. A pane takes no focus, so a sheet docked to a pane returns focus to what had it
// when the sheet opened.
async function sheetOpeners(page) {
  await fresh(page);
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'in-pane';
    button.className = 'im-btn';
    button.textContent = 'In the pane';
    document.querySelector('.im-content').append(button);
  });
  const expanded = (id) => page.evaluate((id) => document.getElementById(id)?.getAttribute('aria-expanded') ?? null, id);
  const paneExpanded = () => page.evaluate(() => document.querySelector('.im-content').getAttribute('aria-expanded'));
  const openOnPane = (placement) =>
    page.evaluate((placement) => {
      window.__imagoSurfaces.openSheet(document.querySelector('.im-content'), Object.assign(document.createElement('div'), { textContent: 'On the pane' }), { placement });
    }, placement);

  for (const placement of ['pane-top', 'pane-bottom']) {
    const where = (text) => `${placement}: ${text}`;
    await page.focus('#in-pane');
    await openOnPane(placement);
    assert.equal(await count(page, '.im-sheet'), 1, where('the sheet is open'));
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('.im-sheet'))), true, where('focus is in the sheet'));
    assert.equal(await paneExpanded(), null, where('the pane is not a control: no aria-expanded on it'));
    await press(page, 'Escape');
    assert.equal(await count(page, '.im-sheet'), 0, where('Escape closes the sheet'));
    assert.equal((await active(page)).id, 'in-pane', where('focus goes back to what had it, not to the body'));
    assert.equal(await paneExpanded(), null, where('and the pane has no aria-expanded after it closes'));

    // Nothing had focus when it opened: there is nothing to go back to, and nothing breaks.
    await page.evaluate(() => document.activeElement?.blur());
    await openOnPane(placement);
    await press(page, 'Escape');
    assert.equal(await count(page, '.im-sheet'), 0, where('a sheet opened with no focus closes with Escape'));
  }

  // Under a control the control is the opener: it says it is expanded while the sheet is open and gets its own state back.
  await anchor(page, { id: 'plain', left: 260, top: 120, text: 'Plain' });
  await anchor(page, { id: 'disclosure', left: 420, top: 120, text: 'Disclosure' });
  await page.evaluate(() => document.getElementById('disclosure').setAttribute('aria-expanded', 'false'));
  for (const [id, before] of [['plain', null], ['disclosure', 'false']]) {
    const where = (text) => `a sheet under #${id}: ${text}`;
    assert.equal(await expanded(id), before, where('the control starts as the page wrote it'));
    await page.evaluate((id) => {
      const button = document.getElementById(id);
      window.__imagoSurfaces.openSheet(button, Object.assign(document.createElement('div'), { textContent: 'Below' }));
    }, id);
    assert.equal(await expanded(id), 'true', where('the control says it is expanded'));
    await press(page, 'Escape');
    assert.equal(await expanded(id), before, where('and has its own state back once the sheet is closed'));
    assert.equal((await active(page)).id, id, where('focus is back on the control'));
  }
}

// Dialogs in the corners: an opener that left the document, two dialogs released in either order, a notice under a dialog.
async function dialogEdges(page) {
  await fresh(page);
  await page.evaluate(() => {
    window.__results = [];
    window.__ask = (name) =>
      window.__imagoSurfaces
        .confirm(document.querySelector('.im-shell'), { title: `Dialog ${name}`, body: 'Sure?', confirm: `Yes ${name}`, cancel: `No ${name}` })
        .then((value) => window.__results.push(`${name}:${value}`));
  });
  const nothingInert = async (text) => {
    assert.equal(await count(page, '[inert]'), 0, text);
    assert.equal(await count(page, '.im-scrim'), 0, text);
  };

  // The opener leaves the document while the dialog is open: closing still releases the page and does not throw.
  await anchor(page, { id: 'gone', left: 300, top: 120, text: 'Gone' });
  await page.focus('#gone');
  await page.evaluate(() => void window.__ask('A'));
  assert.equal(await count(page, '.im-dialog'), 1, 'the dialog is open');
  await page.evaluate(() => document.getElementById('gone').remove());
  await press(page, 'Escape');
  await page.waitForFunction(() => window.__results.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__results), ['A:false'], 'Escape resolves false');
  await nothingInert('the page is released although the opener is gone');
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'and focus is on the page, with nowhere to go back to');

  // Two dialogs, released top first: the page stays inert until the last one is gone.
  await page.evaluate(() => {
    window.__results = [];
    void window.__ask('A');
    void window.__ask('B');
  });
  assert.equal(await count(page, '.im-dialog'), 2, 'two dialogs are stacked');
  assert.equal(await inertAt(page, '.im-content'), true, 'the page is inert');
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-dialog'), 1, 'Escape closes the top dialog only');
  assert.equal(await inertAt(page, '.im-content'), true, 'the page stays inert under the one left');
  assert.equal(await inertAt(page, '.im-dialog'), false, 'and the dialog left is live again');
  await press(page, 'Escape');
  await page.waitForFunction(() => window.__results.length === 2);
  assert.deepEqual(await page.evaluate(() => window.__results), ['B:false', 'A:false'], 'B answered first');
  await nothingInert('both closed: the page is released');

  // Released bottom first: the dialog under closes, the one on top and the inert page stay.
  await page.evaluate(() => {
    window.__results = [];
    void window.__ask('A');
    void window.__ask('B');
  });
  await page.evaluate(() => document.querySelectorAll('.im-shell .im-dialog')[0].querySelector('.im-btn').click());
  await page.waitForFunction(() => window.__results.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__results), ['A:false'], 'the dialog under answered');
  assert.equal(await count(page, '.im-dialog'), 1, 'the one on top is still there');
  assert.equal(await inertAt(page, '.im-content'), true, 'the page is still inert');
  assert.equal(await page.evaluate(() => document.querySelector('.im-dialog').contains(document.activeElement)), true, 'focus stays in the dialog on top');
  await press(page, 'Escape');
  await page.waitForFunction(() => window.__results.length === 2);
  assert.deepEqual(await page.evaluate(() => window.__results), ['A:false', 'B:false']);
  await nothingInert('both closed in the other order: the page is released');

  // The first notice of a shell arrives under a dialog: its host is made under the dialog and is inert from the start.
  await fresh(page);
  assert.equal(await count(page, '.im-notices'), 0, 'a new shell has no notice host yet');
  await page.evaluate(() => void window.__ask('A'));
  await page.evaluate(() => window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'First of all', { tone: 'err' }));
  assert.equal(await inertAt(page, '.im-notices'), true, 'a host made under a dialog is inert');
  await press(page, 'Escape');
  assert.equal(await inertAt(page, '.im-notices'), false, 'and live when the dialog is gone');
  await page.click('.im-notice [aria-label="Dismiss"]');

  // A notice shows under a pending dialog but cannot be pressed; it is live again afterwards.
  await page.evaluate(() => {
    window.__log = [];
    window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'Room closed', { timeoutMs: 600000, action: { label: 'Undo', run: () => window.__log.push('undo') } });
    void window.__ask('A');
  });
  assert.equal(await inertAt(page, '.im-notices'), true, 'the notices are inert under a dialog');
  const undo = await box(page, '.im-notice .im-btn');
  assert.ok(undo && undo.width > 0, 'but still shown');
  await page.mouse.click(undo.left + undo.width / 2, undo.top + undo.height / 2);
  assert.deepEqual(await log(page), [], 'Undo cannot be pressed over a pending confirm');
  assert.equal(await count(page, '.im-dialog'), 1, 'the dialog is still waiting');
  await page.evaluate(() => window.__imagoSurfaces.notify(document.querySelector('.im-shell'), 'Late', { tone: 'err' }));
  assert.equal(await inertAt(page, '.im-notice[role="alert"]'), true, 'a notice that arrives under the dialog is inert too');
  await press(page, 'Escape');
  assert.equal(await inertAt(page, '.im-notices'), false, 'the notices are live again when the dialog is gone');
  await page.click('.im-notice .im-btn');
  assert.deepEqual(await log(page), ['undo'], 'and Undo works');
  await page.click('.im-notice [aria-label="Dismiss"]');
  await nothingInert('nothing is left');
}

// Text that looks like markup is text: shown as typed, creating no element.
async function literalText(page) {
  await fresh(page);
  const bait = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
  await page.evaluate(() => {
    window.__pwned = undefined;
  });

  // A dialog: title, body and both buttons.
  await page.evaluate((bait) => void window.__imagoSurfaces.confirm(document.querySelector('.im-shell'), { title: bait, body: bait, confirm: bait, cancel: bait, danger: true }), bait);
  assert.equal(await page.locator('.im-dialog-title').textContent(), bait, 'the dialog title is shown literally');
  assert.equal(await page.locator('.im-dialog-body').textContent(), bait, 'and so is its body');
  assert.deepEqual(await page.locator('.im-dialog .im-btn').allTextContents(), [bait, bait], 'and its buttons');
  assert.equal(await count(page, '.im-dialog img, .im-dialog b'), 0, 'no element comes out of it');
  await press(page, 'Escape');

  // A menu: the label and the reason.
  await anchor(page, { id: 'anchor' });
  await page.evaluate((bait) => {
    window.__imagoSurfaces.openMenu(document.getElementById('anchor'), [{ label: bait, run() {} }, { label: 'Off', disabled: bait, run() {} }]);
  }, bait);
  assert.equal(await page.locator('.im-shell .im-menu-item span').first().textContent(), bait, 'a menu label is shown literally');
  assert.equal(await page.locator('.im-shell .im-menu-item').nth(1).getAttribute('title'), bait, 'and a reason too');
  assert.equal(await count(page, '.im-shell .im-menu img, .im-shell .im-menu b'), 0, 'no element comes out of the menu');
  await press(page, 'Escape');

  // A notice: the text, the action and the error word.
  await page.evaluate((bait) => {
    const shell = document.querySelector('.im-shell');
    window.__imagoSurfaces.notify(shell, bait, { timeoutMs: 600000, action: { label: bait, run() {} } });
    window.__imagoSurfaces.notify(shell, bait, { tone: 'err', errorWord: bait, dismissLabel: bait });
  }, bait);
  assert.equal(await page.locator('.im-notice[role="status"] .im-notice-text').textContent(), bait, 'a notice is shown literally');
  assert.equal(await page.locator('.im-notice[role="status"] .im-btn').textContent(), bait, 'and its action');
  assert.equal(await page.locator('.im-notice[role="alert"] .im-notice-text').textContent(), `${bait}: ${bait}`, 'and an error, with its word');
  assert.equal(await count(page, '.im-notice img, .im-notice b:not(.im-notice-word)'), 0, 'no element comes out of a notice');
  assert.equal(await count(page, '.im-notice-word b'), 0, 'not even out of the error word');
  await page.evaluate(() => document.querySelector('.im-notice[role="alert"] .im-icon-btn').click());

  // A command title in the palette, and the palette's own words.
  await page.evaluate((bait) => {
    window.__unregister = window.__imagoSurfaces.registry.register({ id: 'test:bait', title: bait, run() {} });
    window.__imagoSurfaces.openPalette(document.querySelector('.im-shell'), window.__imagoSurfaces.registry, { placeholder: bait, empty: bait });
  }, bait);
  const titles = await page.locator('.im-palette-list [role="option"] > span:first-child').allTextContents();
  assert.ok(titles.includes(bait), 'a command title is shown literally');
  assert.equal(await count(page, '.im-palette img, .im-palette b'), 0, 'no element comes out of the palette');
  assert.equal(await page.getAttribute('.im-palette-input', 'placeholder'), bait, 'the placeholder is an attribute');
  await page.fill('.im-palette-input', 'zzzzzz');
  assert.equal(await page.locator('.im-palette-empty').textContent(), bait, 'the empty text is shown literally');
  assert.equal(await count(page, '.im-palette img, .im-palette b'), 0, 'and creates nothing either');
  await press(page, 'Escape');
  await page.evaluate(() => window.__unregister());

  await page.waitForTimeout(150); // an image that was created would have failed to load by now
  assert.equal(await page.evaluate(() => window.__pwned), undefined, 'no handler of the text ran');
  assert.equal(await count(page, 'img[src="x"]'), 0, 'and no image exists');
}

// Failures that belong to the app's code: a `when()` that throws, a command or a question that rejects.
async function failures(page) {
  await fresh(page);
  await page.evaluate(() => {
    window.__unhandled = [];
    window.__thrown = [];
    if (!window.__failureListeners) {
      window.__failureListeners = true;
      window.addEventListener('unhandledrejection', (event) => {
        event.preventDefault();
        window.__unhandled.push(String(event.reason));
      });
      window.addEventListener('error', (event) => {
        event.preventDefault();
        window.__thrown.push(event.message);
      });
    }
    window.__whenThrows = false;
    window.__unregister = window.__imagoSurfaces.registry.register({ id: 'test:when', title: 'Fragile', when: () => { if (window.__whenThrows) throw new Error('when failed'); return true; }, run() {} });
  });
  const opener = '.im-actions .im-btn:not(.im-btn--primary)';

  // `when()` throws while the list is built: the palette closes cleanly, the page is released and the error goes on.
  await page.focus(opener);
  const message = await page.evaluate(() => {
    window.__whenThrows = true;
    try {
      window.__imagoSurfaces.openPalette(document.querySelector('.im-shell'), window.__imagoSurfaces.registry);
      return 'it did not throw';
    } catch (error) {
      return error.message;
    } finally {
      window.__whenThrows = false;
    }
  });
  assert.equal(message, 'when failed', 'the error of the app reaches the caller');
  assert.equal(await count(page, '.im-palette, .im-scrim, [inert]'), 0, 'the palette is gone and the page is released');
  assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(s), opener), true, 'and focus is back where it was');
  await page.evaluate(() => window.__imagoSurfaces.openPalette(document.querySelector('.im-shell'), window.__imagoSurfaces.registry));
  assert.equal(await count(page, '.im-palette'), 1, 'a palette opens normally afterwards');

  // The same while typing: the list is built again on every key.
  await page.evaluate(() => (window.__whenThrows = true));
  await page.keyboard.type('f');
  await page.waitForFunction(() => window.__thrown.length > 0);
  assert.deepEqual(await page.evaluate(() => window.__thrown.map((m) => m.includes('when failed'))), [true], 'the error went on');
  await page.evaluate(() => (window.__whenThrows = false));
  assert.equal(await count(page, '.im-palette, .im-scrim, [inert]'), 0, 'the palette closed itself and released the page');

  // A command that rejects or throws is the app's: no unhandled rejection, the palette is already closed.
  await page.evaluate(() => {
    window.__unregisterRejects = window.__imagoSurfaces.registry.register({ id: 'test:rejects', title: 'Rejects', run: () => Promise.reject(new Error('nope')) });
    window.__unregisterThrows = window.__imagoSurfaces.registry.register({ id: 'test:throws', title: 'Throws', run: () => { throw new Error('boom'); } });
  });
  for (const name of ['Rejects', 'Throws']) {
    await press(page, 'Control+k');
    await page.fill('.im-palette-input', name);
    await press(page, 'Enter');
    await page.waitForTimeout(60);
    assert.equal(await count(page, '.im-palette, [inert]'), 0, `${name}: the palette is closed and the page released`);
  }
  assert.deepEqual(await page.evaluate(() => window.__unhandled), [], 'no unhandled rejection');
  assert.equal(await page.evaluate(() => window.__thrown.length), 1, 'and nothing was thrown that the palette did not catch');

  // The inspector's question rejects: the form is not thrown away, and the next close can ask again.
  await page.evaluate((s) => {
    const content = document.createElement('div');
    content.innerHTML = '<input id="name" type="text">';
    const api = window.__imagoSurfaces.inspector;
    window.__asks = 0;
    window.__answer = 'reject';
    api.open(content, document.querySelector(s));
    api.guard(() => true, () => { window.__asks++; return window.__answer === 'reject' ? Promise.reject(new Error('ask failed')) : Promise.resolve(true); });
    api.close();
  }, opener);
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), true, 'a question that fails keeps the inspector open');
  assert.deepEqual(await page.evaluate(() => window.__unhandled), [], 'with no unhandled rejection');
  await page.evaluate(() => {
    window.__answer = 'yes';
    window.__imagoSurfaces.inspector.close();
  });
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => window.__asks), 2, 'it asks again, once');
  assert.equal(await page.evaluate(() => window.__imagoSurfaces.inspector.isOpen()), false, 'and closes on a yes');

  await page.evaluate(() => {
    window.__unregister();
    window.__unregisterRejects();
    window.__unregisterThrows();
  });
}

// ---------------------------------------------------------------------------------------------------------------------
async function formDialogs(page) {
  await fresh(page);
  await anchor(page);
  await page.focus('#anchor');
  await page.evaluate(() => {
    const shell = document.querySelector('.im-shell');
    const { openFormDialog } = window.__imagoSurfaces;
    const create = title => openFormDialog(shell, { title, closeLabel: 'Close', onClose: () => window.__log.push(title) });
    const first = create('Import');
    const input = document.createElement('input');
    first.body.append(input);
    first.lock(true);
    const second = create('Settings');
    window.__forms = { first, second };
  });
  assert.equal((await active(page)).text, 'Close', 'deferred focus belongs to the top form');
  assert.equal(await page.getByRole('dialog', { name: 'Settings' }).count(), 1);
  await press(page, 'Escape');
  assert.equal(await page.getByRole('dialog', { name: 'Import' }).count(), 1);
  await press(page, 'Tab', 'Escape');
  assert.equal(await page.evaluate(() => {
    const { first } = window.__forms;
    first.root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return first.body.inert && first.foot.inert && !first.close() && document.activeElement === first.dialog;
  }), true, 'the locked form retains focus and survives every dismissal path');
  await page.evaluate(() => {
    const { first } = window.__forms;
    first.lock(false);
    first.setTitle('Finished');
    first.foot.append(document.createElement('button'));
  });
  assert.equal(await page.getByRole('dialog', { name: 'Finished' }).count(), 1);
  await press(page, 'Shift+Tab');
  assert.equal(await page.evaluate(() => window.__forms.first.foot.contains(document.activeElement)), true);
  await press(page, 'Tab', 'Escape');
  assert.equal((await active(page)).id, 'anchor');
  assert.deepEqual(await log(page), ['Settings', 'Import']);
  await page.evaluate(() => {
    const form = window.__imagoSurfaces.openFormDialog(document.querySelector('.im-shell'), {
      title: 'Advanced options', closeLabel: 'Close',
    });
    form.body.innerHTML = '<details><summary id="options">Options</summary><summary>Other text</summary><input id="advanced"></details>';
  });
  await page.focus('#options');
  await press(page, 'Tab');
  assert.equal((await active(page)).text, 'Close', 'Tab wraps from the closed summary');
  await press(page, 'Shift+Tab');
  assert.equal((await active(page)).id, 'options', 'the summary is the last stop while closed');
  await press(page, 'Enter', 'Tab');
  assert.equal((await active(page)).id, 'advanced', 'the expanded field follows the first summary');
  await press(page, 'Shift+Tab');
  assert.equal((await active(page)).id, 'options');
  await press(page, 'Shift+Tab');
  assert.equal((await active(page)).text, 'Close');
  await press(page, 'Shift+Tab');
  assert.equal((await active(page)).id, 'advanced', 'the expanded field is the last stop');
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-scrim, .im-shell [inert]'), 0);
  await page.evaluate(() => {
    const shell = document.querySelector('.im-shell');
    window.__detachedShell = shell;
    const pending = window.__imagoSurfaces.openFormDialog(shell, {
      title: 'Saving', closeLabel: 'Close', onClose: () => window.__log.push('disposed'),
    });
    pending.lock(true);
  });
  await fresh(page); // remount the gallery shell during the write
  assert.deepEqual(await log(page), ['Settings', 'Import', 'disposed']);
  assert.equal(await page.evaluate(() => window.__detachedShell.querySelector('.im-scrim, [inert]') === null), true);
  await page.keyboard.press('Control+k');
  assert.equal(await count(page, '.im-palette'), 1);
  await press(page, 'Escape');
}

// ---------------------------------------------------------------------------------------------------------------------
// Drawers: app-owned forms beside the panels. The panels stay live, Escape closes the top drawer, the control that
// opened one closes it, and a drawer opened from inside another covers it until it closes.
async function drawers(page, look, theme) {
  const where = (text) => `${look} ${theme}: ${text}`;
  await show(page, { app: 'xiox', look, theme, width: 1160 });
  await anchor(page, { id: 'anchor', left: 260, top: 120, text: 'Library' });
  await page.evaluate(() => {
    const shell = document.querySelector('.im-shell');
    const make = (id, title) => {
      document.getElementById(id)?.remove();
      const dialog = document.createElement('dialog');
      dialog.id = id;
      dialog.setAttribute('aria-label', title);
      dialog.innerHTML = `<form class="im-form"><label class="im-field"><span class="im-field-label">${title} filter</span><input id="${id}-field" class="im-native-input"></label><button type="button" class="im-btn" data-more>More</button><button type="button" class="im-btn" data-child>Details</button><button type="button" class="im-btn" data-cancel>Cancel</button></form>`;
      dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
      dialog.addEventListener('cancel', (event) => { if (window.__refuse) event.preventDefault(); });
      shell.append(dialog);
      return dialog;
    };
    const library = make('drawer-library', 'Library');
    const details = make('drawer-details', 'Details');
    const settings = make('drawer-settings', 'Settings');
    window.__refuse = false;
    window.__openDrawer = (dialog) => window.__imagoSurfaces.openDialogDrawer(dialog, {
      acceptsEscape: (target) => !(target instanceof Element && target.closest('[data-keeps-escape]')),
    });
    document.getElementById('anchor').addEventListener('click', () => window.__openDrawer(library));
    library.querySelector('[data-child]').addEventListener('click', () => window.__openDrawer(details));
    library.querySelector('[data-more]').addEventListener('click', (event) => window.__imagoSurfaces.openMenu(event.currentTarget, [{ label: 'Export', run() {} }]));
    window.__settings = settings;
  });
  const shown = (id) => page.evaluate((id) => { const el = document.getElementById(id); return Boolean(el?.open && el.getClientRects().length); }, id);
  // One panel at the right edge at a time: the sample's docked inspector makes way for the drawer.
  await page.evaluate(() => window.__imagoSurfaces.inspector.close());

  // It opens at the window's edge under the title bar, takes focus, and leaves the panels live.
  await page.click('#anchor');
  assert.equal(await shown('drawer-library'), true, where('the control opens the drawer'));
  const drawer = await box(page, '#drawer-library');
  const shellBox = await box(page, '.im-shell');
  assert.ok(Math.abs(drawer.right - shellBox.right) <= 1, where(`the drawer is at the right edge (${drawer.right} vs ${shellBox.right})`));
  assert.ok(Math.abs(drawer.top - (await box(page, '.im-titlebar')).bottom) <= 1, where('under the title bar'));
  assert.equal(await page.evaluate(() => document.getElementById('drawer-library').contains(document.activeElement)), true, where('focus is in the drawer'));
  assert.equal(await count(page, '[inert]'), 0, where('a drawer makes nothing inert'));
  // Beside the panels: from 900px the content gives the drawer its width, and takes it back when it closes.
  const beside = await box(page, '.im-content');
  assert.ok(beside.right <= drawer.left + 1, where(`the content ends where the drawer starts (${beside.right} vs ${drawer.left})`));

  await page.fill('.im-content input', 'beside');
  assert.equal(await page.inputValue('.im-content input'), 'beside', where('the panels beside it take input'));
  assert.equal(await shown('drawer-library'), true, where('and a press in them leaves it open'));

  // Escape closes it from the panels too, and focus stays where the user went on working; from inside the drawer,
  // focus goes back to its control. The control toggles it.
  await press(page, 'Escape');
  assert.equal(await shown('drawer-library'), false, where('Escape in the panels closes the drawer'));
  assert.ok((await box(page, '.im-content')).right > beside.right + 100, where('the content takes its width back'));
  assert.equal(await page.evaluate(() => document.querySelector('.im-shell').hasAttribute('data-im-drawer-open')), false, where('and the shell has no drawer open'));
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.im-content input')), true, where('and focus stays in the field'));
  await page.click('#anchor');
  await page.focus('#drawer-library-field');
  await press(page, 'Escape');
  assert.equal((await active(page)).id, 'anchor', where('from inside the drawer, focus is back on its control'));
  await page.click('#anchor');
  await page.click('#anchor');
  await page.waitForTimeout(50);
  assert.equal(await shown('drawer-library'), false, where('its control closes it and does not open it again'));
  await page.click('#anchor');
  await page.focus('#anchor');
  await press(page, 'Enter');
  assert.equal(await shown('drawer-library'), false, where('and so does Enter on the control, with focus beside the open drawer'));

  // From inside, a drawer covers the one it came from; Escape uncovers it.
  await page.click('#anchor');
  await page.click('#drawer-library [data-child]');
  assert.equal(await shown('drawer-details'), true, where('a drawer opens from inside another'));
  assert.equal(await shown('drawer-library'), false, where('and covers it'));
  assert.equal(await inertAt(page, '#drawer-library'), true, where('the covered drawer cannot be reached'));
  await press(page, 'Escape');
  assert.equal(await shown('drawer-details'), false, where('Escape closes the top drawer'));
  assert.equal(await shown('drawer-library'), true, where('and the covered one is back'));
  assert.equal(await inertAt(page, '#drawer-library'), false, where('live again'));
  assert.equal((await active(page)).text, 'Details', where('focus is back on the control inside it'));

  // From outside, a drawer replaces the open ones.
  await page.click('#drawer-library [data-child]');
  await page.evaluate(() => { document.querySelector('.im-content input').focus(); window.__openDrawer(window.__settings); });
  assert.equal(await shown('drawer-settings'), true, where('a drawer opened from outside'));
  assert.equal(await page.evaluate(() => ['drawer-library', 'drawer-details'].some((id) => document.getElementById(id).open)), false, where('replaces every open drawer'));
  await press(page, 'Escape');

  // A drawer that refuses its cancel stays; a field that keeps Escape keeps it.
  await page.click('#anchor');
  await page.evaluate(() => (window.__refuse = true));
  await press(page, 'Escape');
  assert.equal(await shown('drawer-library'), true, where('a refused cancel keeps the drawer'));
  await page.evaluate(() => (window.__refuse = false));
  await page.evaluate(() => document.querySelector('.im-content input').setAttribute('data-keeps-escape', ''));
  await page.focus('.im-content input');
  await press(page, 'Escape');
  assert.equal(await shown('drawer-library'), true, where('Escape in a field that keeps it leaves the drawer'));
  await page.evaluate(() => document.querySelector('.im-content input').removeAttribute('data-keeps-escape'));

  // A menu over the drawer closes first; a dialog over it makes it inert and closes first.
  await page.click('#drawer-library [data-more]');
  assert.equal(await count(page, '.im-shell .im-menu'), 1, where('a menu opens from inside the drawer'));
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-shell .im-menu'), 0, where('the first Escape closes the menu'));
  assert.equal(await shown('drawer-library'), true, where('and the drawer stays'));
  await page.evaluate(() => void window.__imagoSurfaces.confirm(document.querySelector('.im-shell'), { title: 'Sure?', body: 'Really.', confirm: 'Yes', cancel: 'No' }));
  assert.equal(await inertAt(page, '#drawer-library'), true, where('a dialog makes the drawer inert'));
  assert.equal(await page.evaluate(() => window.__openDrawer(window.__settings)), false, where('and no drawer opens under it'));
  await press(page, 'Escape');
  assert.equal(await count(page, '.im-dialog[role="alertdialog"]'), 0, where('Escape closes the dialog first'));
  assert.equal(await inertAt(page, '#drawer-library'), false, where('the drawer is live again'));
  await press(page, 'Escape');
  assert.equal(await shown('drawer-library'), false, where('the next Escape closes the drawer'));
  assert.equal(await count(page, '[inert], [data-im-covered], [data-im-layer="drawer"]'), 0, where('nothing is left behind'));

  // Narrower than 900px the drawer overlaps the panels instead (the redraw removes this test's own drawers after).
  await page.evaluate(() => window.__imago.set({ width: 860 }));
  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'drawer-narrow';
    dialog.innerHTML = '<p>Narrow</p>';
    document.querySelector('.im-shell').append(dialog);
    window.__imagoSurfaces.openDialogDrawer(dialog);
  });
  const narrow = await box(page, '.im-content');
  const narrowDrawer = await box(page, '#drawer-narrow');
  assert.ok(narrow.right > narrowDrawer.left + 50, where(`at 860 the drawer overlaps the content (${narrow.right} vs ${narrowDrawer.left})`));
  await press(page, 'Escape');
  assert.equal(await page.evaluate(() => document.querySelector('.im-shell').hasAttribute('data-im-drawer-open')), false, where('closed'));
  await fresh(page); // the sample shell again, its inspector open
}

export default async (page, url) => {
  await formDialogs(page);
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      await menus(page, look, theme);
      await dialogs(page, look, theme);
      await formDialogPlacement(page, look, theme);
      await sheets(page, look, theme);
      await drawers(page, look, theme);
      await inspectors(page, look, theme);
      await palettes(page, look, theme);
    }
  }
  await everyApp(page);
  await viewsMenu(page);
  await paneSheets(page);
  await sheetOpeners(page);
  await dialogEdges(page);
  await literalText(page);
  await failures(page);
  await notices(page, url);
};
