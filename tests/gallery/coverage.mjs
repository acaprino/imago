// Every class the package styles is drawn by the gallery. The test opens every surface of the page once, through the
// hooks the other tests drive (window.__imago, window.__imagoSurfaces, window.__imagoPanelState), in the five apps, both
// looks, both themes, with the glass, and at the widths of the three breakpoints, and records every class that is ever
// on an element: a MutationObserver sees a class that is on an element only for a moment (a menu that was opened and
// closed, a tab held in a drag). Each im- class that css/ styles must have been seen; the test prints those that were not
// and fails.
//
// Two lists are the exceptions, each class with its reason, and each list is kept true: a listed class that the gallery
// draws, or that css/ no longer styles, fails the test as well.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { namesDefined } from '../../scripts/check/names.mjs';
import { parseSource } from '../../scripts/check/source.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPS = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];

/**
 * Classes css/ styles that nothing in the package writes and no app of the family uses: no file of ts/, react/ or gallery/
 * names them, no test does, and neither do the sources of Muro, Mukade, Shinatama, Xiox, Daodan, Ethel and artcraft-web.
 * They are to be removed from css/ (and added to the mapping table) once the rewrite of css/ is merged; until then the
 * test tolerates them and prints them.
 */
export const UNUSED_PENDING_REMOVAL = new Map([
  ['im-path', 'css/content.css: a muted one-line path of 300px, hidden under 850. Nothing writes it: the path of a file is im-file-location (fileWorkspace), of a field im-path-field (pathField).'],
]);

/**
 * Classes that are on an element only while something runs, which this test does not drive, each with its reason. A
 * class it can drive is driven instead (the tab held in a drag of the tiling workspace is).
 */
export const WHILE_RUNNING = new Map([]);

/** The im- classes that the stylesheets of css/ style (the tiling workspace's included). */
function stylesheetClasses() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.css')) files.push(path);
    }
  };
  walk(join(ROOT, 'css'));
  const sources = files.map((file) => parseSource(relative(ROOT, file).replaceAll('\\', '/'), readFileSync(file, 'utf8')));
  const { classes } = namesDefined(sources);
  return [...classes].sort();
}

// Runs in the page before its scripts: records every class of every element that is ever in the document.
function recordClasses() {
  const seen = new Set();
  window.__gallerySeen = seen;
  const note = (el) => {
    const value = el.getAttribute?.('class');
    if (value) for (const name of value.split(/\s+/)) if (name) seen.add(name);
  };
  const sweep = (node) => {
    if (node.nodeType !== 1) return;
    note(node);
    for (const el of node.querySelectorAll('[class]')) note(el);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        // The value before the change too: a class taken off again before this ran was still on the element.
        for (const name of (record.oldValue ?? '').split(/\s+/)) if (name) seen.add(name);
        note(record.target);
      } else for (const node of record.addedNodes) sweep(node);
    }
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  window.__gallerySweep = () => sweep(document.documentElement);
}

const show = async (page, state) => {
  await page.evaluate((s) => window.__imago.set({ glass: false, width: 1160, ...s }), state);
  await page.waitForFunction(({ app, look }) => {
    const root = document.getElementById('g-window');
    return root?.dataset.imApp === app && root.dataset.imLook === look;
  }, { app: state.app, look: state.look ?? 'smooth' });
};

