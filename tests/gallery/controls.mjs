// The controls and their states, in both looks and both themes: the matrix draws every pair of the manifest, and each
// state is told apart without colour alone, never changes the size of the control, and keeps its text readable.
import assert from 'node:assert/strict';
import { CONTROLS } from '../../gallery/manifest.ts';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];

// The element of a cell that carries the state, and the one that carries its text (the target when not listed).
const TARGET = {
  'button-primary': '.im-btn',
  'button-secondary': '.im-btn',
  'button-ghost': '.im-btn',
  'button-danger': '.im-btn',
  'button-confirm-danger': '.im-btn',
  'icon-button': '.im-icon-btn',
  field: '.im-input',
  search: '.im-input',
  select: '.im-select',
  checkbox: '.im-check',
  radio: '.im-radio',
  switch: '.im-switch',
  tab: '.im-tab',
  segmented: '.im-seg > button',
  row: '.im-row',
  tree: '.im-tree-item',
  'table-row': 'tbody tr',
  'menu-item': '.im-menu-item',
};
const TEXT = {
  field: 'input',
  search: 'input',
  checkbox: '.im-option',
  radio: '.im-option',
  switch: '.im-option',
  row: '.im-row-title',
  tree: '.im-tree-label',
  'table-row': '.im-cell-title',
  'menu-item': '.im-menu-item > span',
};
const BUTTONS = ['button-primary', 'button-secondary', 'button-ghost', 'button-danger', 'button-confirm-danger'];
// Controls with a box one control high: their height is --im-h-control in every state.
const CONTROL_HEIGHT = [...BUTTONS, 'icon-button', 'field', 'search', 'select', 'tab', 'segmented', 'row'];
// css/surfaces.css draws the menu item: its edge is not ours to assert.
const NO_EDGE = ['menu-item'];

// Where the focus ring sits, in px (negative: inside). The rule is in the focus section of css/controls.css:
// a control that stands alone 2 outside; a field 1 outside; an item of a list, table, tree, menu, tab strip or
// segmented control 2 inside (its container clips); an ONI chamfered button 5 inside (a clip-path cuts an outer ring).
const RING_OFFSET = (() => {
  const alone = { 'icon-button': 2, select: 2, checkbox: 2, radio: 2, switch: 2 };
  const field = { field: 1, search: 1 };
  const item = { tab: -2, segmented: -2, row: -2, tree: -2, 'table-row': -2, 'menu-item': -2 };
  const buttons = (offset) => Object.fromEntries(BUTTONS.map((id) => [id, offset]));
  return { smooth: { ...buttons(2), ...alone, ...field, ...item }, oni: { ...buttons(-5), ...alone, ...field, ...item } };
})();

const show = async (page, state) => {
  await page.evaluate((s) => window.__imago.set(s), state);
  await page.waitForSelector('#im-gallery-matrix [data-control][data-state]', { state: 'attached' });
};

