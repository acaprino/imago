// Repaints a mounted frame (`shellFrameHtml`) from new markup. Every element of the frame stays the same element for the
// life of the shell, so what holds a reference to it keeps working: the title bar, the body, the work area, the columns,
// the content with its panel body and the inspector are never replaced, and the dialog's inert body stays inert. The
// layers and notices in the shell stay where they are. The inspector is not touched at all: its content, and the values
// a person typed in it, are the inspector's own.
//
// What is inside the title bar, the sidebar, the status row, the content's header, tools, body and foot, the action bar
// and the footer is replaced. A region the markup no longer has is taken out and kept; when the markup has it again, the
// same element goes back in its place, with what the markup now gives it. So a sidebar that goes and comes back is the
// sidebar `sidebarDrawer`, `sidebarCollapse` and `sidebarResize` were wired to, and the title bar's sidebar button and
// window buttons are the ones `sidebarDrawer` and `mountWindowControls` hold: nothing is wired again. The sidebar's list
// stays the same element in its place, with its scroll, and takes the new rows. A kept control or region that held the
// focus holds it after the repaint, and so does a control the markup replaced (a row, a field) when it can be found again:
// by its `data-im-key` or `id`, or its `data-action`, `data-id` or `name` (`captureFocus`, `restoreFocus`: the caret of a
// field too). A replaced control with none of those cannot be, and the focus falls to the page.

import { captureFocus, restoreFocus } from './dom-state.ts';

const REGIONS = 'a title bar, a body, a work area, columns, a content region with its panel body and an inspector';

type Frame = {
  skip: Element | null;
  titlebar: Element | null;
  body: Element | null;
  sidebar: Element | null;
  work: Element | null;
  status: Element | null;
  columns: Element | null;
  content: Element | null;
  contentHeader: Element | null;
  contentTools: Element | null;
  contentBody: Element | null;
  contentFoot: Element | null;
  inspector: Element | null;
  actions: Element | null;
  footer: Element | null;
};
type Fixed = 'titlebar' | 'body' | 'work' | 'columns' | 'content' | 'contentBody' | 'inspector';
type Complete = { [K in keyof Frame]: K extends Fixed ? Element : Element | null };

/** The child of `parent` that has the class, where the frame's markup puts each region. */
const child = (parent: ParentNode | null, name: string): Element | null =>
  parent ? Array.from(parent.children).find((element) => element.classList.contains(name)) ?? null : null;

/** The first element under `root` that has the class. */
function find(root: ParentNode, name: string): Element | null {
  for (const element of Array.from(root.children)) {
    if (element.classList.contains(name)) return element;
    const found = find(element, name);
    if (found) return found;
  }
  return null;
}

function regionsOf(root: ParentNode): Frame {
  const body = child(root, 'im-body');
  const work = child(body, 'im-work');
  const columns = child(work, 'im-columns');
  const content = child(columns, 'im-content');
  return {
    skip: child(root, 'im-shell-skip-link'), titlebar: child(root, 'im-titlebar'), body, sidebar: child(body, 'im-sidebar'), work,
    status: child(work, 'im-status'), columns, content,
    contentHeader: child(content, 'im-panel-header'), contentTools: child(content, 'im-panel-tools'),
    contentBody: child(content, 'im-panel-body'), contentFoot: child(content, 'im-panel-foot'),
    inspector: child(columns, 'im-inspector'), actions: child(work, 'im-actions'), footer: child(work, 'im-footer'),
  };
}

const complete = (frame: Frame): frame is Complete =>
  !!(frame.titlebar && frame.body && frame.work && frame.columns && frame.content && frame.contentBody && frame.inspector);

/**
 * Gives `mounted` the attributes of `incoming`, and removes none. An attribute a script set and the markup does not write
 * (`inert`) stays; so does one an earlier paint wrote and the markup now drops: the markup takes an attribute away by
 * writing its new value (`aria-busy="false"`), not by leaving it out.
 */
function takeAttributes(mounted: Element, incoming: Element): void {
  for (const { name, value } of Array.from(incoming.attributes)) mounted.setAttribute(name, value);
}