// The surfaces of the live shell, opened and closed through the gallery's hooks.
async function openSurfaces(page) {
  // The palette, from its key, with a word that matches no command.
  await page.locator('#g-window .im-shell').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Control+K');
  await page.waitForSelector('#g-window .im-palette');
  await page.keyboard.type('zzzz');
  await page.keyboard.press('Escape');

  await page.evaluate(async () => {
    const api = window.__imagoSurfaces;
    const shell = document.querySelector('#g-window .im-shell');
    const anchor = document.createElement('button');
    anchor.type = 'button';
    anchor.className = 'im-btn';
    anchor.textContent = 'Actions';
    shell.querySelector('.im-content .im-panel-body').prepend(anchor);
    const settle = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

    // A menu with every kind of item: a key, a reason it is not available, a rule, a danger item, a radio choice.
    let choice = 'First';
    const closeMenu = api.openMenu(anchor, [
      { label: 'Check now', keys: 'r', run() {} },
      { label: 'Rename', keys: 'F2', disabled: 'Select one item first', run() {} },
      'separator',
      ...['First', 'Second'].map((label) => ({ label, checked: () => choice === label, run() { choice = label; } })),
      { label: 'Stop managing', danger: true, run() {} },
    ]);
    await settle();
    closeMenu?.();

    // A sheet under its anchor, with the row of its actions.
    const form = document.createElement('div');
    form.innerHTML = '<label class="im-field"><span class="im-field-label">Rename thread</span><span class="im-input"><input type="text" value="Tax rounding bug"></span></label><div class="im-sheet-actions"><button type="button" class="im-btn im-btn--ghost">Cancel</button><button type="button" class="im-btn im-btn--primary">Rename</button></div>';
    const closeSheet = api.openSheet(anchor, form);
    await settle();
    closeSheet();

    // A form dialog, wide, with its head, body and foot.
    const formDialog = api.openFormDialog(shell, { title: 'Edit harness', subtitle: 'Claude Code', wide: true, closeLabel: 'Close' });
    formDialog.body.innerHTML = '<label class="im-field"><span class="im-field-label">Name</span><span class="im-input"><input value="Claude Code"></span></label>';
    formDialog.foot.innerHTML = '<button type="button" class="im-btn im-btn--primary">Save</button>';
    await settle();
    formDialog.close();

    // An app's own native dialog in the layer stack.
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Native form');
    dialog.innerHTML = '<form class="im-form" method="dialog"><button class="im-btn" type="submit">Close</button></form>';
    const content = api.openContentDialog(shell, dialog);
    await settle();
    content.close();

    // A drawer: an app's own dialog beside the panels, not modal. It is closed again by its own cancel.
    const side = document.createElement('dialog');
    side.setAttribute('aria-label', 'Side form');
    side.innerHTML = '<form class="im-form"><button class="im-btn" type="button">Close</button></form>';
    shell.append(side);
    api.openDialogDrawer(side, { opener: anchor });
    await settle();
    side.close();
    side.remove();

    // A panel over the whole of its positioned host, by role (uiTraits 'overlay').
    const { uiPart, uiTraits } = window.__imagoParts;
    const over = uiTraits(uiPart('stack'), 'overlay');
    shell.querySelector('.im-content').append(over);
    await settle();
    over.remove();

    // A destructive confirmation, answered no.
    const answer = api.confirm(shell, { title: 'Delete 8 items permanently?', body: 'This cannot be undone.', confirm: 'Delete 8 items', cancel: 'Cancel', danger: true });
    await settle();
    document.querySelector('.im-dialog .im-btn:not(.im-btn--danger):not(.im-btn--confirm-danger)')?.click();
    await answer;

    // Notices: a plain one, one with an action, an error with its word and its dismiss button.
    api.notify(shell, 'Ran: Analyze');
    api.notify(shell, '8 items moved to the bin', { action: { label: 'Undo', run() {} } });
    api.notify(shell, 'The folder could not be read', { tone: 'err' });
    await settle();
    api.clearNotices(shell);

    // The inspector, open and covered by a second view.
    const details = document.createElement('div');
    details.innerHTML = '<header class="im-panel-header"><h4 class="im-panel-title">Session</h4></header><div class="im-panel-body"><p>billing-service</p></div><div class="im-panel-foot"><button type="button" class="im-btn">Close</button></div>';
    api.inspector.open(details, anchor);
    const more = document.createElement('p');
    more.textContent = 'Event 12';
    api.inspector.push(more, anchor);
    await settle();
    api.inspector.close();
    anchor.remove();
  });
}

