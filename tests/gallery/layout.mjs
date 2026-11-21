// The seven-region shell: its measures, its three breakpoints and its minimum width, in both looks and both themes.
import assert from 'node:assert/strict';

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

// The frames 0.1.2 to 0.1.4 added beside im-shell, and their parts (docs/superpowers/moving-from-0.1.4.md): none is drawn.
const REMOVED = [
  'im-app-layout', 'im-main', 'im-desktop-frame', 'im-desktop-content', 'im-page', 'im-skip-link', 'im-page-frame', 'im-page-view',
  'im-workbench', 'im-work-column', 'im-work-area', 'im-workspace-area', 'im-navigation-panel', 'im-resizable-nav', 'im-nav-rail',
  'im-nav-entry', 'im-nav-line', 'im-nav-mark', 'im-nav-detail', 'im-signal', 'im-docked-inspector', 'im-inspection-rail',
  'im-detail-panel', 'im-document', 'im-toolbar', 'im-panel-strip', 'im-master-detail',
];
/** Every element of the gallery page that carries a removed class or data-im-badge. */
const stale = (page) => page.evaluate((names) => [...document.querySelectorAll('[class], [data-im-badge]')]
  .flatMap((el) => [...el.classList].filter((name) => names.includes(name)).concat(el.hasAttribute('data-im-badge') ? ['data-im-badge'] : [])), REMOVED);

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
    contentHtml: api.pageContentHtml('<h1>Page title</h1><h2>Section</h2><h3>Group</h3><p>Body text</p><ul><li>Item</li></ul>'),
    contentLabel: 'First', contentId: 'frame-main', skipLabel: 'Skip to content', inspectorLabel: 'Details',
    actionsHtml: options.bare ? undefined : '<button type="button" class="im-btn"><span>Check</span></button><button type="button" class="im-btn im-btn--primary"><span>Apply</span></button>',
    footerHtml: options.bare ? undefined : '<span class="im-dot" data-im-tone="ok"></span><span class="im-footer-text">State</span><span class="im-spacer"></span><span class="im-footer-keys"><span><kbd class="im-key">F6</kbd>next region</span></span>',
  }));
  const inspector = shell.querySelector('.im-inspector');
  inspector.innerHTML = '<header class="im-panel-header"><h4 class="im-panel-title">Details</h4></header><div class="im-panel-body">Facts</div>';
  inspector.hidden = false;
}, { width, options });

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
    }
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
// icon or the initials for every row, the row's text kept for the accessible name (the name is longer than the title
// tooltip, which is what a name falls back to when the text is gone), the selection told by weight or ring as well as by
// fill, and neither tools nor foot.
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
    assert.ok(name.startsWith(title) && name.length > title.length, where(`${label}: row ${i} is named by its text, not only by its title (${name})`));
    const item = row.locator('.im-rail-item');
    assert.equal(await item.isVisible(), true, where(`${label}: row ${i} shows its rail item`));
    if (await item.locator('svg').count()) assert.equal(await item.locator('svg').isVisible(), true, where(`${label}: row ${i} shows its icon`));
    else assert.ok(((await item.innerText()) ?? '').trim(), where(`${label}: row ${i} shows its initials`));
  }
  const looks = await page.evaluate(() =>
    [...document.querySelectorAll('.im-sidebar [role="option"]')].map((row) => {
      const item = row.querySelector('.im-rail-item');
      const style = getComputedStyle(item);
      const svg = item.querySelector('svg');
      return { on: row.getAttribute('aria-selected') === 'true', icon: !!svg, stroke: svg ? parseFloat(getComputedStyle(svg).strokeWidth) : 0, ring: style.borderTopColor, box: item.getBoundingClientRect().width };
    }));
  for (const icon of [true, false]) {
    const on = looks.filter((l) => l.on && l.icon === icon);
    const off = looks.filter((l) => !l.on && l.icon === icon);
    if (!on.length || !off.length) continue;
    if (icon) assert.ok(Math.min(...on.map((l) => l.stroke)) > Math.max(...off.map((l) => l.stroke)), where(`${label}: the selected icon is drawn heavier`));
    else assert.ok(on.every((l) => off.every((o) => o.ring !== l.ring)), where(`${label}: the selected avatar has a ring`));
  }
  assert.ok(looks.filter((l) => l.icon).every((l) => l.box === 20), where(`${label}: an icon sits in the rail's 20px box`));
  const rail = await box(page, '.im-sidebar');
  const centres = await page.evaluate(() => [...document.querySelectorAll('.im-sidebar .im-rail-item')].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect()).map((r) => r.left + r.width / 2));
  assert.ok(centres.length >= 3 && centres.every((x) => Math.abs(x - (rail.left + rail.width / 2)) <= 1.5), where(`${label}: the rail items are centred in the rail`));
  // a tools row and a foot in the sidebar are not for a rail
  await addSidebarParts(page);
  assert.equal(await visible(page, '[data-test="tools"]'), false, where(`${label}: no tools row`));
  assert.equal(await visible(page, '[data-test="foot"]'), false, where(`${label}: no foot`));
  await removeSidebarParts(page);
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

      // 1160: the sidebar, the docked inspector and a content of 420 or more, as the tokens say.
      const side = await box(page, '.im-sidebar');
      const content = await box(page, '.im-content');
      const inspector = await box(page, '.im-inspector');
      near(side.width, widths.sidebar, where('sidebar width at 1160'));
      near(inspector.width, widths.inspector, where('inspector width at 1160'));
      assert.ok(inspector.left >= content.right - 0.5, where('inspector is on the right of the content at 1160'));
      assert.ok(content.width >= 420, where(`content width at 1160 is ${content.width}`));
      assert.equal(await visible(page, '.im-sidebar-toggle'), false, where('no sidebar button at 1160'));

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
        }
      }
    }
  } finally {
    await context.close();
  }
};
