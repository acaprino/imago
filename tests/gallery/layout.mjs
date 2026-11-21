// The seven-region shell: its measures, its three breakpoints and its minimum width, in both looks and both themes.
import assert from 'node:assert/strict';
import { CONTROLS } from '../../gallery/manifest.ts';
import { cellMarkup } from '../../gallery/matrix.ts';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const APPS = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];
// Global Constraints, px: [Smooth, ONI]
const MEASURES = { titlebar: [46, 38], footer: [30, 26] };
const NAMES = { xiox: 'Xiox', mukade: 'Mukade', shinatama: 'Shinatama', muro: 'Muro', daodan: 'Daodan' };

const show = (page, state) => page.evaluate((s) => window.__imago.set(s), state);
const box = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
const visible = (page, selector) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
}, selector);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 0.5, `${label}: expected ${expected}, got ${actual}`);
const token = (page, name) => page.evaluate((n) => parseFloat(getComputedStyle(document.querySelector('.im-shell')).getPropertyValue(n)), name);

// The mark at the top left: where the square, the name and the letter are. The boxes come from the layout: the square,
// the name's box and the title bar, and the letter's own box, read with a Range over its text node (the box the font
// gives the letter: its ascent and descent). The letter's ink and the ink of the name's first capital are read from the
// pixels of a screenshot of the title bar at `scale` device pixels per CSS pixel: the ink is what the eye levels, and
// no DOM box gives it.
const markGeometry = (page) => page.evaluate(() => {
  const bar = document.querySelector('#g-window .im-titlebar');
  const mark = bar.querySelector('.im-mark');
  const word = bar.querySelector('.im-wordmark');
  const rect = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
  const letter = document.createRange();
  letter.selectNodeContents(mark.firstChild);
  const first = document.createRange();
  first.setStart(word.firstChild, 0);
  first.setEnd(word.firstChild, 1);
  return {
    bar: rect(bar.getBoundingClientRect()), mark: rect(mark.getBoundingClientRect()), word: rect(word.getBoundingClientRect()),
    letter: rect(letter.getBoundingClientRect()), first: rect(first.getBoundingClientRect()),
    text: mark.textContent, children: mark.children.length,
  };
});
const centre = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

/** The ink boxes of the letter in the square and of the name's first capital, in CSS px of the page. */
async function markInk(page, geometry, scale) {
  const { bar, mark, first } = geometry;
  const shot = await page.screenshot({ clip: { x: bar.left, y: bar.top, width: bar.width, height: bar.height } });
  return page.evaluate(async ({ png, bar, mark, first, scale }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0);
    const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixel = (x, y) => { const at = (y * canvas.width + x) * 4; return [data[at], data[at + 1], data[at + 2]]; };
    const apart = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    // The pixels of a region (CSS px from the title bar's corner) that are far from the colour under them.
    const ink = (left, top, width, height, under) => {
      const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      for (let y = Math.round(top * scale); y < Math.round((top + height) * scale); y++) {
        for (let x = Math.round(left * scale); x < Math.round((left + width) * scale); x++) {
          if (apart(pixel(x, y), under) <= 160) continue;
          box.left = Math.min(box.left, x / scale);
          box.top = Math.min(box.top, y / scale);
          box.right = Math.max(box.right, (x + 1) / scale);
          box.bottom = Math.max(box.bottom, (y + 1) / scale);
        }
      }
      return { left: box.left + bar.left, right: box.right + bar.left, top: box.top + bar.top, bottom: box.bottom + bar.top };
    };
    const m = { left: mark.left - bar.left, top: mark.top - bar.top };
    // The accent is read inside the square, at the middle of its right edge. The letter is looked for 3px in from each
    // side: clear of Smooth's rounded corners and of ONI's cut ones (6px), which show the bar through them.
    const accent = pixel(Math.round((m.left + mark.width - 2) * scale), Math.round((m.top + mark.height / 2) * scale));
    const letter = ink(m.left + 3, m.top + 3, mark.width - 6, mark.height - 6, accent);
    const ground = pixel(Math.round((first.left - bar.left - 1) * scale), Math.round(2 * scale));
    const capital = ink(first.left - bar.left, 0, first.width, bar.height, ground);
    return { letter, capital };
  }, { png: shot.toString('base64'), bar, mark, first, scale });
}

// The frames 0.1.2 to 0.1.4 added beside im-shell, and their parts (docs/superpowers/moving-from-0.1.4.md): none is drawn.
const REMOVED = [
  'im-app-layout', 'im-main', 'im-desktop-frame', 'im-desktop-content', 'im-page', 'im-skip-link', 'im-page-frame', 'im-page-view',
  'im-workbench', 'im-work-column', 'im-work-area', 'im-workspace-area', 'im-navigation-panel', 'im-resizable-nav', 'im-nav-rail',
  'im-nav-entry', 'im-nav-line', 'im-nav-mark', 'im-nav-detail', 'im-signal', 'im-docked-inspector', 'im-inspection-rail',
  'im-detail-panel', 'im-document', 'im-toolbar', 'im-panel-strip', 'im-master-detail',
];
/** Every element of the gallery page that carries a removed class, or a badge anywhere but on a row. */
const stale = (page) => page.evaluate((names) => [...document.querySelectorAll('[class], [data-im-badge]')]
  .flatMap((el) => [...el.classList].filter((name) => names.includes(name)).concat(el.hasAttribute('data-im-badge') && !el.classList.contains('im-row') ? ['data-im-badge'] : [])), REMOVED);

// The frame of a shell, as a list: the skip link and the regions (tag, region classes, and what the frame's markup gives
// each: a name, the content's id and tabindex), and every child of the content region, which is a panel: its header,
// tools, body and foot by tag and class, anything else as the app's. What an app puts inside the other regions, and
// inside the content's parts, is its own.
const skeleton = (page, selector, markup) => page.evaluate(({ selector, markup }) => {
  const REGION = ['im-shell-skip-link', 'im-titlebar', 'im-body', 'im-sidebar', 'im-work', 'im-status', 'im-columns', 'im-content', 'im-inspector', 'im-actions', 'im-footer'];
  const PART = ['im-panel-header', 'im-panel-tools', 'im-panel-body', 'im-panel-foot'];
  let shell = selector ? document.querySelector(selector) : null;
  if (markup) {
    shell = document.createElement('div');
    shell.innerHTML = markup;
  }
  const out = [];
  const walk = (parent, depth) => {
    for (const child of parent.children) {
      const region = REGION.find((name) => child.classList.contains(name));
      if (!region) continue;
      const classes = [...child.classList].filter((name) => name === 'im-panel' || REGION.includes(name)).join('.');
      const extra = (child.hasAttribute('aria-label') ? '[aria-label]' : '') + (region === 'im-content' ? `${child.id ? '[id]' : ''}[tabindex=${child.getAttribute('tabindex')}]` : '')
        + (region === 'im-shell-skip-link' ? `[href=${child.getAttribute('href') === '#' + shell.querySelector('.im-content')?.id ? 'content' : child.getAttribute('href')}]` : '');
      out.push(`${'  '.repeat(depth)}${child.localName}.${classes}${extra}`);
      if (region === 'im-content') {
        for (const inner of child.children) {
          const part = PART.find((name) => inner.classList.contains(name));
          out.push(`${'  '.repeat(depth + 1)}${part ? `${inner.localName}.${part}` : `${inner.localName} (not a part of a panel)`}`);
        }
      } else walk(child, depth + 1);
    }
  };
  walk(shell, 0);
  return out;
}, { selector, markup });

/** The boxes of the regions of a shell, null for one that is not on screen. */
const regionBoxes = (page, selector) => page.evaluate((s) => {
  const shell = document.querySelector(s);
  const rect = (el) => {
    if (!el || !el.getClientRects().length || el.closest('[hidden]')) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  };
  const one = (q) => rect(shell.querySelector(q));
  return {
    shell: rect(shell), sidebar: one('.im-sidebar'), work: one('.im-work'), status: one('.im-status'), columns: one('.im-columns'),
    content: one('.im-content'), inspector: one('.im-inspector'), actions: one('.im-actions'), footer: one('.im-footer'),
    primary: one('.im-actions .im-btn--primary'), toggle: one('.im-sidebar-toggle'),
    windowButtons: [...shell.querySelectorAll('.im-window-button')].map(rect),
    scroll: shell.scrollWidth, client: shell.clientWidth, sidebarOff: shell.dataset.imSidebar === 'off',
  };
}, selector);

/** Where the regions are at one width: the sidebar, the rail or the drawer; the inspector docked or over the content. */
function checkRegions(r, width, label, { dockFrom = 1000, inspectorWidth = 300, minContent = 420 } = {}) {
  const inside = (box) => box && box.left >= r.shell.left - 0.5 && box.right <= r.shell.right + 0.5 && box.top >= r.shell.top - 0.5 && box.bottom <= r.shell.bottom + 0.5;
  near(r.shell.width, width, `${label}: shell width`);
  assert.ok(r.scroll <= r.client, `${label}: nothing is pushed out sideways (${r.scroll} > ${r.client})`);
  assert.equal(r.windowButtons.length, 3, `${label}: three window buttons`);
  for (const button of r.windowButtons) assert.ok(inside(button) && button.width >= 44 - 0.5, `${label}: a window button is outside the shell or narrow (${JSON.stringify(button)})`);
  assert.ok(inside(r.primary), `${label}: the primary action is inside the shell (${JSON.stringify(r.primary)})`);
  if (!r.sidebarOff) {
    if (width >= 850) near(r.sidebar.width, 232, `${label}: the whole sidebar`);
    else if (width >= 620) near(r.sidebar.width, 56, `${label}: the rail`);
    else {
      assert.equal(r.sidebar, null, `${label}: no sidebar in the layout`);
      assert.ok(inside(r.toggle), `${label}: the sidebar button is in the title bar`);
    }
  } else assert.equal(r.sidebar, null, `${label}: no sidebar`);
  if (width >= dockFrom) {
    assert.ok(r.inspector.left >= r.content.right - 0.5, `${label}: the inspector is docked at the right of the content`);
    near(r.inspector.width, inspectorWidth, `${label}: inspector width`);
    assert.ok(r.content.width >= minContent - 0.5, `${label}: the content is ${r.content.width} wide`);
  } else {
    assert.ok(r.inspector.left > r.content.left && r.inspector.left < r.content.right, `${label}: the inspector covers the content's right edge`);
    near(r.content.right, r.work.right, `${label}: the content reaches the work area's right edge under the drawer`);
  }
  if (r.status) assert.ok(r.status.bottom <= r.columns.top + 0.5, `${label}: the status row is above the columns`);
  if (r.actions) assert.ok(r.columns.bottom <= r.actions.top + 0.5, `${label}: the action bar is under the columns`);
  if (r.footer) {
    assert.ok((r.actions ?? r.columns).bottom <= r.footer.top + 0.5, `${label}: the footer is under the action bar`);
    near(r.footer.bottom, r.shell.bottom, `${label}: the footer is the window's last row`);
  }
}

