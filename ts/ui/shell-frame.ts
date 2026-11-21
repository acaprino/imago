// Repaints a mounted frame (`shellFrameHtml`) from new markup. The shell keeps its region elements: the title bar,
// the body, the work area, the columns, the content and the inspector are never replaced, so what holds a reference to
// them keeps working. The dialog's inert body stays inert and the layers and notices in the shell stay where they are.
// The inspector is not touched at all: its content, and the values a person typed in it, are the inspector's own.
//
// What is inside the title bar, the sidebar, the status row, the content's panel body, the action bar and the footer is
// replaced. A region the markup no longer has is removed, and one it has again is put back in its place; a sidebar that
// comes back is a new element, which the app wires again (`sidebarDrawer`, `sidebarCollapse`, `sidebarResize`), as after
// the first paint. Focus inside a replaced region is the app's to restore (`captureDomState`, `restoreDomState`).

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
  contentBody: Element | null;
  inspector: Element | null;
  actions: Element | null;
  footer: Element | null;
};
type Complete = { [K in keyof Frame]: K extends 'skip' | 'sidebar' | 'status' | 'actions' | 'footer' ? Element | null : Element };

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
    status: child(work, 'im-status'), columns, content, contentBody: child(content, 'im-panel-body'),
    inspector: child(columns, 'im-inspector'), actions: child(work, 'im-actions'), footer: child(work, 'im-footer'),
  };
}

const complete = (frame: Frame): frame is Complete =>
  !!(frame.titlebar && frame.body && frame.work && frame.columns && frame.content && frame.contentBody && frame.inspector);

/** Gives `mounted` the attributes of `incoming`. An attribute a script set and the markup does not write (`inert`) stays. */
function takeAttributes(mounted: Element, incoming: Element): void {
  for (const { name, value } of Array.from(incoming.attributes)) mounted.setAttribute(name, value);
}

/** The children and attributes of `incoming` into `mounted`; `incoming` alone is put in with `place`; `mounted` alone goes. */
function repaint(mounted: Element | null, incoming: Element | null, place: (region: Element) => void): void {
  if (mounted && incoming) {
    takeAttributes(mounted, incoming);
    mounted.replaceChildren(...Array.from(incoming.childNodes));
  } else if (incoming) place(incoming);
  else mounted?.remove();
}

// The controls a module of the package wires in place keep their element, with its listeners and the state the module
// set on it: the sidebar's button (sidebarDrawer) and fold button (sidebarCollapse), which take their other attributes
// and their children from the markup, and the window buttons (mountWindowControls), which stay as they are.
const SCRIPTED: Record<string, readonly string[] | null> = {
  'im-sidebar-toggle': ['aria-expanded'],
  'im-sidebar-collapse': ['aria-expanded', 'aria-label', 'title'],
  'im-window-buttons': null,
};

/** Puts the mounted control in the place of its copy in the incoming markup, before the markup moves in. */
function keep(mountedRegion: Element, incomingRegion: Element, name: string): Element | null {
  const mounted = find(mountedRegion, name);
  const incoming = find(incomingRegion, name);
  if (!mounted || !incoming) return null;
  const scripted = SCRIPTED[name];
  if (scripted) {
    for (const { name: attribute, value } of Array.from(incoming.attributes)) {
      if (!scripted.includes(attribute)) mounted.setAttribute(attribute, value);
    }
    mounted.replaceChildren(...Array.from(incoming.childNodes));
  }
  incoming.replaceWith(mounted);
  return mounted;
}

/**
 * Repaint shell content while preserving the regions that own modality, the inspector and every overlay host.
 * The complete next frame is validated before anything changes. Markup must come from trusted Imago composition
 * (`shellFrameHtml`), with external values escaped.
 */
export function renderShellFrame(shell: HTMLElement, markup: string): void {
  const template = shell.ownerDocument.createElement('template');
  template.innerHTML = markup;
  const next = regionsOf(template.content);
  if (!complete(next)) throw new Error('An Imago frame needs ' + REGIONS);
  const mounted = regionsOf(shell);
  const sidebar = next.sidebar ? 'on' : 'off';
  if (!mounted.titlebar && !mounted.body) {
    shell.setAttribute('data-im-sidebar', sidebar);
    shell.replaceChildren(template.content);
    return;
  }
  if (!complete(mounted)) throw new Error('The mounted Imago frame is incomplete: it needs ' + REGIONS);
  shell.setAttribute('data-im-sidebar', sidebar);

  repaint(mounted.skip, next.skip, (link) => mounted.titlebar.before(link));
  keep(mounted.titlebar, next.titlebar, 'im-sidebar-toggle');
  keep(mounted.titlebar, next.titlebar, 'im-window-buttons');
  repaint(mounted.titlebar, next.titlebar, () => {});

  if (mounted.sidebar && next.sidebar) {
    const fold = keep(mounted.sidebar, next.sidebar, 'im-sidebar-collapse');
    // The splitter of sidebarResize is the package's own child of the sidebar: it stays, at the end.
    const splitters = Array.from(mounted.sidebar.children).filter((element) => element.classList.contains('im-sidebar-splitter'));
    repaint(mounted.sidebar, next.sidebar, () => {});
    mounted.sidebar.append(...splitters);
    // Its name follows the shell's state, as sidebarCollapse names it, from the labels the markup now gives.
    const label = fold?.getAttribute(shell.getAttribute('data-im-sidebar-collapsed') === 'true' ? 'data-im-label-expand' : 'data-im-label-collapse');
    if (fold && label) {
      fold.setAttribute('aria-label', label);
      fold.setAttribute('title', label);
    }
  } else repaint(mounted.sidebar, next.sidebar, (region) => mounted.work.before(region));

  repaint(mounted.status, next.status, (region) => mounted.columns.before(region));
  takeAttributes(mounted.content, next.content);
  repaint(mounted.contentBody, next.contentBody, () => {});
  repaint(mounted.actions, next.actions, (region) => mounted.columns.after(region));
  const actions = child(mounted.work, 'im-actions');
  repaint(mounted.footer, next.footer, (region) => (actions ?? mounted.columns).after(region));
}
