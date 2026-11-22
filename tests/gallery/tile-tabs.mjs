// A tab of a tile is chrome: one line in the head font, at every width of the gallery's width control, in both looks and both
// themes. A label longer than its room ends in an ellipsis and the tab carries the whole label as its title.
import assert from 'node:assert/strict';

const TILING = '[data-g-tiling]';
const LONG = 'Saved terminal · unavailable';
const WIDTHS = [250, 300, 340, 400, 450, 500, 560, 620, 700, 850, 1000, 1160];

const measure = (page) =>
  page.locator(TILING).evaluate((host) => {
    const found = [];
    for (const el of host.querySelectorAll('.im-tile-tab, .im-pane-focus')) {
      if (!el.getClientRects().length) continue; // a collapsed pane hides its chrome
      const style = getComputedStyle(el);
      const range = document.createRange();
      range.selectNodeContents(el);
      const box = el.getBoundingClientRect();
      found.push({
        kind: el.classList.contains('im-tile-tab') ? 'tab' : 'focus', text: el.textContent, title: el.title,
        lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
        height: Math.round(box.height), font: style.fontFamily, wrap: style.whiteSpace, overflow: style.textOverflow,
        clipped: el.scrollWidth > el.clientWidth,
      });
    }
    return found;
  });

export default async function (page) {
  for (const look of ['smooth', 'oni']) {
    for (const theme of ['dark', 'light']) {
      for (const width of WIDTHS) {
        const where = (message) => `${look} ${theme} at ${width}: ${message}`;
        await page.evaluate((s) => window.__imago.set({ app: 'shinatama', glass: false, ...s }), { look, theme, width });
        await page.waitForSelector(`${TILING} .im-tile-tab`, { state: 'attached' });
        await page.locator(TILING).scrollIntoViewIfNeeded();
        await page.waitForTimeout(60);
        const found = await measure(page);
        assert.ok(found.some((item) => item.kind === 'tab'), where('the tiling workspace shows tabs'));
        for (const item of found) {
          assert.ok(item.lines <= 1, where(`"${item.text}" wraps onto ${item.lines} lines`));
          assert.ok(item.height <= 30, where(`"${item.text}" makes a chrome row ${item.height}px tall`));
          assert.ok(!/cascadia|consolas|mono/i.test(item.font), where(`"${item.text}" is set in the code font (${item.font}), not the head font`));
          assert.equal(item.wrap, 'nowrap', where(`"${item.text}" does not keep to one line`));
          assert.equal(item.overflow, 'ellipsis', where(`"${item.text}" is not cut with an ellipsis`));
          if (item.kind === 'tab') assert.ok(item.title.startsWith(item.text), where(`"${item.text}" does not carry its whole label as its title`));
        }
        assert.ok(found.some((item) => item.text === LONG), where('the long label is shown'));
      }
    }
  }
}