// Every fixture is the frame shellFrameHtml writes, the skip link and the content's panel parts included. Muro, Shinatama
// and Daodan had their own frames until 0.1.4: their regions are where the design file says at 1160, 900, 700, 500, 250.
async function canonicalFixtures(page, look, theme) {
  for (const app of APPS) {
    await show(page, { app, look, theme, glass: false, width: 1160 });
    // The frame shellFrameHtml writes with the regions and the content parts this app uses.
    const markup = await page.evaluate(() => {
      const api = window.__imagoSurfaces;
      const live = document.querySelector('#g-window .im-shell');
      const has = (selector) => (live.querySelector(selector) ? '' : undefined);
      return api.shellFrameHtml({
        titlebarHtml: '<header class="im-titlebar"></header>', contentHtml: '', contentLabel: 'View', skipLabel: 'Skip', inspectorLabel: 'Inspector',
        sidebarHtml: live.querySelector('.im-sidebar') ? api.sidebarHtml({ id: 'probe', label: 'Probe', rowsHtml: '' }) : undefined,
        statusHtml: has('.im-status'), actionsHtml: has('.im-actions'), footerHtml: has('.im-footer'),
        contentHeaderHtml: has('.im-content > .im-panel-header'), contentToolsHtml: has('.im-content > .im-panel-tools'), contentFootHtml: has('.im-content > .im-panel-foot'),
      });
    });
    const live = await skeleton(page, '#g-window .im-shell');
    assert.ok(live.some((line) => line.includes('im-shell-skip-link')) && live.some((line) => line.includes('im-panel-body')), `${look} ${theme}: the skeleton reads the skip link and the content's parts (${live.join(' | ')})`);
    assert.deepEqual(live, await skeleton(page, null, markup), `${look} ${theme}: ${app}'s fixture is the canonical frame`);
    if (!['muro', 'shinatama', 'daodan'].includes(app)) continue;
    for (const width of [1160, 900, 700, 500, 250]) {
      await show(page, { app, look, theme, glass: false, width });
      checkRegions(await regionBoxes(page, '#g-window .im-shell'), width, `${look} ${theme}: ${app} at ${width}`);
    }
  }
}

// A frame written by shellFrameHtml and mounted by renderShellFrame, beside the gallery's window: every region, a sidebar
// and an open inspector, page content with its three headings.
const FRAME = '#frame-host .im-shell';
const buildFrame = (page, width, options = {}) => page.evaluate(({ width, options }) => {
  document.getElementById('frame-host')?.remove();
  const api = window.__imagoSurfaces;
  const host = document.createElement('div');
  host.id = 'frame-host';
  for (const { name, value } of document.querySelector('#g-window').attributes) if (name.startsWith('data-im-')) host.setAttribute(name, value);
  host.style.cssText = `position:relative;width:${width}px;height:640px`;
  const shell = document.createElement('div');
  shell.className = 'im-shell';
  if (options.wide) shell.dataset.imInspector = 'wide';
  host.append(shell);
  document.querySelector('#g-sections').append(host);
  const row = (text) => `<div class="im-row im-row--1" role="option" aria-selected="false" title="${text}"><span class="im-avatar im-rail-item" aria-hidden="true">${text.slice(0, 2)}</span><span class="im-row-text"><span class="im-row-title">${text}</span></span></div>`;
  const nav = '<button type="button" class="im-icon-btn im-sidebar-toggle" aria-label="Threads" title="Threads" aria-expanded="false" aria-controls="frame-side">T</button>'
    + '<nav class="im-tabs" role="tablist" aria-label="Views"><button type="button" role="tab" class="im-tab" aria-selected="true">First</button><button type="button" role="tab" class="im-tab" aria-selected="false">Second</button></nav>';
  api.renderShellFrame(shell, api.shellFrameHtml({
    titlebarHtml: api.titlebarHtml({ brand: { name: 'Frame' }, navigationHtml: nav, views: { label: 'Views', action: 'views' }, commands: { label: 'Commands', action: 'palette', shortcut: 'Ctrl K' }, windowControls: true }),
    sidebarHtml: options.sidebar === false ? undefined : api.sidebarHtml({ id: 'frame-side', label: 'Threads', rowsHtml: ['Alpha', 'Beta', 'Gamma'].map(row).join(''), collapse: { collapse: 'Collapse sidebar', expand: 'Expand sidebar' } }),
    statusHtml: options.bare ? undefined : '<span class="im-chip" data-im-tone="ok">Ready</span><span class="im-status-text">Summary</span><span class="im-spacer"></span><span class="im-status-end">Info</span>',
    contentHeaderHtml: '<h4 class="im-panel-title">First</h4>', contentToolsHtml: '<span class="im-chip">Filter</span>',
    contentHtml: api.pageContentHtml('<h1>Page title</h1><h2>Section</h2><h3>Group</h3><p>Body text</p><ul><li>Item</li></ul>'
      + '<p>Commit <code>a1b2c3d</code> on <code>C:\\work\\app</code></p><button type="button" class="im-btn" data-test="copy"><span>Copy</span></button>'
      + '<div class="im-tabs" role="tablist" aria-label="Parts"><button type="button" role="tab" class="im-tab" aria-selected="true">Tab</button></div>'
      + '<div role="listbox" aria-label="Rows"><div class="im-row im-row--1" role="option" aria-selected="false"><span class="im-row-text"><span class="im-row-title">Row</span></span></div></div>'),
    contentLabel: 'First', contentId: 'frame-main', skipLabel: 'Skip to content', inspectorLabel: 'Details',
    actionsHtml: options.bare ? undefined : '<button type="button" class="im-btn"><span>Check</span></button><button type="button" class="im-btn im-btn--primary"><span>Apply</span></button>',
    footerHtml: options.bare ? undefined : '<span class="im-dot" data-im-tone="ok"></span><span class="im-footer-text">State</span><span class="im-spacer"></span><span class="im-footer-keys"><span><kbd class="im-key">F6</kbd>next region</span></span>',
  }));
  const inspector = shell.querySelector('.im-inspector');
  inspector.innerHTML = '<header class="im-panel-header"><h4 class="im-panel-title">Details</h4></header><div class="im-panel-body">Facts</div>';
  inspector.hidden = false;
}, { width, options });

// What a page holds that is content, not a control: a table of data, steps, a progress value, avatars, facts, a note. Every
// other control of the manifest is chrome, in a page as everywhere: none of its text can be selected. A control added to
// the manifest is chrome until it is named here.
const PAGE_CONTENT = ['table-row', 'steps', 'progress', 'avatar', 'facts', 'note'];
// Controls the matrix does not draw, which the rule names all the same.
const MORE_CONTROLS = '<a class="im-btn" href="#">Open</a><div role="menu" aria-label="View"><div role="menuitemcheckbox" aria-checked="true">Wrap lines</div>'
  + '<div role="menuitemradio" aria-checked="false">Left</div></div><div role="button">Act</div><div role="listbox" aria-label="Pick"><span role="option">One</span></div>'
  + '<span role="checkbox" aria-checked="false">Pinned</span><span class="im-field-label">Label</span><summary>More</summary>';

// Page content is content and its controls are chrome: every control of the manifest in a page cannot be selected, what is
// content in it can, and a drag across two paragraphs with controls between them copies the paragraphs' words alone.
async function pageControls(page, where) {
  const cells = CONTROLS.map(({ id }) => `<div data-cell="${id}">${cellMarkup(id, 'rest')}</div>`).join('');
  const between = '<button type="button" class="im-btn"><span>Copy</span></button><label class="im-option"><input type="checkbox" class="im-check">Keep</label>'
    + '<a class="im-btn" href="#">Open</a><span class="im-chip">open</span><kbd class="im-key">Ctrl K</kbd><span class="im-count">3</span>';
  try {
    await page.evaluate(({ cells, between, more }) => {
      document.getElementById('frame-host')?.remove();
      const api = window.__imagoSurfaces;
      const host = document.createElement('div');
      host.id = 'frame-host';
      for (const { name, value } of document.querySelector('#g-window').attributes) if (name.startsWith('data-im-')) host.setAttribute(name, value);
      host.style.cssText = 'position:relative;width:1160px;height:640px';
      const shell = document.createElement('div');
      shell.className = 'im-shell';
      host.append(shell);
      document.querySelector('#g-sections').append(host);
      api.renderShellFrame(shell, api.shellFrameHtml({
        titlebarHtml: api.titlebarHtml({ brand: { name: 'Frame' } }), contentLabel: 'Page', skipLabel: 'Skip to content', inspectorLabel: 'Details',
        contentHtml: api.pageContentHtml(`<p data-test="first">First paragraph</p>${between}<p data-test="second">Second paragraph</p><div data-test="more">${more}</div>${cells}`),
      }));
      host.scrollIntoView({ block: 'start' });
    }, { cells, between, more: MORE_CONTROLS });
    const read = await page.evaluate((content) => {
      const page = document.querySelector('#frame-host .im-page-content');
      const texts = (root) => {
        const out = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim() || node.parentElement.closest('input, textarea')) continue;
          out.push({ text: node.textContent.trim(), select: getComputedStyle(node.parentElement).userSelect });
        }
        return out;
      };
      return {
        cells: [...page.querySelectorAll('[data-cell]')].map((cell) => ({ id: cell.dataset.cell, content: content.includes(cell.dataset.cell), texts: texts(cell) })),
        more: texts(page.querySelector('[data-test="more"]')),
        fields: [...page.querySelectorAll('input:not([type="checkbox"], [type="radio"]), textarea')].map((el) => getComputedStyle(el).userSelect),
      };
    }, PAGE_CONTENT);
    for (const cell of read.cells) {
      const wrong = cell.texts.filter((t) => t.select !== (cell.content ? 'text' : 'none'));
      assert.deepEqual(wrong, [], where(`page content: the ${cell.id} control's text ${cell.content ? 'can' : 'cannot'} be selected`));
    }
    assert.ok(read.cells.filter((cell) => !cell.content).every((cell) => cell.texts.length || ['icon-button', 'search', 'field', 'field-bare', 'textarea'].includes(cell.id)), where('the controls have text to test'));
    assert.deepEqual(read.more.filter((t) => t.select !== 'none'), [], where('page content: a link button, menu items of every kind, a role button, an option, a check, a field label and a summary cannot be selected'));
    assert.ok(read.fields.length && read.fields.every((value) => value === 'text'), where('page content: a field\'s value can'));

    // A drag from the first paragraph to the end of the second, over the controls between them.
    const ends = await page.evaluate(() => {
      const range = (selector, start) => {
        const node = document.querySelector(`#frame-host [data-test="${selector}"]`).firstChild;
        const r = document.createRange();
        r.setStart(node, start ? 0 : node.length - 1);
        r.setEnd(node, start ? 1 : node.length);
        const box = r.getBoundingClientRect();
        return { x: start ? box.left + 1 : box.right - 1, y: box.top + box.height / 2 };
      };
      getSelection().removeAllRanges();
      return { from: range('first', true), to: range('second', false) };
    });
    await page.mouse.move(ends.from.x, ends.from.y);
    await page.mouse.down();
    await page.mouse.move(ends.to.x, ends.to.y, { steps: 8 });
    await page.mouse.up();
    const copied = await page.evaluate(() => getSelection().toString());
    assert.match(copied, /^First paragraph\s+Second paragraph$/, where(`a drag across two paragraphs copies their words, not the controls between them (${JSON.stringify(copied)})`));
  } finally {
    await page.evaluate(() => { getSelection().removeAllRanges(); document.getElementById('frame-host')?.remove(); });
  }
}