/** The attributes and the children of `incoming`, into `target`. */
function fill(target: Element, incoming: Element): void {
  takeAttributes(target, incoming);
  target.replaceChildren(...Array.from(incoming.childNodes));
}

// The elements of a frame that are out of it for now, per shell and by name: a region or a wired control the markup left
// out, kept until the markup has it again.
const away = new WeakMap<Element, Map<string, Element>>();

// The controls a module of the package wires in place keep their element, with its listeners and the state the module
// set on it: the sidebar's button (sidebarDrawer) and fold button (sidebarCollapse), which take their other attributes
// and their children from the markup, and the window buttons (mountWindowControls), which stay as they are.
const SCRIPTED: Record<string, readonly string[] | null> = {
  'im-sidebar-toggle': ['aria-expanded'],
  'im-sidebar-collapse': ['aria-expanded', 'aria-label', 'title'],
  'im-window-buttons': null,
};

// The shells measured once, and those waiting for the frame that measures them.
const measured = new WeakSet<Element>();
const pending = new WeakSet<Element>();

/**
 * Says once on the console, with the fix, that a shell does not fill the window: once it is drawn, its height or its
 * content region's is 0 while the window's is not. That is a shell in a parent of no height of its own (React's
 * `<div id="app">` without `im-root`), and nothing else would say it. One measure per shell, a frame after the first
 * call; a shell that is not on screen yet is measured at a later call. `renderShellFrame` and the React `Shell` call it.
 */
export function checkShellFill(shell: HTMLElement): void {
  const win = shell.ownerDocument.defaultView;
  if (measured.has(shell) || pending.has(shell) || !win?.requestAnimationFrame) return;
  pending.add(shell);
  win.requestAnimationFrame(() => {
    pending.delete(shell);
    if (!shell.isConnected || !shell.getClientRects().length || !win.innerHeight) return;
    measured.add(shell);
    const content = shell.querySelector('.im-content');
    const height = shell.getBoundingClientRect().height;
    const inside = content ? content.getBoundingClientRect().height : height;
    if (height > 0 && inside > 0) return;
    console.warn(`Imago: the shell is ${Math.round(height)}px tall and its content region ${Math.round(inside)}px, in a window `
      + `${win.innerHeight}px tall: its parent does not fill the window. Put the shell directly in <body>, or give every element `
      + 'between <body> and the shell the class im-root: <div id="app" class="im-root">.');
  });
}

/**
 * Repaint shell content while preserving the regions that own modality, the inspector and every overlay host.
 * The complete next frame is validated before anything changes. Markup must come from trusted Imago composition
 * (`shellFrameHtml`), with external values escaped. A shell that does not fill the window is said on the console
 * (`checkShellFill`).
 */
