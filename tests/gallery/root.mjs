// A shell fills the window only when everything between the body and the shell does. A shell in a wrapper that does not
// (a root without im-root, as React's <div id="app"> is by default) is drawn as tall as its title bar, and its content
// region and the canvas in it 0 pixels, and nothing else says so: renderShellFrame and the React Shell say it once on
// the console, with the fix. A shell that fills the window says nothing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..').replaceAll('\\', '/');

/** React, react-dom/client and the binding, in one module a page imports. The binding's `../lib/ui/` is read from ts/ui. */
async function reactBundle() {
  const result = await build({
    configFile: false, root, logLevel: 'silent',
    resolve: { alias: [{ find: /^\.\.\/lib\/ui\/(.*)\.js$/, replacement: `${root}/ts/ui/$1.ts` }] },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'root-test-entry', enforce: 'pre',
      resolveId: (id) => (id === 'virtual:root-test' ? '\0root-test' : null),
      load: (id) => (id === '\0root-test'
        ? `export { createElement } from 'react'; export { createRoot } from 'react-dom/client'; export * from '${root}/react/index.js';`
        : null),
    }],
    build: { write: false, minify: false, modulePreload: false, rollupOptions: { input: 'virtual:root-test', preserveEntrySignatures: 'strict', output: { format: 'es', entryFileNames: 'react.js' } } },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((chunk) => chunk.fileName === 'react.js').code;
}

const PAGE = (css, body) => '<!doctype html><html lang="en" data-im-app="daodan" data-im-look="smooth" data-im-theme="light">'
  + `<head><link rel="stylesheet" href="${css}"></head><body>${body}</body></html>`;

/** Mounts a shell in `where` (the body, or #app), draws two frames, and returns the warnings the console got. */
async function mount(page, base, css, body, script) {
  const warnings = [];
  const listen = (message) => { if (message.type() === 'warning') warnings.push(message.text()); };
  page.on('console', listen);
  try {
    await page.route(`${base}page`, (route) => route.fulfill({ contentType: 'text/html', body: PAGE(css, body) }));
    await page.goto(`${base}page`);
    await page.evaluate(script);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
    const sizes = await page.evaluate(() => ({ shell: document.querySelector('.im-shell').getBoundingClientRect().height, content: document.querySelector('.im-content').getBoundingClientRect().height, canvas: document.querySelector('.canvas').getBoundingClientRect().height }));
    return { warnings, sizes };
  } finally {
    page.off('console', listen);
    await page.unroute(`${base}page`);
  }
}

export default async function rootTest(page, url) {
  const css = await page.locator('link[rel=stylesheet]').first().evaluate((link) => link.href);
  const base = new URL('/root-test/', url).href;
  await page.route(`${base}*.ts`, async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop();
    const source = await readFile(join(root, 'ts', 'ui', file), 'utf8');
    await route.fulfill({ contentType: 'text/javascript', body: stripTypeScriptTypes(source) });
  });
  const bundle = await reactBundle();
  await page.route(`${base}react.js`, (route) => route.fulfill({ contentType: 'text/javascript', body: bundle }));

  // The string frame, mounted and repainted with renderShellFrame.
  const strings = async () => {
    const ui = await import('./index.ts');
    const shell = document.createElement('div');
    shell.className = 'im-shell';
    (document.getElementById('app') ?? document.body).append(shell);
    const paint = (n) => ui.shellFrameHtml({ titlebarHtml: ui.titlebarHtml({ brand: { name: `Viewer ${n}` } }), contentHtml: '<div class="canvas" style="block-size: 100%"></div>', contentLabel: 'Graph', skipLabel: 'Skip to content', inspectorLabel: 'Details' });
    ui.renderShellFrame(shell, paint(1));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    ui.renderShellFrame(shell, paint(2));
  };
  // The React Shell with its Workbench, rendered into #app.
  const react = async () => {
    const { createElement: h, createRoot, Shell, Workbench } = await import('./react.js');
    const app = document.getElementById('app');
    createRoot(app).render(h(Shell, { skipLabel: 'Skip to content', titlebar: h('header', { className: 'im-titlebar' }, 'Viewer') },
      h(Workbench, { detailsLabel: 'Details', 'aria-label': 'Graph' }, h('div', { className: 'canvas', style: { blockSize: '100%' } }))));
    for (let tries = 0; tries < 50 && !app.querySelector('.im-content'); tries++) await new Promise((done) => setTimeout(done, 20));
  };

  for (const [label, script] of [['renderShellFrame', strings], ['the React Shell', react]]) {
    const bare = await mount(page, base, css, '<div id="app"></div>', script);
    assert.ok(bare.sizes.content === 0 && bare.sizes.canvas === 0, `${label}: in a root without im-root the content region and its canvas are 0 pixels tall (${JSON.stringify(bare.sizes)})`);
    assert.equal(bare.warnings.length, 1, `${label}: one warning, however often the frame is painted (${JSON.stringify(bare.warnings)})`);
    assert.match(bare.warnings[0], /im-root/, `${label}: the warning says the fix`);
    assert.match(bare.warnings[0], /<div id="app" class="im-root">/, `${label}: with the markup to write`);
    const fixed = await mount(page, base, css, '<div id="app" class="im-root"></div>', script);
    assert.ok(fixed.sizes.content > 200 && fixed.sizes.canvas > 200, `${label}: in a root with im-root the content region and its canvas fill the window (${JSON.stringify(fixed.sizes)})`);
    assert.deepEqual(fixed.warnings, [], `${label}: a shell that fills the window says nothing`);
  }
  const direct = await mount(page, base, css, '', strings);
  assert.ok(direct.sizes.content > 200, 'a shell directly in the body fills the window');
  assert.deepEqual(direct.warnings, [], 'and says nothing');
}