async function builtFrame(page, look) {
  const where = (text) => `${look}: the frame of shellFrameHtml ${text}`;
  try {
    for (const width of [1160, 900, 700, 500, 250]) {
      await buildFrame(page, width);
      checkRegions(await regionBoxes(page, FRAME), width, where(`at ${width}`));
      // Page content has the content region's padding, and its headings are the page's: sentence case in both looks.
      const page_ = await page.evaluate((s) => {
        const shell = document.querySelector(s);
        const content = shell.querySelector('.im-page-content');
        const probe = (property, value) => {
          const el = document.createElement('span');
          el.style.setProperty(property, value);
          content.append(el);
          const result = getComputedStyle(el).getPropertyValue(property);
          el.remove();
          return result;
        };
        const heading = (tag) => {
          const style = getComputedStyle(content.querySelector(tag));
          return { size: style.fontSize, weight: style.fontWeight, transform: style.textTransform, color: style.color, family: style.fontFamily, margin: style.marginTop };
        };
        return {
          padding: getComputedStyle(content).paddingTop, scrolls: getComputedStyle(content.parentElement).overflowY,
          h1: heading('h1'), h2: heading('h2'), h3: heading('h3'),
          hi: probe('color', 'var(--im-text-hi)'), head: probe('font-family', 'var(--im-font-head)'),
          p: getComputedStyle(content.querySelector('p')).marginTop, list: getComputedStyle(content.querySelector('ul')).listStyleType,
          parts: [...shell.querySelector('.im-content').children].map((el) => {
            const r = el.getBoundingClientRect();
            return { name: el.className, top: r.top, bottom: r.bottom };
          }),
        };
      }, FRAME);
      assert.equal(page_.padding, width >= 620 ? '24px' : '16px', where(`page padding at ${width}`));
      assert.equal(page_.scrolls, 'auto', where('the content panel body scrolls'));
      assert.deepEqual(page_.parts.map((p) => p.name), ['im-panel-header', 'im-panel-tools', 'im-panel-body'], where('the content is a panel: header, tools, body'));
      for (let at = 1; at < page_.parts.length; at++) {
        assert.ok(page_.parts[at - 1].bottom <= page_.parts[at].top + 0.5, where(`${page_.parts[at - 1].name} is above ${page_.parts[at].name} at ${width}`));
      }
      for (const [tag, size] of [['h1', '18px'], ['h2', '14px'], ['h3', '13px']]) {
        const h = page_[tag];
        assert.deepEqual([h.size, h.weight, h.transform, h.margin], [size, '600', 'none', '0px'], where(`${tag} at ${width}`));
        assert.equal(h.color, page_.hi, where(`${tag} is in --im-text-hi`));
        assert.equal(h.family, page_.head, where(`${tag} is in --im-font-head`));
      }
      assert.deepEqual([page_.p, page_.list], ['0px', 'none'], where('the document resets apply in the shell'));
      // Page content is content: its text can be selected and copied (a path, a commit, an id); its controls cannot, as
      // everywhere in the shell.
      if (width === 1160) {
        const select = await page.evaluate((s) => {
          const content = document.querySelector(s).querySelector('.im-page-content');
          const of = (selector) => getComputedStyle(content.querySelector(selector)).userSelect;
          return {
            heading: of('h1'), paragraph: of('p'), code: of('code'), item: of('li'),
            button: of('[data-test="copy"]'), label: of('[data-test="copy"] > span'), tab: of('.im-tab'), row: of('.im-row'), title: of('.im-row-title'),
            chrome: getComputedStyle(document.querySelector(s).querySelector('.im-titlebar')).userSelect,
          };
        }, FRAME);
        assert.deepEqual(select, { heading: 'text', paragraph: 'text', code: 'text', item: 'text', button: 'none', label: 'none', tab: 'none', row: 'none', title: 'none', chrome: 'none' }, where('page content is selectable, its controls are not'));
      }
    }
    await pageControls(page, where);
    // The wide inspector: 360, docked from 1012 beside the sidebar, from 1000 without one.
    await buildFrame(page, 1160, { wide: true });
    checkRegions(await regionBoxes(page, FRAME), 1160, where('wide at 1160'), { inspectorWidth: 360 });
    // (1012 is 232 + 420 + 360; the gaps of ONI's panes come out of the content, so its 420 is not asserted here)
    await buildFrame(page, 1012, { wide: true });
    checkRegions(await regionBoxes(page, FRAME), 1012, where('wide at 1012'), { dockFrom: 1012, inspectorWidth: 360, minContent: 0 });
    await buildFrame(page, 1011, { wide: true });
    checkRegions(await regionBoxes(page, FRAME), 1011, where('wide at 1011'), { dockFrom: 1012 });
    near((await regionBoxes(page, FRAME)).inspector.width, 360, where('the wide drawer is 360'));
    await buildFrame(page, 1000, { wide: true, sidebar: false });
    checkRegions(await regionBoxes(page, FRAME), 1000, where('wide without a sidebar at 1000'), { inspectorWidth: 360 });
    await buildFrame(page, 999, { wide: true, sidebar: false });
    checkRegions(await regionBoxes(page, FRAME), 999, where('wide without a sidebar at 999'));
    // A frame without a status row, an action bar or a footer: the columns take the whole work area, no empty band.
    await buildFrame(page, 1160, { bare: true });
    const bare = await regionBoxes(page, FRAME);
    assert.deepEqual([bare.status, bare.actions, bare.footer], [null, null, null], where('bare has no status, actions or footer'));
    // (Smooth's work area has a 1px top edge)
    assert.ok(Math.abs(bare.columns.top - bare.work.top) <= 1.5, where(`bare: the columns start at the top of the work area (${bare.columns.top} for ${bare.work.top})`));
    near(bare.columns.bottom, bare.work.bottom, where('bare: the columns reach the bottom of the work area'));
  } finally {
    await page.evaluate(() => document.getElementById('frame-host')?.remove());
  }
}

/** A tools row and a foot, as a sidebar may have: shown while it is whole, not in a rail. */
const addSidebarParts = (page) =>
  page.evaluate(() => {
    const sidebar = document.querySelector('.im-sidebar');
    for (const part of ['tools', 'foot']) {
      const el = document.createElement('div');
      el.className = `im-panel-${part}`;
      el.dataset.test = part;
      el.textContent = part;
      sidebar.append(el);
    }
  });
const removeSidebarParts = (page) => page.evaluate(() => document.querySelectorAll('.im-sidebar [data-test]').forEach((el) => el.remove()));

