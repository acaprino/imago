// node tests/demo.mjs, after `npm run build` (it opens what `npm run demo:web` built, examples/demo/dist).
// The demo page in a browser: it loads without an error under the content policy of its window, in both schemes; nothing
// overflows at the widths where the frame changes, with the views where that width puts them; the palette opens and
// chooses the scheme; in a browser nothing of Tauri is asked for, and in a window (a fake one) the bar has its buttons and
// the window is told its theme and where the maximize button is.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'examples', 'demo', 'dist');
const policy = JSON.parse(readFileSync(join(root, 'examples/demo/src-tauri/tauri.conf.json'), 'utf8')).app.security.csp;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };

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

/** The window of Tauri as the page finds it: it answers every call and writes it down in `window.calls`. */
function fakeWindow() {
  window.calls = [];
  let callbacks = 0;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
    transformCallback: () => ++callbacks,
    unregisterCallback: () => {},
    invoke: async (command, args) => {
      window.calls.push([command, args]);
      return command === 'plugin:window|is_maximized' ? false : command === 'plugin:event|listen' ? 1 : null;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
}

const browser = await chromium.launch();

/** Opens the page in a context of its own, runs `look` on it, and fails on an error the page reported. */
async function onPage(name, { width = 1280, colorScheme = 'light', init } = {}, look) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('requestfailed', (request) => problems.push(`${request.url()} failed`));
  if (init) await page.addInitScript(init);
  await page.goto(url);
  await page.waitForSelector('[data-slot="app-shell"]');
  await look(page);
  assert.deepEqual(problems, [], name);
  await context.close();
  console.log(`ok   ${name}`);
}

/** What sticks out of the page or of a region of the frame, sideways. */
const overflow = (page) => page.evaluate(() => {
  const out = [];
  const wide = document.documentElement;
  if (wide.scrollWidth > wide.clientWidth) out.push(`the page is ${wide.scrollWidth} wide in ${wide.clientWidth}`);
  for (const slot of ['title-bar', 'app-shell-tabs', 'app-shell-status', 'app-shell-content', 'app-shell-actions', 'app-shell-footer', 'app-shell-bottom', 'panel-body', 'inspector-body']) {
    for (const region of document.querySelectorAll(`[data-slot="${slot}"]`)) {
      if (region.scrollWidth > region.clientWidth) out.push(`${slot} is ${region.scrollWidth} wide in ${region.clientWidth}`);
    }
  }
  for (const control of document.querySelectorAll('button')) {
    const box = control.getBoundingClientRect();
    if (box.width > 1 && (box.left < 0 || box.right > innerWidth)) out.push(`the button "${control.textContent || control.getAttribute('aria-label')}" goes from ${box.left} to ${box.right} in ${innerWidth}`);
  }
  return out;
});

const scheme = (page) => page.evaluate(() => document.documentElement.dataset.scheme);
const ground = (page) => page.evaluate(() => getComputedStyle(document.querySelector('[data-slot="app-shell-work"]')).backgroundColor);

try {
  const grounds = {};
  for (const colorScheme of ['light', 'dark']) {
    for (const [width, views] of [[340, 'app-shell-bottom'], [620, 'app-shell-tabs'], [860, 'title-bar'], [1440, 'title-bar']]) {
      await onPage(`${colorScheme} at ${width}`, { width, colorScheme }, async (page) => {
        assert.equal(await scheme(page), colorScheme);
        grounds[colorScheme] = await ground(page);
        assert.equal(await page.locator(`[data-slot="${views}"] [data-slot="toolbar-tabs"]`).count(), 1, `the views are in ${views}`);
        assert.equal(await page.locator('[data-slot="toolbar-tabs"]').count(), 1, 'and nowhere else');
        assert.deepEqual(await overflow(page), [], 'the list');
        await page.getByRole('button', { name: /^Zoom/ }).click();
        await page.locator('[data-slot="inspector-body"]').waitFor();
        assert.deepEqual(await overflow(page), [], 'with the details open');
        await page.locator('[data-slot="inspector-close"]').click();
        await page.getByRole('button', { name: 'Settings' }).click();
        await page.getByRole('switch').waitFor();
        assert.deepEqual(await overflow(page), [], 'the settings');
      });
    }
  }
  assert.notEqual(grounds.light, grounds.dark, 'the two schemes draw the same ground');

  await onPage('the palette chooses the scheme, and the choice is kept', {}, async (page) => {
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.type('dark');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.documentElement.dataset.scheme === 'dark');
    await page.reload();
    await page.waitForSelector('[data-slot="app-shell"]');
    assert.equal(await scheme(page), 'dark');
  });

  await onPage('what sticks out is found', { width: 340 }, async (page) => {
    await page.evaluate(() => {
      const wide = document.createElement('button');
      wide.style.width = '2000px';
      document.querySelector('[data-slot="app-shell-content"]').append(wide);
    });
    assert.ok((await overflow(page)).length >= 2, 'a button of 2000px in a page of 340px is not found');
  });

  await onPage('in a browser there are no window buttons, and nothing of Tauri is there', {}, async (page) => {
    assert.equal(await page.locator('[data-slot="window-controls"]').count(), 0);
    assert.equal(await page.evaluate(() => '__TAURI_INTERNALS__' in window), false);
  });

  await onPage('in a window the bar has its buttons, and the window is told its theme and its maximize button', { colorScheme: 'dark', init: fakeWindow }, async (page) => {
    assert.equal(await page.locator('[data-slot="window-controls"] button').count(), 3);
    assert.equal(await page.locator('[data-slot="title-bar"][data-tauri-drag-region]').count(), 1);
    await page.click('[data-window-control="minimize"]');
    await page.waitForFunction(() => window.calls.some(([command]) => command === 'plugin:window|minimize'));
    const calls = await page.evaluate(() => window.calls);
    const argsOf = (command) => calls.find(([name]) => name === command)?.[1];
    assert.deepEqual(argsOf('set_window_theme'), { theme: 'system', resolved: 'dark' });
    const box = await page.locator('[data-window-control="maximize"]').boundingBox();
    assert.deepEqual(argsOf('window_caption_maximize'), { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) });
    assert.ok(calls.some(([command, args]) => command === 'plugin:event|listen' && args.event === 'caption-maximize'), 'the page listens to caption-maximize');
    assert.deepEqual(await overflow(page), []);
  });
} finally {
  await browser.close();
  server.close();
}
