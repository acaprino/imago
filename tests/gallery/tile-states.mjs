// The tiling workspace's controls have their states, in both looks: the tab and the start button answer a hover and a press, and
// in forced colours (which drop every fill and shadow) the active tab, its wrap and the focused pane are still told from the
// others by something that is not a colour.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const TILING = '[data-g-tiling]';

const styleOf = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      weight: Number(s.fontWeight), background: s.backgroundColor, color: s.color, border: s.borderBottomWidth, borderStyle: s.borderBottomStyle,
      borderColour: s.borderBottomColor, edge: s.borderTopColor, outline: s.outlineStyle, outlineWidth: s.outlineWidth,
    };
  });

export default async function (page) {
  for (const look of LOOKS) {
    const where = (message) => `${look}: ${message}`;
    await page.evaluate((s) => window.__imago.set({ app: 'shinatama', glass: false, width: 1160, theme: 'dark', ...s }), { look });
    await page.waitForSelector(`${TILING} .im-tile-tab`, { state: 'attached' });
    await page.locator(TILING).scrollIntoViewIfNeeded();

    // Hover and press of an unselected tab, and of the start button of the empty pane.
    const tab = page.locator(`${TILING} .im-tile-tab[aria-selected="false"]`).first();
    await tab.scrollIntoViewIfNeeded();
    const tabRest = await styleOf(page, `${TILING} .im-tile-tab[aria-selected="false"]`);
    await tab.hover();
    await page.waitForTimeout(250); // its transition
    const tabHover = await styleOf(page, `${TILING} .im-tile-tab[aria-selected="false"]`);
    assert.notEqual(tabHover.background, tabRest.background, where('an unselected tab takes a wash when hovered'));
    await page.mouse.move(0, 0);

    const start = page.locator(`${TILING} .im-tile-empty-start`).first();
    await start.scrollIntoViewIfNeeded();
    const startRest = await styleOf(page, `${TILING} .im-tile-empty-start`);
    await start.hover();
    await page.waitForTimeout(250); // its transition
    const startHover = await styleOf(page, `${TILING} .im-tile-empty-start`);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const startPressed = await styleOf(page, `${TILING} .im-tile-empty-start`);
    await page.mouse.up();
    await page.mouse.move(0, 0);
    assert.notEqual(startHover.background, startRest.background, where('the start button changes its fill when hovered'));
    assert.notEqual(startPressed.background, startHover.background, where('the start button changes its fill when pressed'));
  }

  // Forced colours: what told the active tab, its wrap and the focused pane apart was a fill, a shadow and a colour.
  await page.emulateMedia({ forcedColors: 'active' });
  try {
    for (const look of LOOKS) {
      const where = (message) => `${look}, forced colours: ${message}`;
      await page.evaluate((s) => window.__imago.set({ app: 'shinatama', glass: false, width: 1160, theme: 'dark', ...s }), { look });
      await page.waitForSelector(`${TILING} .im-tile-tab`, { state: 'attached' });
      const selected = await styleOf(page, `${TILING} .im-tile-tab[aria-selected="true"]`);
      const other = await styleOf(page, `${TILING} .im-tile-tab[aria-selected="false"]`);
      assert.ok(selected.weight > other.weight, where(`the active tab is heavier (${selected.weight} against ${other.weight})`));
      const activeWrap = await styleOf(page, `${TILING} .im-tile-tabwrap-active`);
      const otherWrap = await styleOf(page, `${TILING} .im-tile-tabwrap:not(.im-tile-tabwrap-active)`);
      assert.ok(parseFloat(activeWrap.border) >= 2 && activeWrap.borderStyle === 'solid', where(`the active tab's wrap has a bar (${activeWrap.border} ${activeWrap.borderStyle})`));
      assert.ok(parseFloat(otherWrap.border) === 0 || otherWrap.borderStyle === 'none', where('another wrap has none'));
      const focused = await styleOf(page, `${TILING} .im-pane.im-focused`);
      const unfocused = await styleOf(page, `${TILING} .im-pane:not(.im-focused)`);
      assert.ok(focused.edge !== unfocused.edge || focused.outline !== unfocused.outline, where(`the focused pane is told from another by its edge or an outline (${focused.edge}/${focused.outline} against ${unfocused.edge}/${unfocused.outline})`));
      assert.notEqual(focused.outline, 'none', where('the focused pane draws an outline'));
    }
  } finally {
    await page.emulateMedia({ forcedColors: 'none' });
  }
}