// What the sidebar is in the rail, whether the width forced it (840) or the user folded it (1160): the rail's width, an
// icon, the initials or the row's check for every row, the row's text kept for the accessible name (the name is longer
// than the title tooltip, which is what a name falls back to when the text is gone), the selection told by weight or
// ring as well as by fill, and neither tools nor foot.
async function checkRail(page, where, widths, label) {
  near((await box(page, '.im-sidebar')).width, widths.rail, where(`${label}: rail width`));
  const rows = page.locator('.im-sidebar [role="option"]');
  const total = await rows.count();
  assert.ok(total >= 3, where(`${label}: the sidebar has rows`));
  for (let i = 0; i < total; i++) {
    const row = rows.nth(i);
    const title = ((await row.getAttribute('title')) ?? '').trim();
    assert.ok(title, where(`${label}: row ${i} has a title`));
    const name = /option "([^"]+)"/.exec(await row.ariaSnapshot())?.[1] ?? '';
    const heading = ((await row.locator('.im-row-title').textContent()) ?? '').trim();
    assert.ok(name.startsWith(heading) && name.length > title.length, where(`${label}: row ${i} is named by its text, not only by its title (${name})`));
    const item = row.locator('.im-rail-item');
    assert.equal(await item.count(), 1, where(`${label}: row ${i} has one rail item`));
    assert.equal(await item.isVisible(), true, where(`${label}: row ${i} shows its rail item`));
    if (await item.locator('svg').count()) assert.equal(await item.locator('svg').isVisible(), true, where(`${label}: row ${i} shows its icon`));
    else if ((await item.getAttribute('role')) === 'checkbox') assert.ok(await item.getAttribute('aria-checked'), where(`${label}: row ${i} shows its check`));
    else assert.ok(((await item.innerText()) ?? '').trim(), where(`${label}: row ${i} shows its initials`));
  }
  const looks = await page.evaluate(() =>
    [...document.querySelectorAll('.im-sidebar [role="option"]')].map((row) => {
      const item = row.querySelector('.im-rail-item');
      const style = getComputedStyle(item);
      const svg = item.querySelector('svg');
      const kind = svg ? 'icon' : item.classList.contains('im-check') ? 'check' : 'avatar';
      return { on: row.getAttribute('aria-selected') === 'true', kind, stroke: svg ? parseFloat(getComputedStyle(svg).strokeWidth) : 0, ring: style.boxShadow, box: item.getBoundingClientRect().width };
    }));
  for (const kind of ['icon', 'avatar', 'check']) {
    const on = looks.filter((l) => l.on && l.kind === kind);
    const off = looks.filter((l) => !l.on && l.kind === kind);
    if (!on.length || !off.length) continue;
    if (kind === 'icon') assert.ok(Math.min(...on.map((l) => l.stroke)) > Math.max(...off.map((l) => l.stroke)), where(`${label}: the selected icon is drawn heavier`));
    else assert.ok(on.every((l) => off.every((o) => o.ring !== l.ring)), where(`${label}: the selected ${kind} has a ring (${on.map((l) => l.ring)} and ${off.map((l) => l.ring)})`));
  }
  // A sidebar whose selected row has no icon: an icon row, selected for the test, is drawn heavier too.
  if (!looks.some((l) => l.on && l.kind === 'icon') && looks.some((l) => l.kind === 'icon')) {
    const strokes = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.im-sidebar [role="option"]')].find((el) => el.querySelector(':scope > .im-rail-item svg'));
      const stroke = () => parseFloat(getComputedStyle(row.querySelector(':scope > .im-rail-item svg')).strokeWidth);
      const was = row.getAttribute('aria-selected');
      const rest = stroke();
      row.setAttribute('aria-selected', 'true');
      const selected = stroke();
      row.setAttribute('aria-selected', was);
      return { rest, selected };
    });
    assert.ok(strokes.selected > strokes.rest, where(`${label}: a selected icon is drawn heavier (${JSON.stringify(strokes)})`));
  }
  assert.ok(looks.filter((l) => l.kind === 'icon').every((l) => l.box === 20), where(`${label}: an icon sits in the rail's 20px box`));
  assert.ok(looks.filter((l) => l.kind === 'check').every((l) => l.box === 16), where(`${label}: a check keeps its own 16px box`));
  const rail = await box(page, '.im-sidebar');
  const centres = await page.evaluate(() => [...document.querySelectorAll('.im-sidebar .im-rail-item')].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect()).map((r) => r.left + r.width / 2));
  assert.ok(centres.length >= 3 && centres.every((x) => Math.abs(x - (rail.left + rail.width / 2)) <= 1.5), where(`${label}: the rail items are centred in the rail`));
  // a tools row and a foot in the sidebar are not for a rail: the sidebar's own foot neither
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.im-sidebar > .im-panel-foot')].some((el) => el.getClientRects().length > 0)), false, where(`${label}: the sidebar's foot is not in the rail`));
  await addSidebarParts(page);
  assert.equal(await visible(page, '[data-test="tools"]'), false, where(`${label}: no tools row`));
  assert.equal(await visible(page, '[data-test="foot"]'), false, where(`${label}: no foot`));
  await removeSidebarParts(page);
}

// ---------- the rows of the sidebar: a check in the rail, a categorical colour, a badge ----------

/** The checks that are the rail items of the sidebar's rows: how each is drawn, and whether a press at its centre reaches it. */
const railChecks = (page) => page.evaluate(() => [...document.querySelectorAll('.im-sidebar [role="option"] > .im-check.im-rail-item')].map((check) => {
  check.scrollIntoView({ block: 'center' }); // clear of the gallery's sticky bar
  const s = getComputedStyle(check);
  const mark = getComputedStyle(check, '::after');
  const r = check.getBoundingClientRect();
  return {
    hit: r.width > 0 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === check,
    drawn: [r.width, r.height, s.backgroundColor, s.borderTopWidth, s.borderTopStyle, s.borderTopColor, mark.content,
      mark.content === 'none' ? '' : [mark.width, mark.height, mark.backgroundColor, mark.borderRightColor, mark.transform].join(' ')].join(' | '),
  };
}));

// Xiox's rows are checks: each row's check is its rail item, drawn in the rail as in the whole sidebar, and a press on it
// there reaches it, so the person ticks it in the rail as in the whole sidebar.
async function checksInRail(page, where, at) {
  await at(1160);
  const whole = await railChecks(page);
  assert.ok(whole.length >= 3 && whole.every((check) => check.hit), where(`the checks of the rows are their rail items (${JSON.stringify(whole)})`));
  await at(840);
  const rail = await railChecks(page);
  assert.deepEqual(rail.map((check) => check.drawn), whole.map((check) => check.drawn), where('a check is drawn in the rail as in the whole sidebar'));
  assert.ok(rail.every((check) => check.hit), where('a press in the rail reaches the check'));
  const check = page.locator('.im-sidebar [role="option"] > .im-check.im-rail-item[aria-checked="false"]').first();
  await check.evaluate((el) => { el.dataset.test = 'tick'; el.addEventListener('click', () => el.setAttribute('aria-checked', 'true'), { once: true }); });
  await page.locator('[data-test="tick"]').click();
  assert.equal(await page.locator('[data-test="tick"]').getAttribute('aria-checked'), 'true', where('a check in the rail is ticked by a press'));
  assert.notEqual(await page.locator('[data-test="tick"]').evaluate((el) => getComputedStyle(el, '::after').content), 'none', where('and shows its tick'));
  // In the rail the check is all there is to aim at: a press 10px from its centre, in each direction, still ticks it (a
  // target of 24 by 24), and its drawn box stays 16 by 16.
  const target = page.locator('[data-test="tick"]');
  await target.evaluate((el) => { window.__ticks = 0; el.addEventListener('click', (event) => { if (event.target === el) window.__ticks++; }); });
  const centre = await target.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height }; });
  assert.deepEqual([centre.width, centre.height], [16, 16], where('the check is drawn 16 by 16 in the rail'));
  for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) await page.mouse.click(centre.x + dx, centre.y + dy);
  assert.equal(await page.evaluate(() => window.__ticks), 4, where('a press 10px from the check, in each direction, reaches it'));
}

// The marks a rail item carries that are not colour, the selection's ring (of an avatar, of a check) and the badge's
// dot, are set apart from the item's fill (a category, the accent of a ticked check) by a gap in what is under the row:
// the gap is the row's own ground at rest, hovered and selected, and each mark stands at 3:1 or more against it. Rows of
// the eight categories, rest, hovered and selected, and selected checks, in the rail of the live sidebar.
const railMarks = (page) => page.evaluate(() => {
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
    return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const background = (el) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const paint = getComputedStyle(node).backgroundColor;
      if (paint !== 'rgba(0, 0, 0, 0)' && paint !== 'transparent') layers.unshift(paint);
    }
    return layers;
  };
  const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = ([r, g2, b]) => 0.2126 * channel(r) + 0.7152 * channel(g2) + 0.0722 * channel(b);
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
  /** The layers of a box-shadow of rings, top first: [colour, spread]. */
  const rings = (value) => [...value.matchAll(/((?:rgba?|oklch|oklab|color|hsla?|lab|lch)\([^)]*\)|transparent)\s+0px 0px 0px (\d+(?:\.\d+)?)px/g)].map((m) => ({ colour: m[1], spread: Number(m[2]) }));
  const list = document.querySelector('.im-shell .im-sidebar .im-list');
  const probes = [];
  for (let n = 1; n <= 8; n++) {
    for (const state of ['rest', 'hover', 'selected']) {
      probes.push({ label: `category ${n} ${state}`, selected: state === 'selected', html: `<div class="im-row" role="option" aria-selected="${state === 'selected'}" data-im-cat="${n}" data-im-badge${state === 'hover' ? ' data-im-force="hover"' : ''} title="Thread ${n}, needs you"><span class="im-avatar im-rail-item" data-im-cat="${n}" aria-hidden="true">TH</span><span class="im-row-text"><span class="im-row-title">Thread ${n}</span></span></div>` });
    }
  }
  for (const checked of ['true', 'mixed', 'false']) {
    probes.push({ label: `a check ${checked}, selected`, selected: true, html: `<div class="im-row" role="option" aria-selected="true" title="Category"><span class="im-check im-rail-item" role="checkbox" aria-checked="${checked}" aria-label="Category"></span><span class="im-row-text"><span class="im-row-title">Category</span></span></div>` });
  }
  const failures = [];
  let measured = 0;
  for (const probe of probes) {
    const holder = document.createElement('div');
    holder.innerHTML = probe.html;
    const row = holder.firstElementChild;
    list.append(row);
    const item = row.querySelector(':scope > .im-rail-item');
    const under = flatten(background(row));
    if (probe.selected) {
      const layers = rings(getComputedStyle(item).boxShadow);
      const gap = layers.length >= 3 ? flatten(layers.slice(0, -1).map((layer) => layer.colour).reverse()) : null;
      const ring = layers.length >= 3 ? flatten([...background(row), layers.at(-1).colour]) : null;
      if (!gap) failures.push(`${probe.label}: the ring has no gap (${getComputedStyle(item).boxShadow})`);
      else {
        if (!same(gap, under)) failures.push(`${probe.label}: the ring's gap is ${gap}, the row under it ${under}`);
        if (ratio(ring, gap) < 3) failures.push(`${probe.label}: the ring is ${ratio(ring, gap).toFixed(2)}:1 against the gap beside it`);
        measured++;
      }
    }
    if (row.hasAttribute('data-im-badge')) {
      const dot = getComputedStyle(row, '::after');
      const layers = rings(dot.boxShadow);
      const cut = layers.length >= 2 ? flatten(layers.map((layer) => layer.colour).reverse()) : null;
      if (dot.content === 'none' || dot.display === 'none') failures.push(`${probe.label}: no badge in the rail`);
      else if (!cut) failures.push(`${probe.label}: the badge has no cut-out (${dot.boxShadow})`);
      else {
        if (!same(cut, under)) failures.push(`${probe.label}: the badge's cut-out is ${cut}, the row under it ${under}`);
        for (const tone of [null, 'ok', 'err', 'info']) {
          if (tone) row.setAttribute('data-im-tone', tone);
          const colour = flatten([getComputedStyle(row, '::after').backgroundColor]);
          if (ratio(colour, cut) < 3) failures.push(`${probe.label}: the ${tone ?? 'warn'} badge is ${ratio(colour, cut).toFixed(2)}:1 against its cut-out`);
          measured++;
        }
      }
    }
    row.remove();
  }
  return { failures, measured };
});

async function checkRailMarks(page, where, at) {
  await at(840);
  const root = page.locator('#g-window');
  const app = await root.getAttribute('data-im-app');
  try {
    for (const accent of ['xiox', 'mukade', 'shinatama', 'muro', 'daodan']) {
      await root.evaluate((el, value) => { el.dataset.imApp = value; }, accent);
      const { failures, measured } = await railMarks(page);
      assert.deepEqual(failures, [], where(`${accent}'s accent: a mark of the rail is lost in a fill`));
      assert.ok(measured >= 24 * 3, where(`${accent}'s accent: the rail's marks are measured (${measured})`));
    }
  } finally {
    await root.evaluate((el, value) => { el.dataset.imApp = value; }, app);
  }
}

