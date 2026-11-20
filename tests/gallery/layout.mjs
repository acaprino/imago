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

      // The widths of the layout are the tokens': sidebar 232, rail 56, inspector 300 to 360.
      await at(1160);
      const widths = { sidebar: await token(page, '--im-w-sidebar'), rail: await token(page, '--im-w-rail'), inspector: await token(page, '--im-w-inspector') };
      assert.equal(widths.sidebar, 232, where('--im-w-sidebar'));
      assert.equal(widths.rail, 56, where('--im-w-rail'));
      assert.ok(widths.inspector >= 300 && widths.inspector <= 360, where(`--im-w-inspector is ${widths.inspector}`));

      // 1160: the sidebar, the docked inspector and a content of 420 or more, as the tokens say.
      const side = await box(page, '.im-sidebar');
      const content = await box(page, '.im-content');
      const inspector = await box(page, '.im-inspector');
      near(side.width, widths.sidebar, where('sidebar width at 1160'));
      near(inspector.width, widths.inspector, where('inspector width at 1160'));
      assert.ok(inspector.left >= content.right - 0.5, where('inspector is on the right of the content at 1160'));
      assert.ok(content.width >= 420, where(`content width at 1160 is ${content.width}`));
      assert.equal(await visible(page, '.im-sidebar-toggle'), false, where('no sidebar button at 1160'));

      // The breakpoints, pinned on both sides of each edge: 1000/999, 850/849, 620/619.
      await at(1000);
      const docked = await box(page, '.im-content');
      assert.ok(docked.width >= 420, where(`content width at 1000 is ${docked.width}`));
      assert.ok((await box(page, '.im-inspector')).left >= docked.right - 0.5, where('inspector is docked at 1000'));
      await at(999);
      const covered = await box(page, '.im-content');
      const over = await box(page, '.im-inspector');
      assert.ok(over.left > covered.left && over.left < covered.right, where('inspector overlaps the content at 999'));

      await at(850);
      near((await box(page, '.im-sidebar')).width, widths.sidebar, where('sidebar width at 850'));
      await at(849);
      near((await box(page, '.im-sidebar')).width, widths.rail, where('rail width at 849'));

      await at(620);
      near((await box(page, '.im-sidebar')).width, widths.rail, where('rail width at 620'));
      assert.equal(await visible(page, '.im-titlebar .im-tabs'), true, where('title-bar tabs at 620'));
      assert.equal(await visible(page, '.im-views-menu'), false, where('no Views menu at 620'));
      assert.equal(await visible(page, '.im-sidebar-toggle'), false, where('no sidebar button at 620'));
      await at(619);
      assert.equal(await visible(page, '.im-sidebar'), false, where('sidebar hidden at 619'));
      assert.equal(await visible(page, '.im-titlebar .im-tabs'), false, where('title-bar tabs hidden at 619'));
      assert.equal(await visible(page, '.im-views-menu'), true, where('Views menu at 619'));
      assert.equal(await visible(page, '.im-sidebar-toggle'), true, where('sidebar button at 619'));
      // No fractional width falls between two blocks: the ranges are half-open.
      await at(619.5);
      assert.equal(await visible(page, '.im-sidebar'), false, where('sidebar hidden at 619.5'));
      assert.equal(await visible(page, '.im-titlebar .im-tabs'), false, where('title-bar tabs hidden at 619.5'));
      assert.equal(await visible(page, '.im-views-menu'), true, where('Views menu at 619.5'));
      assert.equal(await visible(page, '.im-sidebar-toggle'), true, where('sidebar button at 619.5'));
      await at(849.5);
      near((await box(page, '.im-sidebar')).width, widths.rail, where('rail width at 849.5'));
      await at(999.5);
      const half = await box(page, '.im-content');
      const halfInspector = await box(page, '.im-inspector');
      assert.ok(halfInspector.left > half.left && halfInspector.left < half.right, where('inspector overlaps the content at 999.5'));

      // 990: the inspector covers the content's right edge; the content reaches the work area's right edge.
      await at(990);
      const work = await box(page, '.im-work');
      const cover = await box(page, '.im-content');
      const drawer = await box(page, '.im-inspector');
      assert.ok(drawer.left > cover.left && drawer.left < cover.right, where('inspector overlaps the content at 990'));
      near(cover.right, work.right, where('content reaches the work area at 990'));

      // 840: the sidebar is a 56px rail; each item has a title and an accessible name.
      await at(840);
      near((await box(page, '.im-sidebar')).width, widths.rail, where('rail width at 840'));
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
      assert.equal(await visible(page, '.im-sidebar-toggle'), false, where('no sidebar button at 840'));

      // 610: no sidebar, no tabs in the title bar, the Views menu instead (a menu button that is closed).
      await at(610);
      assert.equal(await visible(page, '.im-sidebar'), false, where('sidebar hidden at 610'));
      assert.equal(await visible(page, '.im-titlebar .im-tabs'), false, where('title-bar tabs hidden at 610'));
      assert.equal(await visible(page, '.im-views-menu'), true, where('Views menu shown at 610'));
      assert.equal(await page.locator('.im-views-menu').getAttribute('aria-haspopup'), 'menu', where('Views menu announces a menu'));
      assert.equal(await page.locator('.im-views-menu').getAttribute('aria-expanded'), 'false', where('Views menu is closed at rest'));

      // 610: the sidebar's objects stay reachable. A title-bar button, named after the sidebar and a tab stop right
      // after the brand, opens it over the content; the keyboard and the pointer close it again.
      const toggle = page.locator('.im-sidebar-toggle');
      const sidebarName = await page.locator('.im-sidebar').getAttribute('aria-label');
      const sidebarId = await page.locator('.im-sidebar').getAttribute('id');
      assert.equal(await visible(page, '.im-sidebar-toggle'), true, where('sidebar button at 610'));
      assert.equal(await toggle.getAttribute('aria-label'), sidebarName, where('the sidebar button is named after the sidebar'));
      assert.equal(await toggle.getAttribute('title'), sidebarName, where('the sidebar button has the same title'));
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false', where('the sidebar button is closed at rest'));
      assert.ok(sidebarId && (await toggle.getAttribute('aria-controls')) === sidebarId, where('the sidebar button controls the sidebar'));
      const focused = () => page.evaluate(() => {
        const el = document.activeElement;
        return { toggle: !!el?.classList.contains('im-sidebar-toggle'), inSidebar: !!el?.closest('.im-sidebar'), role: el?.getAttribute('role') ?? null };
      });
      const closed = async (label) => {
        assert.equal(await visible(page, '.im-sidebar'), false, where(`sidebar hidden ${label}`));
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false', where(`sidebar button closed ${label}`));
        assert.equal(await page.locator('.im-shell').getAttribute('data-im-sidebar-open'), null, where(`shell not open ${label}`));
      };
      const contentBefore = await box(page, '.im-content');
      await page.focus('#g-width'); // the last control before the window, in the page's order
      await page.keyboard.press('Tab');
      assert.equal((await focused()).toggle, true, where('Tab from the page reaches the sidebar button first'));
      await page.keyboard.press('Enter');
      assert.equal(await visible(page, '.im-sidebar'), true, where('Enter opens the sidebar'));
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true', where('the button says it is open'));
      const now = await focused();
      assert.ok(now.inSidebar && now.role === 'option', where('focus is on a row of the sidebar'));
      const drawn = await box(page, '.im-sidebar');
      const shellBox = await box(page, '.im-shell');
      const barBox = await box(page, '.im-titlebar');
      near(drawn.left, shellBox.left, where('the sidebar starts at the left edge'));
      near(drawn.top, barBox.bottom, where('the sidebar starts under the title bar'));
      near(drawn.width, widths.sidebar, where('the sidebar is --im-w-sidebar wide'));
      const contentOpen = await box(page, '.im-content');
      near(contentOpen.left, contentBefore.left, where('the content does not move when the sidebar opens'));
      near(contentOpen.width, contentBefore.width, where('the content does not shrink when the sidebar opens'));
      const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.im-sidebar'), { x: drawn.left + drawn.width / 2, y: drawn.top + drawn.height / 2 });
      assert.equal(onTop, true, where('the sidebar is above the content'));
      await page.keyboard.press('Escape');
      await closed('after Escape');
      assert.equal((await focused()).toggle, true, where('Escape gives focus back to the button'));

      await toggle.click();
      assert.equal(await visible(page, '.im-sidebar'), true, where('a click opens the sidebar'));
      await toggle.click();
      await closed('after a second click');
      assert.equal((await focused()).toggle, true, where('a second click leaves focus on the button'));

      await toggle.click();
      const status = await box(page, '.im-status');
      await page.mouse.click(status.right - 24, status.top + status.height / 2); // empty space of the status row
      await closed('after a press outside');
      await page.waitForFunction(() => document.activeElement?.classList.contains('im-sidebar-toggle'));

      // Leaving the sidebar by keyboard closes it, and the focus stays where it went.
      await toggle.click();
      const inContent = () => page.evaluate(() => !!document.activeElement?.closest('.im-work'));
      for (let tabs = 0; tabs < 12 && !(await inContent()); tabs++) await page.keyboard.press('Tab');
      assert.equal(await inContent(), true, where('Tab leaves the sidebar for the content'));
      await closed('after Tab into the content');
      assert.equal((await focused()).toggle, false, where('the focus is not pulled back to the button'));

      // With the focus in the content, a press on the button opens it again; Escape closes it from anywhere,
      // here with the focus on the page because the press landed on the sidebar's own chrome.
      await toggle.click();
      assert.equal(await visible(page, '.im-sidebar'), true, where('the button reopens the sidebar'));
      await page.locator('.im-sidebar .im-panel-title').click();
      assert.equal(await visible(page, '.im-sidebar'), true, where('a press inside the sidebar keeps it open'));
      assert.equal(await page.evaluate(() => document.activeElement === document.body), true, where('the focus is on the page'));
      await page.keyboard.press('Escape');
      await closed('after Escape with the focus on the page');
      assert.equal((await focused()).toggle, true, where('Escape from the page gives focus to the button'));

      // A floating layer (a menu opened from the sidebar) is not outside it: neither a press nor its focus closes it.
      await toggle.click();
      await page.evaluate(() => {
        const layer = document.createElement('div');
        layer.dataset.imLayer = 'menu';
        layer.id = 'test-layer';
        layer.style.cssText = 'position:absolute;z-index:9;right:8px;top:90px;width:120px;height:40px';
        layer.innerHTML = '<button type="button" id="test-layer-item">Item</button>';
        document.querySelector('.im-shell').append(layer);
      });
      await page.click('#test-layer-item');
      assert.equal(await visible(page, '.im-sidebar'), true, where('a press in a floating layer keeps the sidebar open'));
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'test-layer-item', where('the layer keeps the focus'));
      await page.evaluate(() => document.getElementById('test-layer').remove());
      await page.keyboard.press('Escape');
      await closed('after the layer is gone and Escape');

      await toggle.click();
      await at(700); // 620 or more: the sidebar is a rail again and the open state is gone
      await page.waitForFunction(() => !document.querySelector('.im-shell').hasAttribute('data-im-sidebar-open'));
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false', where('widening clears the open state'));

      // A width change never leaves the focus on what it hides: the sidebar when narrowing, the button when widening.
      await page.focus('.im-sidebar [role="option"][tabindex="0"]');
      await at(610);
      await page.waitForFunction(() => document.activeElement?.classList.contains('im-sidebar-toggle'));
      await at(700);
      await page.waitForFunction(() => !!document.activeElement?.closest('.im-sidebar') && document.activeElement.getAttribute('tabindex') === '0');
      await at(610);

      // Muro has no sidebar and no button for it, at any width.
      for (const width of [1160, 990, 840, 610, 500]) {
        await at(width, 'muro');
        assert.equal(await page.locator('.im-shell').getAttribute('data-im-sidebar'), 'off');
        assert.equal(await visible(page, '.im-sidebar'), false, where(`Muro has no sidebar at ${width}`));
        assert.equal(await page.locator('.im-sidebar-toggle').count(), 0, where(`Muro has no sidebar button at ${width}`));
        const offset = (await box(page, '.im-content')).left - (await box(page, '.im-work')).left;
        assert.ok(offset >= 0 && offset <= 2.5, where(`Muro's content starts at its work area at ${width} (offset ${offset})`));
      }
      if (look === 'smooth') {
        await at(610, 'muro');
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.im-work')).marginInlineStart), '0px', where('Muro below 620: the sheet has no margin'));
        near((await box(page, '.im-work')).left, (await box(page, '.im-shell')).left, where('Muro below 620: the sheet starts at the window edge'));
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
