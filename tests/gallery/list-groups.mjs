// Hierarchical lists: the head of a group (im-list-group) is a label and not a row, and the actions at the end of a row
// (im-row-actions) appear when the row is used. The gallery's row "Groups, row actions and categories" draws a sidebar with
// its groups at 900 (the full sidebar) and 700 (the rail), under both looks, both themes and the five apps. Measured: the head's
// type and its space, its text where a row's starts, its count, its fold (a button with aria-expanded, or a label with none);
// the actions of a row, which are hidden at rest and shown on hover, on focus and when the row is selected, with the row
// never changing size, reachable from the keyboard with Tab; the text of the head and the icons of the actions at 4.5:1 on the
// fills of rest, hover and selected; the category on the row and on its rail item; and the rail, which shows the head's icon
// and nothing else, hides a head without an icon, and hides the actions.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const APPS = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];

// Everything the layout checks read, measured in the page for one of the two sidebars.
function measure({ width }) {
  const host = document.querySelector(`[data-g-list-groups="${width}"]`);
  if (!host) throw new Error(`the row has no sidebar of ${width}`);
  const probe = document.createElement('span');
  host.append(probe);
  const px = (property, value) => {
    probe.style.cssText = `${property}: ${value}`;
    return parseFloat(getComputedStyle(probe)[property]);
  };
  const tokens = { meta: px('font-size', 'var(--im-fs-meta)'), s1: px('padding-top', 'var(--im-s-1)'), s3: px('padding-top', 'var(--im-s-3)'), rowSmall: px('padding-top', 'var(--im-h-control-sm)') };
  const head = getComputedStyle(probe);
  probe.style.cssText = 'font-size: var(--im-fs-meta); font-family: var(--im-font-head); text-transform: var(--im-case); letter-spacing: var(--im-track)';
  const look = { family: head.fontFamily, transform: head.textTransform, tracking: head.letterSpacing };
  probe.remove();
  const box = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height, display: s.display, visibility: s.visibility };
  };
  const groups = [...host.querySelectorAll('.im-list-group')].map((el) => {
    const s = getComputedStyle(el);
    const first = el.firstElementChild;
    const label = el.querySelector(':scope > span:not(.im-count)');
    return {
      tag: el.localName, role: el.getAttribute('role'), expanded: el.getAttribute('aria-expanded'), title: el.getAttribute('title'), text: label.textContent,
      count: el.querySelector(':scope > .im-count')?.textContent ?? null, hasIcon: first.matches('.im-icon'),
      box: box(el), firstChild: box(first), label: box(label), countBox: el.querySelector(':scope > .im-count') ? box(el.querySelector(':scope > .im-count')) : null,
      type: { size: parseFloat(s.fontSize), family: s.fontFamily, transform: s.textTransform, tracking: s.letterSpacing, weight: s.fontWeight },
      margin: [parseFloat(s.marginTop), parseFloat(s.marginBottom)], scrollsX: el.scrollWidth - el.clientWidth,
    };
  });
  const rows = [...host.querySelectorAll('.im-row')].map((el) => ({
    state: el.dataset.gState, cat: el.dataset.gCat, rowCat: el.getAttribute('data-im-cat'), railCat: el.querySelector('.im-rail-item')?.getAttribute('data-im-cat') ?? null,
    box: box(el), titleLeft: box(el.querySelector('.im-row-title')).left,
    railItem: box(el.querySelector('.im-rail-item')), railFill: getComputedStyle(el.querySelector('.im-rail-item')).backgroundColor,
    actions: box(el.querySelector('.im-row-actions')),
    buttons: [...el.querySelectorAll('.im-row-actions > .im-icon-btn')].map((b) => ({ label: b.getAttribute('aria-label'), title: b.getAttribute('title'), ...box(b) })),
    inGroup: el.parentElement.getAttribute('role'),
  }));
  const sidebar = host.querySelector('.im-sidebar');
  const list = host.querySelector('.im-list');
  return { tokens, look, groups, rows, sidebarWidth: sidebar.getBoundingClientRect().width, listScrollsX: list.scrollWidth - list.clientWidth, groupIdsResolve: [...host.querySelectorAll('[role="group"]')].every((g) => host.querySelector(`#${g.getAttribute('aria-labelledby')}.im-list-group`)) };
}

// The colours the eye sees: text and icons of the head and of the actions, each on the fill under it, in each forced state.
function contrast({ width }) {
  const host = document.querySelector(`[data-g-list-groups="${width}"]`);
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
  const under = (el) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') layers.unshift(s.backgroundColor);
    }
    return layers;
  };
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = ([r, gr, b]) => 0.2126 * channel(r) + 0.7152 * channel(gr) + 0.0722 * channel(b);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const read = (el, colour) => {
    const layers = under(el);
    return ratio(flatten([...layers, colour ?? getComputedStyle(el).color]), flatten(layers));
  };
  const out = { heads: [], icons: [] };
  for (const head of host.querySelectorAll('.im-list-group')) {
    const label = head.querySelector(':scope > span:not(.im-count)');
    out.heads.push({ text: label.textContent, ratio: read(label), count: head.querySelector('.im-count') ? read(head.querySelector('.im-count')) : null });
  }
  for (const row of host.querySelectorAll('.im-row')) {
    for (const button of row.querySelectorAll('.im-row-actions > .im-icon-btn')) out.icons.push({ state: row.dataset.gState, visible: button.getClientRects().length > 0 ? getComputedStyle(button).visibility : 'none', ratio: read(button.querySelector('.im-icon'), getComputedStyle(button).color) });
  }
  return out;
}

