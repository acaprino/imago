// Throwaway: the page of the demo's real window, over the WebView2 debugging port. node glass-page.mjs <port> <action> [arg]
import { chromium } from 'playwright';

const [port, action, arg] = process.argv.slice(2);
let browser;
let last;
for (let attempt = 0; attempt < 40 && !browser; attempt++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 }); } catch (error) { last = error; await new Promise((done) => setTimeout(done, 250)); }
}
if (!browser) throw new Error(`the debugging port did not open: ${String(last).slice(0, 600)}`);
let page;
for (let attempt = 0; attempt < 60 && !page; attempt++) {
  page = browser.contexts()[0]?.pages().find((each) => /tauri\.localhost/.test(each.url()));
  if (!page) await new Promise((done) => setTimeout(done, 250));
}
page.setDefaultTimeout(8000);
await page.waitForSelector('[data-slot="window-controls"]');
const palette = async (text) => {
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};
const invoke = (command, args) => page.evaluate(([name, values]) => window.__TAURI_INTERNALS__.invoke(`plugin:imago-shell|${name}`, values).then(
  (answer) => ({ ok: true, answer }), (error) => ({ ok: false, error: String(error) })), [command, args]);
const read = () => page.evaluate(() => ({
  scheme: document.documentElement.dataset.scheme,
  material: document.documentElement.dataset.material ?? null,
  ipc: performance.getEntriesByType('resource').filter(({ name }) => name.includes('ipc.localhost')).map(({ name, responseStatus }) => ({ call: decodeURIComponent(new URL(name).pathname.slice(1)), status: responseStatus })),
  notices: [...document.querySelectorAll('[data-toasts]')].map((each) => each.innerText).filter(Boolean),
}));
let said = {};
if (action === 'clear') {
  // What the page draws is taken away: what shows is the window's own colour, or what lies behind it.
  // In the light scheme of CSS an empty page shows the engine's background, which is the window's own colour (in the dark one
  // Chromium paints its own dark canvas over it).
  await page.addStyleTag({ content: ':root { color-scheme: light !important; } html, body, [data-slot="app-shell"], [data-slot="title-bar"], [data-slot="title-bar"] * { background: transparent !important; }' });
} else if (action === 'glass') said = await invoke('set_glass', { glass: arg === 'on' });
else if (action === 'kept') said = await invoke('kept_glass', {});
else if (action === 'light' || action === 'dark') {
  await palette(`${action} theme`);
  await page.waitForFunction((word) => document.documentElement.dataset.scheme === word, action);
} else if (action === 'close') {
  await page.click('[data-window-control="close"]').catch(() => {});
  process.exit(0);
}
await new Promise((done) => setTimeout(done, 900));
console.log(JSON.stringify({ ...(await read()), said }));
await browser.close();
