// Steps, in the browser: one drawing, im-steps, for a step that only shows and a step that can be opened. A step that can
// be opened is a button inside its item, with the common hover, press, focus (2px inside) and selected, and disabled as a
// dashed edge and the muted colour. The gallery mounts the lists in gallery/mount/steps.ts.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const APPS = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];
const STATES = ['rest', 'hover', 'press', 'focus', 'selected', 'disabled'];

async function show(page, state) {
  await page.evaluate((s) => window.__imago.set(s), state);
  await page.waitForFunction(
    ({ look, theme, app }) => {
      const box = document.getElementById('im-gallery-steps');
      return box?.getAttribute('data-im-look') === look && box.getAttribute('data-im-theme') === theme && box.getAttribute('data-im-app') === app;
    },
    state,
  );
}

// Everything read in the page in one round trip: for each state, the first step's item and button, and the hardest text.
const measure = (page) =>
  page.evaluate((states) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    // Paints the colours one over the other and reads back what the eye sees.
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
    const under = (el) => {
      const layers = [];
      for (let node = el; node; node = node.parentElement) {
        const colour = getComputedStyle(node).backgroundColor;
        if (colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') layers.unshift(colour);
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
    const worstText = (root) => {
      let worst = { ratio: Infinity, text: '' };
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const holder = node.parentElement;
        const s = getComputedStyle(holder);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const fill = flatten(under(holder));
        const r = ratio(flatten([...under(holder), s.color]), fill);
        if (r < worst.ratio) worst = { ratio: r, text: node.textContent.trim() };
      }
      return worst;
    };
    const box = document.getElementById('im-gallery-steps');
    const muted = flatten([getComputedStyle(box).getPropertyValue('--im-muted').trim()]).join(',');
    const accentText = flatten([getComputedStyle(box).getPropertyValue('--im-accent-text').trim()]).join(',');
    const accent = flatten([getComputedStyle(box).getPropertyValue('--im-accent').trim()]).join(',');
    const out = {};
    for (const state of states) {
      const list = box.querySelector(`[data-g-steps="${state}"] .im-steps`);
      const button = list.querySelector('[data-id="scan"]');
      const item = button.parentElement;
      const index = button.querySelector('.im-step-index');
      const text = button.querySelector('.im-step-text');
      const b = getComputedStyle(button);
      const li = getComputedStyle(item);
      const rect = item.getBoundingClientRect();
      let opacity = 1;
      for (let node = button; node && node !== box; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      out[state] = {
        list: { tag: list.tagName, role: list.getAttribute('role') },
        itemTag: item.tagName,
        fill: flatten(under(text)).join(','),
        textColor: flatten([...under(text), getComputedStyle(text).color]).join(','),
        outline: { style: b.outlineStyle, width: b.outlineWidth, offset: parseFloat(b.outlineOffset) },
        edge: { style: li.borderTopStyle, color: flatten([...under(item), li.borderTopColor]).join(',') },
        indexFill: flatten([...under(index), getComputedStyle(index).backgroundColor]).join(','),
        size: { width: rect.width, height: rect.height },
        buttonFillsItem: Math.abs(button.getBoundingClientRect().width - item.clientWidth) < 0.5,
        cursor: b.cursor,
        opacity,
        worst: worstText(list),
      };
    }
    const process = box.querySelector('[data-g-steps="process"] .im-steps');
    out.process = { worst: worstText(process), buttons: process.querySelectorAll(':scope > li > button').length };
    return { states: out, muted, accentText, accent };
  }, STATES);

export default async function (page) {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      for (const app of APPS) {
        await show(page, { app, look, theme, glass: false, width: 1160 });
        const where = (message) => `${look} ${theme} ${app}: ${message}`;
        const { states, muted, accentText, accent } = await measure(page);

        // The text of every list, in every state, reads at 4.5:1 on the colour under it.
        for (const [state, seen] of Object.entries(states)) {
          assert.ok(seen.worst.ratio >= 4.5, where(`${state}: "${seen.worst.text}" is ${seen.worst.ratio.toFixed(2)}:1`));
        }
        assert.equal(states.process.buttons, 2, where('stepList puts a button in each step that can be opened'));
        if (app !== 'xiox') continue;

        const rest = states.rest;
        assert.deepEqual(rest.list, { tag: 'OL', role: 'tablist' }, where('the steps are an ol.im-steps that is a tab list'));
        assert.equal(rest.itemTag, 'LI', where('each tab is inside an item of the list'));
        assert.ok(rest.buttonFillsItem, where('the button fills its item'));
        assert.equal(rest.outline.style, 'none', where('no ring at rest'));
        assert.equal(rest.edge.style, 'solid', where('an item has a solid edge at rest'));
        assert.equal(rest.cursor, 'default', where('no hand cursor'));

        assert.notEqual(states.hover.fill, rest.fill, where('hover has a fill of its own'));
        assert.notEqual(states.press.fill, states.hover.fill, where('pressed is a step darker than hover'));
        assert.deepEqual(states.focus.outline, { style: 'solid', width: '2px', offset: -2 }, where('focus is the 2px ring, drawn 2px inside'));

        const selected = states.selected;
        assert.notEqual(selected.fill, rest.fill, where('selected has the selection fill'));
        assert.notEqual(selected.edge.color, rest.edge.color, where('selected has an edge of its own'));
        if (look === 'smooth') assert.equal(selected.edge.color, accentText, where('selected has the accent edge'));
        assert.equal(selected.indexFill, accent, where('selected fills its index with the accent, a mark that is not the text colour'));
        assert.notEqual(rest.indexFill, accent, where('an index at rest is not filled'));

        const disabled = states.disabled;
        assert.equal(disabled.edge.style, 'dashed', where('disabled has a dashed edge'));
        assert.equal(disabled.textColor, muted, where('disabled text is the muted colour'));
        assert.equal(disabled.opacity, 1, where('disabled is never an opacity'));
        assert.equal(disabled.fill, rest.fill, where('a disabled step has no fill of its own'));

        for (const state of STATES) {
          assert.ok(Math.abs(states[state].size.width - rest.size.width) <= 0.5 && Math.abs(states[state].size.height - rest.size.height) <= 0.5, where(`${state} keeps the size of the item`));
        }
      }
    }
  }

  // The keyboard: the arrows move from tab to tab, the selection follows, focus stays on the selected tab.
  await show(page, { app: 'xiox', look: 'smooth', theme: 'dark', glass: false, width: 1160 });
  const tab = (id) => page.locator(`[data-g-steps="live"] [data-id="${id}"]`);
  await tab('scan').focus();
  const selectedNow = () => page.evaluate(() => ({
    focused: document.activeElement?.getAttribute('data-id') ?? null,
    selected: document.querySelector('[data-g-steps="live"] [aria-selected="true"]')?.getAttribute('data-id') ?? null,
    stops: document.querySelectorAll('[data-g-steps="live"] [tabindex="0"]').length,
  }));
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selectedNow(), { focused: 'analyze', selected: 'analyze', stops: 1 }, 'ArrowRight selects and focuses the next step');
  await page.keyboard.press('End');
  assert.deepEqual(await selectedNow(), { focused: 'union', selected: 'union', stops: 1 }, 'End goes to the last step');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selectedNow(), { focused: 'scan', selected: 'scan', stops: 1 }, 'the arrows wrap around');
}