// What a real pointer and a real key do: hover a rest row, focus a rest row, then Tab to the actions.
async function interaction(page, width, where) {
  const sel = `[data-g-list-groups="${width}"]`;
  const rest = `${sel} .im-row[data-g-state="rest"][data-g-cat="yes"]`;
  const visibility = (selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).visibility, selector);
  const height = (selector) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().height, selector);
  const before = await height(rest);
  assert.equal(await visibility(`${rest} .im-row-actions`), 'hidden', where('a row at rest hides its actions'));
  await page.hover(rest);
  assert.equal(await visibility(`${rest} .im-row-actions`), 'visible', where('a hovered row shows its actions'));
  assert.equal(await height(rest), before, where('and does not change size'));
  await page.mouse.move(0, 0);
  assert.equal(await visibility(`${rest} .im-row-actions`), 'hidden', where('they are hidden again when the pointer leaves'));
  await page.focus(rest);
  assert.equal(await visibility(`${rest} .im-row-actions`), 'visible', where('a row that holds focus shows its actions'));
  assert.equal(await height(rest), before, where('and does not change size'));
  const names = [];
  for (let step = 0; step < 2; step++) {
    await page.keyboard.press('Tab');
    names.push(await page.evaluate((s) => {
      const active = document.activeElement;
      return active?.closest(`${s} .im-row[data-g-state="rest"][data-g-cat="yes"]`) && active.matches('.im-row-actions > .im-icon-btn') ? active.getAttribute('aria-label') : `not an action: ${active?.outerHTML.slice(0, 60)}`;
    }, sel));
  }
  assert.deepEqual(names, ['Rename billing-service', 'Close billing-service'], where('Tab from the row reaches its two actions, in order'));
  assert.equal(await visibility(`${rest} .im-row-actions`), 'visible', where('the actions stay shown while one of them holds focus'));
  assert.equal(await height(rest), before, where('and the row does not change size'));
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.evaluate(() => document.activeElement?.blur());
  assert.equal(await visibility(`${rest} .im-row-actions`), 'hidden', where('with focus gone the actions are hidden again'));
}

