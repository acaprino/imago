// The overview strip beside a list that scrolls by itself: the frame follows the scroll, a press on the track jumps,
// a drag on the frame moves it from where it was taken, the wheel scrolls, a press on the band is the band's, and the
// strip is drawn in the look's colours, under both looks and both themes.
import assert from 'node:assert/strict';

export default async (page) => {
  for (const look of ['smooth', 'oni']) {
    for (const theme of ['dark', 'light']) {
      const where = (text) => `${look} ${theme}: ${text}`;
      await page.evaluate((state) => window.__imago.set({ app: 'shinatama', glass: false, width: 1160, ...state }), { look, theme });
      await page.waitForFunction(() => Boolean(window.__overview));
      const region = page.getByRole('region', { name: 'Overview strip' });
      await region.scrollIntoViewIfNeeded();
      const strip = region.locator('.im-overview');
      const list = region.getByLabel('Sample rows').locator('div').first();
      const state = () => page.evaluate(() => {
        const strip = document.querySelector('.im-overview');
        const frame = strip.querySelector('.im-overview-frame').getBoundingClientRect();
        const box = strip.getBoundingClientRect();
        const list = strip.previousElementSibling;
        return { top: frame.top - box.top, height: frame.height, scroll: list.scrollTop, max: list.scrollHeight - list.clientHeight, box: { x: box.x, y: box.y, width: box.width, height: box.height } };
      });
      const clear = () => page.evaluate(() => { window.__overview.events.length = 0; });
      const events = () => page.evaluate(() => [...window.__overview.events]);

      assert.equal(await strip.getAttribute('aria-hidden'), 'true', where('the strip is a pointer shortcut, hidden from assistive technology'));
      await list.evaluate(el => { el.scrollTop = 0; });
      await page.waitForTimeout(30);
      const start = await state();
      assert.ok(start.height > 4 && start.top >= 23, where(`the frame sits under the band (${start.top}, ${start.height})`));

      // A press low on the track jumps there, holds, and a release ends it.
      await clear();
      await page.mouse.click(start.box.x + start.box.width / 2, start.box.y + start.box.height - 10);
      await page.waitForTimeout(50); // the sample repaints on the list's scroll event
      const jumped = await state();
      assert.ok(jumped.scroll > jumped.max * 0.8, where(`a press near the bottom scrolls near the end (${jumped.scroll} of ${jumped.max})`));
      assert.ok(jumped.top > start.top + 100, where('and the frame follows'));
      assert.deepEqual(await events(), ['press:track', 'release:true'], where('press then release'));

      // A drag on the frame moves the view by as much as the frame moves.
      await clear();
      const frameY = jumped.box.y + jumped.top + jumped.height / 2;
      await page.mouse.move(start.box.x + start.box.width / 2, frameY);
      await page.mouse.down();
      await page.mouse.move(start.box.x + start.box.width / 2, frameY - 80, { steps: 4 });
      const dragging = await strip.getAttribute('data-im-dragging');
      await page.mouse.up();
      await page.waitForTimeout(50);
      const dragged = await state();
      assert.equal(dragging, '', where('the strip says it is being dragged'));
      assert.ok(Math.abs((jumped.top - dragged.top) - 80) <= 3, where(`the frame moved with the pointer (${jumped.top} → ${dragged.top})`));
      const seen = await events();
      assert.equal(seen[0], 'press:frame', where('the press was on the frame'));
      assert.ok(seen.includes('drag') && seen.at(-1) === 'release:true', where(`drags, then the release (${seen})`));
      assert.equal(await strip.getAttribute('data-im-dragging'), null, where('and no longer dragged'));

      // The wheel scrolls; a press on the band is the band's and holds nothing.
      await clear();
      await page.mouse.move(start.box.x + start.box.width / 2, start.box.y + 120);
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(30);
      assert.ok((await state()).scroll < dragged.scroll, where('the wheel scrolls the view'));
      await page.mouse.click(start.box.x + start.box.width / 2, start.box.y + 6);
      assert.deepEqual((await events()).filter(event => event !== 'wheel'), ['press:band'], where('a press on the band is reported and not held'));

      // The look's colours: the trace and the band read them from the strip.
      const ink = await page.evaluate(() => {
        const probe = (value) => { const span = document.createElement('span'); span.style.color = value; document.body.append(span); const color = getComputedStyle(span).color; span.remove(); return color; };
        return { ...window.__overview.ink(), info: probe('var(--im-info)'), muted: probe('var(--im-muted)') };
      });
      assert.equal(ink.trace, ink.info, where('the trace is in the info colour'));
      assert.equal(ink.band, ink.muted, where('the band is muted'));
    }
  }
};
