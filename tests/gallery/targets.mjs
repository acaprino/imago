// A pointer target is at least 24px (docs/design-file.md, "A pointer target is at least 24px"): every interactive element of the
// page, in both looks and every app, is measured as the pointer meets it (the point 12px each side of its centre is on the
// control or on its label), and a click anywhere inside the box of a field puts the cursor in the field.
//
// Open, said by the report of the css area and not hidden here:
//  - ONI draws a small button (`im-btn--sm`) 22px high (`--im-h-control-sm`): the measures table of the design file prints 22 and
//    tests/tokens.test.ts pins it. A hit area round a chamfered button cannot be drawn (the clip-path and the button's overflow
//    cut it). Whether ONI's small buttons become 24 is the owner's. (The segments of `im-seg` and the title bar's command are 22
//    too, and have a hit area of 24 that is not drawn.)
//  - The splitters (6 and 8px) are drag handles at the edge of panes that scroll: a wider hit area would take the scrollbar
//    of the pane beside them.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const APPS = ['xiox', 'shinatama', 'mukade'];

/** Every interactive element that a pointer cannot hit over 24px, as `tag.class[role] WxH (W|H)`. */
const smallTargets = (page) =>
  page.evaluate(() => {
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="separator"]';
    const named = (el) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}`;
    const found = [];
    let measured = 0;
    for (const el of document.querySelectorAll(selector)) {
      // The gallery's own pickers and slider are not the package's; the skip link is off the page until it has the focus;
      // a visually hidden input (the radio of a segment) is not a target, its label is.
      if (el.disabled || el.closest('[data-g-pick], .g-width, [hidden]') || el.matches('.im-shell-skip-link')) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const first = el.getBoundingClientRect();
      if (first.width <= 2 && first.height <= 2) continue;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const box = el.getBoundingClientRect();
      measured++;
      const label = el.closest('label');
      const mine = (hit) => hit && (hit === el || el.contains(hit) || (label && label.contains(hit)));
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const wide = box.width >= 24 || [cx - 11.5, cx + 11.5].every((x) => mine(document.elementFromPoint(x, cy)));
      const high = box.height >= 24 || [cy - 11.5, cy + 11.5].every((y) => mine(document.elementFromPoint(cx, y)));
      if (wide && high) continue;
      const oniSmall = el.closest('[data-im-look="oni"]') && wide && Math.round(box.height) === 22 && el.matches('.im-btn--sm');
      const splitter = el.matches('[role="separator"]');
      if (oniSmall || splitter) continue;
      found.push(`${named(el)} ${box.width.toFixed(1)}x${box.height.toFixed(1)} (${wide ? '' : 'W'}${high ? '' : 'H'})`);
    }
    return { measured, found: [...new Set(found)] };
  });

/** A click on the box of a field, near each of its four edges, and where the cursor goes. */
async function clicksInField(page, selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} is on the page`);
  const inset = 3;
  const points = {
    top: [box.x + box.width / 2, box.y + inset],
    bottom: [box.x + box.width / 2, box.y + box.height - inset],
    left: [box.x + inset, box.y + box.height / 2],
    right: [box.x + box.width - inset, box.y + box.height / 2],
  };
  const out = {};
  for (const [side, [x, y]] of Object.entries(points)) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.click(x, y);
    out[side] = await page.evaluate(() => document.activeElement?.tagName);
  }
  return out;
}

export default async function (page) {
  // A field is its whole box: a click near an edge, in the padding, puts the cursor in the input.
  for (const look of LOOKS) {
    await page.evaluate((s) => window.__imago.set({ app: 'xiox', glass: false, width: 1160, theme: 'dark', ...s }), { look });
    await page.waitForSelector('#im-gallery-matrix [data-control="field"][data-state="rest"] .im-input');
    for (const control of ['field', 'search']) {
      const selector = `#im-gallery-matrix [data-control="${control}"][data-state="rest"] .im-input`;
      await page.locator(selector).scrollIntoViewIfNeeded();
      const clicks = await clicksInField(page, selector);
      assert.deepEqual(clicks, { top: 'INPUT', bottom: 'INPUT', left: 'INPUT', right: 'INPUT' }, `${look} ${control}: a click near each edge of the box focuses the input`);
    }
  }

  for (const look of LOOKS) {
    for (const app of APPS) {
      await page.evaluate((s) => window.__imago.set({ glass: false, width: 1160, theme: 'dark', ...s }), { app, look });
      await page.waitForTimeout(150);
      const { measured, found } = await smallTargets(page);
      assert.ok(measured > 100, `${look} ${app}: the interactive elements of the page are measured (${measured})`);
      assert.deepEqual(found, [], `${look} ${app}: a pointer target under 24px`);
    }
  }
}