export function renderShellFrame(shell: HTMLElement, markup: string): void {
  const template = shell.ownerDocument.createElement('template');
  template.innerHTML = markup;
  const next = regionsOf(template.content);
  if (!complete(next)) throw new Error('An Imago frame needs ' + REGIONS);
  const mounted = regionsOf(shell);
  const sidebar = next.sidebar ? 'on' : 'off';
  checkShellFill(shell);
  if (!mounted.titlebar && !mounted.body) {
    away.delete(shell);
    shell.setAttribute('data-im-sidebar', sidebar);
    shell.replaceChildren(template.content);
    return;
  }
  if (!complete(mounted)) throw new Error('The mounted Imago frame is incomplete: it needs ' + REGIONS);
  shell.setAttribute('data-im-sidebar', sidebar);
  const kept = away.get(shell) ?? new Map<string, Element>();
  away.set(shell, kept);
  // A kept control is moved into the new markup, and a moved element loses the focus: it is given back at the end.
  const doc = shell.ownerDocument;
  const focused = doc.activeElement;
  const held = focused && focused !== shell && shell.contains(focused) ? focused : null;
  const snapshot = held ? captureFocus(shell) : null;

  /**
   * One region: the mounted element, or the one kept from when it went, takes what the incoming one gives (`update`)
   * and, if it is not in the frame, goes in with `place`. One the markup no longer has is taken out and kept.
   */
  const region = (key: string, current: Element | null, incoming: Element | null, place: (element: Element) => void, update = fill): void => {
    if (!incoming) {
      if (current) {
        kept.set(key, current);
        current.remove();
      }
      return;
    }
    const target = current ?? kept.get(key) ?? null;
    if (!target) {
      place(incoming);
      return;
    }
    kept.delete(key);
    update(target, incoming);
    if (!current) place(target);
  };

  /** Puts the wired control in the place of its copy in the incoming markup, before the markup moves in. */
  const keep = (target: Element, incomingRegion: Element, name: string): Element | null => {
    const inFrame = find(target, name);
    const incoming = find(incomingRegion, name);
    if (!incoming) {
      // it goes with the children it was among; kept, it comes back when the markup has it again
      if (inFrame) kept.set(name, inFrame);
      return null;
    }
    const control = inFrame ?? kept.get(name) ?? null;
    if (!control) return null;
    kept.delete(name);
    const scripted = SCRIPTED[name];
    if (scripted) {
      for (const { name: attribute, value } of Array.from(incoming.attributes)) {
        if (!scripted.includes(attribute)) control.setAttribute(attribute, value);
      }
      control.replaceChildren(...Array.from(incoming.childNodes));
    }
    incoming.replaceWith(control);
    return control;
  };

  region('skip', mounted.skip, next.skip, (link) => mounted.titlebar.before(link));
  keep(mounted.titlebar, next.titlebar, 'im-sidebar-toggle');
  keep(mounted.titlebar, next.titlebar, 'im-window-buttons');
  fill(mounted.titlebar, next.titlebar);

  region('sidebar', mounted.sidebar, next.sidebar, (element) => mounted.work.before(element), (target, incoming) => {
    keep(target, incoming, 'im-sidebar-collapse');
    // The splitter of sidebarResize is the package's own child of the sidebar: it stays, at the end.
    const splitters = Array.from(target.children).filter((element) => element.classList.contains('im-sidebar-splitter'));
    const list = child(target, 'im-panel-body');
    const nextList = child(incoming, 'im-panel-body');
    if (list && nextList) {
      // The list never leaves the frame, so it keeps its scroll: it takes the new rows, and what is round it (the header,
      // a tools row, the foot) is replaced.
      takeAttributes(target, incoming);
      const parts = Array.from(incoming.childNodes);
      const at = parts.indexOf(nextList);
      for (const node of Array.from(target.childNodes)) {
        if (node !== list && !splitters.includes(node as Element)) node.remove();
      }
      fill(list, nextList);
      list.before(...parts.slice(0, at));
      list.after(...parts.slice(at + 1));
    } else {
      fill(target, incoming);
      target.append(...splitters);
    }
  });
  // The fold button's name and aria-expanded follow the shell's state, as sidebarCollapse sets them, with the labels the
  // markup now gives: on the button the module wired, or on one the markup gives for the first time.
  const shown = child(mounted.body, 'im-sidebar');
  const fold = shown ? find(shown, 'im-sidebar-collapse') : null;
  if (fold) {
    const collapsed = shell.getAttribute('data-im-sidebar-collapsed') === 'true';
    const label = fold.getAttribute(collapsed ? 'data-im-label-expand' : 'data-im-label-collapse');
    if (label) {
      fold.setAttribute('aria-label', label);
      fold.setAttribute('title', label);
    }
    fold.setAttribute('aria-expanded', String(!collapsed));
  }

  region('status', mounted.status, next.status, (element) => mounted.columns.before(element));
  takeAttributes(mounted.content, next.content);
  region('content-header', mounted.contentHeader, next.contentHeader, (element) => mounted.content.prepend(element));
  region('content-tools', mounted.contentTools, next.contentTools, (element) => mounted.contentBody.before(element));
  fill(mounted.contentBody, next.contentBody);
  region('content-foot', mounted.contentFoot, next.contentFoot, (element) => mounted.contentBody.after(element));
  region('actions', mounted.actions, next.actions, (element) => mounted.columns.after(element));
  region('footer', mounted.footer, next.footer, (element) => (child(mounted.work, 'im-actions') ?? mounted.columns).after(element));

  if (held && !shell.contains(held)) restoreFocus(shell, snapshot);
  else if (held && doc.activeElement !== held && 'focus' in held) (held as HTMLElement).focus({ preventScroll: true });
}