/** What a categorised row of the sidebar draws: the mark at its start, and its rail item's fill. */
const categories = (page) => page.evaluate(() => [...document.querySelectorAll('.im-sidebar .im-row[data-im-cat]')].map((row) => {
  const n = row.dataset.imCat;
  const probe = (value) => {
    const el = document.createElement('i');
    el.style.color = value;
    row.after(el);
    const colour = getComputedStyle(el).color;
    el.remove();
    return colour;
  };
  const mark = getComputedStyle(row, '::before');
  const item = row.querySelector(':scope > .im-rail-item[data-im-cat]');
  return {
    n, cat: probe(`var(--im-cat-${n})`), on: probe('var(--im-cat-on)'), item: item ? { cat: item.dataset.imCat, background: getComputedStyle(item).backgroundColor, color: getComputedStyle(item).color } : null,
    mark: { content: mark.content, position: mark.position, width: mark.width, left: parseFloat(mark.left), color: mark.backgroundColor },
  };
}));

/** The selection of the sidebar's selected row, as the eye sees it: its fill, its inset line, the weight of its title. */
const selection = (page) => page.evaluate(() => {
  const row = document.querySelector('.im-sidebar .im-row[aria-selected="true"]');
  const style = getComputedStyle(row);
  return { fill: style.backgroundColor, line: style.boxShadow, weight: getComputedStyle(row.querySelector('.im-row-title')).fontWeight };
});

/** The badge of the badged row: the dot at the row's end, the dot at its rail item's corner, and the colours of the tones. */
const badge = (page) => page.evaluate(() => {
  const row = document.querySelector('.im-sidebar .im-row[data-im-badge]');
  const item = row.querySelector(':scope > .im-rail-item');
  const probe = (value) => {
    const el = document.createElement('i');
    el.style.color = value;
    row.after(el);
    const colour = getComputedStyle(el).color;
    el.remove();
    return colour;
  };
  const end = getComputedStyle(row, '::after');
  // Where the dot is drawn when it is placed (in the rail): its box from the row's padding box, and the rail item's box.
  const r = row.getBoundingClientRect();
  const left = r.left + parseFloat(getComputedStyle(row).borderLeftWidth) + parseFloat(end.left);
  const top = r.top + parseFloat(getComputedStyle(row).borderTopWidth) + parseFloat(end.top);
  const i = item.getBoundingClientRect();
  return {
    warn: probe('var(--im-warn)'), err: probe('var(--im-err)'), meta: row.querySelector('.im-row-meta').getBoundingClientRect().right,
    end: { content: end.content, display: end.display, position: end.position, width: end.width, height: end.height, color: end.backgroundColor, pointer: end.pointerEvents },
    corner: { right: left + parseFloat(end.width) - i.right, top: i.top - top },
  };
});

// Shinatama colours its threads by category and marks the one that waits for the person with a badge.
async function categoryAndBadge(page, where, at) {
  await at(1160, 'shinatama');
  const whole = await categories(page);
  assert.ok(whole.length >= 3, where('Shinatama colours its threads'));
  for (const row of whole) {
    const said = (text) => where(`category ${row.n}: ${text}`);
    assert.deepEqual([row.mark.content, row.mark.position, row.mark.width], ['""', 'absolute', '3px'], said('a row draws a 3px mark'));
    assert.ok(row.mark.left >= 0 && row.mark.left <= 4, said(`at its start edge (${row.mark.left})`));
    assert.equal(row.mark.color, row.cat, said('in its categorical colour'));
  }
  // The mark is beside the selection mark, never instead of it: the selected row draws its selection as it would without
  // a category.
  const marked = await selection(page);
  const n = await page.evaluate(() => {
    const row = document.querySelector('.im-sidebar .im-row[aria-selected="true"]');
    const value = row.dataset.imCat;
    delete row.dataset.imCat;
    return value;
  });
  assert.ok(n, where('the selected thread has a category'));
  assert.deepEqual(marked, await selection(page), where('a categorised row is selected as any row is'));
  await page.evaluate((value) => { document.querySelector('.im-sidebar .im-row[aria-selected="true"]').dataset.imCat = value; }, n);

  // The badge: at the row's end, after its meta, in the tone of the row (warn by default), and said in the row's words.
  const badged = page.locator('.im-sidebar .im-row[data-im-badge]');
  assert.equal(await badged.count(), 1, where('one thread waits for the person'));
  const name = /option "([^"]+)"/.exec(await badged.ariaSnapshot())?.[1] ?? '';
  assert.match(name, /needs you/, where(`the badged row says what its badge says (${name})`));
  // In the rail the title is all the row says to the eye: it carries the badge's word too.
  assert.match((await badged.getAttribute('title')) ?? '', /needs you/, where("the badged row's title, the rail's tooltip, says what its badge says"));
  const wide = await badge(page);
  assert.deepEqual([wide.end.content, wide.end.position, wide.end.width, wide.end.height, wide.end.color], ['""', 'static', '8px', '8px', wide.warn], where('the badge is a warn dot at the end of the row'));
  const metaWithout = await badged.evaluate((row) => {
    row.removeAttribute('data-im-badge');
    const right = row.querySelector('.im-row-meta').getBoundingClientRect().right;
    row.setAttribute('data-im-badge', '');
    return right;
  });
  assert.ok(metaWithout - wide.meta > 8, where(`the badge takes the end of the row, after the meta (${metaWithout} without it, ${wide.meta} with it)`));
  await badged.evaluate((row) => row.setAttribute('data-im-tone', 'err'));
  assert.equal((await badge(page)).end.color, wide.err, where("the badge takes the row's tone"));
  await badged.evaluate((row) => row.removeAttribute('data-im-tone'));

  // In the rail: the badge is on the corner of the rail item, and the rail item takes the colour of its category.
  await at(840, 'shinatama');
  const rail = await badge(page);
  assert.deepEqual([rail.end.content, rail.end.position, rail.end.width, rail.end.height, rail.end.color], ['""', 'absolute', '8px', '8px', rail.warn], where('in the rail the badge is a dot on the rail item'));
  assert.ok(Math.abs(rail.corner.right - 3) <= 1 && Math.abs(rail.corner.top - 3) <= 1, where(`at its corner, 3px out (${JSON.stringify(rail.corner)})`));
  assert.equal(rail.end.pointer, 'none', where('a press on the dot reaches the rail item under it'));
  for (const row of await categories(page)) {
    assert.ok(row.item, where(`category ${row.n}: the rail item carries the category`));
    assert.deepEqual([row.item.background, row.item.color], [row.cat, row.on], where(`category ${row.n}: the rail item is filled with it, its text in --im-cat-on`));
  }
}

// A viewer mounts its shell in the root of React (<div id="app">), not in the body. That root carries im-root, and the
// shell fills the window there as it does in the body: the content region is not 0 pixels tall, and a canvas that
// fills it neither.
async function rootFills(page, url) {
  const css = await page.locator('link[rel=stylesheet]').first().evaluate((link) => link.href);
  const frame = await page.evaluate(() => {
    const api = window.__imagoSurfaces;
    return api.shellFrameHtml({
      titlebarHtml: api.titlebarHtml({ brand: { name: 'Viewer' } }), contentHtml: '<div id="canvas" style="block-size: 100%"></div>', contentLabel: 'Graph',
      skipLabel: 'Skip to content', inspectorLabel: 'Details', footerHtml: '<span class="im-footer-text">Ready</span>',
    });
  });
  const fresh = await page.context().newPage();
  try {
    const address = new URL('/root-test/viewer', url).href;
    await fresh.route(address, (route) => route.fulfill({ contentType: 'text/html', body:
      `<!doctype html><html lang="en" data-im-app="daodan" data-im-look="smooth" data-im-theme="light"><head><link rel="stylesheet" href="${css}"></head>`
      + `<body><div id="app" class="im-root"><div class="im-shell" data-im-sidebar="off">${frame}</div></div></body></html>` }));
    await fresh.goto(address);
    for (const [width, height] of [[1160, 720], [700, 480]]) {
      await fresh.setViewportSize({ width, height });
      const sizes = await fresh.evaluate(() => {
        const height = (selector) => document.querySelector(selector).getBoundingClientRect().height;
        return {
          window: innerHeight, html: height('html'), body: height('body'), root: height('#app'), shell: height('.im-shell'),
          content: height('.im-content'), canvas: height('#canvas'), margin: getComputedStyle(document.body).marginTop, scroll: document.documentElement.scrollHeight,
        };
      });
      const said = (text) => `a shell in a root that carries im-root, at ${width}x${height}: ${text} (${JSON.stringify(sizes)})`;
      for (const name of ['html', 'body', 'root', 'shell']) near(sizes[name], sizes.window, said(`${name} is as tall as the window`));
      assert.equal(sizes.margin, '0px', said('the page has no margin of its own'));
      assert.ok(sizes.scroll <= sizes.window, said('the page does not scroll'));
      assert.ok(sizes.content > 200, said('the content region is not 0 pixels tall'));
      assert.ok(sizes.canvas > 200, said('a canvas that fills the content is drawn'));
    }
  } finally {
    await fresh.close();
  }
}

