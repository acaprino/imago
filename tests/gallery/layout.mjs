// The seven-region shell: its measures, its three breakpoints and its minimum width, in both looks and both themes.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const APPS = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];
// Global Constraints, px: [Smooth, ONI]
const MEASURES = { titlebar: [46, 38], footer: [30, 26] };
const NAMES = { xiox: 'Xiox', mukade: 'Mukade', shinatama: 'Shinatama', muro: 'Muro', daodan: 'Daodan' };

const show = (page, state) => page.evaluate((s) => window.__imago.set(s), state);
const box = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
const visible = (page, selector) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
}, selector);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 0.5, `${label}: expected ${expected}, got ${actual}`);
const token = (page, name) => page.evaluate((n) => parseFloat(getComputedStyle(document.querySelector('.im-shell')).getPropertyValue(n)), name);

export default async (page, url) => {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      const at = (width, app = 'xiox') => show(page, { app, look, theme, glass: false, width });
      const where = (text) => `${look} ${theme}: ${text}`;

      // 1160: sidebar 232, inspector 300 to 360 on the right of the content, content 420 or more.
      await at(1160);
      const side = await box(page, '.im-sidebar');
      const content = await box(page, '.im-content');
      const inspector = await box(page, '.im-inspector');
      near(side.width, 232, where('sidebar width at 1160'));
      assert.ok(inspector.width >= 300 && inspector.width <= 360, where(`inspector width at 1160 is ${inspector.width}`));
      assert.ok(inspector.left >= content.right - 0.5, where('inspector is on the right of the content at 1160'));
      assert.ok(content.width >= 420, where(`content width at 1160 is ${content.width}`));

      // 1000 is the last width where the inspector is docked: the content keeps 420.
      await at(1000);
      const docked = await box(page, '.im-content');
      assert.ok(docked.width >= 420, where(`content width at 1000 is ${docked.width}`));
      assert.ok((await box(page, '.im-inspector')).left >= docked.right - 0.5, where('inspector is docked at 1000'));

      // 990: the inspector covers the content's right edge; the content reaches the work area's right edge.
      await at(990);
      const work = await box(page, '.im-work');
      const cover = await box(page, '.im-content');
      const drawer = await box(page, '.im-inspector');
      assert.ok(drawer.left > cover.left && drawer.left < cover.right, where('inspector overlaps the content at 990'));
      near(cover.right, work.right, where('content reaches the work area at 990'));

      // 840: the sidebar is a 56px rail; each item has a title and an accessible name.
      await at(840);
      near((await box(page, '.im-sidebar')).width, 56, where('rail width at 840'));
      const items = page.locator('.im-sidebar [role="option"]');
      const total = await items.count();
      assert.ok(total >= 3, where('the sidebar has rows'));
      for (let i = 0; i < total; i++) {
        const item = items.nth(i);
        assert.ok(((await item.getAttribute('title')) ?? '').trim(), where(`rail item ${i} has a title`));
        const name = /option "([^"]+)"/.exec(await item.ariaSnapshot())?.[1] ?? '';
        assert.ok(name.trim(), where(`rail item ${i} has an accessible name`));
      }
      assert.equal(await visible(page, '.im-views-menu'), false, where('no Views menu at 840'));

      // 610: no sidebar, no tabs in the title bar, the Views menu instead.
      await at(610);
      assert.equal(await visible(page, '.im-sidebar'), false, where('sidebar hidden at 610'));
      assert.equal(await visible(page, '.im-titlebar .im-tabs'), false, where('title-bar tabs hidden at 610'));
      assert.equal(await visible(page, '.im-views-menu'), true, where('Views menu shown at 610'));

      // Muro has no sidebar at any width.
      for (const width of [1160, 990, 840, 610, 500]) {
        await at(width, 'muro');
        assert.equal(await page.locator('.im-shell').getAttribute('data-im-sidebar'), 'off');
        assert.equal(await visible(page, '.im-sidebar'), false, where(`Muro has no sidebar at ${width}`));
        const offset = (await box(page, '.im-content')).left - (await box(page, '.im-work')).left;
        assert.ok(offset >= 0 && offset <= 2.5, where(`Muro's content starts at its work area at ${width} (offset ${offset})`));
      }

      // The title bar names the product, at every width, for every app.
      for (const app of APPS) {
        for (const width of [1160, 840, 610, 500]) {
          await at(width, app);
          assert.equal(await visible(page, '.im-titlebar .im-mark'), true, where(`${app} mark at ${width}`));
          assert.equal(await visible(page, '.im-titlebar .im-wordmark'), true, where(`${app} name at ${width}`));
          assert.equal((await page.locator('.im-titlebar .im-wordmark').innerText()).trim().toLowerCase(), NAMES[app].toLowerCase(), where(`${app} name text at ${width}`));
          assert.ok((await box(page, '.im-titlebar .im-wordmark')).right <= (await box(page, '.im-titlebar')).right, where(`${app} name is inside the title bar at ${width}`));
        }
      }

      // The title bar and the footer take the measures of the look.
      await at(1160);
      const index = LOOKS.indexOf(look);
      near((await box(page, '.im-titlebar')).height, MEASURES.titlebar[index], where('title bar height'));
      near((await box(page, '.im-footer')).height, MEASURES.footer[index], where('footer height'));
      near(await token(page, '--im-h-titlebar'), MEASURES.titlebar[index], where('--im-h-titlebar'));
      near(await token(page, '--im-h-footer'), MEASURES.footer[index], where('--im-h-footer'));

      // Smooth: the work area is one sheet with a 10px top-left corner; the sidebar and the title bar paint nothing.
      if (look === 'smooth') {
        const paint = (selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, selector);
        assert.equal(await paint('.im-titlebar'), 'rgba(0, 0, 0, 0)', where('the title bar paints nothing'));
        assert.equal(await paint('.im-sidebar'), 'rgba(0, 0, 0, 0)', where('the sidebar paints nothing'));
        assert.notEqual(await paint('.im-work'), 'rgba(0, 0, 0, 0)', where('the work area is one sheet'));
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.im-work')).borderTopLeftRadius), '10px', where('sheet corner'));
      }
    }
  }

  // Review Focus 1: at the 200% page zoom of a 1000px window the shell is 500 CSS px wide; nothing may overflow it.
  const context = await page.context().browser().newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 2 });
  try {
    const zoomed = await context.newPage();
    await zoomed.goto(url);
    await zoomed.waitForFunction(() => Boolean(window.__imago?.ready));
    for (const look of LOOKS) {
      for (const app of APPS) {
        await show(zoomed, { app, look, theme: 'dark', glass: false, width: 500 });
        const fits = await zoomed.evaluate(() => {
          const shell = document.querySelector('.im-shell').getBoundingClientRect();
          const button = document.querySelector('.im-actions .im-btn--primary').getBoundingClientRect();
          const el = document.querySelector('.im-shell');
          return { scroll: el.scrollWidth, client: el.clientWidth, shell, button: { left: button.left, right: button.right, top: button.top, bottom: button.bottom } };
        });
        const label = `${look} ${app} at 500, zoom 2`;
        assert.ok(fits.scroll <= fits.client, `${label}: scrollWidth ${fits.scroll} > clientWidth ${fits.client}`);
        assert.ok(fits.button.left >= fits.shell.left && fits.button.right <= fits.shell.right, `${label}: the primary button is outside the shell horizontally`);
        assert.ok(fits.button.top >= fits.shell.top && fits.button.bottom <= fits.shell.bottom, `${label}: the primary button is outside the shell vertically`);
      }
    }
  } finally {
    await context.close();
  }
};
