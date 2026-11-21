import { createElement as h, useEffect, useRef, useState } from 'react';
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

export function Workbench({ navigation, children, details, ...props }) {
  return h('main', { ...props, className: 'im-workbench' },
    h('aside', { className: 'im-navigation-panel' }, navigation), children, details);
}

export function DetailPanel({ children, ...props }) {
  return h('section', { ...props, className: 'im-detail-panel' }, children);
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
