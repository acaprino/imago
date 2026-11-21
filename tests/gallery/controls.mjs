// The controls and their states, in both looks and both themes: the matrix draws every pair of the manifest, and each
// state is told apart without colour alone, never changes the size of the control, and keeps its text readable.
import assert from 'node:assert/strict';
import { CONTROLS, NATIVE_TWINS } from '../../gallery/manifest.ts';
import { settingInputHtml, settingsRowHtml } from '../../ts/ui/form-markup.ts';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
// The accent is the hue of the app, and the text in the accent is the hardest to read on a fill: every app is checked.
const APPS = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];

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
  // The native twins: the same class on the native element (a segment is the label over its radio, the bare field the input).
  'field-bare': '.im-input',
  'checkbox-native': '.im-check',
  'radio-native': '.im-radio',
  'switch-native': '.im-switch',
  'select-native': '.im-select',
  'segmented-native': '.im-seg > label',
  textarea: '.im-textarea',
};
const TEXT = {
  field: 'input',
  search: 'input',
  checkbox: '.im-option',
  radio: '.im-option',
  switch: '.im-option',
  'checkbox-native': '.im-option',
  'radio-native': '.im-option',
  'switch-native': '.im-option',
  row: '.im-row-title',
  tree: '.im-tree-label',
  'table-row': '.im-cell-title',
  'menu-item': '.im-menu-item > span',
};
const BUTTONS = ['button-primary', 'button-secondary', 'button-ghost', 'button-danger', 'button-confirm-danger'];
// Controls with a box one control high: their height is --im-h-control in every state.
const CONTROL_HEIGHT = [...BUTTONS, 'icon-button', 'field', 'field-bare', 'search', 'select', 'select-native', 'tab', 'segmented', 'segmented-native', 'row'];
// css/surfaces.css draws the menu item: its edge is not ours to assert.
const NO_EDGE = ['menu-item'];

// Where the focus ring sits, in px (negative: inside). The rule is in the focus section of css/controls.css:
// a control that stands alone 2 outside; a field 1 outside; an item of a list, table, tree, menu, tab strip or
// segmented control 2 inside (its container clips); an ONI chamfered button 5 inside (a clip-path cuts an outer ring).
const RING_OFFSET = (() => {
  const alone = { 'icon-button': 2, select: 2, checkbox: 2, radio: 2, switch: 2, 'select-native': 2, 'checkbox-native': 2, 'radio-native': 2, 'switch-native': 2 };
  const field = { field: 1, 'field-bare': 1, search: 1, textarea: 1 };
  const item = { tab: -2, segmented: -2, 'segmented-native': -2, row: -2, tree: -2, 'table-row': -2, 'menu-item': -2 };
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
      // The colours under an element, outermost first: every background colour up to the root, and over each the wash of a
      // button, which is an inset shadow as wide as the box (`inset 0 0 0 99px`) and not a background.
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
      // The rows of the fill specimen (chips, a count and an avatar in a row and a table row at rest, hover, pressed and
      // selected): only their text is read, like that of a cell.
      for (const row of document.querySelectorAll('#im-gallery-matrix [data-specimen="fill-rows"] [data-fill-row][data-state]')) {
        out.push({ control: `fill-${row.dataset.fillRow}`, state: row.dataset.state, worst: worstText(row) });
      }
      return out;
    },
    { target: TARGET, text: TEXT },
  );

// The letter of the mark at the top left of the live shell, on the accent of its square: its colour and the fill's, as the
// eye sees them, and the contrast between them.
const markContrast = (page) =>
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
    const channel = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r, g2, b]) => 0.2126 * channel(r) + 0.7152 * channel(g2) + 0.0722 * channel(b);
    const mark = document.querySelector('#g-window .im-titlebar .im-mark');
    const layers = [];
    for (let node = mark; node; node = node.parentElement) {
      const paint = getComputedStyle(node).backgroundColor;
      if (paint !== 'rgba(0, 0, 0, 0)' && paint !== 'transparent') layers.unshift(paint);
    }
    const fill = flatten(layers);
    const ink = flatten([...layers, getComputedStyle(mark).color]);
    const [hi, lo] = [luminance(ink), luminance(fill)].sort((a, b) => b - a);
    return { text: mark.textContent, ink: ink.join(','), fill: fill.join(','), accent: flatten([getComputedStyle(mark).getPropertyValue('--im-accent').trim()]).join(','), ratio: (hi + 0.05) / (lo + 0.05) };
  });