export default async function (page) {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      for (const app of APPS) {
        const wide = app === 'shinatama';
        const where = (width) => (text) => `${app} ${look} ${theme} ${width}: ${text}`;
        await page.evaluate((state) => window.__imago.set({ glass: false, width: 1160, ...state }), { app, look, theme });
        await page.waitForSelector('[data-g-list-groups="900"]', { state: 'attached' });
        await page.locator('[data-g-list-groups="900"]').scrollIntoViewIfNeeded();

        // ---------- the full sidebar ----------
        const w900 = where(900);
        const full = await page.evaluate(contrast, { width: 900 });
        for (const head of full.heads) {
          assert.ok(head.ratio >= 4.5, w900(`the head "${head.text}" reads at ${head.ratio.toFixed(2)}:1`));
          if (head.count !== null) assert.ok(head.count >= 4.5, w900(`the count of "${head.text}" reads at ${head.count.toFixed(2)}:1`));
        }
        const shown = full.icons.filter((icon) => icon.visible === 'visible');
        assert.deepEqual([...new Set(shown.map((icon) => icon.state))].sort(), ['focus', 'hover', 'selected'], w900('the actions are shown in the states hover, focus and selected'));
        for (const icon of shown) assert.ok(icon.ratio >= 4.5, w900(`an action in a ${icon.state} row is ${icon.ratio.toFixed(2)}:1`));
        if (!wide) continue; // the rest only needs the contrast of each app: its hue is the accent of the selection and the focus ring

        const seen = await page.evaluate(measure, { width: 900 });
        assert.equal(seen.groups.length, 3, w900('three groups'));
        assert.equal(seen.rows.length, 6, w900('six rows'));
        assert.ok(seen.groupIdsResolve, w900('each role="group" is named by the head that stands before it'));
        assert.equal(seen.listScrollsX, 0, w900('nothing of the list scrolls sideways'));
        for (const group of seen.groups) {
          const at = (text) => w900(`group "${group.text}": ${text}`);
          assert.equal(group.role, null, at('a head is a label, not a row: it has no role'));
          assert.equal(group.title, group.text, at('it carries its label as its title'));
          assert.equal(group.type.size, seen.tokens.meta, at('its text is the size of meta text'));
          assert.equal(group.type.family, seen.look.family, at('in the head font'));
          assert.equal(group.type.transform, seen.look.transform, at("in the look's case"));
          assert.equal(group.type.tracking, seen.look.tracking, at("and the look's spacing"));
          assert.deepEqual(group.margin, [seen.tokens.s3, seen.tokens.s1], at('with the space of a group above and of a label under it'));
          assert.ok(group.box.height >= seen.tokens.rowSmall, at('it is as high as a small control'));
          assert.equal(group.scrollsX, 0, at('nothing of it scrolls sideways'));
          if (group.count !== null) assert.ok(group.countBox.left >= group.label.right - 0.5, at('its count follows its label'));
        }
        const [open, folded, plain] = seen.groups;
        assert.equal(open.tag, 'button', w900('a head that folds is a button'));
        assert.equal(open.expanded, 'true', w900('an open group says so'));
        assert.equal(folded.expanded, 'false', w900('a folded group says so'));
        assert.equal(plain.tag, 'div', w900('a head that does not fold is a div'));
        assert.equal(plain.expanded, null, w900('and has no aria-expanded'));
        assert.equal(open.count, '4', w900('the count is written'));
        // Where the text starts: the group's first item is where a row's title starts (a border and a padding in from the edge of the list).
        const tops = seen.rows.map((row) => row.titleLeft);
        assert.ok(tops.every((left) => Math.abs(left - tops[0]) < 0.75), w900('every row title starts at one place'));
        assert.ok(Math.abs(open.firstChild.left - tops[0]) < 0.75, w900(`the group's icon starts where the rows' titles do (${open.firstChild.left} and ${tops[0]})`));
        assert.ok(Math.abs(plain.label.left - tops[0]) < 0.75, w900(`and so does the label of a head without an icon (${plain.label.left} and ${tops[0]})`));
        // The actions: two icon buttons, named, in place at rest, the same size in every state.
        const heights = new Set(seen.rows.map((row) => row.box.height));
        assert.equal(heights.size, 1, w900(`a row is as high at rest, hovered, focused and selected as any other (${[...heights]})`));
        for (const row of seen.rows) {
          const at = (text) => w900(`row ${row.state}/${row.cat}: ${text}`);
          assert.equal(row.buttons.length, 2, at('two actions'));
          assert.ok(row.buttons.every((b) => b.label && b.title === b.label), at('each has its name and its tooltip'));
          assert.ok(row.buttons.every((b) => b.width >= seen.tokens.rowSmall - 0.01 && b.height >= seen.tokens.rowSmall - 0.01), at('and a target of 24'));
          assert.equal(row.actions.visibility, row.state === 'rest' ? 'hidden' : 'visible', at('the actions are hidden at rest and shown otherwise'));
          assert.ok(row.actions.right <= row.box.right - 1 + 0.5 && row.actions.left > row.box.left, at('they are inside the row, at its end'));
          assert.equal(row.inGroup, 'group', at('the row is in its group'));
          assert.equal(row.rowCat, row.cat === 'yes' ? '1' : null, at('a category is on the row, and only on the rows that have one'));
          assert.equal(row.railCat, row.rowCat, at('the same value is on its rail item'));
        }
        await interaction(page, 900, w900);

        // ---------- the rail ----------
        const w700 = where(700);
        const rail = await page.evaluate(measure, { width: 700 });
        assert.equal(rail.sidebarWidth, 56, w700('the sidebar is the 56px rail'));
        assert.equal(rail.listScrollsX, 0, w700('nothing of the rail scrolls sideways'));
        const [railOpen, railFolded, railPlain] = rail.groups;
        for (const group of [railOpen, railFolded]) {
          assert.equal(group.hasIcon, true, w700(`"${group.text}" has an icon`));
          assert.ok(group.firstChild.width > 0 && group.firstChild.height > 0, w700(`the rail shows the icon of "${group.text}"`));
          assert.ok(group.label.width <= 1.01 && group.label.height <= 1.01, w700(`and not its label, which stays for its name (${group.label.width} by ${group.label.height})`));
          assert.equal(group.countBox?.display, 'none', w700('and not its count'));
          assert.ok(group.box.width <= 56, w700('the head is not wider than the rail'));
          assert.ok(Math.abs((group.firstChild.left + group.firstChild.right) / 2 - (group.box.left + group.box.right) / 2) < 0.75, w700('the icon is centred in the rail'));
          assert.equal(group.title, group.text, w700('the label is the rail\'s tooltip'));
        }
        assert.equal(railPlain.box.display, 'none', w700('a head without an icon is not drawn in the rail'));
        for (const row of rail.rows) {
          const at = (text) => w700(`row ${row.state}/${row.cat}: ${text}`);
          assert.equal(row.actions.display, 'none', at('the actions are not drawn in the rail'));
          assert.ok(row.railItem.width > 0, at('the row shows its rail item'));
          assert.equal(row.railCat, row.rowCat, at('the category is on the rail item'));
          if (row.cat === 'yes') assert.notEqual(row.railFill, 'rgba(0, 0, 0, 0)', at('whose fill tells it'));
        }
        const railContrast = await page.evaluate(contrast, { width: 700 });
        assert.equal(railContrast.icons.filter((icon) => icon.visible === 'visible').length, 0, w700('no action is shown'));
      }
    }
  }
}
