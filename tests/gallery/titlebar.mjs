// The title bar's tools and action (the row "Tools and the action in the title bar" of the feedback patterns): the bar
// titlebarHtml writes for Shinatama, drawn at 1100, 1000, 850, 620, 500, 400, 340 and 250 wide, each its own container of the shell, in
// both looks and both themes. Measured: the tools are quiet (ghost) buttons that are not tabs, shown from 1000 and gone under it
// (the Views button stands for them from then on); the one primary action is always in the bar, with its label from 620 and its
// icon and its name only under it; and the three window buttons, the sidebar button, the Views button and the action never
// leave the bar, down to 250 CSS pixels (a 500px window at 200% zoom). The ghost option of uiButton is the same drawing.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const WIDTHS = [1100, 1000, 850, 620, 500, 400, 340, 250];
const EDGE = 0.5;

function measure(width) {
  const bar = document.querySelector(`[data-g-titlebar="${width}"]`);
  if (!bar) throw new Error(`the row has no title bar of ${width}`);
  const shell = bar.getBoundingClientRect();
  const shown = (el) => Boolean(el) && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left - shell.left, right: r.right - shell.left, top: r.top - shell.top, bottom: r.bottom - shell.top, width: r.width, height: r.height };
  };
  const one = (selector) => bar.querySelector(selector);
  const header = one('.im-titlebar');
  const tools = [...bar.querySelectorAll('.im-titlebar-tools .im-btn')];
  const action = one('.im-titlebar-action');
  const parts = {
    tools: one('.im-titlebar-tools'), action, toggle: one('.im-sidebar-toggle'), views: one('.im-views-menu'), command: one('.im-titlebar-command'),
    minimize: one('[data-im-window="minimize"]'), maximize: one('[data-im-window="maximize"]'), close: one('[data-im-window="close"]'),
  };
  const children = [...header.children].filter((el) => shown(el) && el.getBoundingClientRect().width > 0).map((el) => ({ name: el.className || el.tagName, ...rect(el) }));
  const toolStyle = (el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, border: s.borderTopColor, color: s.color, weight: s.fontWeight };
  };
  return {
    shell: { width: shell.width, height: shell.height },
    shown: Object.fromEntries(Object.entries(parts).map(([name, el]) => [name, shown(el)])),
    rects: Object.fromEntries(Object.entries(parts).filter(([, el]) => shown(el)).map(([name, el]) => [name, rect(el)])),
    children,
    scrollWidth: header.scrollWidth, clientWidth: header.clientWidth,
    tools: tools.map((el) => ({ text: el.textContent.trim(), pressed: el.getAttribute('aria-pressed'), role: el.getAttribute('role'), selected: el.getAttribute('aria-selected'), classes: el.className, style: toolStyle(el) })),
    action: action ? { text: action.textContent.trim(), fontSize: getComputedStyle(action).fontSize, hasIcon: Boolean(action.querySelector(':scope > .im-icon')) } : null,
    tabs: { shown: shown(one('.im-tabs')), widths: [...bar.querySelectorAll('.im-tab')].map((el) => el.getBoundingClientRect().width) },
    primaries: bar.querySelectorAll('.im-btn--primary').length,
  };
}