// Rows of the eight categorical colours (data-im-cat), at rest, hovered and selected, in the live sidebar's list (in the
// inspector of an app without a sidebar): each with a rail avatar, an avatar, a dot and a chip of its colour, and its title,
// line and meta. For each, the text that is the hardest to read on what is under it, and the colours the design gives
// them: the avatar and the dot are filled with the colour, the avatar's text in --im-cat-on, the chip's text in the colour.
// The rows are taken out again before the page is read for anything else.
const categoryRows = (page) =>
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
    const background = (el) => {
      const layers = [];
      for (let node = el; node; node = node.parentElement) {
        const paint = getComputedStyle(node).backgroundColor;
        if (paint !== 'rgba(0, 0, 0, 0)' && paint !== 'transparent') layers.unshift(paint);
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
    const list = document.querySelector('.im-shell .im-sidebar .im-list') ?? document.querySelector('.im-shell .im-inspector .im-panel-body');
    const STATES = { rest: '', hover: ' data-im-force="hover"', selected: '' };
    const rows = [];
    for (let n = 1; n <= 8; n++) {
      for (const [state, force] of Object.entries(STATES)) {
        const row = document.createElement('div');
        row.innerHTML = `<div class="im-row" role="option" aria-selected="${state === 'selected'}" data-im-cat="${n}"${force}><span class="im-avatar im-rail-item" data-im-cat="${n}" aria-hidden="true">TH</span>`
          + `<span class="im-avatar" data-im-cat="${n}">CA</span><span class="im-dot" data-im-cat="${n}"></span><span class="im-row-text"><span class="im-row-title">Thread ${n}</span>`
          + `<span class="im-row-sub">1 session · running</span></span><span class="im-row-meta">2m</span><span class="im-chip" data-im-cat="${n}">thread</span></div>`;
        rows.push({ n, state, el: row.firstElementChild });
        list.append(row.firstElementChild);
      }
    }
    const colour = (value) => {
      const el = document.createElement('i');
      el.style.color = value;
      list.append(el);
      const result = getComputedStyle(el).color;
      el.remove();
      return result;
    };
    const out = rows.map(({ n, state, el }) => {
      let worst = { ratio: Infinity, text: '' };
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const holder = node.parentElement;
        if (!node.textContent.trim() || !holder.getClientRects().length) continue;
        const under = background(holder);
        const r = ratio(flatten([...under, getComputedStyle(holder).color]), flatten(under));
        if (r < worst.ratio) worst = { ratio: r, text: node.textContent.trim() };
      }
      const style = (selector) => getComputedStyle(el.querySelector(selector));
      return {
        n, state, worst, cat: colour(`var(--im-cat-${n})`), on: colour('var(--im-cat-on)'),
        avatar: [style('.im-avatar:not(.im-rail-item)').backgroundColor, style('.im-avatar:not(.im-rail-item)').color],
        rail: [style('.im-rail-item').backgroundColor, style('.im-rail-item').color],
        dot: style('.im-dot').backgroundColor, chip: style('.im-chip').color,
      };
    });
    for (const { el } of rows) el.remove();
    return out;
  });

/** Every categorised row of `categoryRows` reads at 4.5:1 and takes its colour as the design says. */
async function checkCategories(page, where) {
  const rows = await categoryRows(page);
  assert.equal(rows.length, 24, where('eight colours in three states'));
  const unreadable = rows.filter((row) => row.worst.ratio < 4.5).map((row) => `category ${row.n} ${row.state}: "${row.worst.text}" is ${row.worst.ratio.toFixed(2)}:1`);
  assert.deepEqual(unreadable, [], where('text on a categorised row under 4.5:1'));
  for (const row of rows) {
    const said = (text) => where(`category ${row.n} ${row.state}: ${text}`);
    assert.deepEqual(row.avatar, [row.cat, row.on], said('the avatar is filled with the colour, its text in --im-cat-on'));
    assert.deepEqual(row.rail, [row.cat, row.on], said('the rail item too'));
    assert.equal(row.dot, row.cat, said('the dot is filled with the colour'));
    assert.equal(row.chip, row.cat, said('the chip takes the colour as its tone'));
  }
}

const index = (rows) => {
  const map = new Map(rows.map((row) => [`${row.control}|${row.state}`, row]));
  return (control, state) => map.get(`${control}|${state}`);
};

