// Small things of the stylesheets that a state matrix does not reach, each measured in both looks: a pressed icon button has its
// drawing, a title-bar tab shows its press, `im-stack` answers its gap hook, the scrollbar thumb is a mark that is seen, and
// no stylesheet reads a custom property that nothing defines (`--im-panel-pad`).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const css = fileURLToPath(new URL('../../css/', import.meta.url));

export default async function (page) {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      const where = (message) => `${look} ${theme}: ${message}`;
      await page.evaluate((s) => window.__imago.set({ app: 'xiox', glass: false, width: 1160, ...s }), { look, theme });
      await page.waitForSelector('#im-gallery-matrix [data-control="icon-button"][data-state="selected"]', { state: 'attached' });

      // An icon button that toggles (aria-pressed) draws it: the selection fill and a bar inside its bottom edge, at the same size.
      const cells = await page.evaluate(() => {
        const read = (state) => {
          const el = document.querySelector(`#im-gallery-matrix [data-control="icon-button"][data-state="${state}"] .im-icon-btn`);
          const s = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return { bg: s.backgroundColor, shadow: s.boxShadow, color: s.color, width: box.width, height: box.height, pressed: el.getAttribute('aria-pressed') };
        };
        return { rest: read('rest'), selected: read('selected') };
      });
      assert.equal(cells.selected.pressed, 'true', where('the selected cell of the icon button is a pressed toggle'));
      assert.notEqual(cells.selected.bg, cells.rest.bg, where('a pressed icon button has the selection fill'));
      assert.ok(/ 0px -2px /.test(cells.selected.shadow) && !/ 0px -2px /.test(cells.rest.shadow), where(`a pressed icon button has a bar inside its bottom edge (${cells.selected.shadow})`));
      assert.deepEqual([cells.selected.width, cells.selected.height], [cells.rest.width, cells.rest.height], where('pressed does not change the size'));

      // A tab of the title bar shows that it is pressed (the hover rule that takes its wash away does not take the press's).
      const tab = page.locator('#g-window .im-titlebar .im-tab[aria-selected="false"]').first();
      await tab.hover();
      await page.waitForTimeout(250); // the tab's transition
      const hovered = await tab.evaluate((el) => getComputedStyle(el).backgroundColor);
      await page.mouse.down();
      await page.waitForTimeout(250);
      const pressed = await tab.evaluate((el) => getComputedStyle(el).backgroundColor);
      await page.mouse.up();
      await page.mouse.move(0, 0);
      assert.notEqual(pressed, hovered, where(`a pressed title-bar tab shows the press (${hovered} then ${pressed})`));
      assert.notEqual(pressed, 'rgba(0, 0, 0, 0)', where('the press is a fill'));

      // `im-stack` is one rule: its gap is the hook's, and 8px (`--im-s-2`) without it.
      const gaps = await page.evaluate(() => {
        const host = document.querySelector('#g-window .im-shell');
        const make = (style) => {
          const el = document.createElement('div');
          el.className = 'im-stack';
          el.style.cssText = style;
          el.innerHTML = '<i>a</i><i>b</i>';
          host.append(el);
          const gap = getComputedStyle(el).rowGap;
          el.remove();
          return gap;
        };
        return { plain: make(''), hooked: make('--im-gap: 20px'), space: getComputedStyle(host).getPropertyValue('--im-s-2').trim() };
      });
      assert.equal(gaps.plain, gaps.space, where(`im-stack has a gap of --im-s-2 by default (${gaps.plain})`));
      assert.equal(gaps.hooked, '20px', where('im-stack answers --im-gap'));

      // An element that carries a look and a theme and no app has an accent (the hue has a default), and one with an app keeps its own.
      const hues = await page.evaluate(() => {
        const host = document.querySelector('#g-window');
        const make = (attrs) => {
          const el = document.createElement('div');
          for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
          el.innerHTML = '<button class="im-btn im-btn--primary" type="button">Go</button>';
          host.append(el);
          const out = { hue: getComputedStyle(el).getPropertyValue('--im-hue').trim(), fill: getComputedStyle(el.firstChild).backgroundColor };
          el.remove();
          return out;
        };
        const { imLook, imTheme } = { imLook: host.dataset.imLook, imTheme: host.dataset.imTheme };
        return { none: make({ 'data-im-look': imLook, 'data-im-theme': imTheme }), app: make({ 'data-im-look': imLook, 'data-im-theme': imTheme, 'data-im-app': 'xiox' }) };
      });
      assert.notEqual(hues.none.hue, '', where('a look without an app has a hue'));
      assert.ok(!['rgba(0, 0, 0, 0)', 'transparent'].includes(hues.none.fill), where(`its primary button has a fill (${hues.none.fill})`));
      assert.equal(hues.app.hue, '75', where("an app keeps its own hue (xiox's)"));

      // A field's label is one drawing: the bare span a renderer writes (textFieldHtml) and `im-field-label` look the same.
      const labels = await page.evaluate(() => {
        const host = document.querySelector('#g-window .im-shell');
        const wrap = document.createElement('div');
        wrap.innerHTML = '<div class="im-field"><span>Name</span><span class="im-input"><input type="text"></span></div><div class="im-field"><span class="im-field-label">Name</span><span class="im-input"><input type="text"></span></div>';
        host.append(wrap);
        const [bare, classed] = [...wrap.querySelectorAll('.im-field > span:first-child')].map((el) => {
          const s = getComputedStyle(el);
          return [s.fontWeight, s.fontSize, s.lineHeight, s.color, s.fontFamily].join('|');
        });
        const input = getComputedStyle(wrap.querySelector('.im-input')).fontWeight;
        wrap.remove();
        return { bare, classed, input };
      });
      assert.equal(labels.bare, labels.classed, where('a bare span label is drawn as im-field-label'));
      assert.equal(labels.input, '400', where('the box of a field is not bold'));

      // The thumb of a scrollbar is a mark: at least 3:1 on the surface it is on.
      const thumb = await page.evaluate(() => {
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
        const channel = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
        const luminance = ([r, g2, b]) => 0.2126 * channel(r) + 0.7152 * channel(g2) + 0.0722 * channel(b);
        const body = document.querySelector('#g-window .im-panel-body');
        const probe = document.createElement('i');
        probe.style.color = 'var(--im-line-strong)';
        body.append(probe);
        const strong = getComputedStyle(probe).color;
        probe.remove();
        const layers = [];
        for (let node = body; node; node = node.parentElement) {
          const paint = getComputedStyle(node).backgroundColor;
          if (paint !== 'rgba(0, 0, 0, 0)' && paint !== 'transparent') layers.unshift(paint);
        }
        const [hi, lo] = [luminance(flatten([...layers, strong])), luminance(flatten(layers))].sort((a, b) => b - a);
        const scrollbar = getComputedStyle(body).scrollbarColor;
        return { strongFirst: scrollbar.startsWith(strong), scrollbar, ratio: (hi + 0.05) / (lo + 0.05) };
      });
      assert.ok(thumb.strongFirst, where(`the scrollbar thumb is --im-line-strong (${thumb.scrollbar})`));
      assert.ok(thumb.ratio >= 3, where(`the scrollbar thumb is ${thumb.ratio.toFixed(2)}:1 on its panel`));
    }
  }

  // In forced colours a pressed icon button is told from one at rest by its edge (its fill, its colour and its shadow are dropped).
  await page.emulateMedia({ forcedColors: 'active' });
  try {
    for (const look of LOOKS) {
      await page.evaluate((s) => window.__imago.set({ app: 'xiox', glass: false, width: 1160, theme: 'dark', ...s }), { look });
      await page.waitForSelector('#im-gallery-matrix [data-control="icon-button"][data-state="selected"]', { state: 'attached' });
      const edges = await page.evaluate(() => {
        const read = (state) => {
          const s = getComputedStyle(document.querySelector(`#im-gallery-matrix [data-control="icon-button"][data-state="${state}"] .im-icon-btn`));
          return [s.borderTopColor, s.borderTopStyle, s.borderTopWidth].join(' ');
        };
        return { rest: read('rest'), selected: read('selected') };
      });
      assert.notEqual(edges.selected, edges.rest, `${look}, forced colours: a pressed icon button has an edge of its own (${edges.selected} against ${edges.rest})`);
    }
  } finally {
    await page.emulateMedia({ forcedColors: 'none' });
  }

  // Nothing reads a custom property that no rule sets: `--im-panel-pad` was never defined (the panel's is `--im-pane-pad`).
  const sources = readdirSync(css, { recursive: true }).filter((name) => String(name).endsWith('.css')).map((name) => readFileSync(`${css}${name}`, 'utf8'));
  assert.ok(sources.every((text) => !text.includes('--im-panel-pad')), 'css/ reads --im-panel-pad, which nothing defines (--im-pane-pad is the panel padding)');
}
