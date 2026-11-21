import { isIconName } from './icon.ts';
import { escapeHtml, iconHtml } from './markup.ts';
import { chipToneAttribute, toneAttribute, type ChipTone, type Tone } from './tone.ts';

/** String-rendered shell components. Text is escaped; named HTML slots contain trusted component output. */
export interface NavigationTab {
  id: string;
  label: string;
  icon?: string;
  count?: number;
  countLabel?: string;
  controls?: string;
}

export function tabNavigationHtml(tabs: readonly NavigationTab[], selected: string, options: { label: string; action: string }): string {
  const active = tabs.some(tab => tab.id === selected) ? selected : tabs[0]?.id;
  return `<nav class="im-tabs" role="tablist" aria-label="${escapeHtml(options.label)}">${tabs.map(tab => {
    const current = tab.id === active;
    const count = typeof tab.count === 'number' && Number.isFinite(tab.count) && tab.count > 0 ? tab.count : 0;
    return `<button type="button" class="im-tab" role="tab" data-action="${escapeHtml(options.action)}" data-id="${escapeHtml(tab.id)}" ${current ? 'aria-current="page" aria-selected="true"' : 'aria-selected="false"'} tabindex="${current ? 0 : -1}"${tab.controls ? ` aria-controls="${escapeHtml(tab.controls)}"` : ''}${count && tab.countLabel ? ` aria-label="${escapeHtml(tab.label + ', ' + tab.countLabel)}"` : ''}>${tab.icon ? iconHtml(tab.icon) : ''}<span class="label">${escapeHtml(tab.label)}</span>${count ? `<span class="im-count" aria-hidden="true">${count}</span>` : ''}</button>`;
  }).join('')}</nav>`;
}