// Text is readable: a disabled control's text is the muted colour at 4.5:1 and never faded, and every text of every cell (and
// of the rows of the fill specimen) reaches 4.5:1 on the colour under it.
function checkReadable(rows, where) {
  assert.ok(rows.every((r) => !r.missing), where(`a cell has no element for ${rows.find((r) => r.missing)?.control}`));
  const at = index(rows);
  for (const { id, states } of CONTROLS) {
    if (!states.includes('disabled')) continue;
    const cell = at(id, 'disabled');
    assert.ok(cell.contrast >= 4.5, where(`${id} disabled text is ${cell.contrast.toFixed(2)}:1`));
    assert.equal(cell.textColor, cell.muted, where(`${id} disabled text is the muted colour`));
    assert.equal(cell.opacity, 1, where(`${id} disabled is not shown with opacity`));
    if (!NO_EDGE.includes(id)) assert.equal(cell.borderStyle, 'dashed', where(`${id} disabled has a dashed border`));
  }
  const unreadable = rows
    .filter((row) => row.worst.ratio < 4.5)
    .map((row) => `${row.control} ${row.state}: "${row.worst.text}" is ${row.worst.ratio.toFixed(2)}:1 (${row.worst.color} on ${row.worst.fill})`);
  assert.deepEqual(unreadable, [], where('text under 4.5:1'));
}

// What the eye tells one state of a control from another by: the fill, the text, the edge and the wash.
const picture = (cell) => [cell.fill, cell.textColor, cell.borderColor, cell.boxShadow, cell.fontWeight].join('|');

// The items that mark their selection with a bar of their own in forced colours: where the bar is drawn (a pseudo-element of
// the host) and which element carries the focus ring.
const MARKED = [
  { id: 'row', item: '.im-row', text: '.im-row-title', host: null, pseudo: '::before' },
  { id: 'tree', item: '.im-tree-item', text: '.im-tree-label', host: null, pseudo: '::before' },
  { id: 'segmented', item: '.im-seg > button', text: null, host: null, pseudo: '::after' },
  { id: 'segmented-native', item: '.im-seg > label', text: null, host: null, pseudo: '::after' },
  // The tab's line is always there; it is scaled to nothing until the tab is selected.
  { id: 'tab', item: '.im-tab', text: null, host: null, pseudo: '::after', scaled: true },
  { id: 'table-row', item: 'tbody tr', text: '.im-cell-title', host: ':scope > :first-child', pseudo: '::before' },
];

// The box and the text start of the item at rest and selected. Self-contained: Playwright sends its source to the page.
const shapesOf = (marked) => {
  const cell = (control, state) => document.querySelector(`[data-control="${control}"][data-state="${state}"]`);
  const shape = (el, textSelector) => {
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(textSelector ? el.querySelector(textSelector) : el);
    return { width: box.width, height: box.height, textStart: range.getBoundingClientRect().left - box.left };
  };
  const out = {};
  for (const m of marked) {
    out[m.id] = {
      rest: shape(cell(m.id, 'rest').querySelector(m.item), m.text),
      selected: shape(cell(m.id, 'selected').querySelector(m.item), m.text),
    };
  }
  return out;
};

// In forced colours: the bar that marks the selected item, the ring of the same item once focused, and where they sit.
const marksOf = (marked) => {
  const cell = (control, state) => document.querySelector(`[data-control="${control}"][data-state="${state}"]`);
  const px = (value) => parseFloat(value);
  const out = {};
  for (const m of marked) {
    const item = cell(m.id, 'selected').querySelector(m.item);
    const restItem = cell(m.id, 'rest').querySelector(m.item);
    const host = m.host ? item.querySelector(m.host) : item;
    const restHost = m.host ? restItem.querySelector(m.host) : restItem;
    const bar = getComputedStyle(host, m.pseudo);
    const box = host.getBoundingClientRect();
    const mark = {
      x: box.left + px(getComputedStyle(host).borderLeftWidth) + px(bar.left),
      y: box.top + px(getComputedStyle(host).borderTopWidth) + px(bar.top),
      width: px(bar.width),
      height: px(bar.height),
    };
    const own = getComputedStyle(item).outlineStyle;
    item.setAttribute('data-im-force', 'focus');
    const ring = getComputedStyle(item);
    const focused = { style: ring.outlineStyle, width: ring.outlineWidth, offset: px(ring.outlineOffset) };
    item.removeAttribute('data-im-force');
    const itemBox = item.getBoundingClientRect();
    out[m.id] = {
      content: bar.content,
      restContent: getComputedStyle(restHost, m.pseudo).content,
      color: bar.backgroundColor,
      transform: bar.transform,
      mark,
      own,
      focused,
      ring: { left: itemBox.left, top: itemBox.top, right: itemBox.right, bottom: itemBox.bottom },
    };
  }
  return out;
};

