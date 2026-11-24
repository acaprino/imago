// node tests/demo.mjs, after `npm run build` (it opens what `npm run demo:web` built, examples/demo/dist).
// The demo app in a browser, and in a window that only pretends to be Tauri's. At each width where the frame changes and in
// both schemes nothing overflows, the views are where the width puts them and the shared controls keep their places; then
// the keys, the palette, the focus, the notices, a screen that fails, and what the window is told. Photographs of the page
// go to examples/demo/shots.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'examples', 'demo', 'dist');
const shots = join(root, 'examples', 'demo', 'shots');
rmSync(shots, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });
const policy = JSON.parse(readFileSync(join(root, 'examples/demo/src-tauri/tauri.conf.json'), 'utf8')).app.security.csp;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
const WIDTHS = [340, 500, 620, 860, 1000, 1440];
const SHOTS = [340, 620, 860, 1440];
const VIEWS = ['items', 'new', 'notices', 'failure'];

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(dist, `.${path.endsWith('/') ? `${path}index.html` : path}`);
  if (!file.startsWith(dist + sep) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'content-security-policy': policy });
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

/**
 * The window of Tauri as the page finds it: it answers every call and writes it down, but for those of `window.refused`. The
 * plugin answers late, as off the window's thread; `together` is the most calls of a command that were in the air at once.
 */
