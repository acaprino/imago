// The focus ring is seen: (1) against what it is drawn on (an inside ring on a button's fill must not be the fill's own
// colour: the primary button's ring in ONI was 1.00:1), and (2) whole: no container that clips (overflow, a scroller)
// cuts the ring of any focusable element of the page, from the keyboard, in both looks and every app.
import assert from 'node:assert/strict';
import { CONTROLS } from '../../gallery/manifest.ts';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const APPS = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];
// A mark (a ring, an edge that tells a state) is at least 3:1 on what it stands on (WCAG 1.4.11).
const MARK = 3;

/** For every cell of the matrix in the focus state: the ring's colour and the colour it is drawn on, flattened. */
const ringsOf = (page) =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const flatten = (colours) => {
      g.clearRect(0, 0, 1, 1);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 1, 1);
      for (const c of colours) {
        g.fillStyle = c;
        g.fillRect(0, 0, 1, 1);
      }
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    // Every colour under an element, outermost first, with a button's wash (an inset shadow as wide as the box).
    const background = (el) => {
      const layers = [];
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const own = [];
        if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') own.push(style.backgroundColor);
        for (const wash of style.boxShadow.matchAll(/((?:rgba?|color|oklch|hsla?)\([^)]*\)) 0px 0px 0px (\d+(?:\.\d+)?)px inset/g)) {
          if (Number(wash[2]) >= 50) own.push(wash[1]);
        }
        layers.unshift(...own);
      }
      return layers;
    };
    const channel = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r, g2, b]) => 0.2126 * channel(r) + 0.7152 * channel(g2) + 0.0722 * channel(b);
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const out = [];
    for (const cell of document.querySelectorAll('#im-gallery-matrix [data-control][data-state="focus"]')) {
      const el = cell.querySelector('.im-btn, .im-icon-btn, .im-input, .im-select, .im-check, .im-radio, .im-switch, .im-tab, .im-seg > button, .im-seg > label, .im-row, .im-tree-item, tbody tr, .im-menu-item, .im-textarea');
      if (!el) continue;
      const s = getComputedStyle(el);
      const offset = parseFloat(s.outlineOffset);
      // A ring inside the box stands on the box's own fill; one outside, on what is behind the box.
      const under = background(offset < 0 ? el : el.parentElement);
      const fill = flatten(under);
      const ring = flatten([...under, s.outlineColor]);
      out.push({ control: cell.dataset.control, offset, ring: ring.join(','), fill: fill.join(','), ratio: ratio(ring, fill) });
    }
    return out;
  });

/** Every focusable element of the page, focused from the keyboard: the ring's outer edge against every ancestor that clips. */
const cutRings = (page) =>
  page.evaluate(() => {
    const selector = 'a[href], button, input, select, textarea, summary, [tabindex], [role="tab"], [role="separator"]';
    const named = (el) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}`;
    const found = [];
    let scanned = 0;
    for (const el of document.querySelectorAll(selector)) {
      if (el.disabled || el.tabIndex < -1 || el.closest('[data-g-pick], .g-width, [hidden], [inert]')) continue;
      const box = el.getBoundingClientRect();
      // A visually hidden control (the radio under a segment, 1px) is not seen: its label is.
      if (box.width <= 3 || box.height <= 3 || getComputedStyle(el).visibility === 'hidden') continue;
      el.focus({ focusVisible: true });
      if (!el.matches(':focus-visible')) continue;
      const style = getComputedStyle(el);
      if (style.outlineStyle === 'none') continue;
      scanned++;
      const reach = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      const at = el.getBoundingClientRect();
      const ring = { l: at.left - reach, t: at.top - reach, r: at.right + reach, b: at.bottom + reach };
      for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const cs = getComputedStyle(ancestor);
        if (cs.display === 'contents' || (cs.overflowX === 'visible' && cs.overflowY === 'visible')) continue;
        const frame = ancestor.getBoundingClientRect();
        const left = frame.left + parseFloat(cs.borderLeftWidth);
        const top = frame.top + parseFloat(cs.borderTopWidth);
        const edge = { l: left, t: top, r: left + ancestor.clientWidth, b: top + ancestor.clientHeight };
        // The element itself is partly out of that container (scrolled): what shows of it is for the scroll to decide.
        if (at.left < edge.l - 0.5 || at.top < edge.t - 0.5 || at.right > edge.r + 0.5 || at.bottom > edge.b + 0.5) continue;
        const cut = { left: edge.l - ring.l, top: edge.t - ring.t, right: ring.r - edge.r, bottom: ring.b - edge.b };
        const sides = Object.entries(cut).filter(([, px]) => px > 0.5).map(([side, px]) => `${side} ${px.toFixed(1)}px`);
        if (sides.length) found.push(`${named(el)} is cut by ${named(ancestor)}: ${sides.join(', ')}`);
      }
      el.blur();
    }
    return { scanned, found: [...new Set(found)] };
  });

export default async function (page) {
  // The ring of every control of the matrix, in every look, theme and app, is seen against what it stands on.
  const withFocus = CONTROLS.filter(({ states }) => states.includes('focus')).map(({ id }) => id);
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      for (const app of APPS) {
        await page.evaluate((s) => window.__imago.set({ glass: false, width: 1160, ...s }), { app, look, theme });
        await page.waitForSelector('#im-gallery-matrix [data-control][data-state="focus"]', { state: 'attached' });
        const rings = await ringsOf(page);
        const where = (message) => `${look} ${theme} ${app}: ${message}`;
        assert.deepEqual([...new Set(rings.map((r) => r.control))].sort(), [...withFocus].sort(), where('every control with a focus state is read'));
        const faint = rings.filter((r) => r.ratio < MARK).map((r) => `${r.control}: ring ${r.ring} on ${r.fill} is ${r.ratio.toFixed(2)}:1`);
        assert.deepEqual(faint, [], where(`a focus ring under ${MARK}:1 against what it is drawn on`));
      }
    }
  }

  // The ring of every focusable element of the page is whole: nothing that clips cuts it.
  for (const look of LOOKS) {
    for (const app of APPS) {
      await page.evaluate((s) => window.__imago.set({ glass: false, width: 1160, theme: 'dark', ...s }), { app, look });
      await page.waitForTimeout(150);
      await page.keyboard.press('Tab'); // the keyboard is what the page was last used with, so a programmatic focus shows its ring
      const { scanned, found } = await cutRings(page);
      assert.ok(scanned > 100, `${look} ${app}: the focusable elements of the page are scanned (${scanned})`);
      assert.deepEqual(found, [], `${look} ${app}: a focus ring is cut by a container that clips`);
    }
  }
}