// What a control looks like, read from its computed style: its box and edge, its fill, its ring, its text, and its mark
// (`::after`: the tick, the bar of a mixed checkbox, the dot, the thumb). For each cell of a native control, the same read of
// the cell of its twin in the same state; a cell with more than one control (a checkbox and its mixed one) is read in order.
// Self-contained: Playwright sends its source to the page.
const drawingsOf = ({ twins, target }) => {
  const BOX = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle',
    'borderBottomStyle', 'borderLeftStyle', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius', 'backgroundColor', 'boxShadow',
    'outlineStyle', 'outlineWidth', 'outlineOffset', 'outlineColor', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing',
    'textTransform'];
  const MARK = ['content', 'display', 'position', 'top', 'left', 'width', 'height', 'backgroundColor', 'borderTopWidth', 'borderRightWidth',
    'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'borderTopLeftRadius', 'transform'];
  const pick = (style, names) => Object.fromEntries(names.map((name) => [name, style[name]]));
  // A mark with no content is not drawn: the rest of its style is the browser's and says nothing.
  const mark = (style) => (style.content === 'none' ? 'none' : pick(style, MARK));
  const read = (cell, control) => [...cell.querySelectorAll(target[control])].map((el) => {
    const box = el.getBoundingClientRect();
    return { tag: el.localName, width: box.width, height: box.height, ...pick(getComputedStyle(el), BOX), mark: mark(getComputedStyle(el, '::after')) };
  });
  const out = [];
  for (const [native, twin] of Object.entries(twins)) {
    for (const cell of document.querySelectorAll(`#im-gallery-matrix [data-control="${native}"][data-state]`)) {
      const other = document.querySelector(`#im-gallery-matrix [data-control="${twin}"][data-state="${cell.dataset.state}"]`);
      out.push({ native, twin, state: cell.dataset.state, drawn: read(cell, native), twinDrawn: other ? read(other, twin) : [] });
    }
  }
  return out;
};

// The native inputs whose mark is a pseudo-element: [control, state, which of the cell's controls].
const MARKS = [['checkbox-native', 'selected', 0], ['checkbox-native', 'selected', 1], ['checkbox-native', 'disabled', 0], ['radio-native', 'selected', 0], ['switch-native', 'rest', 0], ['switch-native', 'selected', 0]];

