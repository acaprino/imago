// The names the canon removed, each with what replaces it: the rule removed-name reports one wherever an app writes it,
// its tests included. They are the names of the mapping tables (docs/superpowers/moving-from-0.1.4.md and
// docs/superpowers/moving/*.md) that a program can match: a class (with or without the im- prefix), a data-im-
// attribute, a --im- custom property or an export of the package. A row of a table that describes a change of behaviour
// (an argument that went, an option that changed) is not a name, and is not here. tests/check.test.ts asserts that
// every name of the tables is here, but those of KEPT, and that the package no longer defines any of them.
//
// Built from moving-from-0.1.4.md and moving/task-4.md, task-5.md, task-6.md, task-7.md, task-9.md, task-13.md,
// task-14.md, task-16.md, task-17.md and task-18.md. A later table may correct an earlier one: task-16.md brings back
// data-im-badge (KEPT), and keeps --im-item-color as the package's, which the app reads and never sets (`when: 'set'`).

/**
 * @typedef {{ old: string, kind: 'class' | 'attribute' | 'property' | 'export', now: string, when?: 'set' }} Removed
 *   `when: 'set'`, on a custom property the package still has: only the app's setting it is removed (a declaration of
 *   it, in CSS, in a style a script writes or in setProperty); reading it with var() is the package's way.
 */

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
  { old: 'im-nav-mark', kind: 'class', now: 'im-dot in the row with data-im-cat="1" to "8"; a mark that turns on and off is an im-check' },
  { old: 'im-nav-detail', kind: 'class', now: 'im-row-sub, the row\'s second line' },
  { old: 'im-signal', kind: 'class', now: 'im-dot with data-im-tone, and the word for the state beside it' },
  // moving-from-0.1.4.md, as task-16.md corrects it
  { old: '--im-item-color', kind: 'property', when: 'set', now: 'data-im-cat="1" to "8" on the im-row, im-rail-item, im-avatar, im-dot or im-chip: the package sets --im-item-color from it; read it with var(--im-item-color)' },
  { old: '--im-item-ink', kind: 'property', now: '--im-cat-on, the text on a categorical fill, which the package writes' },
  // moving-from-0.1.4.md: the inspector and the toolbars
  { old: 'im-docked-inspector', kind: 'class', now: 'im-inspector (inspector(shell)); data-im-inspector="wide" on the shell makes it 360' },
  { old: '--im-inspector-size', kind: 'property', now: '--im-w-inspector, or data-im-inspector="wide" on the shell' },
  { old: 'im-inspection-rail', kind: 'class', now: 'im-inspector' },
  { old: 'im-detail-panel', kind: 'class', now: 'im-inspector' },
  { old: 'im-document', kind: 'class', now: 'im-page-content' },
  { old: 'im-toolbar', kind: 'class', now: 'im-content-toolbar' },
  { old: 'im-panel-strip', kind: 'class', now: 'im-content-toolbar; at the head of a panel, im-panel-tools' },
  { old: 'im-master-detail', kind: 'class', now: 'nothing: the detail is the inspector' },
  // moving/task-4.md: the native controls take the class of their drawing
  { old: 'im-native-controls', kind: 'class', now: 'nothing: each native control carries the class of its drawing (input.im-input, select.im-select, textarea.im-textarea, input.im-check, input.im-radio, input.im-switch)' },
  { old: 'im-native-input', kind: 'class', now: 'im-input on the input, or <span class="im-input"><input></span> when the field holds an icon or a key cap' },
  { old: 'im-native-select', kind: 'class', now: 'im-select on the select' },
  { old: 'im-native-textarea', kind: 'class', now: 'im-textarea on the textarea' },
  { old: 'im-native-check', kind: 'class', now: 'im-check on the input type="checkbox"' },
  { old: 'im-native-radio', kind: 'class', now: 'im-radio on the input type="radio"' },
  { old: 'im-native-choice', kind: 'class', now: 'im-check or im-radio on the input: nothing is drawn with accent-color' },
  { old: 'im-seg--native', kind: 'class', now: 'im-seg alone, over label > input[type=radio] + span' },
  { old: 'im-seg--choice', kind: 'class', now: 'im-seg alone, as segmentedControl writes it' },
  { old: 'im-switch-knob', kind: 'class', now: 'nothing: im-switch draws its thumb; switchHtml writes an empty button' },
  { old: 'data-im-checked', kind: 'attribute', now: 'a span.im-check with role="checkbox" and aria-checked in the mark of a picker' },
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
  { old: 'im-sectioned-drawer', kind: 'class', now: 'inspector(shell).open(content, opener?); its sections are im-section' },
  { old: 'im-padded-drawer', kind: 'class', now: 'inspector(shell).open(content, opener?)' },
  { old: 'applyShinatamaPalette', kind: 'export', now: 'nothing in the package: the skins are Shinatama\'s own overrides of tokens (git show v0.1.4:ts/shell/shinatama-palette.ts)' },
  { old: 'SHINATAMA_PALETTES', kind: 'export', now: 'nothing in the package: the skins are Shinatama\'s own overrides of tokens' },
  { old: 'ShinatamaPaletteTokens', kind: 'export', now: 'nothing in the package: the skins are Shinatama\'s own overrides of tokens' },
  // moving/task-9.md: the React binding
  { old: 'DetailPanel', kind: 'export', now: 'the details as the children of the inspector: give them to Workbench as details, with detailsLabel' },
  // moving/task-7.md: the classes of the tiling workspace (createTilingWorkspace) take the im- prefix
  { old: 'wm-host', kind: 'class', now: 'im-host' },
  { old: 'wm-canvas', kind: 'class', now: 'im-tile-canvas (im-canvas-panel, -frame and -message are the canvas of a page)' },
  { old: 'wm-pane', kind: 'class', now: 'im-pane' },
  { old: 'wm-focused', kind: 'class', now: 'im-focused' },
  { old: 'wm-header', kind: 'class', now: 'im-header' },
  { old: 'wm-chrome', kind: 'class', now: 'im-chrome' },
  { old: 'wm-control', kind: 'class', now: 'im-control' },
  { old: 'wm-pane-focus', kind: 'class', now: 'im-pane-focus' },
  { old: 'wm-pane-tools', kind: 'class', now: 'im-pane-tools' },
  { old: 'wm-tabs', kind: 'class', now: 'im-tile-tabs (im-tabs is the strip of the title bar and of a panel)' },
  { old: 'wm-tab', kind: 'class', now: 'im-tile-tab (im-tab is a tab of the title bar and of a panel)' },
  { old: 'wm-tabwrap', kind: 'class', now: 'im-tile-tabwrap' },
  { old: 'wm-tabwrap-active', kind: 'class', now: 'im-tile-tabwrap-active' },
  { old: 'wm-tab-close', kind: 'class', now: 'im-tile-tab-close' },
  { old: 'wm-tab-toned', kind: 'class', now: 'im-tile-tab-toned' },
  { old: 'wm-tab-dragging', kind: 'class', now: 'im-tile-tab-dragging' },
  { old: 'wm-tabs-filtered', kind: 'class', now: 'im-tile-tabs-filtered' },
  { old: 'wm-body', kind: 'class', now: 'im-tile-body (im-body is the shell\'s row of the sidebar and the work area)' },
  { old: 'wm-placeholder', kind: 'class', now: 'im-placeholder' },
  { old: 'wm-empty-start', kind: 'class', now: 'im-tile-empty-start (im-empty is the empty state of a panel)' },
  { old: 'wm-collapsed', kind: 'class', now: 'im-collapsed' },
  { old: 'wm-splitter', kind: 'class', now: 'im-tile-splitter (im-splitter is the handle of splitView)' },
  { old: 'wm-drop-preview', kind: 'class', now: 'im-drop-preview' },
  { old: 'wm-drop-label', kind: 'class', now: 'im-drop-label' },
  { old: 'wm-drop-marker', kind: 'class', now: 'im-drop-marker' },
  { old: 'wm-drag-ghost', kind: 'class', now: 'im-drag-ghost' },
  { old: 'wm-changing', kind: 'class', now: 'im-changing' },
  { old: 'wm-dragging', kind: 'class', now: 'im-dragging' },
  { old: 'wm-status', kind: 'class', now: 'im-tile-status (im-status is the shell\'s status row)' },
  { old: 'wm-add', kind: 'class', now: 'im-add' },
  { old: 'wm-filtered-out', kind: 'class', now: 'im-filtered-out' },
  { old: 'wm-parking', kind: 'class', now: 'im-parking' },
  { old: 'data-wm-key', kind: 'attribute', now: 'data-im-tile-key, on the tiling workspace\'s controls, tabs and handles' },
  { old: '--tab-tone', kind: 'property', now: '--im-tile-tone, which the tiling workspace sets on a tab from toneForView' },
];

/**
 * The names an earlier table removed and a later one brought back: they are the package's again, and no rule reports
 * them as removed.
 * @type {{ old: string, why: string }[]}
 */
export const KEPT = [
  { old: 'data-im-badge', why: 'task-16.md: the badge of an im-row, a dot at its end and on the corner of its rail item' },
  { old: 'im-content-drawer', why: 'the drawer: the class openDialogDrawer writes on an app-owned dialog it shows beside live panels, not modal. The modal side panel it once named is still gone (im-content-dialog--drawer, im-sectioned-drawer, im-padded-drawer)' },
];

/**
 * The names the tables removed that another rule reports, with what replaces them: removed-name and unknown-name leave
 * them to it, so that a line has one finding for one name.
 * @type {{ old: string, rule: string }[]}
 */
export const ELSEWHERE = [
  { old: 'im-brand-image', rule: 'brand-mark' },
];