/** The words of the window buttons: each one's accessible name and its tooltip (`title`), as an icon-only control has both. */
export interface WindowButtonLabels { minimize: string; maximize: string; close: string; minimizeTitle: string; maximizeTitle: string; closeTitle: string }
export function windowButtonsHtml(labels: WindowButtonLabels = { minimize: 'Minimize window', maximize: 'Maximize window', close: 'Close window', minimizeTitle: 'Minimize', maximizeTitle: 'Maximize', closeTitle: 'Close' }): string {
  const svg = (body: string) => `<svg class="im-icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const icons = {
    minimize: svg('<path d="M5 12h14"/>'),
    maximize: svg('<rect x="6" y="6" width="12" height="12"/>') + svg('<path d="M8 8V4h12v12h-4M4 8h12v12H4z"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  };
  const titles = { minimize: labels.minimizeTitle, maximize: labels.maximizeTitle, close: labels.closeTitle };
  return `<div class="im-window-buttons">${(['minimize', 'maximize', 'close'] as const).map(name => `<button type="button" class="im-window-button" data-im-window="${name}" aria-label="${escapeHtml(labels[name])}" title="${escapeHtml(titles[name])}">${icons[name]}</button>`).join('')}</div>`;
}

export interface TitlebarOptions {
  brand: { name: string; image?: string };
  /** The button that opens the sidebar as a drawer under 620 (`sidebarDrawer`): its name and the id of the sidebar. */
  sidebarToggle?: { label: string; controls: string };
  navigationHtml?: string;
  views?: { label: string; action: string };
  statusHtml?: string;
  commands?: { label: string; action: string; shortcut?: string };
  windowControls?: boolean | WindowButtonLabels;
}
export function titlebarHtml(options: TitlebarOptions): string {
  const { brand, sidebarToggle, views, commands } = options;
  const brandHtml = brand.image ? `<img class="im-brand-image" src="${escapeHtml(brand.image)}" alt="${escapeHtml(brand.name)}" data-tauri-drag-region>` : `<span class="im-wordmark" data-tauri-drag-region>${escapeHtml(brand.name)}</span>`;
  const toggleHtml = sidebarToggle ? `<button type="button" class="im-icon-btn im-sidebar-toggle" aria-label="${escapeHtml(sidebarToggle.label)}" title="${escapeHtml(sidebarToggle.label)}" aria-expanded="false" aria-controls="${escapeHtml(sidebarToggle.controls)}">${iconHtml('sidebar')}</button>` : '';
  return `<header class="im-titlebar" data-tauri-drag-region><div class="im-brand" data-tauri-drag-region>${brandHtml}</div>${toggleHtml}${options.navigationHtml ?? ''}${views ? `<button type="button" class="im-btn im-btn--ghost im-views-menu" data-action="${escapeHtml(views.action)}">${escapeHtml(views.label)}</button>` : ''}<span class="im-spacer" data-tauri-drag-region></span>${options.statusHtml ?? ''}${commands ? `<button type="button" class="im-titlebar-command" data-action="${escapeHtml(commands.action)}" aria-label="${escapeHtml(commands.label)}">${escapeHtml(commands.label)}${commands.shortcut ? ` <kbd class="im-key">${escapeHtml(commands.shortcut)}</kbd>` : ''}</button>` : ''}${options.windowControls ? windowButtonsHtml(typeof options.windowControls === 'object' ? options.windowControls : undefined) : ''}</header>`;
}

export interface StatusButtonOptions {
  label: string;
  accessibleLabel: string;
  action: string;
  id?: string;
  /** The tone of the dot: a status tone, the accent, or none (`''`). */
  tone: ChipTone;
}
export function statusButtonHtml(options: StatusButtonOptions): string {
  return `<button type="button" class="im-btn im-btn--ghost im-titlebar-status" data-action="${escapeHtml(options.action)}"${options.id === undefined ? '' : ` data-id="${escapeHtml(options.id)}"`} aria-label="${escapeHtml(options.accessibleLabel)}"><i class="im-dot"${chipToneAttribute(options.tone)} aria-hidden="true"></i><span>${escapeHtml(options.label)}</span></button>`;
}

export interface NoteOptions {
  /** An icon of the package (`IconName`), before the note's text; an unknown name writes no icon. */
  icon?: string;
  title?: string;
  message?: string;
  items?: readonly { label: string; message: string }[];
  /** Trusted component markup: the note's buttons. */
  actionsHtml?: string;
  /** A status tone: a note is a message, and the accent is not a status. */
  tone?: Tone;
}
/**
 * A message that stays in the page. A title and a line make the compact `im-note` of the design (its icon, then the
 * title in `b` and the line in `span`); a list or actions make an `im-note--block`, its icon, title, paragraph, list and
 * actions one under the other. An `err` or `warn` note is announced at once (`role="alert"`), any other as a status.
 * Text is escaped.
 */
export function noteHtml(options: NoteOptions): string {
  const { title, message, items, actionsHtml } = options;
  const role = options.tone === 'err' || options.tone === 'warn' ? 'alert' : 'status';
  const icon = options.icon && isIconName(options.icon) ? iconHtml(options.icon) : '';
  const open = (block: boolean): string => `<div class="im-note${block ? ' im-note--block' : ''}"${toneAttribute(options.tone)} role="${role}">${icon}`;
  if (!items?.length && !actionsHtml) {
    return `${open(false)}<div>${title ? `<b>${escapeHtml(title)}</b>` : ''}${message ? `<span>${escapeHtml(message)}</span>` : ''}</div></div>`;
  }
  return open(true)
    + (title ? `<b>${escapeHtml(title)}</b>` : '')
    + (message ? `<p>${escapeHtml(message)}</p>` : '')
    + (items?.length ? `<ul>${items.map(item => `<li><b>${escapeHtml(item.label)}</b>: ${escapeHtml(item.message)}</li>`).join('')}</ul>` : '')
    + (actionsHtml ? `<div class="im-action-row">${actionsHtml}</div>` : '')
    + '</div>';
}

/** A constrained page inside the shell's scrolling content area. */
export function pageContentHtml(contentHtml: string, width: 'normal' | 'narrow' = 'normal'): string {
  return `<div class="im-page-content${width === 'narrow' ? ' im-page-content--narrow' : ''}">${contentHtml}</div>`;
}

export interface ShellFrameOptions {
  titlebarHtml: string;
  /** What the content region shows: its panel body's children. The body scrolls. */
  contentHtml: string;
  /** The children of the content panel's header (`.im-panel-header`), above the body: its title and tools. */
  contentHeaderHtml?: string;
  /** The children of the content panel's tools row (`.im-panel-tools`), between the header and the body. */
  contentToolsHtml?: string;
  /** The children of the content panel's foot (`.im-panel-foot`), under the body. */
  contentFootHtml?: string;
  /** The accessible name of the content region. */
  contentLabel: string;
  /** The id of the content region, which the skip link goes to. Default `main`. */
  contentId?: string;
  skipLabel: string;
  /** The accessible name of the inspector, which the frame writes empty and hidden. */
  inspectorLabel: string;
  busy?: boolean;
  /** The sidebar, from `sidebarHtml()`. Without it the shell has none (`data-im-sidebar="off"`). */
  sidebarHtml?: string;
  /** The children of the status row (`.im-status`). */
  statusHtml?: string;
  /** The children of the action bar (`.im-actions`). */
  actionsHtml?: string;
  /** The children of the footer (`.im-footer`). */
  footerHtml?: string;
}

/**
 * Contents of an `.im-shell` root: the window's seven regions, in the order of docs/using-imago.md section 4. A region
 * that is not given (undefined) is left out; the content and the inspector are always there, the inspector empty and
 * hidden until `inspector(shell).open()`. The content region is a panel: header, tools, body and foot, the three around
 * the body left out when not given. Repaint a mounted frame with `renderShellFrame`.
 */
export function shellFrameHtml(options: ShellFrameOptions): string {
  const id = escapeHtml(options.contentId ?? 'main');
  const region = (html: string | undefined, open: string, close: string): string => (html === undefined ? '' : open + html + close);
  return `<a class="im-shell-skip-link" href="#${id}">${escapeHtml(options.skipLabel)}</a>${options.titlebarHtml}`
    + `<div class="im-body">${options.sidebarHtml ?? ''}<div class="im-work">`
    + region(options.statusHtml, '<div class="im-status">', '</div>')
    + `<div class="im-columns"><main id="${id}" class="im-panel im-content" tabindex="-1" aria-label="${escapeHtml(options.contentLabel)}" aria-busy="${!!options.busy}">`
    + region(options.contentHeaderHtml, '<header class="im-panel-header">', '</header>')
    + region(options.contentToolsHtml, '<div class="im-panel-tools">', '</div>')
    + `<div class="im-panel-body">${options.contentHtml}</div>`
    + region(options.contentFootHtml, '<div class="im-panel-foot">', '</div>')
    + '</main>'
    + `<section class="im-panel im-inspector" aria-label="${escapeHtml(options.inspectorLabel)}" hidden></section></div>`
    + region(options.actionsHtml, '<div class="im-actions">', '</div>')
    + region(options.footerHtml, '<footer class="im-footer">', '</footer>')
    + '</div></div>';
}

export interface SidebarOptions {
  id: string;
  /** The sidebar's title, and the name of the sidebar and of its list. */
  label: string;
  /** The rows of the list: `im-row` elements with `role="option"`, each with its `im-rail-item`. */
  rowsHtml: string;
  /** The two names of the header's fold button (`sidebarCollapse`). Without them the header has no fold button. */
  collapse?: { collapse: string; expand: string };
}
/** The sidebar region: a titled panel whose body is a listbox of rows, with the button that folds it into the rail. */
export function sidebarHtml(options: SidebarOptions): string {
  const id = escapeHtml(options.id);
  const label = escapeHtml(options.label);
  const fold = options.collapse
    ? `<button type="button" class="im-icon-btn im-sidebar-collapse" aria-label="${escapeHtml(options.collapse.collapse)}" title="${escapeHtml(options.collapse.collapse)}" aria-expanded="true" aria-controls="${id}" data-im-label-collapse="${escapeHtml(options.collapse.collapse)}" data-im-label-expand="${escapeHtml(options.collapse.expand)}">${iconHtml('sidebar')}</button>`
    : '';
  return `<section class="im-panel im-sidebar" id="${id}" aria-label="${label}"><header class="im-panel-header"><h4 class="im-panel-title">${label}</h4><span class="im-spacer"></span>${fold}</header>`
    + `<div class="im-panel-body im-list" role="listbox" aria-label="${label}">${options.rowsHtml}</div></section>`;
}
