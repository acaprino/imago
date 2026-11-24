// Throwaway: which face the tabs of the demo are drawn in, per tab, in the runner's browsers.
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const dist = resolve('examples/demo/dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = join(dist, path === '/' ? 'index.html' : path);
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return response.writeHead(404).end();
  response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;
mkdirSync('fonts', { recursive: true });

for (const channel of [undefined, 'msedge']) {
  const browser = await chromium.launch({ channel });
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  await page.goto(url);
  await page.waitForSelector('[data-slot="toolbar-tab"]');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  console.log(`--- ${channel ?? 'chromium'} ${browser.version()}`);
  const ask = async (selector) => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      const { computedStyle } = await cdp.send('CSS.getComputedStyleForNode', { nodeId });
      const of = (name) => computedStyle.find((each) => each.name === name).value;
      const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId });
      console.log(outerHTML.replace(/<[^>]+>/g, '').slice(0, 24).padEnd(25), of('font-weight'), of('color'), of('font-family').slice(0, 40), '=>', fonts.map(({ familyName, postScriptName, glyphCount }) => `${familyName} / ${postScriptName} (${glyphCount})`).join(', '));
    }
  };
  await ask('[data-slot="toolbar-tab"] [data-label], [data-slot="toggle-group-item"] [data-label]');
  await ask('[data-slot="toolbar-brand-name"], [data-slot="sidebar-row"] [data-slot="text"], [data-slot="toggle-group-item"]');
  await page.screenshot({ path: `fonts/${channel ?? 'chromium'}.png`, clip: { x: 0, y: 0, width: 1440, height: 170 } });
  await page.setContent(`<body style="background:#12161e;color:#9aa5b8">${['"Segoe UI Variable Text", "Segoe UI"', '"Segoe UI Variable Text"', '"Segoe UI"'].flatMap((f) => [400, 500, 600, 700].map((w) => `<p style="margin:4px"><span style='font:${w} 14px ${f}'>New item</span></p>`)).join('')}`);
  await ask('span');
  await page.screenshot({ path: `fonts/${channel ?? 'chromium'}-weights.png`, clip: { x: 0, y: 0, width: 200, height: 330 } });
  await browser.close();
}
server.close();
