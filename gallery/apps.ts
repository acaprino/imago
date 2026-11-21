// The five apps' sample content, ported from docs/reference/toolkit-preview.html: the live shell of the gallery is
// drawn from here. The markup uses the classes of css/primitives.css (regions) and css/controls.css (controls);
// nothing in this file styles anything.
import { noteHtml } from '../ts/ui/shell-markup.ts';

export type AppId = 'xiox' | 'mukade' | 'shinatama' | 'muro' | 'daodan';
type Tone = 'ok' | 'warn' | 'err' | 'info' | 'accent';

export const APP_IDS: AppId[] = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];
export const APP_HUES: Record<AppId, number> = { xiox: 75, shinatama: 355, mukade: 300, muro: 170, daodan: 235 };

const ICONS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  min: '<path d="M5 12h14"/>', restore: '<path d="M8.5 8.5v-2h9v9h-2"/><rect x="6.5" y="8.5" width="9" height="9" rx="1.2"/>', max: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>', list: '<path d="M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01"/>', sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  folder: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  window: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 9h16"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.3 2.5 13.7 0 16M12 4c-2.5 2.3-2.5 13.7 0 16"/>',
  code: '<path d="M8.5 8l-4 4 4 4M15.5 8l4 4-4 4"/>',
  apps: '<rect x="4.5" y="4.5" width="6" height="6" rx="1"/><rect x="13.5" y="4.5" width="6" height="6" rx="1"/><rect x="4.5" y="13.5" width="6" height="6" rx="1"/><rect x="13.5" y="13.5" width="6" height="6" rx="1"/>',
  lock: '<rect x="5.5" y="11" width="13" height="8.5" rx="1.5"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"/>',
  sidebar: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M9.5 5v14"/>',
  chev: '<path d="M7 10l5 5 5-5"/>',
  reload: '<path d="M19 12a7 7 0 1 1-2.05-4.95M19 5v4h-4"/>', term: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M7.5 10l3 2.5-3 2.5M12.5 15.5h4"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>', chat: '<path d="M5 6h14v9H10l-4 3.5V15H5z"/>', send: '<path d="M4 12l16-7-6 16-2.5-6.5z"/>',
};

// ---- markup helpers --------------------------------------------------------------------------------------------

