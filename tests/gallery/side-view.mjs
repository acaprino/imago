// A side view (the inspector's views, a sheet, a drawer): a header, a body that scrolls with the inset modifier, a foot with the
// actions. The gallery's row "The composition of a side view" draws it at the inspector's two widths, 300 and 360, under
// both looks and both themes. Measured: the body's padding is the tokens' (s-3 above, the pane's padding at the sides and
// below), the first section heading has no top margin, the left edge of every line of the panel, a list and a table that
// run to the edge included, is the left edge of the panel's title, and no line or control comes nearer to the panel's
// edge than the pane's padding, from the smallest width up. Without the modifier a body has no padding (it is the body of
// the content region and of the sidebar too), so the first body of the row, which has none, is the control.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const WIDTHS = [300, 360];
const EDGE = 0.75;

// The lines of a panel, read in the page: the text of every node, line by line, and every control and mark, grouped into the
// lines they stand on (items that overlap vertically are one line), each with its left and right edge.
function measure({ width }) {
  const panel = document.querySelector(`[data-g-side-view="${width}"]`);
  if (!panel) throw new Error(`the row has no side view of ${width}`);
  const title = panel.querySelector('.im-panel-title');
  const body = panel.querySelector('.im-panel-body');
  const probe = document.createElement('span');
  panel.append(probe);
  const px = (property, value) => {
    probe.style.cssText = `${property}: ${value}`;
    return parseFloat(getComputedStyle(probe)[property]);
  };
  const pad = px('padding-left', 'var(--im-pane-pad)');
  const space3 = px('padding-top', 'var(--im-s-3)');
  const space4 = px('padding-top', 'var(--im-s-4)');
  probe.remove();
  const visible = (el) => {
    for (let node = el; node && node !== panel; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
    }
    return true;
  };
  const items = [];
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim() || !node.parentElement || !visible(node.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (r.width > 0) items.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, foot: Boolean(node.parentElement.closest('.im-panel-foot')), what: node.textContent.trim().slice(0, 24) });
  }
  const marks = '.im-input, .im-select, .im-textarea, .im-check, .im-radio, .im-switch, .im-avatar, .im-dot, .im-icon-btn, .im-btn, .im-chip, .im-icon, .im-count';
  for (const el of panel.querySelectorAll(marks)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && visible(el)) items.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, foot: Boolean(el.closest('.im-panel-foot')), what: `<${el.localName} class="${el.className}">` });
  }
  items.sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];
  for (const item of items) {
    const line = lines[lines.length - 1];
    if (line && item.top < line.bottom - 1) {
      line.bottom = Math.max(line.bottom, item.bottom);
      line.items.push(item);
    } else lines.push({ bottom: item.bottom, items: [item] });
  }
  const edge = panel.getBoundingClientRect();
  const inner = { left: edge.left + panel.clientLeft, right: edge.right - panel.clientLeft };
  const first = body.querySelector('.im-section-heading');
  const bodyStyle = getComputedStyle(body);
  return {
    pad, space3, space4, title: title.getBoundingClientRect().left, inner,
    body: { top: parseFloat(bodyStyle.paddingTop), side: [parseFloat(bodyStyle.paddingLeft), parseFloat(bodyStyle.paddingRight)], bottom: parseFloat(bodyStyle.paddingBottom), overflowX: body.scrollWidth - body.clientWidth },
    heading: first ? parseFloat(getComputedStyle(first).marginTop) : null,
    sections: [...body.querySelectorAll(':scope > .im-section')].map((el) => parseFloat(getComputedStyle(el).marginTop)),
    lines: lines.map((line) => ({ left: Math.min(...line.items.map((i) => i.left)), right: Math.max(...line.items.map((i) => i.right)), what: line.items.map((i) => i.what).slice(0, 3).join(' | '), foot: line.items.every((i) => i.foot) })),
    count: lines.length,
  };
}

export default async function (page) {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      await page.evaluate((state) => window.__imago.set({ app: 'shinatama', glass: false, width: 1160, ...state }), { look, theme });
      await page.waitForSelector('[data-g-side-view]');
      for (const width of WIDTHS) {
        const where = (text) => `${look} ${theme} ${width}: ${text}`;
        const seen = await page.evaluate(measure, { width });
        assert.ok(seen.count >= 12, where(`the side view is read (${seen.count} lines)`));
        assert.deepEqual(seen.body.side, [seen.pad, seen.pad], where('the inset body has the pane padding at its sides'));
        assert.equal(seen.body.top, seen.space3, where('and the space of a group above'));
        assert.equal(seen.body.bottom, seen.pad, where('and the pane padding below'));
        assert.equal(seen.body.overflowX, 0, where('nothing of the body scrolls sideways'));
        assert.equal(seen.heading, 0, where('the first section heading has no margin above it'));
        assert.ok(seen.sections.length >= 2, where('the body holds two sections'));
        assert.equal(seen.sections[1], seen.space4, where('two sections are the space of a section apart'));
        const off = seen.lines.filter((line) => !line.foot && Math.abs(line.left - seen.title) > EDGE);
        assert.deepEqual(off.map((line) => `${line.what} at ${(line.left - seen.title).toFixed(1)}`), [], where('every line of the header and the body starts where the title does (the actions of the foot are at the right)'));
        const near = seen.lines.filter((line) => line.left < seen.inner.left + seen.pad - EDGE || line.right > seen.inner.right - seen.pad + EDGE);
        assert.deepEqual(near.map((line) => `${line.what} (${(line.left - seen.inner.left).toFixed(1)}, ${(seen.inner.right - line.right).toFixed(1)})`), [], where('no line comes nearer to the edge than the pane padding'));
      }
      // The control: a body without the modifier has no padding of its own.
      const bare = await page.evaluate(() => {
        const body = document.querySelector('[data-g-side-view="bare"] .im-panel-body');
        if (!body) throw new Error('the row has no body without the modifier');
        const style = getComputedStyle(body);
        return [style.paddingTop, style.paddingLeft, style.paddingRight, style.paddingBottom];
      });
      assert.deepEqual(bare, ['0px', '0px', '0px', '0px'], `${look} ${theme}: a body without the modifier has no padding`);
    }
  }
}
