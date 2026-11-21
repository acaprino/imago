// The demo's page side (gallery/mount/desktop.ts) as the demo app runs it, with Tauri's internals stood in for: the
// page tells the window its theme, its look and the theme it draws, and under the Windows theme (`system`) a change of
// Windows' colours reaches the page and the window again (docs/using-imago.md, section 3). A theme of its own does not
// follow Windows, and a redraw leaves no listener of an earlier drawing behind.
import assert from 'node:assert/strict';

/** Runs in the page before its scripts: Tauri's internals, every call answered, the window theme's calls recorded. */
function standInForTauri() {
  const calls = [];
  let callbacks = 0;
  window.__galleryWindowThemes = calls;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
    invoke: (cmd, args) => {
      if (cmd === 'set_window_theme') calls.push({ ...args });
      return Promise.resolve(cmd === 'plugin:window|is_maximized' ? false : null);
    },
    transformCallback: () => ++callbacks,
    unregisterCallback: () => {},
    convertFileSrc: (path) => path,
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
}

const sent = (page) => page.evaluate(() => window.__galleryWindowThemes.map((call) => ({ ...call })));
const drawn = (page) =>
  page.evaluate(() => {
    const root = document.getElementById('g-window');
    return { look: root?.getAttribute('data-im-look'), theme: root?.getAttribute('data-im-theme') };
  });
const waitForTheme = (page, theme) =>
  page.waitForFunction((t) => document.getElementById('g-window')?.getAttribute('data-im-theme') === t, theme);
/** Long enough for a change of the colour scheme to reach the page's listeners, if it has any. */
const settle = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 100))));

export default async function desktopTheme(page, url) {
  await page.addInitScript(standInForTauri);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.__imago?.ready) && document.documentElement.hasAttribute('data-g-desktop'));

  // The page in the Windows theme, as an app's can be: it draws what Windows has, and tells the window so.
  await page.evaluate(() => window.__imago.set({ look: 'smooth', theme: 'system' }));
  await waitForTheme(page, 'dark');
  assert.deepEqual((await sent(page)).at(-1), { theme: 'system', look: 'smooth', resolved: 'dark' });
  const before = (await sent(page)).length;

  // Windows turns light: the page draws light, and the window is told once, for the tint of its acrylic.
  await page.emulateMedia({ colorScheme: 'light' });
  await waitForTheme(page, 'light');
  await settle(page);
  const afterLight = await sent(page);
  assert.equal(afterLight.length, before + 1, 'one change, one call');
  assert.deepEqual(afterLight.at(-1), { theme: 'system', look: 'smooth', resolved: 'light' });

  // And back to dark.
  await page.emulateMedia({ colorScheme: 'dark' });
  await waitForTheme(page, 'dark');
  await settle(page);
  assert.deepEqual((await sent(page)).at(-1), { theme: 'system', look: 'smooth', resolved: 'dark' });

  // ONI with the Windows theme is dark whatever Windows says. The Smooth drawing's listener is gone with it: a change
  // of Windows' colours puts no Smooth back on the page and sends nothing.
  await page.evaluate(() => window.__imago.set({ look: 'oni' }));
  await page.waitForFunction(() => document.getElementById('g-window')?.getAttribute('data-im-look') === 'oni');
  assert.deepEqual((await sent(page)).at(-1), { theme: 'dark', look: 'oni', resolved: 'dark' });
  const oni = (await sent(page)).length;
  await page.emulateMedia({ colorScheme: 'light' });
  await settle(page);
  assert.deepEqual(await drawn(page), { look: 'oni', theme: 'dark' });
  assert.equal((await sent(page)).length, oni, 'nothing changed for the window');

  // A theme of its own does not follow Windows.
  await page.evaluate(() => window.__imago.set({ look: 'smooth', theme: 'light' }));
  await waitForTheme(page, 'light');
  const own = (await sent(page)).length;
  await page.emulateMedia({ colorScheme: 'dark' });
  await settle(page);
  assert.deepEqual(await drawn(page), { look: 'smooth', theme: 'light' });
  assert.equal((await sent(page)).length, own, 'the light theme stays, and nothing is sent');
}
