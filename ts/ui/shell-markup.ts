import { escapeHtml, iconHtml, spinnerHtml } from './markup.ts';

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

export interface WindowButtonLabels { minimize: string; maximize: string; close: string }
export function windowButtonsHtml(labels: WindowButtonLabels = { minimize: 'Minimize window', maximize: 'Maximize window', close: 'Close window' }): string {
  const svg = (body: string) => `<svg class="im-icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const icons = {
    minimize: svg('<path d="M5 12h14"/>'),
    maximize: svg('<rect x="6" y="6" width="12" height="12"/>') + svg('<path d="M8 8V4h12v12h-4M4 8h12v12H4z"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  };
  return `<div class="im-window-buttons">${(['minimize', 'maximize', 'close'] as const).map(name => `<button type="button" class="im-window-button" data-im-window="${name}" aria-label="${escapeHtml(labels[name])}">${icons[name]}</button>`).join('')}</div>`;
}

export interface TitlebarOptions {
  brand: { name: string; image?: string };
  navigationHtml?: string;
  views?: { label: string; action: string };
  statusHtml?: string;
  commands?: { label: string; action: string; shortcut?: string };
  windowControls?: boolean | WindowButtonLabels;
}
export function titlebarHtml(options: TitlebarOptions): string {
  const { brand, views, commands } = options;
  const brandHtml = brand.image ? `<img class="im-brand-image" src="${escapeHtml(brand.image)}" alt="${escapeHtml(brand.name)}" data-tauri-drag-region>` : `<span class="im-wordmark" data-tauri-drag-region>${escapeHtml(brand.name)}</span>`;
  return `<header class="im-titlebar" data-tauri-drag-region><div class="im-brand" data-tauri-drag-region>${brandHtml}</div>${options.navigationHtml ?? ''}${views ? `<button type="button" class="im-btn im-btn--ghost im-views-menu" data-action="${escapeHtml(views.action)}">${escapeHtml(views.label)}</button>` : ''}<span class="im-spacer" data-tauri-drag-region></span>${options.statusHtml ?? ''}${commands ? `<button type="button" class="im-titlebar-command" data-action="${escapeHtml(commands.action)}" aria-label="${escapeHtml(commands.label)}">${escapeHtml(commands.label)}${commands.shortcut ? ` <kbd class="im-key">${escapeHtml(commands.shortcut)}</kbd>` : ''}</button>` : ''}${options.windowControls ? windowButtonsHtml(typeof options.windowControls === 'object' ? options.windowControls : undefined) : ''}</header>`;
}

export interface StatusButtonOptions {
  label: string;
  accessibleLabel: string;
  action: string;
  id?: string;
  tone: 'ok' | 'warn' | 'err' | 'accent';
}
export function statusButtonHtml(options: StatusButtonOptions): string {
  return `<button type="button" class="im-btn im-btn--ghost im-titlebar-status" data-action="${escapeHtml(options.action)}"${options.id === undefined ? '' : ` data-id="${escapeHtml(options.id)}"`} aria-label="${escapeHtml(options.accessibleLabel)}"><i class="im-dot" data-im-tone="${escapeHtml(options.tone)}" aria-hidden="true"></i><span>${escapeHtml(options.label)}</span></button>`;
}

export interface BannerOptions {
  title: string;
  message?: string;
  items?: readonly { label: string; message: string }[];
  actionsHtml?: string;
  tone: 'ok' | 'warn' | 'err' | 'accent';
}
export function bannerHtml(options: BannerOptions): string {
  const role = options.tone === 'err' || options.tone === 'warn' ? 'alert' : 'status';
  return `<div class="im-banner" data-im-tone="${escapeHtml(options.tone)}" role="${role}"><div><strong>${escapeHtml(options.title)}</strong>${options.message ? `<p>${escapeHtml(options.message)}</p>` : ''}${options.items?.length ? `<ul>${options.items.map(item => `<li><b>${escapeHtml(item.label)}</b>: ${escapeHtml(item.message)}</li>`).join('')}</ul>` : ''}</div>${options.actionsHtml ?? ''}</div>`;
}

export const busyIndicatorHtml = (label: string): string => `<div class="im-busy" role="status">${spinnerHtml}<span>${escapeHtml(label)}</span></div>`;

/** A loading placeholder occupying an empty content surface. */
export const loadingStateHtml = (label: string): string => `<div class="im-panel im-surface im-empty" data-im-surface="sheet" role="status">${spinnerHtml}<span>${escapeHtml(label)}</span></div>`;

/** A constrained page inside the shell's scrolling content area. */
export function pageContentHtml(contentHtml: string, width: 'normal' | 'narrow' = 'normal'): string {
  return `<div class="im-page-content${width === 'narrow' ? ' im-page-content--narrow' : ''}">${contentHtml}</div>`;
}

export interface ShellFrameOptions {
  titlebarHtml: string;
  mainHtml: string;
  mainId?: string;
  skipLabel: string;
  busy?: boolean;
}
/** Contents of an `.im-shell` root. Keep the titlebar/body elements stable when replacing their children. */
export function shellFrameHtml(options: ShellFrameOptions): string {
  const id = options.mainId ?? 'main';
  return `<a class="im-shell-skip-link" href="#${escapeHtml(id)}">${escapeHtml(options.skipLabel)}</a>${options.titlebarHtml}<div class="im-body"><main id="${escapeHtml(id)}" class="im-main im-content" tabindex="-1" aria-busy="${!!options.busy}">${options.mainHtml}</main></div>`;
}
