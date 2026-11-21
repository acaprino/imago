import assert from 'node:assert/strict';
import test from 'node:test';
import { bannerHtml, busyIndicatorHtml, pageContentHtml, shellFrameHtml, sidebarHtml, statusButtonHtml, tabNavigationHtml, titlebarHtml, windowButtonsHtml, type ShellFrameOptions } from '../ts/ui/shell-markup.ts';
import { renderShellFrame } from '../ts/ui/shell-frame.ts';

test('tabs expose one initial keyboard stop and announced counts without repeating their visual badge', () => {
  const html = tabNavigationHtml([{ id: 'a', label: 'First', count: 0 }, { id: 'b', label: 'Second', count: 3, countLabel: '3 running' }], 'b', { label: 'Sections', action: 'navigate' });
  assert.equal(html.match(/tabindex="0"/g)?.length, 1);
  assert.match(html, /data-id="b" aria-current="page" aria-selected="true" tabindex="0"/);
  assert.match(html, /aria-label="Second, 3 running"/);
  assert.match(html, /class="im-count" aria-hidden="true">3<\/span>/);
  assert.equal(html.match(/class="im-count"/g)?.length, 1);
  const fallback = tabNavigationHtml([{ id: 'first', label: 'First' }], 'removed', { label: 'Sections', action: 'navigate' });
  assert.match(fallback, /data-id="first" aria-current="page" aria-selected="true" tabindex="0"/);
});

test('shell text and identifiers cannot inject HTML or attributes', () => {
  const html = shellFrameHtml({
    contentId: 'm"<', skipLabel: '<skip>', contentLabel: '<content>', inspectorLabel: '"inspector',
    titlebarHtml: titlebarHtml({ brand: { name: '<name>', image: '/image" onerror="x' }, navigationHtml: tabNavigationHtml([{ id: '"x', label: '<tab>', count: 2, countLabel: '"waiting' }], '"x', { label: '<sections>', action: '"click' }), commands: { label: '<commands>', action: '"cmd', shortcut: '<K>' } }),
    contentHtml: pageContentHtml('<p>Trusted page component</p>', 'narrow'), busy: true,
  });
  assert.doesNotMatch(html, /<skip>|<name>|<tab>|<commands>|<K>|<content>| onerror="/);
  assert.match(html, /href="#m&quot;&lt;"/);
  assert.match(html, /src="\/image&quot; onerror=&quot;x"/);
  assert.match(html, /<main id="m&quot;&lt;" class="im-panel im-content" tabindex="-1" aria-label="&lt;content&gt;" aria-busy="true"><div class="im-panel-body">/);
  assert.match(html, /<section class="im-panel im-inspector" aria-label="&quot;inspector" hidden><\/section>/);
  assert.match(html, /class="im-page-content im-page-content--narrow"><p>Trusted page component<\/p>/);
});

// ---------- the frame: seven regions in the order of docs/using-imago.md section 4 ----------

const BASE: ShellFrameOptions = {
  titlebarHtml: '<header class="im-titlebar"><div class="im-brand"><span class="im-wordmark">App</span></div></header>',
  contentHtml: '<p>Page</p>', contentLabel: 'Sync', skipLabel: 'Skip to content', inspectorLabel: 'Details',
};
const ALL: ShellFrameOptions = {
  ...BASE,
  sidebarHtml: sidebarHtml({ id: 'side', label: 'Threads', rowsHtml: '<div class="im-row" role="option">Row</div>', collapse: { collapse: 'Fold', expand: 'Unfold' } }),
  statusHtml: '<span class="im-status-text">Ready</span>', actionsHtml: '<button type="button" class="im-btn im-btn--primary">Apply</button>',
  footerHtml: '<span class="im-footer-text">State</span>',
};

/** The opening tags of the frame's regions, in document order, with the attributes that matter to the frame. */
function regions(html: string): string[] {
  const REGION = /^(im-shell-skip-link|im-titlebar|im-body|im-sidebar|im-work|im-status|im-columns|im-content|im-inspector|im-actions|im-footer)$/;
  const found: string[] = [];
  for (const match of html.matchAll(/<([a-z]+)((?:\s[^>]*)?)>/g)) {
    const classes = /class="([^"]*)"/.exec(match[2])?.[1].split(' ') ?? [];
    const region = classes.find((name) => REGION.test(name));
    if (region) found.push(`${match[1]}.${classes.join('.')}`);
  }
  return found;
}