export default async function (page) {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      await page.evaluate((state) => window.__imago.set({ app: 'shinatama', glass: false, width: 1160, ...state }), { look, theme });
      await page.waitForSelector('[data-g-titlebar]', { state: 'attached' });
      for (const width of WIDTHS) {
        const where = (text) => `${look} ${theme} ${width}: ${text}`;
        const seen = await page.evaluate(measure, width);
        assert.equal(seen.shell.width, width, where('the preview is as wide as it says'));
        // Never pushed out: the named parts and every visible child of the bar are inside it, and the bar does not scroll.
        for (const name of ['minimize', 'maximize', 'close', 'action']) {
          const r = seen.rects[name];
          assert.ok(r, where(`the ${name} is drawn`));
          assert.ok(r.left >= -EDGE && r.right <= seen.shell.width + EDGE, where(`the ${name} stays in the bar (${r.left.toFixed(1)} to ${r.right.toFixed(1)} of ${width})`));
          assert.ok(r.top >= -EDGE && r.bottom <= seen.shell.height + EDGE, where(`the ${name} stays in the bar's height`));
        }
        if (width < 620) {
          for (const name of ['toggle', 'views']) {
            const r = seen.rects[name];
            assert.ok(r, where(`the ${name} is drawn`));
            assert.ok(r.left >= -EDGE && r.right <= seen.shell.width + EDGE, where(`the ${name} stays in the bar`));
          }
        }
        for (const child of seen.children) assert.ok(child.left >= -EDGE && child.right <= seen.shell.width + EDGE, where(`${child.name} is in the bar (${child.left.toFixed(1)} to ${child.right.toFixed(1)})`));
        assert.ok(seen.scrollWidth <= seen.clientWidth + 1, where(`the bar does not overflow (${seen.scrollWidth} in ${seen.clientWidth})`));
        // In order, and not on one another: the action is before the window buttons.
        for (const [a, b] of [['toggle', 'views'], ['views', 'action'], ['action', 'minimize']]) {
          if (seen.rects[a] && seen.rects[b]) assert.ok(seen.rects[a].right <= seen.rects[b].left + EDGE, where(`${a} ends before ${b} starts`));
        }
        // The tools: from 1000 in the bar; under it in the Views menu of the app, whose button is then shown.
        assert.equal(seen.shown.tools, width >= 1000, where(`the tools are ${width >= 1000 ? 'shown' : 'gone'}`));
        assert.equal(seen.shown.views, width < 1000, where('the Views button is shown when the tools or the tabs are not in the bar'));
        // A bar with tools folds its tabs into the Views menu under 850, a step before the others (620): a tab is never squeezed
        // under a pointer target.
        assert.equal(seen.tabs.shown, width >= 850, where(`the tabs are ${width >= 850 ? 'shown' : 'in the Views menu'}`));
        for (const tab of seen.tabs.widths.filter(() => seen.tabs.shown)) assert.ok(tab >= 24, where(`a tab is ${tab.toFixed(1)} wide: a pointer target is 24`));
        assert.equal(seen.primaries, 1, where('one primary action in the bar'));
        // The action: its label from 620, its icon and its name under it.
        assert.equal(seen.action.text, 'New session', where('the action keeps its words'));
        assert.ok(seen.action.hasIcon, where('the action has its icon'));
        if (width >= 620) assert.notEqual(seen.action.fontSize, '0px', where('the action shows its label'));
        else {
          assert.equal(seen.action.fontSize, '0px', where('the action shows only its icon'));
          assert.ok(seen.rects.action.width >= 24 && seen.rects.action.height >= 22, where(`the action is a target (${seen.rects.action.width} by ${seen.rects.action.height})`));
        }
      }
      // The tools, read at 1100.
      const wide = await page.evaluate(measure, 1100);
      const label = (text) => `${look} ${theme}: ${text}`;
      assert.deepEqual(wide.tools.map((t) => t.text), ['Sessions', 'Overview', 'Files', 'Leftovers'], label('the four tools of Shinatama'));
      assert.deepEqual(wide.tools.map((t) => t.pressed), [null, 'true', 'false', 'false'], label('aria-pressed only where the app says pressed'));
      for (const tool of wide.tools) {
        assert.equal(tool.role, null, label(`${tool.text} is not a tab`));
        assert.equal(tool.selected, null, label(`${tool.text} has no aria-selected`));
        assert.ok(tool.classes.includes('im-btn--ghost'), label(`${tool.text} is ghost`));
      }
      // Quiet at rest: no fill and no edge, as every ghost button; the pressed one is drawn as selected.
      const [first, second] = wide.tools;
      assert.equal(first.style.background, 'rgba(0, 0, 0, 0)', label('a tool has no fill at rest'));
      // ONI keeps the edge of its buttons, the ghost's a soft one (css/looks/oni.css): only Smooth's ghost has none.
      if (look === 'smooth') assert.equal(first.style.border, 'rgba(0, 0, 0, 0)', label('and no edge'));
      else assert.notEqual(first.style.border, 'rgba(0, 0, 0, 0)', label('in ONI it has the soft edge of its buttons'));
      assert.notEqual(second.style.background, first.style.background, label('a pressed tool is drawn as selected'));
      const tabs = wide.children.find((child) => String(child.name).includes('im-tabs'));
      assert.ok(wide.rects.tools.left >= tabs.right - EDGE, label('the tools come after the tabs'));
      // Under 620 the action shows its icon alone, and the label is still its name.
      for (const width of [500, 250]) {
        const named = page.locator(`[data-g-titlebar="${width}"]`).getByRole('button', { name: 'New session' });
        assert.equal(await named.count(), 1, label(`at ${width} the action is still the button named New session`));
      }
      // uiButton passes the option on.
      const ui = await page.evaluate(() => window.__imagoParts.uiButton('Quiet', { ghost: true, sm: true }).className);
      assert.equal(ui, 'im-btn im-btn--ghost im-btn--sm', label('uiButton writes ghost'));
    }
  }
}
