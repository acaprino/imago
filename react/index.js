import { Children, createElement as h, useCallback, useEffect, useRef, useState } from 'react';
import { roving } from '../lib/ui/keys.js';
import { checkShellFill } from '../lib/ui/shell-frame.js';

export function TabList({ label, tabs, value, onSelect }) {
  const host = useRef(null);
  useEffect(() => roving(host.current, {
    item: '[role="tab"]', orientation: 'horizontal', onSelect: tab => tab.click(),
  }), []);
  return h('div', { ref: host, className: 'im-tabs', role: 'tablist', 'aria-label': label },
    tabs.map(tab => h('button', { key: tab.value, id: tab.id, type: 'button', role: 'tab', className: 'im-tab',
      'aria-selected': tab.value === value, 'aria-controls': tab.panel, disabled: tab.disabled,
      onClick: () => onSelect(tab.value) }, tab.label)));
}

/** Native disclosure with lazy content, useful when opening a panel starts subscriptions. */
export function Disclosure({ label, children }) {
  const [open, setOpen] = useState(false);
  return h('details', { className: 'im-disclosure', onToggle: event => setOpen(event.currentTarget.open) },
    h('summary', null, label), open && children);
}

/** Whether a React node draws nothing: null, undefined, a boolean, an empty string, or a list of those. */
const isEmpty = node => Children.toArray(node).every(child => child === '');
/** Whether a region is given: anything but null, undefined and false, as `navigation`. */
const given = node => node != null && node !== false;

/**
 * The window: the `im-shell` root of docs/using-imago.md section 4, with the skip link and the title bar before its
 * children. Put a `Workbench` in it, and mount it in a root that carries `im-root` (`<div id="app" class="im-root">`),
 * so it fills the window: mounted, a shell that does not is said on the console (`checkShellFill`). `sidebar` says
 * whether the `Workbench` has a sidebar (`data-im-sidebar`). The skip link goes to `contentId`, the id of the
 * `Workbench`'s content region; without it, to the `contentId` of a `Workbench` that is a direct child, else `main`. The
 * app, the look and the theme are not the shell's: `applyLook` writes them on the root element.
 */
export function Shell({ titlebar, children, sidebar, inspector, skipLabel, contentId, ref, ...props }) {
  const workbench = Children.toArray(children).find(child => child?.type === Workbench);
  const target = contentId ?? workbench?.props.contentId ?? 'main';
  // React 19 hands a function component its ref as a prop: the app's ref still gets the element.
  const mount = useCallback(element => {
    if (element) checkShellFill(element);
    if (typeof ref === 'function') return ref(element);
    if (ref) ref.current = element;
    return undefined;
  }, [ref]);
  return h('div', {
    ...props, ref: mount, className: 'im-shell', 'data-im-sidebar': sidebar ? 'on' : 'off',
    'data-im-inspector': inspector === 'wide' ? 'wide' : undefined,
  }, skipLabel != null && h('a', { className: 'im-shell-skip-link', href: `#${target}` }, skipLabel), titlebar, children);
}

/**
 * The body of a `Shell`: the sidebar (when there are `navigation` rows), and the work area: the status row, the columns
 * with the content region and the inspector, the action bar and the footer. The inspector is always there, `hidden`
 * while `details` is empty; the status row, the action bar and the footer are there when they are given. The attributes
 * of a `main` go on the content region. `wide` is ignored: the inspector's width is `inspector="wide"` on the `Shell`.
 */
export function Workbench({ navigation, navigationLabel, children, details, detailsLabel, status, actions, footer, contentId = 'main', sidebarId = 'sidebar', wide, ...props }) {
  const hasDetails = !isEmpty(details);
  return h('div', { className: 'im-body' },
    given(navigation) && h('section', { className: 'im-panel im-sidebar', id: sidebarId, 'aria-label': navigationLabel },
      h('header', { className: 'im-panel-header' },
        h('h4', { className: 'im-panel-title' }, navigationLabel), h('span', { className: 'im-spacer' })),
      h('div', { className: 'im-panel-body im-list', role: 'group', 'aria-label': navigationLabel }, navigation)),
    h('div', { className: 'im-work' },
      given(status) && h('div', { className: 'im-status' }, status),
      h('div', { className: 'im-columns' },
        h('main', { 'aria-busy': false, ...props, id: contentId, className: 'im-panel im-content', tabIndex: -1 },
          h('div', { className: 'im-panel-body' }, children)),
        h('section', { className: 'im-panel im-inspector', 'aria-label': detailsLabel, hidden: !hasDetails }, hasDetails ? details : null)),
      given(actions) && h('div', { className: 'im-actions' }, actions),
      given(footer) && h('footer', { className: 'im-footer' }, footer)));
}

/**
 * A native action button, a row of a list. Provide pressed for toggles or selectable rows. `title` is the row's title;
 * `tooltip` is the button's HTML `title`. `rail` is what the row shows in the rail, in a `span.im-rail-item`: an icon, or
 * the row's initials.
 */
export function ListAction({ title, detail, icon, rail, tooltip, pressed, ...props }) {
  return h('button', { ...props, type: 'button', className: 'im-row im-row--detail', title: tooltip, 'aria-pressed': pressed },
    given(rail) && h('span', { className: 'im-rail-item', 'aria-hidden': true }, rail),
    icon, h('span', { className: 'im-row-text' },
      h('span', { className: 'im-row-title' }, title),
      detail != null && h('span', { className: 'im-row-sub' }, detail)));
}

export function Timeline({ items, ...props }) {
  return h('ol', { ...props, className: 'im-timeline' }, items.map(({ id, title, detail }) =>
    h('li', { key: id }, h('span', null, title), detail != null && h('span', { className: 'im-caption' }, detail))));
}