function fakeWindow({ kept = null, refused = [] }) {
  window.calls = [];
  window.refused = refused;
  window.log = [];
  window.together = {};
  const late = { 'plugin:imago-shell|set_theme': 400, 'plugin:imago-shell|chrome': 1000 };
  const air = {};
  const handlers = [];
  const listeners = {};
  window.emit = (event, payload) => { for (const handler of listeners[event] ?? []) handlers[handler]({ event, id: 1, payload }); };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
    transformCallback: (callback) => handlers.push(callback) - 1,
    unregisterCallback: () => {},
    invoke: async (command, args) => {
      window.calls.push([command, args]);
      window.log.push(command);
      air[command] = (air[command] ?? 0) + 1;
      window.together[command] = Math.max(window.together[command] ?? 0, air[command]);
      if (late[command]) await new Promise((done) => setTimeout(done, late[command]));
      air[command] -= 1;
      window.log.push(`${command} answered`);
      if (window.refused.includes(command)) throw new Error('refused');
      if (command === 'plugin:event|listen') (listeners[args.event] ??= []).push(args.handler);
      return command === 'plugin:window|is_maximized' ? false : command === 'plugin:event|listen' ? 1 : command === 'plugin:imago-shell|kept_theme' ? kept : null;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
}

const browser = await chromium.launch();
const failures = [];

/** Opens the page in a context of its own, with `scheme` as the choice kept, and runs `look` on it; an error of the page fails it. */
async function onPage(name, { width = 1440, scheme, system = 'light', own = false, kept, refused, reduced = false, expected } = {}, look) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: system, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const problems = [];
  const scripts = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !(expected && message.text().includes(expected))) problems.push(message.text()); });
  page.on('requestfailed', (request) => problems.push(`${request.url()} failed`));
  page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname); });
  if (scheme) await page.addInitScript((value) => { if (!localStorage.getItem('imago.scheme')) localStorage.setItem('imago.scheme', value); }, scheme);
  if (own) await page.addInitScript(fakeWindow, { kept, refused });
  try {
    await page.goto(url);
    await page.waitForSelector('[data-slot="app-shell"]');
    await page.evaluate(() => document.fonts.ready);
    await look(page, scripts);
    assert.deepEqual(problems, []);
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${String(error?.stack ?? error).split('\n').slice(0, 24).join('\n     ')}${problems.length ? `\n     the page said: ${problems.join(' | ')}` : ''}`);
    await page.screenshot({ path: join(shots, `FAIL ${name.replace(/[^\w ]/g, '')}.png`) }).catch(() => {});
  }
  await context.close();
}

/** How many movements of the page a clock runs: not those a scroll does. */
const movements = (page) => page.evaluate(() => document.getAnimations().filter(({ timeline }) => timeline === document.timeline).length);
/** Waits for what moves after a press. */
const still = (page) => page.evaluate(() => Promise.race([
  Promise.all(document.getAnimations().filter(({ timeline }) => timeline === document.timeline).map(({ finished }) => finished.catch(() => {}))),
  new Promise((done) => setTimeout(done, 1000)),
]).then(() => {}));

/** What sticks out of the page or of a region of the frame, sideways. */
const overflow = (page) => still(page).then(() => page.evaluate(() => {
  const out = [];
  const wide = document.documentElement;
  if (wide.scrollWidth > wide.clientWidth) out.push(`the page is ${wide.scrollWidth} wide in ${wide.clientWidth}`);
  for (const slot of ['title-bar', 'app-shell-tabs', 'app-shell-status', 'sidebar', 'app-shell-content', 'app-shell-actions', 'app-shell-footer', 'app-shell-bottom', 'panel-header', 'panel-tools', 'panel-body', 'panel-footer', 'inspector-body', 'inspector-footer']) {
    for (const region of document.querySelectorAll(`[data-slot="${slot}"]`)) {
      if (region.clientWidth > 1 && region.scrollWidth > region.clientWidth) out.push(`${slot} is ${region.scrollWidth} wide in ${region.clientWidth}`);
    }
  }
  for (const control of document.querySelectorAll('button, input, textarea')) {
    const box = control.getBoundingClientRect();
    if (box.width > 1 && (box.left < 0 || box.right > innerWidth)) out.push(`"${control.textContent || control.getAttribute('aria-label')}" goes from ${box.left} to ${box.right} in ${innerWidth}`);
  }
  return out;
}));

const scheme = (page) => page.evaluate(() => document.documentElement.dataset.scheme);
const tab = (page, view) => page.locator('[data-slot="toolbar-tab"]').nth(VIEWS.indexOf(view));
const open = async (page, view) => {
  await tab(page, view).click();
  await page.locator(`[data-slot="toolbar-tab"][aria-current="page"]`).waitFor();
  assert.equal(await tab(page, view).getAttribute('aria-current'), 'page', view);
};
const shot = async (page, name) => { await still(page); await page.screenshot({ path: join(shots, `${name}.png`) }); };
const palette = async (page, text) => {
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.type(text);
};
/** The region of the frame that has the focus. */
const region = (page) => page.evaluate(() => {
  const at = document.activeElement;
  if (at === document.body) return 'nowhere';
  const held = at?.closest('[data-slot="app-shell-skip"], [data-slot="title-bar"], [data-slot="sidebar"], [data-slot="inspector"], [data-slot="app-shell-content"], [data-slot="app-shell-actions"], [data-slot="app-shell-footer"], [data-toasts]');
  return held?.hasAttribute('data-toasts') ? 'notices' : held?.getAttribute('data-slot') ?? at?.tagName.toLowerCase();
});

/** The places of the controls every view shares, from the start of the bar to its end. */
const places = async (page) => {
  const box = async (locator) => {
    const found = await locator.boundingBox();
    return found && { x: Math.round(found.x), y: Math.round(found.y), width: Math.round(found.width) };
  };
  return {
    brand: await box(page.locator('[data-slot="toolbar-brand"]')),
    views: await box(page.locator('[data-slot="toolbar-tabs"]')),
    commands: await box(page.locator('[data-slot="title-bar"]').getByRole('button', { name: /^Commands/ })),
  };
};

const FORM = (width, own) => (width >= 860 ? 'title-bar' : width < 620 && !own ? 'app-shell-bottom' : 'app-shell-tabs');

/** Every view at one width: no overflow, the views in their one place, the shared controls where they were; a photograph of each. */
async function everyView(page, name, width, own) {
  const photographed = SHOTS.includes(width);
  const first = [];
  for (const view of VIEWS) {
    await open(page, view);
    if (view === 'items' && width >= 1000) {
      await page.getByRole('button', { name: /^Model cache/ }).click();
      await page.locator('[data-slot="inspector-body"]').waitFor();
    }
    if (photographed) await shot(page, `${name}-${view}`);
    assert.deepEqual(await overflow(page), [], `${view}: overflow`);
    assert.equal(await page.locator('[data-slot="toolbar-tabs"]').count(), 1, 'the views are drawn once');
    assert.equal(await page.locator(`[data-slot="${FORM(width, own)}"] [data-slot="toolbar-tabs"]`).count(), 1, `the views are in ${FORM(width, own)}`);
    const now = await places(page);
    if (!first.length) {
      first.push(now);
      assert.ok(now.brand.x < now.commands.x, 'the brand comes before Commands');
      if (width >= 860) assert.ok(now.brand.x < now.views.x && now.views.x + now.views.width <= now.commands.x, 'the views are between the brand and Commands');
      if (own) {
        const buttons = await page.locator('[data-slot="window-controls"]').boundingBox();
        assert.ok(now.commands.x + now.commands.width <= buttons.x && Math.round(buttons.x + buttons.width) === width, 'the window buttons are the last, at the corner');
      }
    } else assert.deepEqual(now, first[0], `${view}: the shared controls have moved`);
  }
  await open(page, 'items');
  if (width < 1000) {
    await page.getByRole('button', { name: /^Model cache/ }).click();
    await page.locator('[data-slot="inspector-body"]').waitFor();
    if (photographed) await shot(page, `${name}-details`);
    assert.deepEqual(await overflow(page), [], 'the details: overflow');
  }
}

try {
  for (const chosen of ['dark', 'light']) {
    for (const width of WIDTHS) {
      // The system says the other scheme: what is drawn is the choice.
      await onPage(`${chosen} at ${width}`, { width, scheme: chosen, system: chosen === 'dark' ? 'light' : 'dark', expected: 'items.json' }, async (page) => {
        await everyView(page, `${chosen}-${width}`, width, false);
        assert.equal(await scheme(page), chosen);
      });
    }
    for (const width of [500, 1440]) {
      await onPage(`${chosen} at ${width}, in a window`, { width, scheme: chosen, own: true, expected: 'items.json' }, async (page) => {
        await everyView(page, `window-${chosen}-${width}`, width, true);
        await shot(page, `window-${chosen}-${width}`);
      });
    }
  }

  await onPage('the look: dark until the person chooses, boxed keys, strong borders, bold tabs, a tall strip, the font of the system, compact', { system: 'light' }, async (page) => {
    assert.equal(await scheme(page), 'dark');
    const look = await page.evaluate(() => {
      const root_ = document.documentElement;
      const style = getComputedStyle(root_);
      const color = (slot) => getComputedStyle(document.querySelector(`[data-slot="${slot}"]`)).backgroundColor;
      return {
        lang: root_.lang, keys: root_.dataset.keys, controls: root_.dataset.controls, density: root_.dataset.density,
        tabs: root_.dataset.tabs, font: [root_.dataset.font, getComputedStyle(document.body).fontFamily.split(',')[0]],
        loaded: [...document.fonts].filter(({ status }) => status !== 'unloaded').map(({ family }) => family),
        weights: [...document.querySelectorAll('[data-slot="toolbar-tab"]')].map((tab) => getComputedStyle(tab).fontWeight),
        strip: [document.querySelector('[data-slot="app-shell-status"]').getBoundingClientRect().height, getComputedStyle(document.querySelector('[data-slot="app-shell-status"]')).fontSize],
        segment: ['toggle-group', 'toggle-group-item'].map((slot) => getComputedStyle(document.querySelector(`[data-slot="${slot}"]`)).borderTopLeftRadius),
        commands: (({ borderTopColor, color: ink }) => [borderTopColor, ink])(getComputedStyle(document.querySelector('[data-slot="title-bar"] [data-variant="quiet"]'))),
        control: style.getPropertyValue('--density-control-md'), radius: [style.getPropertyValue('--radius-md'), style.getPropertyValue('--radius-lg')],
        ground: color('app-shell'), sheet: color('app-shell-work'),
      };
    });
    assert.deepEqual(look, { lang: 'en', keys: 'boxed', controls: 'strong', density: 'compact', tabs: 'bold', font: ['system', '"Segoe UI Variable Text"'], loaded: [], weights: ['700', '500', '500', '500'], strip: [40, '14px'], segment: ['6px', '4px'], commands: ['rgb(42, 50, 64)', 'rgb(154, 165, 184)'], control: '32px', radius: ['6px', '10px'], ground: 'rgb(18, 22, 30)', sheet: 'rgb(26, 32, 44)' });
  });

  await onPage('the light look: its ground and its sheet', { scheme: 'light', system: 'dark' }, async (page) => {
    const color = (slot) => page.evaluate((name) => getComputedStyle(document.querySelector(`[data-slot="${name}"]`)).backgroundColor, slot);
    assert.deepEqual([await color('app-shell'), await color('app-shell-work')], ['rgb(246, 247, 249)', 'rgb(255, 255, 255)']);
  });

  await onPage('the palette: the views and the look, and the choice is kept', { system: 'dark' }, async (page) => {
    await palette(page, '');
    const options = await page.getByRole('option').allTextContents();
    const at = (word) => options.findIndex((option) => option.includes(word));
    for (const word of ['Check all items', 'Search in this view', 'Go to Items', 'Go to Failure', 'Light theme', 'System theme']) assert.notEqual(at(word), -1, `${word} is not in ${options.join(' | ')}`);
    assert.ok(at('Go to Items') < at('Go to New item') && at('Go to Failure') < at('Light theme'), options.join(' | '));
    await shot(page, 'palette');
    await page.keyboard.type('light theme');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.documentElement.dataset.scheme === 'light');
    await page.reload();
    await page.waitForSelector('[data-slot="app-shell"]');
    assert.equal(await scheme(page), 'light');
  });

  await onPage('a view opened from the palette gives the focus to its content', {}, async (page) => {
    await palette(page, 'new item');
    await page.keyboard.press('Enter');
    await page.getByRole('textbox', { name: 'Name' }).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'app-shell-content');
  });

  await onPage('Ctrl+F is the search of the view, and where there is none the shell says so', {}, async (page) => {
    assert.ok((await page.locator('[data-slot="key-hints"]').textContent()).includes('Search in this view'));
    await page.keyboard.press('Control+f');
    await page.waitForFunction(() => document.activeElement?.getAttribute('type') === 'search');
    await open(page, 'new');
    assert.ok(!(await page.locator('[data-slot="key-hints"]').textContent()).includes('Search in this view'));
    await page.keyboard.press('Control+f');
    await page.getByText('This view has no search.').waitFor();
  });

  await onPage('the segmented filter of the list is beside the search, and under it on a phone', {}, async (page) => {
    const rows = () => page.getByRole('list', { name: 'Items' }).getByRole('listitem').count();
    const box = (locator) => locator.boundingBox();
    const filter = page.getByRole('group', { name: 'Which items' });
    const [field, group] = [await box(page.getByRole('searchbox')), await box(filter)];
    assert.ok(group.x >= field.x + field.width && Math.abs(group.y + group.height / 2 - field.y - field.height / 2) <= 1, 'the filter is not beside the search');
    await filter.getByRole('button', { name: 'Caution' }).click();
    assert.equal(await rows(), 2);
    await page.waitForTimeout(300); // The mark of the filter is moved by a script, which `still` does not see.
    await shot(page, 'filter');
    await filter.getByRole('button', { name: 'All' }).click();
    assert.equal(await rows(), 6);
    await page.setViewportSize({ width: 340, height: 800 });
    await page.locator('[data-slot="app-shell-bottom"]').waitFor();
    const [under, over] = [await box(filter), await box(page.getByRole('searchbox'))];
    assert.ok(under.y >= over.y + over.height && over.width > 250, 'the filter is not under the search');
  });

  await onPage('F6 goes round the regions, and Tab goes through them in the order they are read', {}, async (page) => {
    await page.getByRole('button', { name: /^Model cache/ }).click();
    await page.locator('[data-slot="inspector-body"]').waitFor();
    await page.evaluate(() => document.activeElement.blur());
    const round = [];
    for (let k = 0; k < 6; k++) {
      await page.keyboard.press('F6');
      round.push(await region(page));
    }
    assert.deepEqual(round, ['title-bar', 'sidebar', 'app-shell-content', 'inspector', 'notices', 'title-bar']);
    await page.reload();
    await page.getByRole('button', { name: /^Model cache/ }).click();
    await page.evaluate(() => document.activeElement.blur());
    const order = [];
    // From the top of the page: a press on nothing is where the round begins.
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute('tabindex'); });
    for (let k = 0; k < 40; k++) {
      await page.keyboard.press('Tab');
      const now = await region(page);
      if (order.at(-1) !== now) order.push(now);
      if (now === 'app-shell-actions') break;
    }
    assert.deepEqual(order, ['app-shell-skip', 'title-bar', 'sidebar', 'app-shell-content', 'inspector', 'app-shell-actions']);
  });

  await onPage('the focus goes to the content when what held it goes', { width: 1000 }, async (page) => {
    await tab(page, 'notices').focus();
    await page.setViewportSize({ width: 500, height: 800 });
    await page.locator('[data-slot="app-shell-bottom"]').waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'app-shell-content');
    await page.locator('[data-slot="app-shell-content"] button').first().focus();
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.locator('[data-slot="title-bar"] [data-slot="toolbar-tabs"]').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'BUTTON', 'what stays keeps the focus');
  });

  await onPage('the sidebar collapses to its rail and opens again, by its button and by the palette, and is kept', {}, async (page) => {
    const sidebar = page.locator('[data-slot="sidebar"]');
    const button = page.locator('[data-slot="sidebar-collapse"]');
    const name = page.getByText('States', { exact: true });
    const top = async (locator) => (await locator.boundingBox()).y;
    const is = async (collapsed, why) => {
      await page.waitForFunction((wanted) => document.querySelector('[data-slot="sidebar"]').hasAttribute('data-collapsed') === wanted, collapsed);
      await still(page);
      const { width } = await sidebar.boundingBox();
      assert.ok(collapsed ? width < 60 : width === 256, `${why}: the sidebar is ${width} wide`);
      assert.deepEqual([await button.getAttribute('aria-expanded'), await name.isVisible()], [String(!collapsed), !collapsed], why);
      assert.ok(await top(button) < await top(sidebar.getByRole('listitem').first()), `${why}: the button is at the head`);
      assert.deepEqual(await overflow(page), [], why);
    };
    const kept = () => page.evaluate(() => localStorage.getItem('imago.sidebar'));
    const row = async (word) => {
      await palette(page, word);
      return page.getByRole('option').filter({ hasText: 'Collapse the sidebar' });
    };
    await is(false, 'at first');
    assert.equal(await page.locator('[data-slot="sidebar-group-heading"]').count(), 0, 'the name of the list is its head');
    await button.focus();
    await page.keyboard.press('Enter');
    await is(true, 'after Enter on the button');
    assert.equal(await kept(), 'collapsed');
    assert.ok(await button.evaluate((element) => element === document.activeElement), 'the button keeps the focus');
    await shot(page, 'rail');
    // A place of the rail has its name, and takes there.
    await sidebar.getByRole('button', { name: /^Failed/ }).click();
    assert.equal(await page.getByRole('list', { name: 'Items' }).getByRole('listitem').count(), 1);
    await page.reload();
    await page.waitForSelector('[data-slot="app-shell"]');
    await is(true, 'after a reload');
    await button.focus();
    await page.keyboard.press('Space');
    await is(false, 'after Space on the button');
    assert.equal(await kept(), 'open');
    await button.click();
    await is(true, 'after a press');

    const open_ = await row('expand');
    assert.equal(await open_.getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Enter');
    await is(false, 'after the command');
    const collapse = await row('collapse');
    assert.equal(await collapse.getAttribute('aria-checked'), 'false');
    await page.keyboard.press('Enter');
    await is(true, 'after the command again');
    await page.reload();
    await page.waitForSelector('[data-slot="app-shell"]');
    await is(true, 'after a reload again');
  });

  await onPage('where the width decides the form of the sidebar there is nothing to choose, and the choice stays', {}, async (page) => {
    const sidebar = page.locator('[data-slot="sidebar"]');
    const button = page.locator('[data-slot="sidebar-collapse"]');
    const at = async (width) => {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForFunction((form) => document.querySelector('[data-slot="app-shell"]').dataset.sidebar === form, width >= 850 ? 'full' : width >= 620 ? 'rail' : 'drawer');
      await still(page);
    };
    const dimmed = async () => {
      await palette(page, 'collapse');
      const said = await page.getByRole('option').filter({ hasText: 'Collapse the sidebar' }).getAttribute('aria-disabled');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      return said === 'true';
    };
    for (const collapsed of [false, true]) {
      await at(1000);
      if (collapsed) await button.click();
      assert.deepEqual([await sidebar.getAttribute('data-collapsed') !== null, await button.count(), await dimmed()], [collapsed, 1, false], 'at 1000');
      await at(700);
      assert.deepEqual([await sidebar.getAttribute('data-collapsed') !== null, await button.count(), await dimmed()], [true, 0, true], 'at 700');
      await at(500);
      assert.equal(await sidebar.count(), 0, 'at 500 it is out of the page');
      assert.ok(await dimmed(), 'at 500');
      await page.locator('[data-slot="title-bar"] button').first().click();
      const drawer = page.getByRole('dialog');
      await drawer.getByText('States', { exact: true }).last().waitFor();
      assert.deepEqual([await drawer.locator('[data-slot="sidebar"]').getAttribute('data-collapsed'), await button.count()], [null, 0], 'the drawer is whole');
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'hidden' });
    }
    await at(1000);
    assert.notEqual(await sidebar.getAttribute('data-collapsed'), null, 'the choice is still there');
  });

  await onPage('the drawer of the sidebar opens from the bar, and a place closes it', { width: 500 }, async (page) => {
    await page.locator('[data-slot="title-bar"] button').first().click();
    await page.getByRole('dialog').waitFor();
    await shot(page, 'drawer');
    await page.getByRole('dialog').getByRole('button', { name: /^Failed/ }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('list', { name: 'Items' }).getByRole('listitem').count(), 1, 'the list is filtered');
  });

  await onPage('the notices: one goes by itself, one is undone, one takes the place of another, an error stays', {}, async (page) => {
    await open(page, 'notices');
    await page.getByRole('button', { name: 'Always the same' }).click();
    await page.getByRole('button', { name: 'Always the same' }).click();
    await page.getByText('The server is busy.').first().waitFor();
    assert.equal(await page.getByText('The server is busy.', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'One with Undo' }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await page.getByText('The item is back.').waitFor();
    await page.getByRole('button', { name: 'An error' }).click();
    await page.getByText('The server did not answer.').waitFor();
    await page.waitForTimeout(600);
    await shot(page, 'notices');
    assert.deepEqual(await overflow(page), []);
    await page.mouse.move(700, 200);
    await page.getByText('The item is back.').waitFor({ state: 'hidden', timeout: 15000 });
    assert.equal(await page.getByText('The server did not answer.').count(), 1, 'the error is gone');
    await page.getByRole('button', { name: /Close the notice: The server did not answer/ }).click();
    await page.getByText('The server did not answer.').waitFor({ state: 'hidden' });
  });

  await onPage('a screen that fails says so in its place, the bar stays, and it can be drawn again', { expected: 'items.json' }, async (page) => {
    await open(page, 'failure');
    await page.getByText('This screen could not be shown').waitFor();
    await page.getByText('items.json, line 12').waitFor();
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByText('This screen could not be shown').waitFor();
    await page.getByRole('button', { name: 'Mend the screen' }).click();
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByText('The screen is drawn').waitFor();
    assert.equal(await region(page), 'app-shell-content');
    await open(page, 'items');
  });

  await onPage('what sticks out is found', { width: 340 }, async (page) => {
    await page.evaluate(() => {
      const wide = document.createElement('button');
      wide.style.width = '2000px';
      document.querySelector('[data-slot="app-shell-content"]').append(wide);
    });
    assert.ok((await overflow(page)).length >= 2, 'a button of 2000px in a page of 340px is not found');
  });

  const MOTION = /\/motion-impl-[\w-]+\.js$/;
  await onPage('the line of a view grows from its middle', {}, async (page, scripts) => {
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-motion'));
    const line = await page.evaluate(async () => {
      const [from, to] = document.querySelectorAll('[data-slot="toolbar-tab"]');
      const scaled = () => [from, to].map((one) => parseFloat(getComputedStyle(one, '::after').scale));
      const before = scaled();
      to.click();
      await new Promise(requestAnimationFrame);
      const moves = document.getAnimations().filter(({ effect }) => effect.pseudoElement === '::after' && [from, to].includes(effect.target));
      const each = moves.map(({ transitionProperty, effect }) => [transitionProperty, effect.getTiming().duration]);
      for (const move of moves) {
        move.pause();
        move.currentTime = 40;
      }
      const during = scaled();
      const { transformOrigin, width } = getComputedStyle(to, '::after');
      for (const move of moves) move.finish();
      return { before, each, during, middle: Math.abs(parseFloat(transformOrigin) - parseFloat(width) / 2) < 1, after: scaled() };
    });
    assert.deepEqual([line.before, line.each, line.middle, line.after], [[1, 0], [['scale', 180], ['scale', 180]], true, [0, 1]]);
    for (const scale of line.during) assert.ok(scale > 0 && scale < 1, `the two lines are at ${line.during.join(' and ')}`);
    // So that the test below can fail: what moves by script is loaded here.
    assert.ok(scripts.some((script) => MOTION.test(script)), `nothing of the motion was loaded: ${scripts.join(' ')}`);
  });

  await onPage('a person who asked for less motion sees none', { reduced: true }, async (page, scripts) => {
    const moving = [];
    const look = async (what) => { if (await movements(page)) moving.push(what); };
    for (const view of VIEWS.slice(0, 3)) {
      await open(page, view);
      await look(view);
    }
    await open(page, 'items');
    await page.getByRole('group', { name: 'Which items' }).getByRole('button', { name: 'Open' }).click();
    await look('the filter');
    await page.getByRole('list', { name: 'Items' }).getByRole('button').first().click();
    await look('the details');
    await palette(page, 'notices');
    await look('the palette');
    await page.keyboard.press('Enter');
    await look('the palette that closes');
    await page.setViewportSize({ width: 500, height: 800 });
    await page.locator('[data-slot="title-bar"] button').first().click();
    await page.getByRole('dialog').waitFor();
    await look('the drawer');
    assert.deepEqual(moving, []);
    assert.deepEqual(scripts.filter((script) => MOTION.test(script)), []);
  });

  await onPage('what a press does is done at once, with the movements all but stopped', { own: true, width: 1000 }, async (page) => {
    await page.waitForFunction(() => window.calls.some(([name]) => name === 'plugin:imago-shell|ready'));
    const engine = await page.context().newCDPSession(page);
    await engine.send('Animation.enable');
    await engine.send('Animation.setPlaybackRate', { playbackRate: 0.001 });
    page.setDefaultTimeout(1500);
    await open(page, 'new');
    await page.getByRole('textbox', { name: 'Name' }).waitFor();
    assert.ok(await movements(page) > 0, 'nothing moves: the test shows nothing');
    await palette(page, 'go to items');
    await page.keyboard.press('Enter');
    await page.getByRole('list', { name: 'Items' }).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'app-shell-content');
    await page.getByRole('group', { name: 'Which items' }).getByRole('button', { name: 'Caution' }).press('Enter');
    assert.equal(await page.getByRole('list', { name: 'Items' }).getByRole('listitem').count(), 2);
    await page.getByRole('list', { name: 'Items' }).getByRole('button').first().press('Enter');
    await page.locator('[data-slot="inspector-body"]').waitFor();
    await page.evaluate(() => window.emit('window-shown', null));
    await page.getByText('The window is back.').waitFor();
  });

  const TAURI = /\/(?:core|event|window|webview)-[\w-]+\.js$/;
  await onPage('in a browser there are no window buttons, and nothing of Tauri is loaded', {}, async (page, scripts) => {
    for (const view of VIEWS.slice(0, 3)) await open(page, view);
    assert.equal(await page.locator('[data-slot="window-controls"]').count(), 0);
    assert.deepEqual(scripts.filter((script) => TAURI.test(script)), []);
    assert.ok(scripts.length > 0);
  });

  await onPage('in a window the bar has its buttons, and the window is told what it must be', { system: 'dark', own: true }, async (page, scripts) => {
    const calls = (command) => page.evaluate((name) => window.calls.filter(([each]) => each === name).map(([, args]) => args), command);
    const called = (command) => page.waitForFunction((name) => window.calls.some(([each]) => each === name), command);
    assert.equal(await page.locator('[data-slot="window-controls"] button').count(), 3);
    assert.equal(await page.locator('[data-slot="title-bar"][data-tauri-drag-region]').count(), 1);
    await called('plugin:imago-shell|ready');
    // So that the test above can fail: in a window what it looks for is loaded.
    assert.ok(scripts.some((script) => TAURI.test(script)), `nothing of Tauri was loaded: ${scripts.join(' ')}`);
    await page.waitForTimeout(400);
    assert.equal((await calls('plugin:imago-shell|ready')).length, 1, 'ready is said once');
    const log = await page.evaluate(() => window.log);
    assert.ok(log.indexOf('plugin:imago-shell|set_theme answered') < log.indexOf('plugin:imago-shell|ready'), 'the window is shown in its theme');

    assert.deepEqual(await calls('plugin:imago-shell|set_theme'), [{ theme: 'dark', resolved: 'dark' }]);
    // The system's look on a dark system draws the same scheme: the choice is told all the same.
    await palette(page, 'system theme');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.calls.filter(([name]) => name === 'plugin:imago-shell|set_theme').length === 2);
    assert.deepEqual((await calls('plugin:imago-shell|set_theme'))[1], { theme: 'system', resolved: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => window.calls.filter(([name]) => name === 'plugin:imago-shell|set_theme').length === 3);
    assert.deepEqual((await calls('plugin:imago-shell|set_theme'))[2], { theme: 'system', resolved: 'light' });

    const box = await page.locator('[data-window-control="maximize"]').boundingBox();
    assert.deepEqual((await calls('plugin:imago-shell|caption')).at(-1), { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) });
    await page.evaluate(() => window.emit('caption-maximize', { hover: true, pressed: false }));
    await page.locator('[data-window-control="maximize"][data-os-state="hover"]').waitFor();

    assert.deepEqual(await calls('plugin:imago-shell|chrome'), [], 'the window has its own title until the app says another');
    await page.getByRole('button', { name: 'Check all' }).click();
    await page.locator('[role="progressbar"][aria-valuenow="50"]').waitFor();
    await shot(page, 'window-job');
    await page.getByText('All items are checked.').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => window.calls.filter(([name]) => name === 'plugin:imago-shell|chrome').at(-1)[1].progress === null);
    const jobs = await calls('plugin:imago-shell|chrome');
    assert.deepEqual(jobs[0], { title: 'Imago demo', progress: 0 });
    assert.deepEqual(jobs.at(-1), { title: 'Imago demo', progress: null });
    const together = await page.evaluate(() => window.together);
    assert.deepEqual([together['plugin:imago-shell|chrome'], together['plugin:imago-shell|set_theme']], [1, 1], 'the next call waits for the answer to the one before');
    assert.ok(jobs.length < 12, `${jobs.length} calls: of the values that came meanwhile only the last is sent`);
    await open(page, 'notices');
    await page.getByRole('button', { name: 'Title of the window' }).click();
    await page.waitForFunction(() => window.calls.filter(([name]) => name === 'plugin:imago-shell|chrome').at(-1)[1].title === '3 items · Imago demo');
    assert.equal(await page.title(), '3 items · Imago demo');

    await page.keyboard.press('Control+Equal');
    await page.waitForFunction(() => window.calls.some(([name, args]) => name === 'plugin:webview|set_webview_zoom' && args.value === 1.1));
    assert.equal(await page.evaluate(() => localStorage.getItem('imago.zoom')), '1.1');

    await page.evaluate(() => window.emit('window-shown', null));
    await page.getByText('The window is back.').waitFor();

    await page.evaluate(() => window.refused.push('plugin:window|minimize'));
    await page.click('[data-window-control="minimize"]');
    await page.getByText('The window did not answer (minimize): refused').waitFor();
    await page.evaluate(() => window.refused.push('plugin:imago-shell|chrome'));
    await page.getByRole('button', { name: 'Its own title' }).click();
    await page.waitForFunction(() => document.title === 'Imago demo');
    assert.equal(await page.getByText(/chrome/).count(), 0, 'what the page tells by itself is not said to the person');
  });

  // WebView2 writes the page's storage some seconds late: after it dies, what the browser keeps is old, or gone.
  const themes = (page) => page.evaluate(() => window.calls.filter(([name]) => name === 'plugin:imago-shell|set_theme').map(([, args]) => args));
  const drawn = (page) => page.waitForFunction(() => window.calls.some(([name]) => name === 'plugin:imago-shell|ready'));
  for (const [before, chosen] of [['none', undefined], ['another', 'dark']]) {
    await onPage(`in a window the theme it keeps is the page's, with ${before} in the browser`, { system: 'dark', own: true, kept: 'light', scheme: chosen }, async (page) => {
      await drawn(page);
      assert.equal(await scheme(page), 'light');
      assert.equal(await page.evaluate(() => localStorage.getItem('imago.scheme')), 'light');
      assert.deepEqual(await themes(page), [{ theme: 'light', resolved: 'light' }]);
    });
  }

  await onPage('a window that keeps none is told the browser\'s', { system: 'dark', own: true, scheme: 'light' }, async (page) => {
    await drawn(page);
    assert.deepEqual(await themes(page), [{ theme: 'light', resolved: 'light' }]);
  });

  await onPage('a window that does not say which theme it keeps is told none until the person chooses', { own: true, scheme: 'dark', refused: ['plugin:imago-shell|kept_theme'] }, async (page) => {
    const told = (count) => page.waitForFunction((n) => window.calls.filter(([name]) => name === 'plugin:imago-shell|set_theme').length === n, count);
    await drawn(page);
    assert.equal(await scheme(page), 'dark');
    assert.deepEqual(await themes(page), []);
    for (const word of ['light', 'dark']) {
      await palette(page, `${word} theme`);
      await page.keyboard.press('Enter');
      await told(word === 'light' ? 1 : 2);
    }
    assert.deepEqual(await themes(page), [{ theme: 'light', resolved: 'light' }, { theme: 'dark', resolved: 'dark' }]);
  });

  // For the eye: the top of Xiox, as Imago drew it on 2026-11-20 (tests/xiox), over the top of the demo, at twice its size.
  const tops = [];
  for (const chosen of ['dark', 'light']) {
    await onPage(`the top beside Xiox's, ${chosen}`, { width: 1180, scheme: chosen, own: true }, async (page) => {
      await still(page);
      tops.push(readFileSync(join(root, 'tests', 'xiox', `${chosen}.png`)), await page.screenshot({ clip: { x: 0, y: 0, width: 1180, height: 170 } }));
    });
  }
  const sheet = await browser.newPage({ viewport: { width: 2360, height: 800 } });
  await sheet.setContent(`<body style="margin:0">${tops.map((png) => `<img style="display:block;width:2360px;margin-bottom:12px;image-rendering:pixelated" src="data:image/png;base64,${png.toString('base64')}">`).join('')}`);
  await sheet.screenshot({ path: join(shots, 'compare.png'), fullPage: true });
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed: ${failures.join('; ')}`);
  process.exitCode = 1;
}