export default async (page) => {
  const expected = CONTROLS.flatMap(({ id, states }) => states.map((state) => `${id}|${state}`)).sort();
  // Takes the mark of one element away, to compare its pixels with and without it.
  await page.addStyleTag({ content: '[data-g-unmarked]::after { content: none !important; }' });

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

      // Text is readable: disabled text at 4.5:1 with a dashed edge and no opacity, and every text of every cell and of the
      // fill specimen at 4.5:1 on the colour under it. The accent is the app's, so every app is measured, not Xiox alone.
      checkReadable(rows, where);
      for (const [kind, count] of [['row', 4], ['table-row', 4], ['buttons', 3]]) {
        assert.equal(rows.filter((r) => r.control === `fill-${kind}`).length, count, where(`the fill specimen has ${count} ${kind} states`));
      }
      for (const app of APPS.filter((name) => name !== 'xiox')) {
        await show(page, { app, look, theme, glass: false, width: 1160 });
        checkReadable(await measureAll(page), (message) => where(`${app}: ${message}`));
      }
      // The letter of the mark at the top left is the initial on the app's accent, at 4.5:1 or more, in every app.
      for (const app of APPS) {
        await show(page, { app, look, theme, glass: false, width: 1160 });
        const mark = await markContrast(page);
        assert.match(mark.text, /^\p{Lu}$/u, where(`${app}: the mark holds one capital letter, not "${mark.text}"`));
        assert.equal(mark.fill, mark.accent, where(`${app}: the square is the accent`));
        assert.ok(mark.ratio >= 4.5, where(`${app}: the letter of the mark is ${mark.ratio.toFixed(2)}:1 (${mark.ink} on ${mark.fill})`));
      }
      // The categorical colours on a row, at rest, hovered and selected, in every app (the selection is in the app's accent),
      // in the whole sidebar and in the rail.
      for (const app of APPS) {
        for (const width of [1160, 840]) {
          await show(page, { app, look, theme, glass: false, width });
          await checkCategories(page, (message) => where(`${app} at ${width}: ${message}`));
        }
      }
      await show(page, { app: 'xiox', look, theme, glass: false, width: 1160 });

      // Nothing is smaller than 11px (docs/design-file.md, Type): the initials of an avatar were 10.5.
      const tooSmall = await page.evaluate(() => {
        const found = [];
        for (const root of document.querySelectorAll('.im-shell, #im-gallery-matrix')) {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent.trim()) continue;
            const holder = node.parentElement;
            if (!holder.getClientRects().length) continue;
            const size = parseFloat(getComputedStyle(holder).fontSize);
            if (size < 11) found.push(`${size}px ${holder.className} "${node.textContent.trim().slice(0, 14)}"`);
          }
        }
        return [...new Set(found)];
      });
      assert.deepEqual(tooSmall, [], where('no text is smaller than 11px'));

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
      for (const id of ['segmented', 'segmented-native', 'tree', 'table-row']) {
        assert.ok(at(id, 'selected').fontWeight > rest(id).fontWeight, where(`${id} selected is heavier`));
      }
      // A pressed button (aria-pressed) takes the selection fill and a mark that is not a colour, in both looks: a 2px bar
      // inside its bottom edge, as a selected segment has, in the accent text colour; on the two filled buttons (primary,
      // confirming danger) it is in their text colour, since their fill is the accent's or the danger's, and they keep that
      // fill. Smooth also takes the weight 600; ONI's buttons are 700 at rest and stay so.
      const bars = await page.evaluate((ids) => {
        const probe = document.createElement('i');
        document.querySelector('#im-gallery-matrix .g-mx-surface').append(probe);
        const barOf = (colour) => {
          probe.style.boxShadow = `inset 0 -2px ${colour}`;
          return getComputedStyle(probe).boxShadow;
        };
        const out = {};
        for (const id of ids) {
          const button = (state) => getComputedStyle(document.querySelector(`#im-gallery-matrix [data-control="${id}"][data-state="${state}"] .im-btn`));
          const pressed = button('selected');
          out[id] = { pressed: pressed.boxShadow, rest: button('rest').boxShadow, accent: barOf('var(--im-accent-text)'), text: barOf(pressed.color) };
        }
        probe.remove();
        return out;
      }, BUTTONS);
      for (const id of BUTTONS) {
        const sel = at(id, 'selected');
        const filled = id === 'button-primary' || id === 'button-confirm-danger';
        const bar = filled ? bars[id].text : bars[id].accent;
        assert.ok(bars[id].pressed.startsWith(bar + ','), where(`${id} pressed has the bar inside its bottom edge (${bars[id].pressed}; the bar is ${bar})`));
        assert.ok(!bars[id].rest.includes(' 0px -2px '), where(`${id} at rest has no bar (${bars[id].rest})`));
        if (filled) assert.equal(sel.fill, rest(id).fill, where(`${id} pressed keeps its own fill`));
        else assert.notEqual(sel.fill, rest(id).fill, where(`${id} pressed has the selection fill`));
        assert.equal(sel.fontWeight, filled || look === 'oni' ? rest(id).fontWeight : 600, where(`${id} pressed is ${sel.fontWeight}`));
      }
      // The bar is painted, and in ONI the chamfer's clip-path leaves it along the straight part of the bottom edge: the
      // button looks different with the bar taken away.
      for (const id of BUTTONS) {
        const box = page.locator(`#im-gallery-matrix [data-control="${id}"][data-state="selected"] .im-btn`);
        const marked = await box.screenshot({ animations: 'disabled' });
        await box.evaluate((el) => { el.style.boxShadow = 'inset 0 0 0 99px var(--im-btn-wash)'; });
        const unmarked = await box.screenshot({ animations: 'disabled' });
        await box.evaluate((el) => { el.style.boxShadow = ''; });
        assert.ok(!marked.equals(unmarked), where(`${id} pressed: its bar is painted`));
      }

      // One drawing for a control on a native element and on an ARIA element: in every state, each native cell has the box,
      // the edge, the fill, the ring, the text and the mark of its twin's cell. A text area is the field's drawing on more
      // than one line, so its height is its own, and the field of the matrix is the code one (im-input--code), so its font.
      const drawings = await page.evaluate(drawingsOf, { twins: NATIVE_TWINS, target: TARGET });
      const pairs = Object.entries(NATIVE_TWINS).flatMap(([native]) => CONTROLS.find((c) => c.id === native).states.map((state) => `${native}|${state}`));
      assert.deepEqual(drawings.map((d) => `${d.native}|${d.state}`).sort(), pairs.sort(), where('every state of every native control is compared'));
      for (const { native, twin, state, drawn, twinDrawn } of drawings) {
        const said = (message) => where(`${native} ${state} (${drawn.map((d) => d.tag).join(', ')}) ${message}`);
        assert.ok(drawn.length > 0 && drawn.length === twinDrawn.length, said(`has ${drawn.length} controls, ${twin} has ${twinDrawn.length}`));
        drawn.forEach((one, n) => {
          const { tag, ...mine } = one;
          const { tag: twinTag, ...theirs } = twinDrawn[n];
          if (native === 'textarea') for (const name of ['height', 'fontFamily', 'fontSize']) delete mine[name], delete theirs[name];
          assert.notEqual(tag, twinTag, said(`is a native element, not a second ${twinTag}`));
          assert.deepEqual(mine, theirs, said(`is drawn as ${twin} (${twinTag})`));
        });
      }

      // The mark of a native input is a pseudo-element of the input, as it is of the ARIA element: WebView2 and Chromium paint
      // the ::after of an input with `appearance: none`. Proven on the pixels: the box looks different without its mark.
      for (const [control, state, n] of MARKS) {
        const box = page.locator(`#im-gallery-matrix [data-control="${control}"][data-state="${state}"] ${TARGET[control]}`).nth(n);
        const marked = await box.screenshot({ animations: 'disabled' });
        await box.evaluate((el) => el.setAttribute('data-g-unmarked', ''));
        const unmarked = await box.screenshot({ animations: 'disabled' });
        await box.evaluate((el) => el.removeAttribute('data-g-unmarked'));
        assert.ok(!marked.equals(unmarked), where(`${control} ${state} ${n}: the mark of the native input is painted`));
      }

      // Native controls where the package's layouts hold them. The graph inspector stretches its fields, not a checkbox or
      // a radio; a settings row gives its field 260px, the box and not the input in it; a bare input stays in its line of
      // text, inline as a native input is.
      const placed = await page.evaluate((settingRow) => {
        const host = document.createElement('div');
        host.style.width = '600px';
        // The inspector as graphInspector() writes it, in the flow of the page instead of over a graph.
        host.innerHTML = `<section class="im-editor-inspector" role="dialog" aria-label="Node" style="position: static; width: 260px">
            <label class="im-option"><input type="checkbox" class="im-check" checked>Pinned</label>
            <label class="im-option"><input type="radio" class="im-radio" name="g-inspector-kind" checked>Service</label>
            <input class="im-input" aria-label="Node name" value="Store"></section>
          <div class="im-settings" data-g-settings="renderer">${settingRow}</div>
          <div class="im-setting-row" data-g-settings="bare"><div><strong>Name</strong></div><input class="im-input" aria-label="Name" value="Store"></div>
          <p style="margin: 0">Name <input class="im-input" aria-label="Inline" value="inline"> after</p>
          <div class="im-choice-list"><button type="button" class="im-btn im-choice-row" aria-pressed="true"><span>Claude Code</span><span>default</span></button>
            <div role="listbox" aria-label="Harness"><div class="im-row" role="option" aria-selected="true"><span class="im-row-text"><span class="im-row-title">Codex</span></span></div></div></div>`;
        document.querySelector('#im-gallery-matrix .g-mx-surface').append(host);
        const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        const outside = (control, selector) => box(document.querySelector(`#im-gallery-matrix [data-control="${control}"][data-state="rest"] ${selector}`));
        const inspector = host.querySelector('.im-editor-inspector');
        const pad = getComputedStyle(inspector);
        const line = host.querySelector('p');
        const textBox = (node) => { const range = document.createRange(); range.selectNodeContents(node); return box(range); };
        const out = {
          check: { inside: box(inspector.querySelector('.im-check')), outside: outside('checkbox-native', '.im-check') },
          radio: { inside: box(inspector.querySelector('.im-radio')), outside: outside('radio-native', '.im-radio') },
          field: box(inspector.querySelector('input.im-input')).width,
          room: inspector.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight),
          settings: { renderer: box(host.querySelector('[data-g-settings="renderer"] .im-input')).width, bare: box(host.querySelector('[data-g-settings="bare"] .im-input')).width },
          inline: { before: textBox(line.firstChild), input: box(line.querySelector('input')), after: textBox(line.lastChild), display: getComputedStyle(line.querySelector('input')).display },
          // A row of a choice list takes the common selection, its fill and its mark: as a pressed button, or as a selected
          // row. (The line between the rows of a list is the list's, not the selection's.)
          choice: ((pressed, row) => {
            const look = (el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.boxShadow, s.fontWeight].join(' | '); };
            return {
              button: look(host.querySelector('.im-choice-row')), pressedButton: look(pressed),
              row: look(host.querySelector('.im-choice-list .im-row')), selectedRow: look(row),
            };
          })(document.querySelector('#im-gallery-matrix [data-control="button-secondary"][data-state="selected"] .im-btn'),
            document.querySelector('#im-gallery-matrix [data-control="row"][data-state="selected"] .im-row')),
        };
        host.remove();
        return out;
      }, settingsRowHtml({ title: 'Model', field: 'g-model', controlHtml: settingInputHtml({ name: 'g-model', label: 'Model', value: 'claude' }) }));
      for (const kind of ['check', 'radio']) {
        const { inside, outside } = placed[kind];
        assert.deepEqual([inside.width, inside.height], [outside.width, outside.height], where(`a native ${kind} in the graph inspector is ${inside.width}x${inside.height}, as outside it`));
      }
      assert.ok(Math.abs(placed.field - placed.room) <= 0.5, where(`a field in the graph inspector fills its width (${placed.field} of ${placed.room})`));
      assert.deepEqual(placed.settings, { renderer: 260, bare: 260 }, where('the field of a settings row is 260px, its box'));
      const { before, input, after, display } = placed.inline;
      assert.equal(placed.choice.button, placed.choice.pressedButton, where('a pressed button of a choice list is drawn as every pressed button'));
      assert.equal(placed.choice.row, placed.choice.selectedRow, where('a selected row of a choice list is drawn as every selected row'));
      assert.ok(display.startsWith('inline'), where(`a bare input is inline-level (${display})`));
      assert.ok(input.left >= before.right - 0.5 && after.left >= input.right - 0.5 && input.top < before.bottom && input.bottom > before.top && after.top < input.bottom,
        where(`a bare input stays in its line of text (${JSON.stringify(placed.inline)})`));

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
          const height = id.startsWith('segmented') ? cell.height + 6 : cell.height;
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
      const normal = await page.evaluate(shapesOf, MARKED);
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
        const ring = cell('button-secondary', 'focus').querySelector('.im-btn');
        const field = style(cell('field', 'rest').querySelector('.im-input'));
        return {
          highlight: system('Highlight'),
          grayText: system('GrayText'),
          button: { style: style(ring).outlineStyle, width: style(ring).outlineWidth },
          field: { width: parseFloat(field.borderTopWidth), style: field.borderTopStyle },
          disabledRow: style(cell('row', 'disabled').querySelector('.im-row-title')).color,
          progressFill: getComputedStyle(cell('progress', 'rest').querySelector('.im-progress'), '::before').backgroundColor,
          checked: style(cell('checkbox', 'selected').querySelector('.im-check')).backgroundColor,
          nativeChecked: style(cell('checkbox-native', 'selected').querySelector('.im-check')).backgroundColor,
          // Forced colours drop a gradient: the chevron of a native select is then the browser's own, in system colours.
          nativeSelect: { image: style(cell('select-native', 'rest').querySelector('select')).backgroundImage, appearance: style(cell('select-native', 'rest').querySelector('select')).appearance },
        };
      });
      const marks = await page.evaluate(marksOf, MARKED);
      const shapes = await page.evaluate(shapesOf, MARKED);
      // The edge of a button turns in --im-t-fast (120ms): it is read once the turn is over.
      await page.waitForTimeout(300);
      const pressedEdge = await page.$eval('#im-gallery-matrix [data-control="button-secondary"][data-state="selected"] .im-btn', (el) => getComputedStyle(el).borderBottomColor);
      await page.emulateMedia({ forcedColors: 'none' });
      assert.notEqual(forced.button.style, 'none', where('forced colours: a focused button keeps its outline'));
      assert.equal(forced.button.width, '2px', where('forced colours: the ring is 2px'));
      assert.ok(forced.field.width >= 1 && forced.field.style !== 'none', where('forced colours: a field keeps its border'));
      assert.equal(forced.disabledRow, forced.grayText, where('forced colours: a disabled row is GrayText'));
      assert.equal(forced.progressFill, forced.highlight, where('forced colours: the progress fill is Highlight'));
      assert.equal(forced.checked, forced.highlight, where('forced colours: a checked box is Highlight'));
      assert.equal(forced.nativeChecked, forced.highlight, where('forced colours: a checked native box is Highlight'));
      assert.equal(pressedEdge, forced.highlight, where('forced colours: the bar of a pressed button is its Highlight edge'));
      assert.ok(!/^none(, none)*$/.test(forced.nativeSelect.image) || forced.nativeSelect.appearance !== 'none', where(`forced colours: a native select keeps a chevron (${JSON.stringify(forced.nativeSelect)})`));

      // A selected item is a Highlight bar inside the item. It is not the outline, which is the focus ring, and the ring
      // (the outer band of the item) does not cover it: a focused selected item shows both.
      for (const { id, scaled } of MARKED) {
        const m = marks[id];
        const said = (message) => where(`forced colours: ${id} ${message}`);
        if (scaled) assert.ok(!m.transform.startsWith('matrix(0,'), said(`selected line is scaled to nothing (${m.transform})`));
        else assert.equal(m.restContent, 'none', said('has no bar when it is not selected'));
        assert.notEqual(m.content, 'none', said('selected has a bar'));
        assert.equal(m.color, forced.highlight, said('selected bar is Highlight'));
        assert.ok(m.mark.width >= 2 && m.mark.height >= 2, said(`bar is ${m.mark.width}x${m.mark.height}`));
        assert.equal(m.own, 'none', said('selected alone has no outline'));
        assert.notEqual(m.focused.style, 'none', said('focused selected shows its ring'));
        assert.equal(m.focused.width, '2px', said('ring is 2px'));
        // With a negative offset the ring's inner edge is inset by -offset from the border box; the bar must lie inside it.
        const inset = Math.max(0, -m.focused.offset);
        const inside =
          m.mark.x >= m.ring.left + inset - 0.01 && m.mark.x + m.mark.width <= m.ring.right - inset + 0.01 &&
          m.mark.y >= m.ring.top + inset - 0.01 && m.mark.y + m.mark.height <= m.ring.bottom - inset + 0.01;
        assert.ok(inside || m.focused.offset >= 0, said(`ring (${inset}px band) covers the bar ${JSON.stringify(m.mark)} in ${JSON.stringify(m.ring)}`));
      }

      // Selecting takes no layout: the height and the start of the text are the same selected and not, and the width differs
      // only by what the heavier weight needs, as it does without forced colours.
      for (const { id } of MARKED) {
        const [a, b] = [shapes[id].rest, shapes[id].selected];
        const [na, nb] = [normal[id].rest, normal[id].selected];
        const said = (message) => where(`forced colours: ${id} ${message}`);
        assert.ok(Math.abs(a.height - b.height) <= 0.5, said(`selected is ${b.height}px high, not selected ${a.height}px`));
        assert.ok(Math.abs(a.textStart - b.textStart) <= 0.5, said(`text starts at ${b.textStart}px selected and ${a.textStart}px not`));
        assert.ok(Math.abs(b.width - a.width - (nb.width - na.width)) <= 0.5, said(`selected grows by ${b.width - a.width}px, without forced colours by ${nb.width - na.width}px`));
      }
    }
  }

  // Under im-glass the sheet is translucent. The header of a table is sticky, so rows scroll under it: it is opaque, or they
  // would show through it. It is the colour of the opaque sheet.
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      await show(page, { app: 'xiox', look, theme, glass: true, width: 1160 });
      const header = await page.evaluate(() => {
        const th = document.querySelector('.im-shell .im-table th');
        const shell = getComputedStyle(document.querySelector('.im-shell'));
        const probe = document.createElement('i');
        probe.style.color = shell.getPropertyValue('--im-sheet-solid').trim();
        document.body.append(probe);
        const solid = getComputedStyle(probe).color;
        probe.remove();
        return { background: getComputedStyle(th).backgroundColor, solid, sheet: shell.getPropertyValue('--im-sheet').trim() };
      });
      assert.equal(header.background, header.solid, `${look} ${theme} glass: the sticky table header is the opaque sheet (${header.background}; the sheet under glass is ${header.sheet})`);
      assert.match(header.background, /^rgb\(/, `${look} ${theme} glass: the sticky table header is opaque`);
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
  const LIVE = [['button-secondary', '.im-btn', true], ['button-primary', '.im-btn', true], ['icon-button', '.im-icon-btn', true], ['row', '.im-row', false], ['tab', '.im-tab', false],
    ['field-bare', '.im-input', false], ['checkbox-native', '.im-check', false], ['select-native', '.im-select', false], ['segmented-native', '.im-seg > label:first-child', false], ['textarea', '.im-textarea', false]];
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