// The surfaces of the page patterns (the file dialog, the sheet of a form), and a tab of the tiling workspace dragged to
// another pane: what is on an element only while a tab is held is seen then. The tiling workspace is found by the
// gallery's own attribute and by roles, not by its classes, which are to be renamed.
async function drivePatterns(page) {
  await page.evaluate(async () => {
    const settle = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    for (const open of [window.__imagoPatterns.openFileDialog, window.__imagoPatterns.openFormSheet]) {
      const close = open();
      await settle();
      close();
    }
  });
  const tab = page.locator('[data-g-tiling] [role="tab"]').first();
  await tab.scrollIntoViewIfNeeded();
  const from = await tab.boundingBox();
  const to = await page.locator('[data-g-tiling] [role="tabpanel"]').nth(1).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
}

// The panel states the gallery shows, each switched through all three.
async function switchPanelStates(page) {
  await page.evaluate(() => {
    const api = window.__imagoPanelState;
    if (!api) return;
    for (const panel of Object.values(api.panels)) {
      api.setPanelState(panel, { kind: 'loading', rows: 2 });
      api.setPanelState(panel, { kind: 'error', text: 'Could not load.', retry: { label: 'Retry', run() {} } });
      api.setPanelState(panel, { kind: 'empty', text: 'Nothing yet.' });
    }
  });
}

// The responsive shell: the sidebar folded and unfolded at 1160, the rail at 840, the drawer and the Views menu at 560.
async function responsive(page, app) {
  const collapse = page.locator('#g-window .im-sidebar-collapse');
  if (await collapse.isVisible()) {
    await collapse.click();
    await collapse.click();
  }
  await page.evaluate((a) => window.__imago.set({ app: a, width: 840 }), app);
  await page.evaluate((a) => window.__imago.set({ app: a, width: 560 }), app);
  const views = page.locator('#g-window .im-views-menu');
  if (await views.isVisible()) {
    await views.click();
    await page.keyboard.press('Escape');
  }
  const toggle = page.locator('#g-window .im-sidebar-toggle');
  if (await toggle.isVisible()) {
    await toggle.click();
    await page.keyboard.press('Escape');
  }
  await page.evaluate((a) => window.__imago.set({ app: a, width: 1160 }), app);
}

export default async function (page, url) {
  await page.addInitScript(recordClasses);
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.__imago && window.__imago.ready));

  for (const app of APPS) {
    await show(page, { app, look: 'smooth', theme: 'dark' });
    await openSurfaces(page);
    await switchPanelStates(page);
    await responsive(page, app);
    await show(page, { app, look: 'oni', theme: 'light' });
  }
  await show(page, { app: 'xiox', look: 'smooth', theme: 'light', glass: true });
  await show(page, { app: 'xiox', look: 'oni', theme: 'dark', glass: true });
  await show(page, { app: 'xiox', look: 'smooth', theme: 'dark' });
  await drivePatterns(page);

  await page.evaluate(() => window.__gallerySweep());
  const seen = new Set(await page.evaluate(() => [...window.__gallerySeen]));
  const im = stylesheetClasses();
  const styled = new Set(im);

  // The lists say true things: each listed class is styled by css/, and is not drawn by the gallery.
  for (const [name, list] of [...[...UNUSED_PENDING_REMOVAL.keys()].map((n) => [n, 'UNUSED_PENDING_REMOVAL']), ...[...WHILE_RUNNING.keys()].map((n) => [n, 'WHILE_RUNNING'])]) {
    assert.ok(styled.has(name), `${name} is in ${list}, but css/ no longer styles it: take it out of the list`);
    assert.ok(!seen.has(name), `${name} is in ${list}, but the gallery draws it: take it out of the list`);
  }
  if (UNUSED_PENDING_REMOVAL.size) {
    console.log(`      pending removal from css/ (nothing writes them): ${[...UNUSED_PENDING_REMOVAL.keys()].join(', ')}`);
  }

  const missing = im.filter((name) => !UNUSED_PENDING_REMOVAL.has(name) && !WHILE_RUNNING.has(name)).filter((name) => !seen.has(name));
  // The whole list, one class a line: the runner shows only the first lines of an error.
  if (missing.length) console.log(`      css/ styles ${missing.length} classes the gallery never draws:\n        ${missing.join('\n        ')}`);
  assert.deepEqual(missing, [], `css/ styles ${missing.length} classes the gallery never draws (listed above)`);
}
