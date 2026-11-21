// The React binding writes the package's canonical markup and nothing of its own: the window frame of
// docs/using-imago.md section 4, and the classes that css/ defines.
//   node --experimental-strip-types --test tests/react.test.ts
// It renders each component with react-dom/server (a dev dependency; the binding itself needs only the consumer's react).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement as h, Fragment, Suspense, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { namesDefined, packageNames } from '../scripts/check/names.mjs';
import { parseSource } from '../scripts/check/source.mjs';
import * as binding from '../react/index.js';
import { shellFrameHtml, sidebarHtml } from '../ts/ui/shell-markup.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');
// The binding is plain JavaScript: take its components loosely, as a consumer's JSX would hand them props.
const { Disclosure, ListAction, Shell, TabList, Timeline, Workbench } = binding as Record<string, (props: any) => any>;

const render = (element: ReactNode): string => renderToStaticMarkup(element as never);

// ---------- a small reader for the markup react-dom/server writes (every tag closed, every attribute quoted) ----------

interface Element { tag: string; attrs: Record<string, string>; children: (Element | string)[] }

function parse(html: string): Element {
  const top: Element = { tag: '#root', attrs: {}, children: [] };
  const open: Element[] = [top];
  for (const token of html.matchAll(/<(\/?)([a-z][a-z0-9]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>|([^<]+)/g)) {
    const [, closing, tag, attrs, text] = token;
    const parent = open[open.length - 1];
    if (text !== undefined) parent.children.push(text);
    else if (closing) assert.equal(open.pop()?.tag, tag, `</${tag}> closes another tag in ${html}`);
    else {
      const element: Element = { tag, attrs: Object.fromEntries([...attrs.matchAll(/\s+([^\s=>]+)(?:="([^"]*)")?/g)].map((match) => [match[1], match[2] ?? ''])), children: [] };
      parent.children.push(element);
      open.push(element);
    }
  }
  assert.equal(open.length, 1, `unclosed tag in ${html}`);
  return top;
}

const classesOf = (element: Element): string[] => (element.attrs.class ?? '').split(/\s+/).filter(Boolean);
const elementsOf = (node: Element | string): Element[] => (typeof node === 'string' ? [] : [node, ...node.children.flatMap(elementsOf)]);
const childrenOf = (element: Element): Element[] => element.children.filter((child): child is Element => typeof child !== 'string');
/** Whether an element is what a selector such as `section.im-sidebar` or `.im-row` names: its tag, if given, and each class. */
const matches = (element: Element, selector: string): boolean => {
  const [tag, ...names] = selector.split('.');
  return (!tag || element.tag === tag) && names.every((name) => classesOf(element).includes(name));
};
const find = (node: Element, selector: string): Element | undefined => elementsOf(node).find((element) => matches(element, selector));
const only = (node: Element, selector: string): Element => {
  const found = elementsOf(node).filter((element) => matches(element, selector));
  assert.equal(found.length, 1, `expected one ${selector}, found ${found.length}`);
  return found[0];
};
const textOf = (node: Element | string): string => (typeof node === 'string' ? node : node.children.map(textOf).join(''));
const rootOf = (html: string): Element => {
  const children = childrenOf(parse(html));
  assert.equal(children.length, 1, 'one root element');
  return children[0];
};

/** The tags and classes of a tree, as `div.im-body[section.im-panel.im-sidebar,div.im-work[...]]`; `stop` keeps the outline off what the app puts in a region. */
function outline(element: Element, stop: (element: Element) => boolean): string {
  const name = element.tag + classesOf(element).map((className) => `.${className}`).join('');
  const kids = childrenOf(element);
  return stop(element) || !kids.length ? name : `${name}[${kids.map((kid) => outline(kid, stop)).join(',')}]`;
}
const isAppContent = (element: Element): boolean => ['im-titlebar', 'im-list'].some((name) => classesOf(element).includes(name));

const rows = [
  h(ListAction, { key: 'a', title: 'First', detail: '3 sessions', pressed: true, icon: h('span', { className: 'im-rail-item', 'aria-hidden': true }, 'F') }),
  h(ListAction, { key: 'b', title: 'Second', pressed: false }),
];
const titlebar = h('header', { className: 'im-titlebar' }, 'Title');

describe('the exports', () => {
  test('are the five components and the shell, and DetailPanel is gone', () => {
    assert.deepEqual(Object.keys(binding).sort(), ['Disclosure', 'ListAction', 'Shell', 'TabList', 'Timeline', 'Workbench']);
  });

  test('are the names react/index.d.ts declares, no more and no fewer', () => {
    const declared = [...read('react/index.d.ts').matchAll(/^export (?:declare )?(?:function|const|class|let|var) ([A-Za-z_$][\w$]*)/gm)].map((match) => match[1]);
    assert.ok(declared.length >= 6, 'the test reads the declarations (it would pass on an empty list otherwise)');
    assert.deepEqual([...new Set(declared)].sort(), Object.keys(binding).sort());
  });
});

describe('the types', () => {
  const types = read('react/index.d.ts');
  test("require the skip link's words on Shell and the content's name on Workbench", () => {
    assert.match(types, /\bskipLabel: string;/);
    assert.doesNotMatch(types, /\bskipLabel\?:/);
    assert.match(types, /'aria-label': string;/);
  });

  test("declare Workbench's status row, action bar, footer and ids, and ListAction's tooltip and rail item", () => {
    for (const name of ['status', 'actions', 'footer', 'rail']) assert.match(types, new RegExp(`\\b${name}\\?: ReactNode;`), name);
    for (const name of ['contentId', 'sidebarId', 'tooltip']) assert.match(types, new RegExp(`\\b${name}\\?: string;`), name);
    const shell = /export function Shell\([^]*?\): ReactElement;/.exec(types)?.[0] ?? '';
    assert.match(shell, /\bcontentId\?: string;/, 'Shell takes contentId');
  });

  test('say that the Shell is mounted in a root that carries im-root', () => {
    assert.match(types, /im-root/);
  });
});

describe('Shell', () => {
  test('is the im-shell root: skip link, title bar, then the children, in the order of the string frame', () => {
    const shell = rootOf(render(h(Shell, { sidebar: true, skipLabel: 'Skip to content', titlebar }, h('div', { className: 'im-body' }, 'Body'))));
    assert.equal(shell.tag, 'div');
    assert.deepEqual(classesOf(shell), ['im-shell']);
    assert.deepEqual(childrenOf(shell).map((child) => child.tag + (child.attrs.class ? `.${child.attrs.class}` : '')), ['a.im-shell-skip-link', 'header.im-titlebar', 'div.im-body']);
    assert.equal(only(shell, '.im-shell-skip-link').attrs.href, '#main');
    assert.equal(textOf(only(shell, '.im-shell-skip-link')), 'Skip to content');
  });

  test('writes data-im-sidebar on or off, and off when the sidebar is not asked for', () => {
    assert.equal(rootOf(render(h(Shell, { sidebar: true }))).attrs['data-im-sidebar'], 'on');
    assert.equal(rootOf(render(h(Shell, { sidebar: false }))).attrs['data-im-sidebar'], 'off');
    assert.equal(rootOf(render(h(Shell, null))).attrs['data-im-sidebar'], 'off');
  });

  test('writes data-im-inspector="wide" for inspector="wide" and nothing otherwise', () => {
    assert.equal(rootOf(render(h(Shell, { inspector: 'wide' }))).attrs['data-im-inspector'], 'wide');
    assert.equal('data-im-inspector' in rootOf(render(h(Shell, null))).attrs, false);
  });

  test('never writes data-im-app: applyLook writes the app, the look and the theme on the root element, even if a consumer passes app', () => {
    assert.equal('data-im-app' in rootOf(render(h(Shell, null))).attrs, false);
    assert.equal('data-im-app' in rootOf(render(h(Shell, { app: 'daodan' }))).attrs, false);
  });

  test('sends the skip link to the content region of its Workbench: its contentId, main by default', () => {
    const shell = (props: Record<string, unknown>): Element => rootOf(render(h(Shell, { skipLabel: 'Skip to content', titlebar },
      h(Workbench, { detailsLabel: 'Details', 'aria-label': 'Viewer', ...props }, h('p', null, 'Page')))));
    const custom = shell({ contentId: 'viewer' });
    assert.equal(only(custom, '.im-shell-skip-link').attrs.href, '#viewer');
    assert.equal(only(custom, '.im-content').attrs.id, 'viewer');
    assert.equal(only(shell({}), '.im-shell-skip-link').attrs.href, '#main');
  });

  test('takes contentId itself, for a Workbench it cannot see (in a fragment, a Suspense or a component of the app)', () => {
    const Page = ({ children }: { children?: ReactNode }) => h(Workbench, { contentId: 'viewer', detailsLabel: 'Details', 'aria-label': 'Viewer' }, children);
    for (const [name, wrap] of [
      ['a fragment', (node: ReactNode) => h(Fragment, null, node)],
      ['a Suspense', (node: ReactNode) => h(Suspense, null, node)],
      ['a component', () => h(Page, null, h('p', null, 'Page'))],
    ] as const) {
      const inner = h(Workbench, { contentId: 'viewer', detailsLabel: 'Details', 'aria-label': 'Viewer' }, h('p', null, 'Page'));
      const written = rootOf(render(h(Shell, { skipLabel: 'Skip to content', titlebar, contentId: 'viewer' }, wrap(inner))));
      assert.equal(only(written, '.im-shell-skip-link').attrs.href, '#viewer', name);
      assert.equal(only(written, '.im-content').attrs.id, 'viewer', name);
    }
    assert.equal('contentId' in rootOf(render(h(Shell, { skipLabel: 'Skip', contentId: 'viewer' }))).attrs, false, 'contentId is not written on the shell');
    assert.equal(rootOf(render(h(Shell, { skipLabel: 'Skip', contentId: 'viewer' }))).attrs['contentid'], undefined);
  });

  test('has no skip link without a label for it, and keeps its class whatever className it is given', () => {
    const shell = rootOf(render(h(Shell, { className: 'mine', id: 'window' }, 'x')));
    assert.equal(find(shell, '.im-shell-skip-link'), undefined);
    assert.deepEqual(classesOf(shell), ['im-shell']);
    assert.equal(shell.attrs.id, 'window');
  });
});

describe('Workbench', () => {
  const content = h('p', null, 'Page');
  const details = h('h2', null, 'Selected');
  const full = (): Element => rootOf(render(h(Workbench, { navigation: rows, navigationLabel: 'Threads', details, detailsLabel: 'Details', 'aria-label': 'Viewer' }, content)));

  test('is div.im-body: the sidebar, then div.im-work > div.im-columns > the content and the inspector', () => {
    const body = full();
    assert.equal(body.tag, 'div');
    assert.deepEqual(classesOf(body), ['im-body']);
    const [sidebar, work] = childrenOf(body);
    assert.equal(sidebar.tag, 'section');
    assert.deepEqual(classesOf(sidebar), ['im-panel', 'im-sidebar']);
    assert.equal(work.tag, 'div');
    assert.deepEqual(classesOf(work), ['im-work']);
    const columns = childrenOf(work);
    assert.equal(columns.length, 1);
    assert.deepEqual(classesOf(columns[0]), ['im-columns']);
    const [main, inspector] = childrenOf(columns[0]);
    assert.equal(main.tag, 'main');
    assert.deepEqual(classesOf(main), ['im-panel', 'im-content']);
    assert.equal(inspector.tag, 'section');
    assert.deepEqual(classesOf(inspector), ['im-panel', 'im-inspector']);
  });

  test('writes the sidebar of section 4: an id, a panel header with its title, and the list body of the rows', () => {
    const sidebar = only(full(), '.im-sidebar');
    assert.equal(sidebar.attrs.id, 'sidebar');
    assert.equal(sidebar.attrs['aria-label'], 'Threads');
    const [header, body] = childrenOf(sidebar);
    assert.deepEqual([header.tag, classesOf(header)], ['header', ['im-panel-header']]);
    assert.deepEqual(childrenOf(header).map((child) => child.tag + '.' + child.attrs.class), ['h4.im-panel-title', 'span.im-spacer']);
    assert.equal(textOf(childrenOf(header)[0]), 'Threads');
    assert.deepEqual([body.tag, classesOf(body)], ['div', ['im-panel-body', 'im-list']]);
    assert.equal(body.attrs['aria-label'], 'Threads');
    assert.deepEqual(childrenOf(body).map((row) => row.tag + '.' + row.attrs.class), ['button.im-row im-row--detail', 'button.im-row im-row--detail']);
  });

  test('writes the content region of the frame: an id the skip link reaches, a focus target, one panel body', () => {
    const main = only(full(), '.im-content');
    assert.equal(main.attrs.id, 'main');
    assert.equal(main.attrs.tabindex, '-1');
    assert.equal(main.attrs['aria-busy'], 'false');
    assert.equal(main.attrs['aria-label'], 'Viewer');
    assert.equal(childrenOf(main).length, 1);
    assert.deepEqual(classesOf(childrenOf(main)[0]), ['im-panel-body']);
    assert.equal(textOf(childrenOf(main)[0]), 'Page');
  });

  test('writes the details as the children of an open inspector', () => {
    const inspector = only(full(), '.im-inspector');
    assert.equal(inspector.attrs['aria-label'], 'Details');
    assert.equal('hidden' in inspector.attrs, false);
    assert.deepEqual(childrenOf(inspector).map((child) => child.tag), ['h2']);
  });

  test('leaves the sidebar out without navigation', () => {
    const body = rootOf(render(h(Workbench, { details, detailsLabel: 'Details' }, content)));
    assert.equal(find(body, '.im-sidebar'), undefined);
    assert.deepEqual(childrenOf(body).map((child) => child.attrs.class), ['im-work']);
  });

  for (const [name, empty] of [['absent', undefined], ['null', null], ['false', false], ['an empty string', ''], ['an empty array', []], ['nothing but empty values', [null, false, '']]] as const) {
    test(`hides the inspector, empty, when the details are ${name}`, () => {
      const inspector = only(rootOf(render(h(Workbench, { details: empty, detailsLabel: 'Details' }, content))), '.im-inspector');
      assert.equal(inspector.attrs.hidden, '');
      assert.equal(inspector.attrs['aria-label'], 'Details');
      assert.deepEqual(inspector.children, []);
    });
  }

  test('ignores wide: the shell takes data-im-inspector from Shell', () => {
    const html = render(h(Workbench, { details, detailsLabel: 'Details', wide: true }, content));
    assert.doesNotMatch(html, /data-im-inspector|wide/);
  });

  test('writes the same elements and classes as shellFrameHtml, region by region', () => {
    const frame = shellFrameHtml({
      titlebarHtml: '<header class="im-titlebar"></header>', contentHtml: '<p>Page</p>', contentLabel: 'Viewer', skipLabel: 'Skip to content', inspectorLabel: 'Details',
      sidebarHtml: sidebarHtml({ id: 'sidebar', label: 'Threads', rowsHtml: '<div class="im-row"></div>' }),
    });
    const expected = outline(rootOf(`<div class="im-shell" data-im-sidebar="on">${frame}</div>`), isAppContent);
    const written = outline(rootOf(render(h(Shell, { sidebar: true, skipLabel: 'Skip to content', titlebar },
      h(Workbench, { navigation: rows, navigationLabel: 'Threads', detailsLabel: 'Details', 'aria-label': 'Viewer' }, content)))), isAppContent);
    assert.equal(written, expected);
  });

  test('writes the status row, the action bar and the footer around the columns, as shellFrameHtml does', () => {
    const frame = shellFrameHtml({
      titlebarHtml: '<header class="im-titlebar"></header>', contentHtml: '<p>Page</p>', contentLabel: 'Viewer', skipLabel: 'Skip to content', inspectorLabel: 'Details',
      sidebarHtml: sidebarHtml({ id: 'sidebar', label: 'Threads', rowsHtml: '<div class="im-row"></div>' }),
      statusHtml: '<span class="im-status-text">Ready</span>', actionsHtml: '<button type="button" class="im-btn">Apply</button>', footerHtml: '<span class="im-footer-text">State</span>',
    });
    const expected = outline(rootOf(`<div class="im-shell" data-im-sidebar="on">${frame}</div>`), isAppContent);
    const workbench = h(Workbench, {
      navigation: rows, navigationLabel: 'Threads', detailsLabel: 'Details', 'aria-label': 'Viewer',
      status: h('span', { className: 'im-status-text' }, 'Ready'), actions: h('button', { type: 'button', className: 'im-btn' }, 'Apply'),
      footer: h('span', { className: 'im-footer-text' }, 'State'),
    }, content);
    const written = rootOf(render(h(Shell, { sidebar: true, skipLabel: 'Skip to content', titlebar }, workbench)));
    assert.equal(outline(written, isAppContent), expected);
    const work = only(written, '.im-work');
    assert.deepEqual(childrenOf(work).map((child) => `${child.tag}.${child.attrs.class}`), ['div.im-status', 'div.im-columns', 'div.im-actions', 'footer.im-footer']);
    assert.deepEqual([textOf(only(work, '.im-status')), textOf(only(work, '.im-actions')), textOf(only(work, '.im-footer'))], ['Ready', 'Apply', 'State']);
  });

  test('leaves the status row, the action bar and the footer out when they are not given', () => {
    for (const empty of [undefined, null, false]) {
      const work = only(rootOf(render(h(Workbench, { detailsLabel: 'Details', 'aria-label': 'Viewer', status: empty, actions: empty, footer: empty }, content))), '.im-work');
      assert.deepEqual(childrenOf(work).map((child) => child.attrs.class), ['im-columns'], String(empty));
    }
  });

  test('takes the ids of the content region and of the sidebar, main and sidebar by default', () => {
    const body = rootOf(render(h(Workbench, { navigation: rows, navigationLabel: 'Threads', detailsLabel: 'Details', 'aria-label': 'Viewer', contentId: 'viewer', sidebarId: 'threads' }, content)));
    assert.equal(only(body, '.im-content').attrs.id, 'viewer');
    assert.equal(only(body, '.im-sidebar').attrs.id, 'threads');
    assert.equal(only(full(), '.im-content').attrs.id, 'main');
    assert.equal(only(full(), '.im-sidebar').attrs.id, 'sidebar');
  });

  test('writes the same attributes on the regions as shellFrameHtml', () => {
    const frame = rootOf(`<div class="im-shell">${shellFrameHtml({
      titlebarHtml: '', contentHtml: '', contentLabel: 'Viewer', skipLabel: 'Skip', inspectorLabel: 'Details',
      sidebarHtml: sidebarHtml({ id: 'sidebar', label: 'Threads', rowsHtml: '' }),
    })}</div>`);
    const written = rootOf(render(h(Shell, { sidebar: true, skipLabel: 'Skip' }, h(Workbench, { navigation: rows, navigationLabel: 'Threads', detailsLabel: 'Details', 'aria-label': 'Viewer' }, null))));
    for (const selector of ['.im-sidebar', '.im-content', '.im-inspector']) {
      const attributes = (element: Element): Record<string, string> => Object.fromEntries(Object.entries(element.attrs).filter(([name]) => name !== 'class' && name !== 'role'));
      assert.deepEqual(attributes(only(written, selector)), attributes(only(frame, selector)), selector);
    }
  });

  test('writes none of the classes the shell dropped', () => {
    const html = render(h(Shell, { sidebar: true }, h(Workbench, { navigation: rows, navigationLabel: 'Threads', details, detailsLabel: 'Details' }, content)));
    for (const dropped of ['im-workbench', 'im-navigation-panel', 'im-detail-panel']) assert.ok(!html.includes(dropped), dropped);
  });
});

describe('ListAction', () => {
  const row = (props: Record<string, unknown>): Element => rootOf(render(h(ListAction, { title: 'Name', ...props })));

  test('is a native button.im-row with the title and the detail in its row text', () => {
    const button = row({ detail: 'Info', icon: h('span', { className: 'im-rail-item' }, 'N') });
    assert.equal(button.tag, 'button');
    assert.equal(button.attrs.type, 'button');
    assert.ok(classesOf(button).includes('im-row'));
    assert.deepEqual(childrenOf(button).map((child) => child.attrs.class), ['im-rail-item', 'im-row-text']);
    assert.equal(textOf(only(button, '.im-row-title')), 'Name');
    assert.equal(textOf(only(button, '.im-row-sub')), 'Info');
  });

  test('writes aria-pressed for a pressed prop and nothing for a row that is not a toggle', () => {
    assert.equal(row({ pressed: true }).attrs['aria-pressed'], 'true');
    assert.equal(row({ pressed: false }).attrs['aria-pressed'], 'false');
    assert.equal('aria-pressed' in row({}).attrs, false);
  });

  test('leaves the sub line out without a detail', () => {
    assert.equal(find(row({}), '.im-row-sub'), undefined);
  });

  test('passes the attributes of a button on', () => {
    assert.equal(row({ id: 'r1', disabled: true }).attrs.id, 'r1');
    assert.equal(row({ disabled: true }).attrs.disabled, '');
  });

  test('takes its tooltip as the title attribute: title is the row\'s title', () => {
    const button = row({ tooltip: 'Name, 3 sessions' });
    assert.equal(button.attrs.title, 'Name, 3 sessions');
    assert.equal(textOf(only(button, '.im-row-title')), 'Name');
    assert.equal('title' in row({}).attrs, false, 'no tooltip, no title attribute');
  });

  test('writes its rail item first, the children of a span.im-rail-item, before its icon and its text', () => {
    const button = row({ rail: 'NA', icon: h('svg', { className: 'im-icon' }) });
    const [rail, icon, text] = childrenOf(button);
    assert.deepEqual([rail.tag, rail.attrs.class, rail.attrs['aria-hidden'], textOf(rail)], ['span', 'im-rail-item', 'true', 'NA']);
    assert.deepEqual([icon.tag, text.attrs.class], ['svg', 'im-row-text']);
    assert.equal(find(row({}), '.im-rail-item'), undefined, 'no rail item unless it is given');
  });
});

describe('Timeline, TabList and Disclosure keep their markup', () => {
  test('Timeline is ol.im-timeline of items with a caption for the detail', () => {
    const list = rootOf(render(h(Timeline, { items: [{ id: 1, title: 'Opened', detail: 'Today' }, { id: 2, title: 'Closed' }] })));
    assert.equal(list.tag, 'ol');
    assert.deepEqual(classesOf(list), ['im-timeline']);
    const [first, second] = childrenOf(list);
    assert.deepEqual(childrenOf(first).map((child) => child.attrs.class ?? ''), ['', 'im-caption']);
    assert.equal(childrenOf(second).length, 1);
  });

  test('TabList is div.im-tabs of button.im-tab, one selected', () => {
    const tabs = rootOf(render(h(TabList, { label: 'Views', value: 'b', onSelect() {}, tabs: [
      { value: 'a', id: 'tab-a', panel: 'panel-a', label: 'A' }, { value: 'b', id: 'tab-b', panel: 'panel-b', label: 'B', disabled: true },
    ] })));
    assert.equal(tabs.tag, 'div');
    assert.deepEqual(classesOf(tabs), ['im-tabs']);
    assert.equal(tabs.attrs.role, 'tablist');
    assert.equal(tabs.attrs['aria-label'], 'Views');
    const buttons = childrenOf(tabs);
    assert.deepEqual(buttons.map((button) => [button.tag, button.attrs.class, button.attrs.role, button.attrs['aria-selected'], button.attrs['aria-controls']]), [
      ['button', 'im-tab', 'tab', 'false', 'panel-a'], ['button', 'im-tab', 'tab', 'true', 'panel-b'],
    ]);
  });

  test('Disclosure is a closed details.im-disclosure with its summary and no content', () => {
    const details = rootOf(render(h(Disclosure, { label: 'More' }, h('p', null, 'Hidden until opened'))));
    assert.equal(details.tag, 'details');
    assert.deepEqual(classesOf(details), ['im-disclosure']);
    assert.deepEqual(childrenOf(details).map((child) => child.tag), ['summary']);
    assert.equal(textOf(details), 'More');
  });
});

// ---------- the binding adds no name of its own ----------

describe('every name the binding writes is the package\'s', () => {
  const read = (file: string): string => readFileSync(join(root, file), 'utf8');
  const cssFiles = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? cssFiles(`${dir}/${entry.name}`) : entry.name.endsWith('.css') ? [`${dir}/${entry.name}`] : []));
  const css = namesDefined(cssFiles('css').map((file) => parseSource(file, read(file))));
  const package_ = packageNames(root);
  // The one class a script looks for and no stylesheet styles: the content region, which F6 goes to (see tests/docs.test.ts).
  const HOOKS = new Set(['im-content']);

  const everything = render(h(Shell, { sidebar: true, inspector: 'wide', skipLabel: 'Skip to content', titlebar },
    h(Workbench, { navigation: rows, navigationLabel: 'Threads', detailsLabel: 'Details', details: [
      h(Timeline, { key: 't', items: [{ id: 1, title: 'Opened', detail: 'Today' }] }),
      h(TabList, { key: 'l', label: 'Views', value: 'a', onSelect() {}, tabs: [{ value: 'a', id: 'a', panel: 'p', label: 'A' }] }),
      h(Disclosure, { key: 'd', label: 'More' }),
    ] }, h('p', null, 'Page'))));
  const written = new Set(elementsOf(parse(everything)).flatMap(classesOf));

  test('the markup of everything it renders names classes (the test would pass on an empty set otherwise)', () => {
    for (const name of ['im-shell', 'im-body', 'im-sidebar', 'im-work', 'im-columns', 'im-content', 'im-inspector', 'im-row', 'im-tab', 'im-timeline', 'im-disclosure']) assert.ok(written.has(name), name);
  });

  test('every im- class it renders is defined by the package', () => {
    assert.deepEqual([...written].filter((name) => !package_.classes.has(name)), []);
  });

  test('every im- class it renders, but the hook of the content region, is styled by css/', () => {
    assert.deepEqual([...written].filter((name) => !css.classes.has(name) && !HOOKS.has(name)), []);
  });

  test('every im- class in its source is defined by the package, rendered or not', () => {
    const source = read('react/index.js');
    const named = new Set([...source.matchAll(/(?<![\w-])im-[a-z0-9]+(?:-[a-z0-9]+)*/g)].map((match) => match[0]));
    assert.deepEqual([...named].filter((name) => !package_.classes.has(name)), []);
  });

  test('every data-im- attribute it renders is read or written by the package', () => {
    const attributes = new Set(elementsOf(parse(everything)).flatMap((element) => Object.keys(element.attrs)).filter((name) => name.startsWith('data-im-')));
    assert.deepEqual([...attributes].sort(), ['data-im-inspector', 'data-im-sidebar']);
    assert.deepEqual([...attributes].filter((name) => !package_.attributes.has(name)), []);
  });
});
