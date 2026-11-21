import { Children, createElement as h, useEffect, useRef, useState } from 'react';
import { roving } from '../lib/ui/keys.js';

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

/**
 * The window: the `im-shell` root of docs/using-imago.md section 4, with the skip link and the title bar before its
 * children. Put a `Workbench` in it. `sidebar` says whether the `Workbench` has a sidebar (`data-im-sidebar`). The app,
 * the look and the theme are not the shell's: `applyLook` writes them on the root element.
 */
export function Shell({ titlebar, children, sidebar, inspector, skipLabel, ...props }) {
  return h('div', {
    ...props, className: 'im-shell', 'data-im-sidebar': sidebar ? 'on' : 'off',
    'data-im-inspector': inspector === 'wide' ? 'wide' : undefined,
  }, skipLabel != null && h('a', { className: 'im-shell-skip-link', href: '#main' }, skipLabel), titlebar, children);
}

/**
 * The body of a `Shell`: the sidebar (when there are `navigation` rows), and the work area with the content region and
 * the inspector. The inspector is always there, `hidden` while `details` is empty. The attributes of a `main` go on the
 * content region. `wide` is ignored: the inspector's width is `inspector="wide"` on the `Shell`.
 */
export function Workbench({ navigation, navigationLabel, children, details, detailsLabel, wide, ...props }) {
  const hasDetails = !isEmpty(details);
  return h('div', { className: 'im-body' },
    navigation != null && navigation !== false && h('section', { className: 'im-panel im-sidebar', id: 'sidebar', 'aria-label': navigationLabel },
      h('header', { className: 'im-panel-header' },
        h('h4', { className: 'im-panel-title' }, navigationLabel), h('span', { className: 'im-spacer' })),
      h('div', { className: 'im-panel-body im-list', role: 'group', 'aria-label': navigationLabel }, navigation)),
    h('div', { className: 'im-work' },
      h('div', { className: 'im-columns' },
        h('main', { 'aria-busy': false, ...props, id: 'main', className: 'im-panel im-content', tabIndex: -1 },
          h('div', { className: 'im-panel-body' }, children)),
        h('section', { className: 'im-panel im-inspector', 'aria-label': detailsLabel, hidden: !hasDetails }, hasDetails ? details : null))));
}

/** A native action button. Provide pressed for toggles or selectable rows. */
export function ListAction({ title, detail, icon, pressed, ...props }) {
  return h('button', { ...props, type: 'button', className: 'im-row im-row--detail', 'aria-pressed': pressed },
    icon, h('span', { className: 'im-row-text' },
      h('span', { className: 'im-row-title' }, title),
      detail != null && h('span', { className: 'im-row-sub' }, detail)));
}

export function Timeline({ items, ...props }) {
  return h('ol', { ...props, className: 'im-timeline' }, items.map(({ id, title, detail }) =>
    h('li', { key: id }, h('span', null, title), detail != null && h('span', { className: 'im-caption' }, detail))));
}