test('shellFrameHtml writes the seven regions in their order, with their classes and tags', () => {
  assert.deepEqual(regions(shellFrameHtml(ALL)), [
    'a.im-shell-skip-link', 'header.im-titlebar', 'div.im-body', 'section.im-panel.im-sidebar', 'div.im-work', 'div.im-status',
    'div.im-columns', 'main.im-panel.im-content', 'section.im-panel.im-inspector', 'div.im-actions', 'footer.im-footer',
  ]);
  const html = shellFrameHtml(ALL);
  assert.match(html, /<div class="im-status"><span class="im-status-text">Ready<\/span><\/div>/, 'the status row holds what statusHtml gives');
  assert.match(html, /<div class="im-actions"><button[^>]*>Apply<\/button><\/div>/, 'the action bar holds what actionsHtml gives');
  assert.match(html, /<footer class="im-footer"><span class="im-footer-text">State<\/span><\/footer>/, 'the footer holds what footerHtml gives');
  assert.match(html, /<main id="main" [^>]*><div class="im-panel-body"><p>Page<\/p><\/div><\/main>/, 'the content is one panel body, and its id is main by default');
  assert.match(html, /href="#main"/, 'the skip link goes to the content');
  assert.match(html, /aria-busy="false"/, 'the content is not busy unless the caller says so');
});

test('shellFrameHtml leaves out a region it is not given; the content and the hidden inspector are always there', () => {
  assert.deepEqual(regions(shellFrameHtml(BASE)), [
    'a.im-shell-skip-link', 'header.im-titlebar', 'div.im-body', 'div.im-work', 'div.im-columns', 'main.im-panel.im-content', 'section.im-panel.im-inspector',
  ]);
  for (const name of ['sidebarHtml', 'statusHtml', 'actionsHtml', 'footerHtml'] as const) {
    const without = { ...ALL, [name]: undefined };
    const region = { sidebarHtml: 'im-sidebar', statusHtml: 'im-status', actionsHtml: 'im-actions', footerHtml: 'im-footer' }[name];
    assert.ok(!regions(shellFrameHtml(without)).some((tag) => tag.split('.').includes(region)), `${region} is left out without ${name}`);
  }
  assert.ok(regions(shellFrameHtml({ ...BASE, statusHtml: '' })).includes('div.im-status'), 'an empty string is a region with nothing in it yet');
});

test('sidebarHtml writes the sidebar of section 4: a titled panel, a listbox of rows, and the fold button when asked', () => {
  const html = sidebarHtml({ id: 's"<', label: '<Threads>', rowsHtml: '<div class="im-row" role="option">Trusted row</div>', collapse: { collapse: 'Fold "it"', expand: '<Unfold>' } });
  assert.match(html, /^<section class="im-panel im-sidebar" id="s&quot;&lt;" aria-label="&lt;Threads&gt;"><header class="im-panel-header"><h4 class="im-panel-title">&lt;Threads&gt;<\/h4><span class="im-spacer"><\/span>/);
  assert.match(html, /<button type="button" class="im-icon-btn im-sidebar-collapse" aria-label="Fold &quot;it&quot;" title="Fold &quot;it&quot;" aria-expanded="true" aria-controls="s&quot;&lt;" data-im-label-collapse="Fold &quot;it&quot;" data-im-label-expand="&lt;Unfold&gt;"><svg class="im-icon"/);
  assert.match(html, /<div class="im-panel-body im-list" role="listbox" aria-label="&lt;Threads&gt;"><div class="im-row" role="option">Trusted row<\/div><\/div><\/section>$/);
  assert.doesNotMatch(sidebarHtml({ id: 'side', label: 'Threads', rowsHtml: '' }), /im-sidebar-collapse/, 'no fold button unless its two labels are given');
});

// ---------- renderShellFrame, on a small DOM ----------

// A DOM just big enough for renderShellFrame: elements, text, fragments, and a template that parses the well-formed
// markup the frame renderers write. Moving a node takes it from its old parent, as the DOM does.
const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'embed', 'track']);
const decode = (text: string): string => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name]!);

