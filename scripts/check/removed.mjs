// The names the canon removed, each with what replaces it: the rule removed-name reports one wherever an app writes it,
// its tests included. They are the names of the mapping tables (docs/superpowers/moving-from-0.1.4.md and
// docs/superpowers/moving/*.md) that a program can match: a class (with or without the im- prefix), a data-im-
// attribute, a --im- custom property or an export of the package. A row of a table that describes a change of behaviour
// (an argument that went, an option that changed) is not a name, and is not here. tests/check.test.ts asserts that
// every name of the tables is here, and that the package no longer defines any of them.

/** @typedef {{ old: string, kind: 'class' | 'attribute' | 'property' | 'export', now: string }} Removed */

/** @type {Removed[]} */
export const REMOVED = [
  // moving-from-0.1.4.md: the window, the content region and the sidebar
  { old: 'im-app-layout', kind: 'class', now: 'nothing: the window is im-shell with its seven regions' },
  { old: 'im-main', kind: 'class', now: 'main.im-panel.im-content, the content region shellFrameHtml writes; the padding is im-page-content\'s' },
  { old: 'im-desktop-frame', kind: 'class', now: 'im-shell' },
  { old: 'im-desktop-content', kind: 'class', now: 'im-work: the status row, the columns, the action bar and the footer' },
  { old: 'im-page', kind: 'class', now: 'nothing: a page sits in the content region of im-shell, with the shell\'s headings' },
  { old: 'im-skip-link', kind: 'class', now: 'im-shell-skip-link, which shellFrameHtml writes first' },
  { old: 'im-page-frame', kind: 'class', now: 'im-shell' },
  { old: 'im-page-view', kind: 'class', now: 'im-content' },
  { old: 'im-work-column', kind: 'class', now: 'im-content: a panel, with im-panel-header above im-panel-body' },
  { old: 'im-workbench', kind: 'class', now: 'the shell\'s im-sidebar, im-content and im-inspector' },
  { old: 'im-work-area', kind: 'class', now: 'im-columns' },
  { old: 'im-workspace-area', kind: 'class', now: 'im-content' },
  { old: 'im-navigation-panel', kind: 'class', now: 'im-sidebar, from sidebarHtml' },
  { old: 'im-resizable-nav', kind: 'class', now: 'im-sidebar, made resizable by sidebarResize' },
  { old: '--im-nav-width', kind: 'property', now: '--im-w-sidebar, which sidebarResize sets on the shell' },
  { old: 'data-im-compact', kind: 'attribute', now: 'the rail: sidebarCollapse folds the sidebar and sets data-im-sidebar-collapsed on the shell' },
  { old: 'im-nav-rail', kind: 'class', now: 'the sidebar\'s rail: every row carries an im-rail-item' },
  { old: 'im-nav-entry', kind: 'class', now: 'im-row with role="option" in the sidebar\'s im-list; the current one has aria-selected="true"' },
  { old: 'im-nav-line', kind: 'class', now: 'im-row, with im-row-text (im-row-title, im-row-sub) and im-row-meta' },
  { old: 'im-nav-mark', kind: 'class', now: 'im-dot in the row, coloured with --im-cat-1 to --im-cat-8; a mark that turns on and off is an im-check' },
  { old: 'im-nav-detail', kind: 'class', now: 'im-row-sub, the row\'s second line' },
  { old: 'im-signal', kind: 'class', now: 'im-dot with data-im-tone, and the word for the state beside it' },
  { old: 'data-im-badge', kind: 'attribute', now: 'im-count in the row for a number, or im-dot with data-im-tone and a word in im-row-sub' },
  { old: '--im-item-color', kind: 'property', now: 'the categorical colours --im-cat-1 to --im-cat-8' },
  { old: '--im-item-ink', kind: 'property', now: '--im-cat-on, the text on a categorical colour' },
  // moving-from-0.1.4.md: the inspector and the toolbars
  { old: 'im-docked-inspector', kind: 'class', now: 'im-inspector (inspector(shell)); data-im-inspector="wide" on the shell makes it 360' },
  { old: '--im-inspector-size', kind: 'property', now: '--im-w-inspector, or data-im-inspector="wide" on the shell' },
  { old: 'im-inspection-rail', kind: 'class', now: 'im-inspector' },
  { old: 'im-detail-panel', kind: 'class', now: 'im-inspector' },
  { old: 'im-document', kind: 'class', now: 'im-page-content' },
  { old: 'im-toolbar', kind: 'class', now: 'im-content-toolbar' },
  { old: 'im-panel-strip', kind: 'class', now: 'im-content-toolbar; at the head of a panel, im-panel-tools' },
  { old: 'im-master-detail', kind: 'class', now: 'nothing: the detail is the inspector' },
  // moving/task-5.md: messages, loading, empty and steps
  { old: 'bannerHtml', kind: 'export', now: 'noteHtml({ icon, title, message, items, actionsHtml, tone }), in the panel or page it is about' },
  { old: 'BannerOptions', kind: 'export', now: 'NoteOptions' },
  { old: 'im-banner', kind: 'class', now: 'im-note im-note--block (noteHtml with items or actions)' },
  { old: 'im-callout', kind: 'class', now: 'im-note (noteHtml({ message })), its tone in data-im-tone' },
  { old: 'busyIndicatorHtml', kind: 'export', now: 'loader(doc, label) in the content, aria-busy="true" on the button, or the panel\'s loading state' },
  { old: 'im-busy', kind: 'class', now: 'im-loader, aria-busy="true" on the button, or the panel\'s loading state' },
  { old: 'loadingStateHtml', kind: 'export', now: 'panelStateHtml({ kind: \'loading\', rows }) or setPanelState(panel, { kind: \'loading\', rows })' },
  { old: 'im-zero-state', kind: 'class', now: 'im-empty: emptyStateHtml, or setPanelState(panel, { kind: \'empty\', … })' },
  { old: 'im-empty-message', kind: 'class', now: 'im-empty: emptyStateHtml, or setPanelState(panel, { kind: \'empty\', … })' },
  { old: 'im-step-nav', kind: 'class', now: 'im-steps, which stepNavigationHtml writes' },
  { old: 'im-accent', kind: 'class', now: 'im-text-accent' },
  { old: 'im-warning', kind: 'class', now: 'im-text-warn' },
  { old: 'im-error', kind: 'class', now: 'im-text-err' },
  // moving/task-6.md: dialogs and the skins
  { old: 'im-content-dialog--drawer', kind: 'class', now: 'inspector(shell).open(content, opener?) for a panel of the selected object; a dialog is centred' },
  { old: 'im-content-drawer', kind: 'class', now: 'inspector(shell).open(content, opener?)' },
  { old: 'im-sectioned-drawer', kind: 'class', now: 'inspector(shell).open(content, opener?); its sections are im-section' },
  { old: 'im-padded-drawer', kind: 'class', now: 'inspector(shell).open(content, opener?)' },
  { old: 'applyShinatamaPalette', kind: 'export', now: 'nothing in the package: the skins are Shinatama\'s own overrides of tokens (git show v0.1.4:ts/shell/shinatama-palette.ts)' },
  { old: 'SHINATAMA_PALETTES', kind: 'export', now: 'nothing in the package: the skins are Shinatama\'s own overrides of tokens' },
  { old: 'ShinatamaPaletteTokens', kind: 'export', now: 'nothing in the package: the skins are Shinatama\'s own overrides of tokens' },
  // moving/task-9.md: the React binding
  { old: 'DetailPanel', kind: 'export', now: 'the details as the children of the inspector: give them to Workbench as details, with detailsLabel' },
];
