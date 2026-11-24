// Throwaway: what the page of the demo's real window says, over the WebView2 debugging port. node smoke-page.mjs <port> <action>
import { chromium } from 'playwright';

const [port, action] = process.argv.slice(2);
let browser;
let last;
for (let attempt = 0; attempt < 20 && !browser; attempt++) {
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
const read = () => page.evaluate(() => {
  const button = document.querySelector('[data-window-control="maximize"], [data-window-control="restore"]').getBoundingClientRect();
  const ratio = devicePixelRatio;
  return {
    origin: location.origin,
    timeOrigin: performance.timeOrigin,
    ipc: performance.getEntriesByType('resource').filter(({ name }) => name.includes('ipc.localhost')).map(({ name, startTime, responseEnd, responseStatus }) => ({ call: decodeURIComponent(new URL(name).pathname.slice(1)), start: Math.round(startTime), end: Math.round(responseEnd), status: responseStatus })),
    scheme: document.documentElement.dataset.scheme,
    system: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    os: document.querySelector('[data-os-state]')?.getAttribute('data-os-state') ?? null,
    button: { x: Math.round(button.left * ratio), y: Math.round(button.top * ratio), width: Math.round(button.width * ratio), height: Math.round(button.height * ratio) },
    notices: [...document.querySelectorAll('[data-toasts] li, [data-toasts] [data-slot]')].map((each) => each.textContent).filter(Boolean),
    inner: `${innerWidth}x${innerHeight}`,
    ratio,
  };
});
if (action === 'light') {
  await palette('light theme');
  await page.waitForFunction(() => document.documentElement.dataset.scheme === 'light');
} else if (action === 'system') await palette('system theme');
else if (action === 'title') {
  await palette('go to notices');
  await page.getByRole('button', { name: 'Title of the window' }).click();
} else if (action === 'job') {
  await palette('go to items');
  await page.getByRole('button', { name: 'Check all' }).click();
  await page.getByText('All items are checked.').waitFor({ timeout: 15000 });
} else if (action === 'zoom') {
  await page.keyboard.press('Control+Equal');
  await page.waitForFunction(() => devicePixelRatio > 1.05);
} else if (action === 'maximize') {
  await page.click('[data-window-control="maximize"]');
  await page.waitForSelector('[data-window-control="restore"]');
} else if (action === 'restore') {
  await page.click('[data-window-control="restore"]');
  await page.waitForSelector('[data-window-control="maximize"]');
} else if (action === 'shot') await page.screenshot({ path: process.argv[4] });
else if (action === 'close') {
  await page.click('[data-window-control="close"]').catch(() => {});
  process.exit(0);
}
await new Promise((done) => setTimeout(done, 700));
console.log(JSON.stringify(await read()));
await browser.close();