class FakeNode {
  parentNode: FakeParent | null = null;
  get parentElement(): FakeElement | null { return this.parentNode instanceof FakeElement ? this.parentNode : null; }
  remove(): void {
    const parent = this.parentNode;
    if (!parent) return;
    parent.childNodes.splice(parent.childNodes.indexOf(this), 1);
    this.parentNode = null;
  }
  before(...nodes: FakeNode[]): void { this.parentNode?.insert(nodes, this); }
  after(...nodes: FakeNode[]): void {
    const parent = this.parentNode;
    if (parent) parent.insert(nodes, parent.childNodes[parent.childNodes.indexOf(this) + 1] ?? null);
  }
  replaceWith(...nodes: FakeNode[]): void {
    const parent = this.parentNode;
    if (!parent) return;
    const marker = new FakeText('');
    parent.insert([marker], this);
    this.remove();
    parent.insert(nodes, marker);
    marker.remove();
  }
}
class FakeText extends FakeNode {
  data: string;
  constructor(data: string) { super(); this.data = data; }
}
class FakeParent extends FakeNode {
  childNodes: FakeNode[] = [];
  get children(): FakeElement[] { return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement); }
  get textContent(): string { return this.childNodes.map((node) => (node instanceof FakeText ? node.data : (node as FakeParent).textContent)).join(''); }
  insert(nodes: FakeNode[], reference: FakeNode | null): void {
    const flat = nodes.flatMap((node) => (node instanceof FakeFragment ? [...node.childNodes] : [node]));
    for (const node of flat) {
      if (node === reference) continue;
      node.remove();
      const at = reference ? this.childNodes.indexOf(reference) : this.childNodes.length;
      this.childNodes.splice(at, 0, node);
      node.parentNode = this;
    }
  }
  append(...nodes: FakeNode[]): void { this.insert(nodes, null); }
  replaceChildren(...nodes: FakeNode[]): void {
    const flat = nodes.flatMap((node) => (node instanceof FakeFragment ? [...node.childNodes] : [node]));
    for (const node of flat) node.remove();
    for (const node of [...this.childNodes]) node.remove();
    this.insert(flat, null);
  }
  contains(node: FakeNode | null): boolean {
    for (let at = node; at; at = at.parentNode) if (at === this) return true;
    return false;
  }
  find(name: string): FakeElement | null {
    for (const element of this.children) {
      if (element.classList.contains(name)) return element;
      const found = element.find(name);
      if (found) return found;
    }
    return null;
  }
}
class FakeFragment extends FakeParent {}
class FakeElement extends FakeParent {
  localName: string;
  attrs = new Map<string, string>();
  constructor(localName: string) { super(); this.localName = localName; }
  get ownerDocument() { return fakeDocument; }
  get attributes(): { name: string; value: string }[] { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  getAttribute(name: string): string | null { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attrs.set(name, String(value)); }
  hasAttribute(name: string): boolean { return this.attrs.has(name); }
  removeAttribute(name: string): void { this.attrs.delete(name); }
  get classList() {
    const names = (this.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);
    return { contains: (name: string) => names.includes(name) };
  }
}
class FakeTemplate extends FakeElement {
  content = new FakeFragment();
  set innerHTML(html: string) { this.content = parse(html); }
}
const fakeDocument = { createElement: (tag: string) => (tag === 'template' ? new FakeTemplate('template') : new FakeElement(tag)) };

function parse(html: string): FakeFragment {
  const root = new FakeFragment();
  const open: FakeParent[] = [root];
  for (const [, close, tag, attrs, selfClosing, text] of html.matchAll(/<\/([a-z0-9-]+)\s*>|<([a-z0-9-]+)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi)) {
    const parent = open[open.length - 1];
    if (text !== undefined) parent.append(new FakeText(decode(text)));
    else if (close) {
      while (open.length > 1) if ((open.pop() as FakeElement).localName === close.toLowerCase()) break;
    } else {
      const element = new FakeElement(tag.toLowerCase());
      for (const [, name, value] of attrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) element.setAttribute(name, decode(value ?? ''));
      parent.append(element);
      if (!selfClosing && !VOID.has(element.localName)) open.push(element);
    }
  }
  return root;
}

const TOGGLE = '<button type="button" class="im-icon-btn im-sidebar-toggle" aria-label="Threads" aria-expanded="false" aria-controls="side">T</button>';
const WINDOW = windowButtonsHtml();
/** A frame with a title bar that has a sidebar button and window buttons, and words that change from one paint to the next. */
function frame(paint: string, options: Partial<ShellFrameOptions> = {}): string {
  return shellFrameHtml({
    ...ALL,
    titlebarHtml: `<header class="im-titlebar" data-tauri-drag-region><span class="im-wordmark">${paint}</span>${TOGGLE}${WINDOW}</header>`,
    sidebarHtml: sidebarHtml({ id: 'side', label: `Threads ${paint}`, rowsHtml: `<div class="im-row" role="option">Row ${paint}</div>`, collapse: { collapse: `Fold ${paint}`, expand: `Unfold ${paint}` } }),
    statusHtml: `<span class="im-status-text">Status ${paint}</span>`,
    contentHtml: `<p>Content ${paint}</p>`,
    actionsHtml: `<button type="button" class="im-btn im-btn--primary">Apply ${paint}</button>`,
    footerHtml: `<span class="im-footer-text">Footer ${paint}</span>`,
    ...options,
  });
}
function mount(markup: string) {
  const shell = new FakeElement('div');
  shell.setAttribute('class', 'im-shell');
  renderShellFrame(shell as unknown as HTMLElement, markup);
  return shell;
}
const $ = (root: FakeParent, name: string): FakeElement => {
  const found = root.find(name);
  assert.ok(found, `.${name} is in the frame`);
  return found;
};
/** The regions of the mounted frame, by class, to compare identities before and after a repaint. */
const named = (shell: FakeElement) => Object.fromEntries(
  ['im-titlebar', 'im-body', 'im-sidebar', 'im-work', 'im-status', 'im-columns', 'im-content', 'im-inspector', 'im-actions', 'im-footer'].map((name) => [name, shell.find(name)]),
);

test('renderShellFrame mounts a whole frame on an empty shell and says whether it has a sidebar', () => {
  const shell = mount(frame('1'));
  assert.equal(shell.getAttribute('data-im-sidebar'), 'on');
  assert.deepEqual(shell.children.map((el) => el.getAttribute('class')), ['im-shell-skip-link', 'im-titlebar', 'im-body']);
  assert.equal($(shell, 'im-content').textContent, 'Content 1');
  const bare = mount(shellFrameHtml(BASE));
  assert.equal(bare.getAttribute('data-im-sidebar'), 'off');
});

test('a repaint keeps every region element and replaces what is inside them', () => {
  const shell = mount(frame('1'));
  const before = named(shell);
  const body = $(shell, 'im-content').find('im-panel-body');
  renderShellFrame(shell as unknown as HTMLElement, frame('2'));
  const after = named(shell);
  for (const [name, element] of Object.entries(before)) assert.equal(after[name], element, `${name} is the same element`);
  assert.equal($(shell, 'im-content').find('im-panel-body'), body, 'the content keeps its panel body');
  assert.equal($(shell, 'im-titlebar').find('im-wordmark')?.textContent, '2', 'the title bar shows the new paint');
  assert.equal($(shell, 'im-sidebar').find('im-row')?.textContent, 'Row 2', 'the sidebar shows the new rows');
  assert.equal($(shell, 'im-sidebar').getAttribute('aria-label'), 'Threads 2', 'the sidebar takes its new name');
  assert.equal($(shell, 'im-status').textContent, 'Status 2');
  assert.equal($(shell, 'im-content').textContent, 'Content 2');
  assert.equal($(shell, 'im-actions').textContent, 'Apply 2');
  assert.equal($(shell, 'im-footer').textContent, 'Footer 2');
  assert.equal(shell.children.filter((el) => el.classList.contains('im-shell-skip-link')).length, 1, 'one skip link');
});

test('a repaint never touches the inspector, whatever the markup puts in it', () => {
  const shell = mount(frame('1'));
  const inspector = $(shell, 'im-inspector');
  inspector.removeAttribute('hidden');
  const form = new FakeElement('form');
  const input = new FakeElement('input');
  input.setAttribute('value', 'typed by the person');
  form.append(input);
  inspector.append(form);
  const markup = frame('2').replace('hidden></section>', 'hidden><p>Not this</p></section>');
  renderShellFrame(shell as unknown as HTMLElement, markup);
  assert.equal($(shell, 'im-inspector'), inspector);
  assert.equal(inspector.hasAttribute('hidden'), false, 'an open inspector stays open');
  assert.equal(inspector.childNodes.length, 1, 'nothing is added to it');
  assert.equal(inspector.childNodes[0], form, 'its content is the same form');
  assert.equal(input.getAttribute('value'), 'typed by the person');
});

test('a repaint while a dialog is open leaves the dialog, the notices and what the dialog made inert', () => {
  const shell = mount(frame('1'));
  const layer = new FakeElement('div');
  layer.setAttribute('data-im-layer', 'dialog');
  const notices = new FakeElement('div');
  notices.setAttribute('data-im-notices', '');
  shell.append(layer, notices);
  const skip = shell.children[0];
  for (const region of [skip, $(shell, 'im-body')]) region.setAttribute('inert', '');
  renderShellFrame(shell as unknown as HTMLElement, frame('2'));
  assert.ok(shell.contains(layer) && shell.contains(notices), 'the dialog layer and the notices are still in the shell');
  assert.equal(shell.children[0], skip, 'the skip link is the same element');
  assert.equal(skip.hasAttribute('inert'), true, 'the skip link stays inert');
  assert.equal($(shell, 'im-body').hasAttribute('inert'), true, 'the body stays inert');
  assert.equal(skip.textContent, 'Skip to content');
});

test('an optional region that goes is removed, and comes back in its place', () => {
  const shell = mount(frame('1'));
  const order = () => $(shell, 'im-work').children.map((el) => el.getAttribute('class'));
  for (const [option, region] of [['statusHtml', 'im-status'], ['actionsHtml', 'im-actions'], ['footerHtml', 'im-footer']] as const) {
    renderShellFrame(shell as unknown as HTMLElement, frame('2', { [option]: undefined }));
    assert.equal(shell.find(region), null, `${region} is gone`);
    renderShellFrame(shell as unknown as HTMLElement, frame('3'));
    assert.deepEqual(order(), ['im-status', 'im-columns', 'im-actions', 'im-footer'], `${region} comes back in its place`);
    assert.match($(shell, region).textContent, /3$/);
  }
  renderShellFrame(shell as unknown as HTMLElement, frame('4', { statusHtml: undefined, actionsHtml: undefined, footerHtml: undefined }));
  assert.deepEqual(order(), ['im-columns']);
  renderShellFrame(shell as unknown as HTMLElement, frame('5'));
  assert.deepEqual(order(), ['im-status', 'im-columns', 'im-actions', 'im-footer'], 'all three come back in order');

  renderShellFrame(shell as unknown as HTMLElement, frame('6', { sidebarHtml: undefined }));
  assert.equal(shell.find('im-sidebar'), null, 'the sidebar is gone');
  assert.equal(shell.getAttribute('data-im-sidebar'), 'off');
  renderShellFrame(shell as unknown as HTMLElement, frame('7'));
  assert.deepEqual($(shell, 'im-body').children.map((el) => el.getAttribute('class')), ['im-panel im-sidebar', 'im-work'], 'the sidebar comes back before the work area');
  assert.equal(shell.getAttribute('data-im-sidebar'), 'on');
});

test('the controls the package wires keep their element: the sidebar button, the fold button, the splitter, the window buttons', () => {
  const shell = mount(frame('1'));
  const toggle = $(shell, 'im-sidebar-toggle');
  const fold = $(shell, 'im-sidebar-collapse');
  const buttons = $(shell, 'im-window-buttons');
  const splitter = new FakeElement('div');
  splitter.setAttribute('class', 'im-splitter im-sidebar-splitter');
  $(shell, 'im-sidebar').append(splitter);
  // what sidebarDrawer, sidebarCollapse and mountWindowControls set on them
  toggle.setAttribute('aria-expanded', 'true');
  shell.setAttribute('data-im-sidebar-collapsed', 'true');
  fold.setAttribute('aria-expanded', 'false');
  fold.setAttribute('aria-label', 'Unfold 1');
  buttons.find('im-window-button')?.setAttribute('data-im-os', 'hover');

  renderShellFrame(shell as unknown as HTMLElement, frame('2'));
  assert.equal($(shell, 'im-sidebar-toggle'), toggle, 'the sidebar button is the same element');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true', 'and keeps the state sidebarDrawer gave it');
  assert.equal($(shell, 'im-sidebar-collapse'), fold, 'the fold button is the same element');
  assert.equal(fold.getAttribute('aria-expanded'), 'false', 'and keeps the state sidebarCollapse gave it');
  assert.equal(fold.getAttribute('aria-label'), 'Unfold 2', 'its name is the new expand label while the sidebar is folded');
  assert.equal(fold.getAttribute('title'), 'Unfold 2');
  assert.equal(fold.getAttribute('data-im-label-collapse'), 'Fold 2', 'and it takes the new labels');
  assert.equal($(shell, 'im-window-buttons'), buttons, 'the window buttons are the same elements');
  assert.equal(buttons.find('im-window-button')?.getAttribute('data-im-os'), 'hover');
  assert.equal($(shell, 'im-sidebar').children.at(-1), splitter, 'the splitter stays at the end of the sidebar');
  assert.equal($(shell, 'im-sidebar').find('im-row')?.textContent, 'Row 2');

  shell.removeAttribute('data-im-sidebar-collapsed');
  renderShellFrame(shell as unknown as HTMLElement, frame('3'));
  assert.equal(fold.getAttribute('aria-label'), 'Fold 3', 'unfolded, its name is the collapse label');
  renderShellFrame(shell as unknown as HTMLElement, frame('4').replace(TOGGLE, ''));
  assert.equal(shell.find('im-sidebar-toggle'), null, 'a control the markup no longer has goes');
});

test('renderShellFrame refuses a frame without its fixed regions and changes nothing', () => {
  const shell = mount(frame('1'));
  const content = $(shell, 'im-content');
  for (const broken of [
    frame('2').replace(/<section class="im-panel im-inspector"[^>]*><\/section>/, ''),
    frame('2').replace('<div class="im-panel-body"><p>Content 2</p></div>', '<p>Content 2</p>'),
    '<header class="im-titlebar"></header><div class="im-body"><main>Old frame</main></div>',
  ]) {
    assert.throws(() => renderShellFrame(shell as unknown as HTMLElement, broken), /needs/);
    assert.equal(content.textContent, 'Content 1', 'the mounted frame is as it was');
  }
  const old = new FakeElement('div');
  old.append(...parse('<header class="im-titlebar"></header><div class="im-body"><main class="im-content">Old</main></div>').childNodes);
  assert.throws(() => renderShellFrame(old as unknown as HTMLElement, frame('2')), /incomplete/);
});

test('window buttons provide the native selectors and both maximize/restore icons', () => {
  const html = windowButtonsHtml({ minimize: 'Hide <window>', maximize: 'Grow', close: 'Close' });
  assert.deepEqual([...html.matchAll(/data-im-window="([^"]+)"/g)].map(match => match[1]), ['minimize', 'maximize', 'close']);
  assert.equal(html.match(/<svg/g)?.length, 4);
  assert.match(html, /aria-label="Hide &lt;window&gt;"/);
  assert.doesNotMatch(titlebarHtml({ brand: { name: 'Example' } }), /im-window-buttons/);
  assert.match(titlebarHtml({ brand: { name: 'Example' }, windowControls: true }), /im-window-buttons/);
});

test('banners announce errors and safely render labeled details and action component slots', () => {
  const html = bannerHtml({ title: '<failure>', message: 'a & b', items: [{ label: '<item>', message: '"reason' }], tone: 'err', actionsHtml: '<button>Retry</button>' });
  assert.match(html, /data-im-tone="err" role="alert"/);
  assert.match(html, /<strong>&lt;failure&gt;<\/strong><p>a &amp; b<\/p>/);
  assert.match(html, /<li><b>&lt;item&gt;<\/b>: &quot;reason<\/li>/);
  assert.match(html, /<button>Retry<\/button>/);
  assert.match(bannerHtml({ title: 'Done', tone: 'ok' }), /role="status"/);
  assert.match(busyIndicatorHtml('<loading>'), /role="status">.*aria-hidden="true".*&lt;loading&gt;/);
  assert.match(statusButtonHtml({ label: '<ready>', accessibleLabel: 'Open "status"', action: 'status', tone: 'ok' }), /aria-label="Open &quot;status&quot;"/);
});
