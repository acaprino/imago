// The DOM parts an app composes a stateful view with, and the roles, tones and emphases it gives them by name:
// Imago draws each one, under both looks and both themes, and the app never writes one of its classes.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];

export default async (page) => {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      const where = (text) => `${look} ${theme}: ${text}`;
      await page.evaluate((state) => window.__imago.set({ app: 'shinatama', glass: false, width: 1160, ...state }), { look, theme });
      await page.waitForFunction(() => Boolean(window.__imagoParts));
      const seen = await page.evaluate(() => {
        const { uiButton, uiEmphasis, uiPart, uiTone, uiTraits } = window.__imagoParts;
        const shell = document.querySelector('.im-shell');
        const host = uiPart('stack');
        shell.append(host);
        const ink = (value) => {
          const probe = document.createElement('span');
          probe.style.color = value;
          host.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        // A long list in a bounded scroll: it scrolls inside, it does not grow the page.
        const list = uiTraits(uiPart('orderedList'), 'scroll', 'bounded');
        for (let index = 0; index < 200; index++) list.append(uiPart('item', `Row ${index}`));
        const status = uiPart('status', 'Saved');
        const words = uiTraits(uiPart('text', 'A very long name that does not fit in the narrow row it was given'), 'truncate');
        words.style.display = 'block';
        words.style.width = '80px';
        const button = uiButton('Delete 8 items');
        // The state is read at once: a transition would still show the colour it comes from.
        button.style.transition = 'none';
        status.style.transition = 'none';
        host.append(list, status, words, button);
        const plain = getComputedStyle(status).color;
        const toned = {};
        for (const tone of ['ok', 'warn', 'err']) toned[tone] = getComputedStyle(uiTone(status, tone)).color;
        const toneClasses = status.className;
        uiTone(status, null);
        const back = getComputedStyle(status).color;
        const plainButton = getComputedStyle(button).backgroundColor;
        uiEmphasis(button, 'danger');
        const danger = { classes: button.className, color: getComputedStyle(button).color };
        uiEmphasis(button, 'primary');
        const primary = { classes: button.className, background: getComputedStyle(button).backgroundColor };
        uiEmphasis(button, null);
        const result = {
          listClasses: list.className, listHeight: list.getBoundingClientRect().height, listScroll: list.scrollHeight,
          viewport: innerHeight, overflow: getComputedStyle(list).overflowY,
          plain, back, toned, tones: { ok: ink('var(--im-ok)'), warn: ink('var(--im-warn)'), err: ink('var(--im-err)') }, toneClasses,
          truncated: words.scrollWidth > words.clientWidth, ellipsis: getComputedStyle(words).textOverflow,
          danger, dangerInk: ink('var(--im-err)'), primary, plainButton, buttonAfter: button.className,
        };
        host.remove();
        return result;
      });
      assert.equal(seen.listClasses, 'im-ordered-list im-scroll im-scroll--bounded', where('the roles add Imago\'s classes to the part\'s own'));
      assert.ok(seen.listHeight < seen.viewport * 0.5 + 1, where(`a bounded scroll stays under half the window (${seen.listHeight} of ${seen.viewport})`));
      assert.ok(seen.listScroll > seen.listHeight, where('and its rows scroll inside it'));
      assert.ok(['auto', 'scroll'].includes(seen.overflow), where(`it scrolls (${seen.overflow})`));
      for (const tone of ['ok', 'warn', 'err']) assert.equal(seen.toned[tone], seen.tones[tone], where(`the ${tone} tone is the look's colour`));
      assert.equal(seen.toneClasses.split(' ').filter((name) => name.startsWith('im-text-')).length, 1, where('one tone at a time'));
      assert.equal(seen.back, seen.plain, where('null gives the text its own colour back'));
      assert.ok(seen.truncated && seen.ellipsis === 'ellipsis', where('truncate ends a long text with an ellipsis'));
      assert.ok(seen.danger.classes.includes('im-btn--danger') && !seen.danger.classes.includes('im-btn--primary'), where('danger arms the button'));
      assert.equal(seen.danger.color, seen.dangerInk, where('in the error colour'));
      assert.ok(seen.primary.classes.includes('im-btn--primary') && !seen.primary.classes.includes('im-btn--danger'), where('primary replaces danger'));
      assert.notEqual(seen.primary.background, seen.plainButton, where('and fills the button'));
      assert.ok(!/im-btn--(primary|danger)/.test(seen.buttonAfter), where('null makes it plain again'));
    }
  }
};