export default async (page, url) => {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      const at = (width, app = 'xiox') => show(page, { app, look, theme, glass: false, width });
      const where = (text) => `${look} ${theme}: ${text}`;

      // The widths of the layout are the tokens': sidebar 232, rail 56, inspector 300 to 360.
      await at(1160);
      const widths = { sidebar: await token(page, '--im-w-sidebar'), rail: await token(page, '--im-w-rail'), inspector: await token(page, '--im-w-inspector') };
      assert.equal(widths.sidebar, 232, where('--im-w-sidebar'));
      assert.equal(widths.rail, 56, where('--im-w-rail'));
      assert.ok(widths.inspector >= 300 && widths.inspector <= 360, where(`--im-w-inspector is ${widths.inspector}`));
      assert.equal(await token(page, '--im-w-inspector-wide'), 360, where('--im-w-inspector-wide, the top of the range'));

      // 1160: the sidebar, the docked inspector and a content of 420 or more, as the tokens say.
      const side = await box(page, '.im-sidebar');
      const content = await box(page, '.im-content');
      const inspector = await box(page, '.im-inspector');
      near(side.width, widths.sidebar, where('sidebar width at 1160'));
      near(inspector.width, widths.inspector, where('inspector width at 1160'));
      assert.ok(inspector.left >= content.right - 0.5, where('inspector is on the right of the content at 1160'));
      assert.ok(content.width >= 420, where(`content width at 1160 is ${content.width}`));
      assert.equal(await visible(page, '.im-sidebar-toggle'), false, where('no sidebar button at 1160'));
      // The whole sidebar has its count in the header and its foot under the list.
      assert.equal(await visible(page, '.im-sidebar > .im-panel-header > .im-count'), true, where('the sidebar counts its rows in its header'));
      assert.equal(await visible(page, '.im-sidebar > .im-panel-foot'), true, where('the sidebar has its foot under its list'));
      assert.ok((await box(page, '.im-sidebar > .im-panel-foot')).top >= (await box(page, '.im-sidebar > .im-list')).bottom - 0.5, where('the foot is under the list'));

      // The breakpoints, pinned on both sides of each edge: 1000/999, 850/849, 620/619.
      await at(1000);
      const docked = await box(page, '.im-content');
      assert.ok(docked.width >= 420, where(`content width at 1000 is ${docked.width}`));
      assert.ok((await box(page, '.im-inspector')).left >= docked.right - 0.5, where('inspector is docked at 1000'));
      await at(999);
      const covered = await box(page, '.im-content');
      const over = await box(page, '.im-inspector');
      assert.ok(over.left > covered.left && over.left < covered.right, where('inspector overlaps the content at 999'));

      await at(850);
      near((await box(page, '.im-sidebar')).width, widths.sidebar, where('sidebar width at 850'));
      await at(849);
      near((await box(page, '.im-sidebar')).width, widths.rail, where('rail width at 849'));

      await at(620);
      near((await box(page, '.im-sidebar')).width, widths.rail, where('rail width at 620'));
      assert.equal(await visible(page, '.im-titlebar .im-tabs'), true, where('title-bar tabs at 620'));
      assert.equal(await visible(page, '.im-views-menu'), false, where('no Views menu at 620'));
      assert.equal(await visible(page, '.im-sidebar-toggle'), false, where('no sidebar button at 620'));
      await at(619);
      assert.equal(await visible(page, '.im-sidebar'), false, where('sidebar hidden at 619'));
      assert.equal(await visible(page, '.im-titlebar .im-tabs'), false, where('title-bar tabs hidden at 619'));
      assert.equal(await visible(page, '.im-views-menu'), true, where('Views menu at 619'));
      assert.equal(await visible(page, '.im-sidebar-toggle'), true, where('sidebar button at 619'));
      // No fractional width falls between two blocks: the ranges are half-open.
      await at(619.5);
      assert.equal(await visible(page, '.im-sidebar'), false, where('sidebar hidden at 619.5'));
      assert.equal(await visible(page, '.im-titlebar .im-tabs'), false, where('title-bar tabs hidden at 619.5'));
      assert.equal(await visible(page, '.im-views-menu'), true, where('Views menu at 619.5'));
      assert.equal(await visible(page, '.im-sidebar-toggle'), true, where('sidebar button at 619.5'));
      await at(849.5);
      near((await box(page, '.im-sidebar')).width, widths.rail, where('rail width at 849.5'));
      await at(999.5);
      const half = await box(page, '.im-content');
      const halfInspector = await box(page, '.im-inspector');
      assert.ok(halfInspector.left > half.left && halfInspector.left < half.right, where('inspector overlaps the content at 999.5'));

      // 990: the inspector covers the content's right edge; the content reaches the work area's right edge.
      await at(990);
      const work = await box(page, '.im-work');
      const cover = await box(page, '.im-content');
      const drawer = await box(page, '.im-inspector');
      assert.ok(drawer.left > cover.left && drawer.left < cover.right, where('inspector overlaps the content at 990'));
      near(cover.right, work.right, where('content reaches the work area at 990'));

      // 840: the sidebar is a 56px rail of icons; each row has a title and a name made of its text.
      await at(840);
      await checkRail(page, where, widths, 'forced rail at 840');
      assert.equal(await visible(page, '.im-sidebar .im-panel-header'), false, where('the forced rail has no header'));
      assert.equal(await visible(page, '.im-views-menu'), false, where('no Views menu at 840'));
      assert.equal(await visible(page, '.im-sidebar-toggle'), false, where('no sidebar button at 840'));
      await checksInRail(page, where, at);
      await categoryAndBadge(page, where, at);
      await checkRailMarks(page, where, at);

      // 610: no sidebar, no tabs in the title bar, the Views menu instead (a menu button that is closed).
      await at(610);
      assert.equal(await visible(page, '.im-sidebar'), false, where('sidebar hidden at 610'));
      assert.equal(await visible(page, '.im-titlebar .im-tabs'), false, where('title-bar tabs hidden at 610'));
      assert.equal(await visible(page, '.im-views-menu'), true, where('Views menu shown at 610'));
      assert.equal(await page.locator('.im-views-menu').getAttribute('aria-haspopup'), 'menu', where('Views menu announces a menu'));
      assert.equal(await page.locator('.im-views-menu').getAttribute('aria-expanded'), 'false', where('Views menu is closed at rest'));

      // 610: the sidebar's objects stay reachable. A title-bar button, named after the sidebar and a tab stop right
      // after the brand, opens it over the content; the keyboard and the pointer close it again.
      const toggle = page.locator('.im-sidebar-toggle');
      const sidebarName = await page.locator('.im-sidebar').getAttribute('aria-label');
      const sidebarId = await page.locator('.im-sidebar').getAttribute('id');
      assert.equal(await visible(page, '.im-sidebar-toggle'), true, where('sidebar button at 610'));
      assert.equal(await toggle.getAttribute('aria-label'), sidebarName, where('the sidebar button is named after the sidebar'));
      assert.equal(await toggle.getAttribute('title'), sidebarName, where('the sidebar button has the same title'));
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false', where('the sidebar button is closed at rest'));
      assert.ok(sidebarId && (await toggle.getAttribute('aria-controls')) === sidebarId, where('the sidebar button controls the sidebar'));
      const focused = () => page.evaluate(() => {
        const el = document.activeElement;
        return { toggle: !!el?.classList.contains('im-sidebar-toggle'), inSidebar: !!el?.closest('.im-sidebar'), role: el?.getAttribute('role') ?? null };
      });
      const closed = async (label) => {
        assert.equal(await visible(page, '.im-sidebar'), false, where(`sidebar hidden ${label}`));
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false', where(`sidebar button closed ${label}`));
        assert.equal(await page.locator('.im-shell').getAttribute('data-im-sidebar-open'), null, where(`shell not open ${label}`));
      };
      const contentBefore = await box(page, '.im-content');
      await page.focus('#g-width'); // the last control before the window, in the page's order
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('im-shell-skip-link')), true, where('Tab from the page reaches the skip link first'));
      await page.keyboard.press('Tab');
      assert.equal((await focused()).toggle, true, where('then the sidebar button, the first control of the title bar'));
      await page.keyboard.press('Enter');
      assert.equal(await visible(page, '.im-sidebar'), true, where('Enter opens the sidebar'));
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true', where('the button says it is open'));
      const now = await focused();
      assert.ok(now.inSidebar && now.role === 'option', where('focus is on a row of the sidebar'));
      const drawn = await box(page, '.im-sidebar');
      const shellBox = await box(page, '.im-shell');
      const barBox = await box(page, '.im-titlebar');
      near(drawn.left, shellBox.left, where('the sidebar starts at the left edge'));
      near(drawn.top, barBox.bottom, where('the sidebar starts under the title bar'));
      near(drawn.width, widths.sidebar, where('the sidebar is --im-w-sidebar wide'));
      const contentOpen = await box(page, '.im-content');
      near(contentOpen.left, contentBefore.left, where('the content does not move when the sidebar opens'));
      near(contentOpen.width, contentBefore.width, where('the content does not shrink when the sidebar opens'));
      const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.im-sidebar'), { x: drawn.left + drawn.width / 2, y: drawn.top + drawn.height / 2 });
      assert.equal(onTop, true, where('the sidebar is above the content'));
      await page.keyboard.press('Escape');
      await closed('after Escape');
      assert.equal((await focused()).toggle, true, where('Escape gives focus back to the button'));

      await toggle.click();
      assert.equal(await visible(page, '.im-sidebar'), true, where('a click opens the sidebar'));
      await toggle.click();
      await closed('after a second click');
      assert.equal((await focused()).toggle, true, where('a second click leaves focus on the button'));

      await toggle.click();
      const status = await box(page, '.im-status');
      await page.mouse.click(status.right - 24, status.top + status.height / 2); // empty space of the status row
      await closed('after a press outside');
      await page.waitForFunction(() => document.activeElement?.classList.contains('im-sidebar-toggle'));

      // Leaving the sidebar by keyboard closes it, and the focus stays where it went.
      await toggle.click();
      const inContent = () => page.evaluate(() => !!document.activeElement?.closest('.im-work'));
      for (let tabs = 0; tabs < 12 && !(await inContent()); tabs++) await page.keyboard.press('Tab');
      assert.equal(await inContent(), true, where('Tab leaves the sidebar for the content'));
      await closed('after Tab into the content');
      assert.equal((await focused()).toggle, false, where('the focus is not pulled back to the button'));

      // With the focus in the content, a press on the button opens it again; Escape closes it from anywhere,
      // here with the focus on the page because the press landed on the sidebar's own chrome.
      await toggle.click();
      assert.equal(await visible(page, '.im-sidebar'), true, where('the button reopens the sidebar'));
      await page.locator('.im-sidebar .im-panel-title').click();
      assert.equal(await visible(page, '.im-sidebar'), true, where('a press inside the sidebar keeps it open'));
      assert.equal(await page.evaluate(() => document.activeElement === document.body), true, where('the focus is on the page'));
      await page.keyboard.press('Escape');
      await closed('after Escape with the focus on the page');
      assert.equal((await focused()).toggle, true, where('Escape from the page gives focus to the button'));

      // A floating layer (a menu opened from the sidebar) is not outside it: neither a press nor its focus closes it.
      await toggle.click();
      await page.evaluate(() => {
        const layer = document.createElement('div');
        layer.dataset.imLayer = 'menu';
        layer.id = 'test-layer';
        layer.style.cssText = 'position:absolute;z-index:9;right:8px;top:90px;width:120px;height:40px';
        layer.innerHTML = '<button type="button" id="test-layer-item">Item</button>';
        document.querySelector('.im-shell').append(layer);
      });
      await page.click('#test-layer-item');
      assert.equal(await visible(page, '.im-sidebar'), true, where('a press in a floating layer keeps the sidebar open'));
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'test-layer-item', where('the layer keeps the focus'));
      await page.evaluate(() => document.getElementById('test-layer').remove());
      await page.keyboard.press('Escape');
      await closed('after the layer is gone and Escape');

      await toggle.click();
      await at(700); // 620 or more: the sidebar is a rail again and the open state is gone
      await page.waitForFunction(() => !document.querySelector('.im-shell').hasAttribute('data-im-sidebar-open'));
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false', where('widening clears the open state'));

      // A width change never leaves the focus on what it hides: the sidebar when narrowing, the button when widening.
      await page.focus('.im-sidebar [role="option"][tabindex="0"]');
      await at(610);
      await page.waitForFunction(() => document.activeElement?.classList.contains('im-sidebar-toggle'));
      await at(700);
      await page.waitForFunction(() => !!document.activeElement?.closest('.im-sidebar') && document.activeElement.getAttribute('tabindex') === '0');
      await at(610);

      // A narrowing the observer has not delivered yet must not take the focus from a drawer opened in the meantime:
      // the width changes and the button is pressed in one task, so no frame, and no observer callback, comes between.
      await at(1160);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); // the observer has seen the wide shell
      const raced = await page.evaluate(async () => {
        window.__imago.set({ width: 610 });
        document.querySelector('.im-sidebar-toggle').click(); // what Enter on the focused button does
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))); // the observer now delivers the narrowing
        const el = document.activeElement;
        return { row: !!el?.closest('.im-sidebar') && el.getAttribute('role') === 'option', open: document.querySelector('.im-shell').dataset.imSidebarOpen };
      });
      assert.deepEqual(raced, { row: true, open: 'true' }, where('a late narrowing does not take the focus from the open drawer'));
      await page.keyboard.press('Escape');

      // From 850 up the user folds the sidebar into the rail with the button in its header, and unfolds it.
      await at(1160);
      const fold = page.locator('.im-sidebar-collapse');
      assert.equal(await visible(page, '.im-sidebar-collapse'), true, where('the fold button at 1160'));
      assert.equal(await fold.getAttribute('aria-expanded'), 'true', where('the sidebar is unfolded at rest'));
      const foldName = await fold.getAttribute('aria-label');
      assert.ok(foldName && (await fold.getAttribute('title')) === foldName, where('the fold button has a name and the same title'));
      near((await box(page, '.im-sidebar')).width, widths.sidebar, where('unfolded sidebar width'));
      const unfolded = await box(page, '.im-content');
      await addSidebarParts(page); // shown while unfolded, so that their absence in the rail means something
      assert.equal(await visible(page, '[data-test="tools"]'), true, where('a tools row shows in the unfolded sidebar'));
      assert.equal(await visible(page, '[data-test="foot"]'), true, where('a foot shows in the unfolded sidebar'));
      await removeSidebarParts(page);
      await fold.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('.im-shell').getAttribute('data-im-sidebar-collapsed'), 'true', where('the shell says it is folded'));
      assert.equal(await fold.getAttribute('aria-expanded'), 'false', where('the button says it is folded'));
      const unfoldName = await fold.getAttribute('aria-label');
      assert.ok(unfoldName && unfoldName !== foldName, where('the button is renamed when folded'));
      assert.equal(await fold.getAttribute('title'), unfoldName, where('the title follows the name when folded'));
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('im-sidebar-collapse')), true, where('focus stays on the fold button'));
      assert.equal(await visible(page, '.im-sidebar .im-panel-title'), false, where('only the button is left of the header'));
      assert.ok((await box(page, '.im-content')).width > unfolded.width, where('the content takes the room'));
      await checkRail(page, where, widths, 'folded');
      // the header keeps the button when it sits in a group
      await page.evaluate(() => {
        const button = document.querySelector('.im-sidebar-collapse');
        const group = document.createElement('span');
        group.id = 'test-group';
        button.replaceWith(group);
        group.append(button);
      });
      assert.equal(await visible(page, '.im-sidebar-collapse'), true, where('a folded header keeps a group that holds the button'));
      await page.evaluate(() => document.getElementById('test-group').replaceWith(...document.getElementById('test-group').childNodes));
      // The choice outlives a redraw (and rows without an icon show their initials); below 850 the rail is forced and
      // the button is gone; below 620 the drawer is the whole sidebar.
      await show(page, { app: 'mukade', look, theme, glass: false, width: 1160 });
      await checkRail(page, where, widths, 'folded after a redraw, Mukade');
      assert.equal(await page.locator('.im-sidebar [role="option"]').nth(0).locator('.im-avatar').innerText(), 'H', where('a row without an icon shows its initials'));
      assert.equal(await page.locator('.im-sidebar [role="option"]').nth(2).locator('svg').count(), 1, where('a row with an icon shows it (the closed room keeps its lock)'));
      await at(840, 'mukade');
      assert.equal(await visible(page, '.im-sidebar-collapse'), false, where('no fold button at 840'));
      await at(610, 'mukade');
      assert.equal(await visible(page, '.im-sidebar-collapse'), false, where('no fold button at 610'));
      await page.locator('.im-sidebar-toggle').click();
      near((await box(page, '.im-sidebar')).width, widths.sidebar, where('the drawer shows the whole sidebar although it is folded'));
      assert.equal(await visible(page, '.im-sidebar .im-panel-title'), true, where('the drawer has its title'));
      assert.equal(await visible(page, '.im-sidebar .im-row-sub'), true, where('the drawer shows the rows whole'));
      await page.keyboard.press('Escape');
      await at(1160, 'mukade');
      await page.locator('.im-sidebar-collapse').click();
      near((await box(page, '.im-sidebar')).width, widths.sidebar, where('unfolded again'));
      assert.equal(await page.locator('.im-shell').getAttribute('data-im-sidebar-collapsed'), null, where('the shell is not folded'));
      assert.equal(await page.locator('.im-sidebar-collapse').getAttribute('aria-label'), foldName, where('the button has its first name back'));
      assert.equal(await page.locator('.im-sidebar-collapse').getAttribute('title'), foldName, where('and its first title'));

      // Narrowing under 850 takes the fold button away with the header: focus moves to the sidebar's tab stop, or to the
      // drawer's button when the sidebar is off screen.
      await page.focus('.im-sidebar-collapse');
      await at(800, 'mukade');
      await page.waitForFunction(() => !!document.activeElement?.closest('.im-sidebar') && document.activeElement.getAttribute('tabindex') === '0', null, { timeout: 5000 });
      await at(1160, 'mukade');
      await page.focus('.im-sidebar-collapse');
      await at(610, 'mukade');
      await page.waitForFunction(() => document.activeElement?.classList.contains('im-sidebar-toggle'), null, { timeout: 5000 });
      await at(1160, 'mukade');

      // The cleanup that sidebarCollapse returns takes its listener away.
      const cleaned = await page.evaluate(() => {
        const clone = document.querySelector('.im-shell').cloneNode(true);
        clone.removeAttribute('data-im-sidebar-collapsed');
        document.querySelector('#g-sections').append(clone);
        const button = clone.querySelector('.im-sidebar-collapse');
        const stop = window.__imagoSidebar.sidebarCollapse(clone);
        button.click();
        const folded = clone.dataset.imSidebarCollapsed === 'true';
        stop();
        button.click();
        const stillFolded = clone.dataset.imSidebarCollapsed === 'true';
        clone.remove();
        return { folded, stillFolded };
      });
      assert.deepEqual(cleaned, { folded: true, stillFolded: true }, where('after its cleanup the fold button does nothing'));

      // The fold alone, on a copy of the shell that has no drawer wired (so nothing else moves the focus): when the
      // width takes the button away, focus goes to the sidebar's tab stop, and to the drawer's button under 620.
      const moved = await page.evaluate(async () => {
        const root = document.createElement('div');
        Object.assign(root.dataset, document.querySelector('#g-window').dataset);
        root.style.cssText = 'width:1000px;height:640px;position:relative';
        const clone = document.querySelector('.im-shell').cloneNode(true);
        clone.removeAttribute('data-im-sidebar-collapsed');
        root.append(clone);
        document.querySelector('#g-sections').append(root);
        const stop = window.__imagoSidebar.sidebarCollapse(clone);
        const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        await frames();
        const result = {};
        clone.querySelector('.im-sidebar-collapse').focus();
        root.style.width = '800px';
        await frames();
        result.stop = clone.contains(document.activeElement) && !!document.activeElement.closest('.im-sidebar') && document.activeElement.getAttribute('tabindex') === '0';
        root.style.width = '1000px';
        await frames();
        clone.querySelector('.im-sidebar-collapse').focus();
        root.style.width = '610px';
        await frames();
        result.toggle = document.activeElement === clone.querySelector('.im-sidebar-toggle');
        stop();
        root.remove();
        return result;
      });
      assert.deepEqual(moved, { stop: true, toggle: true }, where('the fold alone moves focus off its button when the width takes it away'));

      // Without a roving tab stop (and with the fold button off screen) the drawer puts focus on the sidebar itself.
      await at(610, 'mukade');
      await page.evaluate(() => document.querySelectorAll('.im-sidebar [tabindex]').forEach((el) => el.removeAttribute('tabindex')));
      await page.locator('.im-sidebar-toggle').click();
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('im-sidebar')), true, where('with no tab stop in it, focus goes to the sidebar, not to a hidden button'));
      await page.keyboard.press('Escape');

      // Muro has no sidebar and no button for it, at any width.
      for (const width of [1160, 990, 840, 610, 500]) {
        await at(width, 'muro');
        assert.equal(await page.locator('.im-shell').getAttribute('data-im-sidebar'), 'off');
        assert.equal(await visible(page, '.im-sidebar'), false, where(`Muro has no sidebar at ${width}`));
        assert.equal(await page.locator('.im-sidebar-toggle').count(), 0, where(`Muro has no sidebar button at ${width}`));
        assert.equal(await page.locator('.im-sidebar-collapse').count(), 0, where(`Muro has no fold button at ${width}`));
        const offset = (await box(page, '.im-content')).left - (await box(page, '.im-work')).left;
        assert.ok(offset >= 0 && offset <= 2.5, where(`Muro's content starts at its work area at ${width} (offset ${offset})`));
      }
      // A shell without a sidebar is never in the rail, whatever attribute is left on it.
      await at(1160, 'muro');
      await page.evaluate(() => { document.querySelector('.im-shell').dataset.imSidebarCollapsed = 'true'; });
      assert.ok((await box(page, '.im-work')).width > (await box(page, '.im-shell')).width - 30, where('Muro with a stale fold attribute keeps its whole width'));
      await page.evaluate(() => { delete document.querySelector('.im-shell').dataset.imSidebarCollapsed; });

      if (look === 'smooth') {
        await at(610, 'muro');
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.im-work')).marginInlineStart), '0px', where('Muro below 620: the sheet has no margin'));
        near((await box(page, '.im-work')).left, (await box(page, '.im-shell')).left, where('Muro below 620: the sheet starts at the window edge'));
      }

      // The title bar names the product, at every width, for every app.
      for (const app of APPS) {
        for (const width of [1160, 840, 610, 500]) {
          await at(width, app);
          assert.equal(await visible(page, '.im-titlebar .im-mark'), true, where(`${app} mark at ${width}`));
          assert.equal(await visible(page, '.im-titlebar .im-wordmark'), true, where(`${app} name at ${width}`));
          assert.equal((await page.locator('.im-titlebar .im-wordmark').innerText()).trim().toLowerCase(), NAMES[app].toLowerCase(), where(`${app} name text at ${width}`));
          assert.ok((await box(page, '.im-titlebar .im-wordmark')).right <= (await box(page, '.im-titlebar')).right, where(`${app} name is inside the title bar at ${width}`));
          if (width === 1160) assert.deepEqual(await stale(page), [], where(`${app}: no element of the gallery carries a removed class`));
        }
        // The mark is the initial of the name in capitals, a letter and no drawing; the square is centred on the title bar
        // and on the name's box, and the letter's own box is centred in the square.
        await at(1160, app);
        const g = await markGeometry(page);
        const says = (text) => where(`${app}: ${text}`);
        assert.deepEqual([g.text, g.children], [NAMES[app][0].toUpperCase(), 0], says('the mark holds the initial, and no element'));
        near(g.mark.width, 22, says('the square is 22 wide'));
        near(g.mark.height, 22, says('and 22 high'));
        const within = (a, b, label) => assert.ok(Math.abs(a - b) <= 1, says(`${label}: ${a.toFixed(2)} and ${b.toFixed(2)} are more than a pixel apart`));
        within(centre(g.mark).y, centre(g.bar).y, 'the square is centred on the title bar');
        within(centre(g.mark).y, centre(g.word).y, "the square is level with the name's box");
        within(centre(g.letter).x, centre(g.mark).x, "the letter's box is centred across the square");
      }

      // The title bar and the footer take the measures of the look.
      await at(1160);
      const index = LOOKS.indexOf(look);
      near((await box(page, '.im-titlebar')).height, MEASURES.titlebar[index], where('title bar height'));
      near((await box(page, '.im-footer')).height, MEASURES.footer[index], where('footer height'));
      near(await token(page, '--im-h-titlebar'), MEASURES.titlebar[index], where('--im-h-titlebar'));
      near(await token(page, '--im-h-footer'), MEASURES.footer[index], where('--im-h-footer'));

      // Smooth: the work area is one sheet with a 10px top-left corner; the sidebar and the title bar paint nothing.
      if (look === 'smooth') {
        const paint = (selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, selector);
        assert.equal(await paint('.im-titlebar'), 'rgba(0, 0, 0, 0)', where('the title bar paints nothing'));
        assert.equal(await paint('.im-sidebar'), 'rgba(0, 0, 0, 0)', where('the sidebar paints nothing'));
        assert.notEqual(await paint('.im-work'), 'rgba(0, 0, 0, 0)', where('the work area is one sheet'));
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.im-work')).borderTopLeftRadius), '10px', where('sheet corner'));
      }

      // One frame: the fixtures of the apps that had their own, and the frame the package writes.
      await canonicalFixtures(page, look, theme);
      if (theme === 'dark') {
        await show(page, { app: 'shinatama', look, theme, glass: false, width: 1160 });
        await builtFrame(page, look);
      }
    }
  }

  await rootFills(page, url);

  // 200% page zoom. The window's minimum is 500 physical pixels, which at 200% is a shell of 250 CSS px; a window half-snapped on a
  // 1366px screen is 683 physical px, 341 CSS px at 200%. The page is laid out in CSS px whatever the zoom, so the shell is
  // given those widths. Nothing may be pushed outside it: not sideways (scrollWidth), not the primary action, and not the
  // three window buttons, which the shell clips: lost, the person could not close the window by its own buttons.
  const context = await page.context().browser().newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2 });
  try {
    const zoomed = await context.newPage();
    await zoomed.goto(url);
    await zoomed.waitForFunction(() => Boolean(window.__imago?.ready));
    for (const look of LOOKS) {
      for (const app of APPS) {
        for (const width of [250, 300, 340, 400, 450, 500]) {
          await show(zoomed, { app, look, theme: 'dark', glass: false, width });
          const fits = await zoomed.evaluate(() => {
            const el = document.querySelector('.im-shell');
            const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
            return {
              shellWidth: el.getBoundingClientRect().width,
              scroll: el.scrollWidth,
              client: el.clientWidth,
              shell: rect(el),
              primary: rect(document.querySelector('.im-actions .im-btn--primary')),
              views: rect(document.querySelector('.im-views-menu')),
              toggle: document.querySelector('.im-sidebar-toggle') ? rect(document.querySelector('.im-sidebar-toggle')) : null,
              windowButtons: [...document.querySelectorAll('.im-window-button')].map((button) => ({ name: button.dataset.imWindow, ...rect(button) })),
            };
          });
          const label = `${look} ${app} at ${width}, zoom 2`;
          const inside = (box) => box.left >= fits.shell.left - 0.5 && box.right <= fits.shell.right + 0.5 && box.top >= fits.shell.top - 0.5 && box.bottom <= fits.shell.bottom + 0.5;
          assert.equal(fits.shellWidth, width, `${label}: the shell is ${fits.shellWidth}px wide`);
          assert.ok(fits.scroll <= fits.client, `${label}: scrollWidth ${fits.scroll} > clientWidth ${fits.client}`);
          assert.ok(inside(fits.primary), `${label}: the primary button is outside the shell (${JSON.stringify(fits.primary)} in ${JSON.stringify(fits.shell)})`);
          assert.deepEqual(fits.windowButtons.map((button) => button.name), ['minimize', 'maximize', 'close'], `${label}: the three window buttons`);
          for (const button of fits.windowButtons) {
            assert.ok(inside(button), `${label}: the ${button.name} button is outside the shell (${button.left}..${button.right} in ${fits.shell.left}..${fits.shell.right})`);
            assert.ok(button.width >= 44 - 0.5, `${label}: the ${button.name} button is only ${button.width}px wide`);
          }
          // What the person needs below 620 is still there and clear of the window buttons: the Views menu (the tabs are gone)
          // and, in an app with a sidebar, the button that opens it.
          const firstWindowButton = fits.windowButtons[0];
          for (const [name, box] of [['Views menu', fits.views], ['sidebar button', fits.toggle]]) {
            if (!box) continue;
            assert.ok(inside(box) && box.right <= firstWindowButton.left + 0.5, `${label}: the ${name} is outside the shell or under the window buttons (${box.left}..${box.right}, window buttons from ${firstWindowButton.left})`);
            assert.ok(box.width >= 24, `${label}: the ${name} is only ${box.width}px wide`);
          }
          assert.equal(fits.toggle !== null, app !== 'muro', `${label}: the sidebar button is there exactly when the app has a sidebar`);
          // Under 340 the brand goes, the mark with the name; from 340 the mark is there.
          if (width < 340) assert.equal(await visible(zoomed, '.im-titlebar .im-brand'), false, `${label}: the brand is gone`);
          assert.equal(await visible(zoomed, '.im-titlebar .im-mark'), width >= 340, `${label}: the mark is ${width >= 340 ? 'shown' : 'gone'}`);
        }
      }
    }
  } finally {
    await context.close();
  }

  // The mark seen as the eye sees it, at four device pixels per CSS pixel: the letter's ink is centred in the square, and
  // the square is level with the ink of the name's capitals, within a pixel, in both looks, both themes and the five apps.
  const SCALE = 4;
  const fine = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: SCALE });
  try {
    const sharp = await fine.newPage();
    await sharp.goto(url);
    await sharp.waitForFunction(() => Boolean(window.__imago?.ready));
    await sharp.evaluate(() => document.fonts.ready);
    for (const look of LOOKS) {
      for (const theme of THEMES) {
        for (const app of APPS) {
          await show(sharp, { app, look, theme, glass: false, width: 1160 });
          const g = await markGeometry(sharp);
          const { letter, capital } = await markInk(sharp, g, SCALE);
          const label = (text) => `${look} ${theme} ${app}: ${text}`;          const within = (a, b, text) => assert.ok(Math.abs(a - b) <= 1, label(`${text}: ${a.toFixed(2)} and ${b.toFixed(2)} are more than a pixel apart`));
          assert.ok(letter.bottom - letter.top >= 6 && capital.bottom - capital.top >= 6, label(`the letter and the capital are drawn (${JSON.stringify({ letter, capital })})`));
          within(centre(letter).y, centre(g.mark).y, "the letter's ink is centred down the square");
          within(centre(letter).x, centre(g.mark).x, "the letter's ink is centred across the square");
          within(centre(capital).y, centre(g.mark).y, "the square is level with the name's capitals");
        }
      }
    }

    // An engine without text-box (WebView2 before 133) skips the @supports block that draws the mark and the name by
    // their capitals. Taken out of the page, the base rules still centre the letter in the square, within a pixel and a
    // half, in both looks.
    const removed = await sharp.evaluate(() => {
      let count = 0;
      const walk = (list, owner) => {
        for (let k = list.length - 1; k >= 0; k--) {
          const rule = list[k];
          if (rule instanceof CSSSupportsRule && rule.conditionText.includes('text-box')) {
            owner.deleteRule(k);
            count++;
          } else if (rule.cssRules) walk(rule.cssRules, rule);
        }
      };
      for (const sheet of document.styleSheets) walk(sheet.cssRules, sheet);
      return count;
    });
    assert.ok(removed >= 1, `the mark and the name are drawn by their capitals inside @supports (text-box: …): ${removed} such block found`);
    for (const look of LOOKS) {
      for (const theme of THEMES) {
        for (const app of APPS) {
          await show(sharp, { app, look, theme, glass: false, width: 1160 });
          const base = await sharp.evaluate(() => {
            const style = (selector) => getComputedStyle(document.querySelector(`#g-window .im-titlebar ${selector}`));
            return { mark: style('.im-mark').textBoxTrim, word: style('.im-wordmark').textBoxTrim, display: style('.im-mark').display, padding: style('.im-wordmark').paddingTop };
          });
          const label = (text) => `without text-box, ${look} ${theme} ${app}: ${text}`;
          assert.deepEqual(base, { mark: 'none', word: 'none', display: 'grid', padding: '0px' }, label('the base rules draw the mark and the name'));
          const g = await markGeometry(sharp);
          const { letter } = await markInk(sharp, g, SCALE);
          for (const axis of ['y', 'x']) {
            const off = centre(letter)[axis] - centre(g.mark)[axis];            assert.ok(Math.abs(off) <= 1.5, label(`the letter's ink is ${off.toFixed(2)}px off the square's centre (${axis})`));
          }
          assert.ok(Math.abs(centre(g.mark).y - centre(g.bar).y) <= 1, label('the square is centred on the title bar'));
        }
      }
    }
  } finally {
    await fine.close();
  }
};