const icon = (name: string): string => `<svg class="im-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
const key = (text: string): string => `<kbd class="im-key">${text}</kbd>`;
const count = (n?: number): string => (n === undefined ? '' : `<span class="im-count">${n}</span>`);
const chip = (text: string, tone?: Tone): string => `<span class="im-chip"${tone ? ` data-im-tone="${tone}"` : ''}>${text}</span>`;
const spacer = '<span class="im-spacer"></span>';
const none = '<span class="im-none">—</span>';
const num = (v: string): string => `<span class="im-num">${v}</span>`;

type ButtonOptions = { primary?: boolean; ghost?: boolean; danger?: boolean; confirmDanger?: boolean; sm?: boolean; disabledReason?: string; icon?: string; keys?: string; act?: string; extra?: string };
function button(text: string, o: ButtonOptions = {}): string {
  const classes = ['im-btn', o.primary && 'im-btn--primary', o.ghost && 'im-btn--ghost', o.danger && 'im-btn--danger', o.confirmDanger && 'im-btn--confirm-danger', o.sm && 'im-btn--sm'].filter(Boolean).join(' ');
  const disabled = o.disabledReason ? ` disabled title="${o.disabledReason}"` : '';
  return `<button type="button" class="${classes}"${disabled}${o.act ? ` data-act="${o.act}"` : ''}${o.extra ?? ''}>${o.icon ? icon(o.icon) : ''}<span>${text}</span>${o.keys ? key(o.keys) : ''}</button>`;
}
const iconButton = (name: string, label: string): string => `<button type="button" class="im-icon-btn" aria-label="${label}" title="${label}">${icon(name)}</button>`;
const segmented = (items: string[], on = 0): string => `<div class="im-seg" role="tablist">${items.map((t, x) => `<button type="button" role="tab" aria-selected="${x === on}">${t}</button>`).join('')}</div>`;
const check = (state: 'on' | 'off' | 'part', label: string): string => `<span class="im-check" role="checkbox" aria-checked="${state === 'on' ? 'true' : state === 'part' ? 'mixed' : 'false'}" aria-label="${label}"></span>`;

const initials = (text: string): string => text.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
type Row = { t: string; s?: string; m?: string; sel?: boolean; ck?: 'on' | 'off' | 'part'; av?: string; icon?: string; dot?: Tone; chip?: [string, Tone?] };
function row(r: Row): string {
  return `<div class="im-row${r.s ? '' : ' im-row--1'}" role="option" aria-selected="${!!r.sel}" title="${r.t}">${r.icon ? `<span class="im-rail-item" aria-hidden="true">${icon(r.icon)}</span>` : `<span class="im-avatar im-rail-item" aria-hidden="true">${initials(r.t)}</span>`}${r.ck ? check(r.ck, r.t) : ''}${r.av ? `<span class="im-avatar">${r.av}</span>` : ''}${r.dot ? `<span class="im-dot" data-im-tone="${r.dot}"></span>` : ''}<span class="im-row-text"><span class="im-row-title">${r.t}</span>${r.s ? `<span class="im-row-sub">${r.s}</span>` : ''}</span>${r.m ? `<span class="im-row-meta">${r.m}</span>` : ''}${r.chip ? chip(r.chip[0], r.chip[1]) : ''}</div>`;
}
type HeaderOptions = { n?: number; sub?: string; right?: string };
const header = (title: string, o: HeaderOptions = {}): string => `<header class="im-panel-header"><h4 class="im-panel-title">${title}</h4>${count(o.n)}${o.sub ? `<span class="im-panel-sub">${o.sub}</span>` : ''}${spacer}${o.right ?? ''}</header>`;
const collapseButton = (t: Strings): string => `<button type="button" class="im-icon-btn im-sidebar-collapse" aria-label="${t.collapse}" title="${t.collapse}" aria-expanded="true" aria-controls="g-sidebar" data-im-label-collapse="${t.collapse}" data-im-label-expand="${t.expand}">${icon('sidebar')}</button>`;
const facts = (rows: [string, string, boolean?][]): string => `<dl class="im-facts">${rows.map(([k, v, code]) => `<dt>${k}</dt><dd${code ? ' class="im-facts-code"' : ''}>${v}</dd>`).join('')}</dl>`;
const two = (title: string, sub: string): string => `<span class="im-cell-title">${title}</span><span class="im-cell-sub">${sub}</span>`;

type Column = { t?: string; n?: boolean; check?: boolean };
type TableRow = { c: string[]; sel?: boolean };
function table(cols: Column[], rows: TableRow[]): string {
  const cls = (c: Column): string => [c.n && 'im-num', c.check && 'im-col-check'].filter(Boolean).join(' ');
  const attr = (c: Column): string => (cls(c) ? ` class="${cls(c)}"` : '');
  return `<table class="im-table"><thead><tr>${cols.map((c) => `<th${attr(c)}>${c.t ?? ''}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr${r.sel ? ' aria-selected="true"' : ''}>${r.c.map((v, x) => `<td${attr(cols[x])}>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ---- the five apps ---------------------------------------------------------------------------------------------

type Strings = {
  cancel: string; undo: string; commands: string; views: string; collapse: string; expand: string;
  /** The words `mountApp` takes as its labels: the search command, and the palette's field and empty list. */
  search: string; palettePlaceholder: string; paletteEmpty: string;
  skip: string;
};
type App = {
  name: string; tabs: string[]; on?: number;
  primary: { text: string; keys?: string; icon?: string; act?: string };
  secondary: { text: string; keys?: string; icon?: string };
  status: [string, Tone, string, string]; footer: string; keys: [string, string][];
  side: { title: string; n: number; rows: Row[] } | null;
  content: () => string; inspector: () => string;
  strings: Strings;
};

const EN: Strings = {
  cancel: 'Cancel', undo: 'Undo', commands: 'Commands', views: 'Views', collapse: 'Collapse sidebar', expand: 'Expand sidebar',
  search: 'Search in this view', palettePlaceholder: 'Type a command', paletteEmpty: 'No command matches',
  skip: 'Skip to content',
};

export const APPS: Record<AppId, App> = {
  xiox: {
    name: 'Xiox', tabs: ['Cleanup', 'Registry', 'Services & RAM', 'Developers'],
    primary: { text: 'Clean 8 items', keys: '↵', act: 'kill' }, secondary: { text: 'Analyze', keys: 'a', icon: 'reload' },
    status: ['Analysis done', 'ok', '13.48 GB to delete · 46,999 files', 'administrator · RAM 32 GB'],
    footer: 'Winapp2 260915 loaded · 70 items', keys: [['↑↓', 'move'], ['space', 'toggle'], ['↵', 'clean']],
    side: { title: 'Categories', n: 7, rows: [
      { ck: 'part', icon: 'sliders', t: 'System', s: '6 items · 4 selected', m: '11.29 GB' }, { ck: 'off', icon: 'folder', t: 'Explorer', s: '1 item · 0 selected', m: '180.0 MB' },
      { ck: 'off', icon: 'window', t: 'Windows', s: '8 items · 0 selected', m: '21.21 GB', sel: true }, { ck: 'part', icon: 'globe', t: 'Browser', s: '5 items · 2 selected', m: '1.54 GB' },
      { ck: 'off', icon: 'code', t: 'Development & AI', s: '4 items · 0 selected', m: '19.85 GB' }, { ck: 'part', icon: 'apps', t: 'Applications', s: '44 items · 2 selected', m: '4.16 GB' }] },
    content: () => `${header('Cleanup', { sub: '70 items · 8 selected', right: segmented(['All', 'Selected', 'Caution']) })}<div class="im-panel-tools"><label class="im-input" style="flex:1">${icon('search')}<input type="text" placeholder="Search this view" aria-label="Search this view">${key('Ctrl F')}</label></div><div class="im-panel-body">${table([{ check: true }, { t: 'Item' }, { t: 'Level' }, { t: 'Files', n: true }, { t: 'Size', n: true }], [
      { c: [check('on', 'Mozilla Firefox – Cache'), two('Mozilla Firefox – Cache', 'Pages and images Firefox saved to load faster'), chip('Recommended', 'ok'), '5,300', '1.50 GB'] },
      { c: [check('on', 'Cookies'), two('Cookies', 'Sites in your keep list stay signed in'), chip('Caution', 'warn'), '6,410', '40.0 MB'] },
      { c: [check('off', 'Google Chrome – Cache'), two('Google Chrome – Cache', 'Close Google Chrome to clean'), chip('Recommended', 'ok'), none, none], sel: true },
      { c: [check('off', 'Hugging Face – Model cache'), two('Hugging Face – Model cache', 'Models downloaded for local AI tools'), chip('Caution', 'warn'), '64', '14.00 GB'] },
      { c: [check('off', 'Cargo – Registry cache'), two('Cargo – Registry cache', 'Crates Cargo downloaded'), chip('Optional'), '9,120', '3.25 GB'] },
      { c: [check('off', 'npm – Cache'), two('npm – Cache', 'Packages npm downloaded'), chip('Recommended', 'ok'), '18,340', '2.10 GB'] },
      { c: [check('off', 'DNS cache'), two('DNS cache', 'Addresses of websites Windows remembers'), chip('Optional'), none, '0 B'] }])}</div>`,
    inspector: () => `${header('Item', { right: chip('Blocked', 'warn') })}<div class="im-panel-body">${facts([['Name', 'Google Chrome – Cache'], ['Level', 'Recommended'], ['Mode', 'Permanently'], ['Blocked', 'Close Google Chrome to clean'], ['Path', '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\*\\Cache', true]])}</div><div class="im-panel-foot">${button('Skip', { ghost: true })}${spacer}${button('Clean', { disabledReason: 'Close Google Chrome to clean' })}</div>`,
    strings: EN,
  },
  mukade: {
    name: 'Mukade', tabs: ['Sessions', 'Chat', 'Harnesses'], on: 1,
    primary: { text: 'Launch agent', keys: 'l', icon: 'term' }, secondary: { text: 'Scan folder', keys: 'o' },
    status: ['Service running', 'ok', 'http://127.0.0.1:47631/mcp', 'checked every 3 s'],
    footer: '6 installations · 16 sessions', keys: [['↑↓', 'move'], ['n', 'new room'], ['l', 'launch']],
    side: { title: 'Rooms', n: 3, rows: [
      { t: 'hop-review', s: '4 members · 11 events · 12:02', chip: ['open', 'ok'], sel: true }, { t: 'desktop-spec', s: '2 members · 4 events · 11:03', chip: ['open', 'ok'] },
      { icon: 'lock', t: 'codex-code-mode', s: '1 member · 3 events · Nov 17', chip: ['closed'] }] },
    content: () => `${header('hop-review', { sub: '11 events', right: segmented(['Graph', 'Lanes', 'Feed'], 2) })}<div class="im-panel-body g-feed">
        <article class="g-msg"><span class="im-avatar">CB</span><div class="g-msg-head"><b>codex-b</b><time>11:41</time></div><p class="im-content-text">The hop wrote three Codex threads for the review.</p><div class="g-msg-foot">${chip('done', 'ok')}to claude-a</div></article>
        <article class="g-msg"><span class="im-avatar">CA</span><div class="g-msg-head"><b>claude-a</b><time>11:53</time></div><p class="im-content-text">Keep the review on the hop branch. Codex lists the Plan threads, OpenCode checks the child sessions.</p><div class="g-msg-foot">to everyone</div></article>
        <article class="g-msg" aria-selected="true"><span class="im-avatar">CA</span><div class="g-msg-head"><b>claude-a</b><time>11:55</time></div><p class="im-content-text">@codex-b list the Plan threads that still have no title.</p><div class="g-msg-foot">${chip('waiting', 'warn')}to codex-b</div></article>
      </div><div class="im-panel-foot"><label class="im-input" style="flex:1">${icon('chat')}<input type="text" placeholder="Write to everyone" aria-label="Message"></label>${button('Send', { keys: 'Ctrl ↵', icon: 'send' })}</div>`,
    inspector: () => `${header('Members', { n: 4 })}<div class="im-panel-body"><div class="im-list">${row({ av: 'CA', t: 'claude-a', s: 'lead · 11:55', chip: ['lead', 'accent'] })}${row({ av: 'CB', t: 'codex-b', s: 'worker · 11:41', chip: ['worker'] })}${row({ av: 'OC', t: 'opencode-c', s: 'peer · 12:02', chip: ['peer'] })}${row({ av: 'PD', t: 'pi-d', s: 'observer · 12:02', chip: ['observer'] })}</div></div><div class="im-panel-foot">${button('Close room', { danger: true, act: 'undo' })}</div>`,
    strings: EN,
  },
  shinatama: {
    name: 'Shinatama', tabs: ['Workspace', 'Sessions', 'Overview', 'Files', 'Leftovers'],
    primary: { text: 'New session', keys: 'Ctrl ⇧ T', icon: 'plus' }, secondary: { text: 'Projects' },
    status: ['Local runtime', 'ok', 'resources available', '4 terminals'],
    footer: 'Local runtime · 4 terminals · 268 MiB', keys: [['Ctrl ⇧ T', 'new session'], ['F6', 'next region']],
    side: { title: 'Threads', n: 9, rows: [
      { dot: 'ok', t: 'PowerShell', s: '4 sessions · 4 running', m: 'now', sel: true }, { dot: 'warn', t: 'Webhook signature check', s: '1 session · needs you', m: '2m' },
      { dot: 'ok', t: 'Tax rounding bug', s: '1 session · running', m: 'now' }, { t: 'Dunning emails', s: '1 session', m: '6m' },
      { t: 'Migrate to Postgres 16', s: '1 session', m: '8m' }, { t: 'Invoice PDF layout', s: '1 session', m: '1h' }] },
    content: () => `${header('Pane 4', { sub: 'billing-service · Claude Code', right: iconButton('plus', 'New tab') })}<div class="im-panel-body g-term-body"><pre class="g-term im-content-text"><span class="g-t-a">&gt;</span> run docs/plans/billing-retries.md

I will hand the tasks to implementer, and keep reviewer for the diff:
  1. exponential backoff in retry.ts
  2. jitter and a cap of 5 attempts
  3. idempotency key on the charge

<span class="g-t-m">[implementer]</span> npm test -- retry          <span class="g-t-ok">14 passed</span>
<span class="g-t-ok">+</span> Task 1  backoff                   <span class="g-t-ok">green</span>
<span class="g-t-ok">+</span> Task 2  jitter and cap            <span class="g-t-ok">green</span>
<span class="g-t-w">*</span> Task 3  idempotency key           <span class="g-t-w">running</span>

<span class="g-t-m">[reviewer]</span> 2 findings, 0 blocking.</pre></div>`,
    inspector: () => `${header('Session', { right: chip('Running', 'ok') })}<div class="im-panel-body">${facts([['Harness', 'Claude Code'], ['Project', 'billing-service'], ['Branch', 'feature/retry-backoff'], ['Memory', '67 MiB'], ['Size', '120 × 32'], ['Folder', 'C:\\work\\acme\\billing-service', true]])}</div><div class="im-panel-foot">${button('End session', { danger: true, act: 'kill' })}</div>`,
    strings: EN,
  },
  muro: {
    name: 'Muro', tabs: ['Sync', 'Activity', 'Settings'],
    primary: { text: 'Apply 3 changes', keys: '↵' }, secondary: { text: 'Check now', keys: 'r', icon: 'reload' },
    status: ['3 changes ready', 'warn', 'Last check today 08:07 · next check today 09:07', '4 harnesses'],
    footer: 'Last sync yesterday 07:07 · 5 plugins in your list', keys: [['↵', 'apply'], ['r', 'check now']],
    side: null,
    content: () => `${header('Sync', { sub: 'Rows are your plugins, columns are your harnesses.', right: segmented(['All', 'Needs action']) })}<div class="im-panel-tools">${noteHtml({ icon: 'reload', title: '3 changes ready to apply', message: '1 install, 1 update, 1 removal. Nothing changes until you apply.', tone: 'warn' })}</div><div class="im-panel-body">${table([{ t: 'Plugin' }, { t: 'Latest' }, { t: 'Claude Code' }, { t: 'Codex' }, { t: 'OpenCode' }], [
      { c: [two('Marionette', 'github.com/acaprino/marionette'), num('0.4.0'), chip('Update 0.3.0 → 0.4.0', 'warn'), num('0.4.0'), num('0.4.0')], sel: true },
      { c: [two('commit-helper', 'github.com/example/commit-helper'), num('2.1.0'), num('2.1.0'), num('2.1.0'), none] },
      { c: [two('test-runner', 'github.com/example/test-runner'), num('1.0.4'), none, none, chip('Install 1.0.4', 'accent')] },
      { c: [two('docs-writer', 'github.com/example/docs-writer'), num('1.2.0'), num('1.2.0'), none, num('1.2.0')] },
      { c: [two('old-snippets', 'Installed, not in your list'), num('0.2.0'), chip('Remove', 'err'), none, none] }])}</div>`,
    inspector: () => `${header('Claude Code', { right: iconButton('x', 'Close') })}<div class="im-panel-body"><div class="im-stack g-form">
        <label class="im-field"><span class="im-field-label">Name</span><span class="im-input"><input type="text" value="Claude Code"></span></label>
        <label class="im-field"><span class="im-field-label">Configuration folder</span><span class="im-input im-input--code"><input type="text" value="C:/Users/you/.claud" aria-invalid="true" aria-describedby="g-muro-folder-error"></span><span class="im-field-error" id="g-muro-folder-error">Error: this folder does not exist. Check the path.</span></label>
        <span class="im-option">${check('on', 'Always uninstall plugins not in my list')}Always uninstall plugins not in my list</span>
      </div></div><div class="im-panel-foot">${button('Stop managing', { danger: true, act: 'undo' })}${spacer}${button('Cancel', { ghost: true })}${button('Save', { disabledReason: 'Fix the configuration folder to save' })}</div>`,
    strings: EN,
  },
  daodan: {
    name: 'Daodan', tabs: ['Analisi', 'Grafo', 'Code review'],
    primary: { text: 'Riprendi demo', keys: 'space', icon: 'play' }, secondary: { text: 'Nuova demo', keys: 'n' },
    status: ['Demo in pausa', 'warn', 'Avanzamento dimostrativo 64%', 'acaprino/daodan · main'],
    footer: 'Prototipo locale · il codice resta sul tuo disco', keys: [['space', 'pausa'], ['g', 'grafo']],
    side: { title: 'Progetti', n: 4, rows: [
      { av: 'DA', t: 'daodan', s: 'main · pubblica', m: '64%', sel: true }, { av: 'SH', t: 'shinatama', s: 'develop · privata', m: '100%' },
      { av: 'MU', t: 'mukade', s: 'develop · privata', m: '—' }, { av: 'XI', t: 'xiox', s: 'main · privata', m: '—' }] },
    content: () => `${header('Pipeline di analisi', { sub: 'acaprino/daodan · main', right: chip('Demo', 'accent') })}<div class="im-panel-body">${table([{ t: 'Fase' }, { t: 'Stato' }, { t: 'Passo', n: true }, { t: 'Durata', n: true }], [
      { c: [two('Scan', 'Inventario e pre-mappa'), chip('Completata', 'ok'), '1 / 4', '0:42'] },
      { c: [two('Analyze', 'Analyzer per tecnologia'), chip('In pausa', 'warn'), '2 / 4', '2:10'], sel: true },
      { c: [two('Dynamic', 'Osservazione dei test · esclusa dalla demo'), chip('Prevista'), '3 / 4', none] },
      { c: [two('Union', 'Collegamento dei grafi'), chip('In attesa'), '4 / 4', none] }])}</div>`,
    inspector: () => `${header('Grafo', { n: 18 })}<div class="im-panel-body">${facts([['Nodi', '10 / 18'], ['Relazioni', '23 / 43'], ['Inventario', '5e49ee96e', true], ['Snapshot', '42a63a9ac071', true]])}</div><div class="im-panel-foot">${button('Elimina analisi', { danger: true, act: 'kill' })}</div>`,
    strings: {
      cancel: 'Annulla', undo: 'Ripristina', commands: 'Comandi', views: 'Viste', collapse: 'Comprimi la colonna laterale', expand: 'Espandi la colonna laterale',
      search: 'Cerca in questa vista', palettePlaceholder: 'Digita un comando', paletteEmpty: 'Nessun comando corrisponde',
      skip: 'Vai al contenuto',
    },
  },
};

// ---- the shell -------------------------------------------------------------------------------------------------

/** The whole shell, `<div class="im-shell">` included: seven regions, filled with the sample content of one app. */
export function shellMarkup(id: AppId): string {
  const a = APPS[id];
  const on = a.on ?? 0;
  const tabs = a.tabs.map((t, x) => `<button type="button" role="tab" class="im-tab" aria-selected="${x === on}">${t}</button>`).join('');
  const side = a.side
    ? `<section class="im-panel im-sidebar" id="g-sidebar" aria-label="${a.side.title}">${header(a.side.title, { n: a.side.n, right: collapseButton(a.strings) })}<div class="im-panel-body im-list" role="listbox" aria-label="${a.side.title}">${a.side.rows.map(row).join('')}</div></section>`
    : '';
  const keys = a.keys.map(([k, label]) => `<span>${key(k)}${label}</span>`).join('');
  return `<div class="im-shell" data-im-sidebar="${a.side ? 'on' : 'off'}">
  <a class="im-shell-skip-link" href="#g-content">${a.strings.skip}</a>
  <header class="im-titlebar">
    <div class="im-brand" data-tauri-drag-region><span class="im-mark" aria-hidden="true" data-tauri-drag-region>${a.name[0].toUpperCase()}</span><span class="im-wordmark" data-tauri-drag-region>${a.name}</span></div>
    ${a.side ? `<button type="button" class="im-icon-btn im-sidebar-toggle" aria-label="${a.side.title}" title="${a.side.title}" aria-expanded="false" aria-controls="g-sidebar">${icon('sidebar')}</button>` : ''}
    <nav class="im-tabs" role="tablist" aria-label="${a.strings.views}">${tabs}</nav>
    <button type="button" class="im-btn im-btn--ghost im-btn--sm im-views-menu" aria-haspopup="menu" aria-expanded="false">${a.strings.views}${icon('chev')}</button>
    ${spacer}
    <button type="button" class="im-titlebar-command" data-act="pal" aria-label="${a.strings.commands}">${icon('search')}<b>${a.strings.commands}</b>${key('Ctrl K')}</button>
    <div class="im-window-buttons"><button type="button" class="im-window-button" data-im-window="minimize" aria-label="Minimize window" title="Minimize">${icon('min')}</button><button type="button" class="im-window-button" data-im-window="maximize" aria-label="Maximize window" title="Maximize">${icon('max')}${icon('restore')}</button><button type="button" class="im-window-button" data-im-window="close" aria-label="Close window" title="Close">${icon('x')}</button></div>
  </header>
  <div class="im-body">
    ${side}
    <div class="im-work">
      <div class="im-status">${chip(a.status[0], a.status[1])}<span class="im-status-text">${a.status[2]}</span>${spacer}<span class="im-status-end">${a.status[3]}</span></div>
      <div class="im-columns">
        <main class="im-panel im-content" id="g-content" tabindex="-1" aria-label="${a.tabs[on]}">${a.content()}</main>
        <section class="im-panel im-inspector" aria-label="Inspector">${a.inspector()}</section>
      </div>
      <div class="im-actions">${button(a.secondary.text, a.secondary)}${button(a.primary.text, { ...a.primary, primary: true })}</div>
      <footer class="im-footer"><span class="im-dot" data-im-tone="ok"></span><span class="im-footer-text">${a.footer}</span>${spacer}<span class="im-footer-keys">${keys}</span></footer>
    </div>
  </div>
</div>`;
}