// Everything the checks read, measured in one round trip: for each cell, its target, its text and its worst text.
const measureAll = (page) =>
  page.evaluate(
    ({ target, text }) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      // Paints the colours one over the other and reads back what the eye sees, so alpha and every colour syntax work.
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
      const background = (el) => {
        const layers = [];
        for (let node = el; node; node = node.parentElement) {
          const c = getComputedStyle(node).backgroundColor;
          if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') layers.unshift(c);
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
      // The text of a cell that is the hardest to read: every text node, on the colour under it.
      const worstText = (cell) => {
        let worst = { ratio: Infinity, text: '', color: '', fill: '' };
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const words = node.textContent.trim();
          if (!words) continue;
          const holder = node.parentElement;
          const s = getComputedStyle(holder);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          const under = background(holder);
          const fill = flatten(under);
          const ink = flatten([...under, s.color]);
          const r = ratio(ink, fill);
          if (r < worst.ratio) worst = { ratio: r, text: words, color: ink.join(','), fill: fill.join(',') };
        }
        return worst;
      };
      const surface = document.querySelector('#im-gallery-matrix .g-mx-surface');
      const muted = flatten([getComputedStyle(surface).getPropertyValue('--im-muted').trim()]).join(',');
      const out = [];
      for (const cell of document.querySelectorAll('#im-gallery-matrix [data-control][data-state]')) {
        const control = cell.dataset.control;
        const el = cell.querySelector(target[control] ?? '*');
        if (!el) { out.push({ control, state: cell.dataset.state, missing: true }); continue; }
        const textEl = cell.querySelector(text[control] ?? target[control]) ?? el;
        const s = getComputedStyle(el);
        const t = getComputedStyle(textEl);
        const under = background(textEl);
        const fill = flatten(under);
        const ink = flatten([...under, t.color]);
        let opacity = 1;
        for (let node = el; node && node !== cell; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
        const rect = el.getBoundingClientRect();
        out.push({
          control,
          state: cell.dataset.state,
          width: rect.width,
          height: rect.height,
          outlineWidth: s.outlineWidth,
          outlineStyle: s.outlineStyle,
          outlineOffset: parseFloat(s.outlineOffset),
          borderStyle: s.borderTopStyle,
          borderColor: flatten([...background(el), s.borderTopColor]).join(','),
          boxShadow: s.boxShadow,
          fontWeight: Number(t.fontWeight),
          textColor: ink.join(','),
          muted,
          fill: fill.join(','),
          contrast: ratio(ink, fill),
          worst: worstText(cell),
          opacity,
          clipPath: s.clipPath,
          pointerEvents: s.pointerEvents,
        });
      }
      return out;
    },
    { target: TARGET, text: TEXT },
  );

const index = (rows) => {
  const map = new Map(rows.map((row) => [`${row.control}|${row.state}`, row]));
  return (control, state) => map.get(`${control}|${state}`);
};

// What the eye tells one state of a control from another by: the fill, the text, the edge and the wash.
const picture = (cell) => [cell.fill, cell.textColor, cell.borderColor, cell.boxShadow, cell.fontWeight].join('|');

export default async (page) => {
  const expected = CONTROLS.flatMap(({ id, states }) => states.map((state) => `${id}|${state}`)).sort();

  for (const look of LOOKS) {
    for (const theme of THEMES) {
      const where = (message) => `${look} ${theme}: ${message}`;
      await show(page, { app: 'xiox', look, theme, glass: false, width: 1160 });

      // The matrix draws one cell for every pair of the manifest, and no other.
      const drawn = await page.$$eval('#im-gallery-matrix [data-control][data-state]', (cells) => cells.map((c) => `${c.dataset.control}|${c.dataset.state}`).sort());
      assert.deepEqual(drawn, expected, where('the matrix cells are the manifest pairs'));

      const rows = await measureAll(page);
      const at = index(rows);
      const rest = (control) => at(control, 'rest');
      assert.ok(rows.every((r) => !r.missing), where(`a cell has no element for ${rows.find((r) => r.missing)?.control}`));

      // Disabled: readable at 4.5:1, a dashed edge, and never faded with opacity.
      for (const { id, states } of CONTROLS) {
        if (!states.includes('disabled')) continue;
        const cell = at(id, 'disabled');
        assert.ok(cell.contrast >= 4.5, where(`${id} disabled text is ${cell.contrast.toFixed(2)}:1`));
        assert.equal(cell.textColor, cell.muted, where(`${id} disabled text is the muted colour`));
        assert.equal(cell.opacity, 1, where(`${id} disabled is not shown with opacity`));
        if (!NO_EDGE.includes(id)) assert.equal(cell.borderStyle, 'dashed', where(`${id} disabled has a dashed border`));
      }

      // Every text in every cell reaches 4.5:1 on the colour under it.
      const unreadable = rows
        .filter((row) => row.worst.ratio < 4.5)
        .map((row) => `${row.control} ${row.state}: "${row.worst.text}" is ${row.worst.ratio.toFixed(2)}:1 (${row.worst.color} on ${row.worst.fill})`);
      assert.deepEqual(unreadable, [], where('text under 4.5:1'));

      // Focus: a ring 2px wide, drawn with outline (which forced colours keep), at the offset of RING_OFFSET.
      const offsets = RING_OFFSET[look];
      const focusable = CONTROLS.filter(({ states }) => states.includes('focus')).map(({ id }) => id);
      assert.deepEqual(Object.keys(offsets).sort(), [...focusable].sort(), where('RING_OFFSET names every control that has a focus state'));
      for (const id of focusable) {
        assert.equal(rest(id).outlineStyle, 'none', where(`${id} has no ring at rest`));
        const cell = at(id, 'focus');
        assert.equal(cell.outlineWidth, '2px', where(`${id} focus ring width`));
        assert.notEqual(cell.outlineStyle, 'none', where(`${id} focus ring is drawn`));
        assert.equal(cell.outlineOffset, offsets[id], where(`${id} ring offset is ${cell.outlineOffset}px, the rule says ${offsets[id]}px`));
      }

      // An ONI button is chamfered: a clip-path cuts an outer ring, which is why its ring is inside.
      for (const id of BUTTONS) {
        assert.equal(at(id, 'focus').clipPath === 'none', look === 'smooth', where(`${id} is chamfered in ONI only`));
      }

      // Hover, pressed and focus are each a picture of their own, and pressed is not hover.
      for (const { id, states } of CONTROLS) {
        if (states.includes('hover')) assert.notEqual(picture(at(id, 'hover')), picture(rest(id)), where(`${id} hover looks like rest`));
        if (states.includes('press')) assert.notEqual(picture(at(id, 'press')), picture(at(id, 'hover')), where(`${id} pressed looks like hover`));
      }

      // Selected is told by the weight as well as the colour. A tab changes its text colour; a row also changes its fill,
      // because ONI light draws a selected row title in the same accent as the others (the preview does).
      for (const id of ['tab', 'row']) {
        const a = rest(id);
        const sel = at(id, 'selected');
        assert.ok(sel.fontWeight > a.fontWeight, where(`${id} selected is heavier (${a.fontWeight} to ${sel.fontWeight})`));
        if (id === 'tab') assert.notEqual(sel.textColor, a.textColor, where('a selected tab has its own text colour'));
        else assert.ok(sel.textColor !== a.textColor || sel.fill !== a.fill, where('a selected row changes the colour or the fill'));
      }
      for (const id of ['segmented', 'tree', 'table-row']) {
        assert.ok(at(id, 'selected').fontWeight > rest(id).fontWeight, where(`${id} selected is heavier`));
      }

      // Busy: the label and the width stay, a spinner takes the icon's place, a second press does nothing.
      for (const id of BUTTONS) {
        const busy = at(id, 'busy');
        assert.ok(Math.abs(busy.width - rest(id).width) <= 0.5, where(`${id} busy is ${busy.width}px wide, rest is ${rest(id).width}px`));
        assert.ok(Math.abs(busy.height - rest(id).height) <= 0.5, where(`${id} busy keeps its height`));
        assert.equal(busy.pointerEvents, 'none', where(`${id} busy takes no press`));
      }
      assert.deepEqual(
        await page.$eval('[data-control="button-primary"][data-state="busy"]', (cell) => ({
          busy: cell.querySelector('.im-btn').getAttribute('aria-busy'),
          spinner: Boolean(cell.querySelector('.im-btn > .im-spinner')),
          icon: Boolean(cell.querySelector('.im-btn > .im-icon')),
        })),
        { busy: 'true', spinner: true, icon: false },
        where('a busy button has aria-busy and a spinner in place of its icon'),
      );

      // Invalid: the edge changes and one sentence under the field, tied by aria-describedby, starts with "Error".
      const invalid = await page.$eval('[data-control="field"][data-state="invalid"]', (cell) => {
        const input = cell.querySelector('input');
        const target = document.getElementById(input.getAttribute('aria-describedby') ?? '');
        return { flag: input.getAttribute('aria-invalid'), text: target?.textContent ?? null, inside: target ? cell.contains(target) : false };
      });
      assert.equal(invalid.flag, 'true', where('an invalid field has aria-invalid'));
      assert.ok(invalid.inside && invalid.text.startsWith('Error'), where(`the error sentence is "${invalid.text}"`));
      assert.notEqual(at('field', 'invalid').borderColor, rest('field').borderColor, where('an invalid field has its own edge'));

      // Read-only: no frame and no fill.
      assert.equal(at('field', 'readonly').borderColor, at('field', 'readonly').fill, where('a read-only field has no visible edge'));

      // Hover and pressed never change the size of the control.
      for (const { id, states } of CONTROLS) {
        for (const state of ['hover', 'press']) {
          if (!states.includes(state)) continue;
          const a = rest(id);
          const b = at(id, state);
          assert.ok(Math.abs(a.width - b.width) <= 0.5 && Math.abs(a.height - b.height) <= 0.5, where(`${id} ${state} is ${b.width}x${b.height}, rest is ${a.width}x${a.height}`));
        }
      }

      // One control height per row of controls: --im-h-control, 32 in Smooth and 28 in ONI.
      const control = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#im-gallery-matrix .g-mx-surface')).getPropertyValue('--im-h-control')));
      assert.equal(control, look === 'oni' ? 28 : 32, where('the token --im-h-control'));
      for (const id of CONTROL_HEIGHT) {
        for (const state of CONTROLS.find((c) => c.id === id).states) {
          const cell = at(id, state);
          // A segment sits in a track with 2px of padding and a 1px edge: the track is the control.
          const height = id === 'segmented' ? cell.height + 6 : cell.height;
          assert.ok(Math.abs(height - control) <= 0.5, where(`${id} ${state} is ${height}px high, the control height is ${control}px`));
        }
      }

      // A long label ends in an ellipsis and keeps the height of the control; the whole label is its title.
      const long = await page.$eval('[data-specimen="long-label"]', (box) => {
        const button = box.querySelector('.im-btn');
        const tab = box.querySelector('.im-tab');
        const row = box.querySelector('.im-row');
        const info = (el, label) => {
          const rect = el.getBoundingClientRect();
          return { height: rect.height, width: rect.width, textOverflow: getComputedStyle(label).textOverflow, scrollWidth: label.scrollWidth, clientWidth: label.clientWidth, title: el.getAttribute('title') ?? '', text: label.textContent };
        };
        return { box: box.getBoundingClientRect().width, button: info(button, button.querySelector(':scope > span')), tab: info(tab, tab), row: info(row, row.querySelector('.im-row-title')) };
      });
      for (const id of ['button', 'tab', 'row']) {
        const item = long[id];
        assert.equal(item.text.length, 60, where(`the ${id} label is 60 characters`));
        assert.equal(item.textOverflow, 'ellipsis', where(`${id} text-overflow`));
        assert.ok(item.scrollWidth > item.clientWidth, where(`${id} label is cut (${item.scrollWidth} > ${item.clientWidth})`));
        assert.equal(item.title, item.text, where(`${id} carries its whole label as title`));
        assert.ok(item.width <= long.box + 0.5, where(`${id} stays inside its box`));
      }
      assert.ok(Math.abs(long.button.height - rest('button-secondary').height) <= 0.5, where('a long button keeps its height'));
      assert.ok(Math.abs(long.tab.height - rest('tab').height) <= 0.5, where('a long tab keeps its height'));
      assert.ok(Math.abs(long.row.height - rest('row').height) <= 0.5, where('a long row keeps its height'));

      // Forced colours: the system takes the fills away, so the ring, the edges and the system colours carry every state.
      await page.emulateMedia({ forcedColors: 'active' });
      const forced = await page.evaluate(() => {
        const cell = (control, state) => document.querySelector(`[data-control="${control}"][data-state="${state}"]`);
        const style = (el) => getComputedStyle(el);
        const system = (name) => {
          const probe = document.createElement('i');
          probe.style.color = name;
          document.body.append(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        };
        const ring = (el) => ({ style: style(el).outlineStyle, width: style(el).outlineWidth });
        const ringOf = (control, selector) => ring(cell(control, 'focus').querySelector(selector));
        // A selected item, alone and then focused too: the selection must not be drawn with the outline the ring uses.
        const selected = {};
        for (const [control, selector] of [['row', '.im-row'], ['tree', '.im-tree-item'], ['segmented', '.im-seg > button']]) {
          const el = cell(control, 'selected').querySelector(selector);
          const own = { ring: ring(el), edge: style(el).borderLeftColor, edgeWidth: parseFloat(style(el).borderLeftWidth) };
          el.setAttribute('data-im-force', 'focus');
          const focused = ring(el);
          el.removeAttribute('data-im-force');
          selected[control] = { own, focused };
        }
        const field = style(cell('field', 'rest').querySelector('.im-input'));
        return {
          highlight: system('Highlight'),
          grayText: system('GrayText'),
          button: ringOf('button-secondary', '.im-btn'),
          field: { width: parseFloat(field.borderTopWidth), style: field.borderTopStyle },
          selected,
          disabledRow: style(cell('row', 'disabled').querySelector('.im-row-title')).color,
          progressFill: getComputedStyle(cell('progress', 'rest').querySelector('.im-progress'), '::before').backgroundColor,
          checked: style(cell('checkbox', 'selected').querySelector('.im-check')).backgroundColor,
        };
      });
      await page.emulateMedia({ forcedColors: 'none' });
      assert.notEqual(forced.button.style, 'none', where('forced colours: a focused button keeps its outline'));
      assert.equal(forced.button.width, '2px', where('forced colours: the ring is 2px'));
      assert.ok(forced.field.width >= 1 && forced.field.style !== 'none', where('forced colours: a field keeps its border'));
      // A selected row, tree item or segment is a Highlight edge (a border), so its outline stays free for the focus ring.
      for (const [control, { own, focused }] of Object.entries(forced.selected)) {
        assert.equal(own.ring.style, 'none', where(`forced colours: a selected ${control} is not drawn with an outline`));
        assert.equal(own.edge, forced.highlight, where(`forced colours: a selected ${control} has a Highlight edge`));
        assert.ok(own.edgeWidth >= 2, where(`forced colours: the edge of a selected ${control} is ${own.edgeWidth}px`));
        assert.notEqual(focused.style, 'none', where(`forced colours: a focused selected ${control} shows its focus ring`));
        assert.equal(focused.width, '2px', where(`forced colours: the ring of a selected ${control} is 2px`));
        assert.notEqual(`${focused.style} ${focused.width}`, `${own.ring.style} ${own.ring.width}`, where(`forced colours: focus and selection of a ${control} differ`));
      }
      assert.equal(forced.disabledRow, forced.grayText, where('forced colours: a disabled row is GrayText'));
      assert.equal(forced.progressFill, forced.highlight, where('forced colours: the progress fill is Highlight'));
      assert.equal(forced.checked, forced.highlight, where('forced colours: a checked box is Highlight'));
    }
  }

  // A forced state answers the same rule as the real one: a live hover or press looks like the forced cell.
  await show(page, { app: 'xiox', look: 'smooth', theme: 'dark', glass: false, width: 1160 });
  const look = (control, state, inner) =>
    page.evaluate(
      ([c, s, i]) => {
        const style = getComputedStyle(document.querySelector(`[data-control="${c}"][data-state="${s}"] ${i}`));
        return [style.backgroundColor, style.boxShadow, style.color, style.borderTopColor].join(' | ');
      },
      [control, state, inner],
    );
  const LIVE = [['button-secondary', '.im-btn', true], ['button-primary', '.im-btn', true], ['icon-button', '.im-icon-btn', true], ['row', '.im-row', false], ['tab', '.im-tab', false]];
  for (const [control, inner, hasPress] of LIVE) {
    await page.locator(`[data-control="${control}"][data-state="rest"] ${inner}`).hover();
    await page.waitForTimeout(300);
    assert.equal(await look(control, 'rest', inner), await look(control, 'hover', inner), `${control}: a real hover looks like the forced one`);
    if (hasPress) {
      await page.mouse.down();
      await page.waitForTimeout(300);
      assert.equal(await look(control, 'rest', inner), await look(control, 'press', inner), `${control}: a real press looks like the forced one`);
      await page.mouse.up();
    }
    await page.mouse.move(0, 0);
  }
};
