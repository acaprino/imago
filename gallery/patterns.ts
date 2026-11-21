// The page patterns of the gallery: what an app puts in the content region of its shell, beyond the controls of the
// matrix. Every class css/ styles for a page is drawn here, written by the package's own renderers wherever one exists
// (ts/ui/markup.ts, content-markup.ts, form-markup.ts, wizard-markup.ts, shell-markup.ts, graph-legend.ts, readout.ts,
// dom-parts.ts, file-tree.ts, file-workspace.ts, breadcrumbs.ts, portrait-notice.ts, ts/graph.ts, ts/graph-editor.ts; the
// tiling workspace is gallery/tiling.ts), so the gallery proves the renderer and the stylesheet together. A class no
// renderer writes is written by hand, the way the app that uses it writes it; each place says which app.
// gallery/mount/patterns.ts mounts the four sections, and tests/gallery/controls.mjs measures the contrast of every text in them.

import { graphView } from '../ts/graph.ts';
import {
  graphArrowMarker, graphConnectionPreview, graphEditorEdge, graphEditorNode, graphEditorPort, graphEditorWorkspace, graphInspector, graphMiniature,
} from '../ts/graph-editor.ts';
import {
  bulletListHtml, codeNoteHtml, codeViewHtml, quoteHtml, sectionHeadingHtml, stackListHtml, stackRowHtml, summaryHtml, tableHtml, tableRowHtml,
  taskCardHtml, textStackHtml, timelineItemHtml, toolbarHtml,
} from '../ts/ui/content-markup.ts';
import { uiButton, uiPart } from '../ts/ui/dom-parts.ts';
import { createFileTree } from '../ts/ui/file-tree.ts';
import { fileWorkspace } from '../ts/ui/file-workspace.ts';
import {
  checkboxOptionHtml, fieldErrorHtml, formFooterHtml, formGroupHtml, formHeaderHtml, repeatableFieldRowHtml, selectFieldHtml, settingInputHtml,
  settingsGroupHtml, settingsMessageHtml, settingsRowHtml, statusTextHtml,
} from '../ts/ui/form-markup.ts';
import { graphLegendHtml } from '../ts/ui/graph-legend.ts';
import { avatarHtml, buttonHtml, chipHtml, escapeHtml, iconButtonHtml, iconHtml, pageHeadingHtml, segmentedHtml, spinnerHtml, textFieldHtml } from '../ts/ui/markup.ts';
import { portraitNotice } from '../ts/ui/portrait-notice.ts';
import { metric, setProgress } from '../ts/ui/readout.ts';
import { noteHtml, pageContentHtml, shellFrameHtml, statusButtonHtml } from '../ts/ui/shell-markup.ts';
import { breadcrumbs } from '../ts/ui/breadcrumbs.ts';
import { choiceRowsHtml, wizardActionsHtml, wizardHeadingHtml, wizardHtml } from '../ts/ui/wizard-markup.ts';
import type { Tone } from '../ts/ui/tone.ts';

const TONES: Tone[] = ['ok', 'warn', 'err', 'info'];

/** A block of the patterns, named for the contrast test: it says which pattern a text that does not read belongs to. */
const block = (name: string, title: string, html: string): string =>
  `<div class="g-pattern" data-g-pattern="${name}"><h3 class="g-part-title">${escapeHtml(title)}</h3>${html}</div>`;

/**
 * An app's window reduced to its content region: an `im-shell` whose frame `shellFrameHtml` writes, without a title bar
 * (the window above has the title bar of the five apps). The region holds the page `pageContentHtml` writes.
 */
export function fixtureHtml(options: { id: string; label: string; pageHtml: string; narrow?: boolean }): string {
  return `<div class="im-root"><div class="im-shell" data-im-sidebar="off">${shellFrameHtml({
    titlebarHtml: '',
    contentHtml: pageContentHtml(options.pageHtml, options.narrow ? 'narrow' : 'normal'),
    contentId: options.id,
    contentLabel: options.label,
    skipLabel: 'Skip to content',
    inspectorLabel: 'Details',
  })}</div></div>`;
}

// ---- page patterns: a page of records (as Muro writes its projects and its sync) --------------------------------

const PATH = 'C:\\work\\acme\\marionette\\marionette.project.json';

/** The head of a page and of a record, its toolbar, and its summary. */
function pageHeadHtml(): string {
  // im-breadcrumb-space, im-record-heading, im-record-meta and the file list are Muro's (pages/projects.ts), written by hand.
  const crumb = `<div class="im-breadcrumb-space">${buttonHtml('Projects', 'g-back', { sm: true, icon: 'back' })}</div>`;
  const heading = pageHeadingHtml('Projects', 'A project turns plugins and skills into one plugin, harmonized for every harness.',
    buttonHtml('Open project file…', 'g-open', { icon: 'folder' }) + buttonHtml('Rebuild all', 'g-rebuild', { accent: true, icon: 'reload' }));
  const record = `<div class="im-record-heading">${avatarHtml('MA')}<h1>Marionette</h1>${chipHtml('0.4.0')}${chipHtml('Up to date', 'ok')}</div>`
    + `<div class="im-record-meta"><code>${escapeHtml(PATH)}</code>${buttonHtml('Open folder', 'g-folder', { sm: true, icon: 'folder' })}`
    + '<span>Repository <code>github.com/acaprino/marionette</code> · main · by Alfio · created 3 Nov 2026</span>'
    + '<details class="im-grow" open><summary>What this project file holds</summary><ul class="im-panel im-surface im-file-list" data-im-surface="sheet">'
    + '<li><strong>Inputs</strong><span>3 plugins and 2 skills, as their authors ship them</span><code class="im-muted">inputs/</code></li>'
    + '<li><strong>Graph</strong><span>5 capabilities and the order they run in</span><code class="im-muted">graph.json</code></li>'
    + '<li><strong class="im-muted">Offline</strong><span class="im-muted">The file carries everything: the project rebuilds without the network.</span><span></span></li>'
    + '</ul></details></div>';
  // The toolbar: a filter and a search, and at its end (im-end) a cluster of what acts on the list.
  const search = `<label class="im-input">${iconHtml('search')}<input type="search" placeholder="Search plugins" aria-label="Search plugins"><kbd class="im-key">/</kbd></label>`;
  const toolbar = toolbarHtml(segmentedHtml('g-pattern-filter', 'all', [['all', 'All'], ['action', 'Needs action']], 'Filter plugins') + search
    + `<div class="im-end im-cluster">${chipHtml('5 plugins', 'accent')}${chipHtml('2 to update', 'warn')}</div>`, buttonHtml('Check now', 'g-check', { icon: 'sync' }));
  const summaries = summaryHtml({ label: 'Sync', title: '3 changes ready to apply', tone: 'warn', icon: 'sync', metadata: [{ label: 'Install', value: '1' }, { label: 'Update', value: '1' }, { label: 'Remove', value: '1' }] })
    + summaryHtml({ label: 'Harnesses', title: 'Every harness is in sync', tone: 'ok', icon: 'check', metadata: [{ label: 'Checked', value: 'today 08:07' }] })
    + summaryHtml({ label: 'Plan', title: '5 plugins in your list', tone: 'accent', icon: 'layers', metadata: [{ label: 'Next check', value: '09:07' }] })
    + summaryHtml({ label: 'Draft', title: 'No change yet' });
  return block('page-heading', 'Page heading, record and summary', crumb + heading + record)
    + block('toolbar', 'Toolbar', toolbar)
    + block('summary', 'Summary, in its tones', summaries);
}

/** The lists of a page: a stack list, links to records, decisions and activity, and a list of details. */
function listsHtml(): string {
  const rows = stackRowHtml({ title: 'commit-helper', message: 'Writes commit messages from the staged diff', detail: 'github.com/example/commit-helper', leadingHtml: avatarHtml('CH'), trailingHtml: chipHtml('2.1.0'), relatedHtml: chipHtml('Claude Code') + chipHtml('Codex') })
    + stackRowHtml({ title: 'test-runner', titleMono: true, message: 'Runs the tests of the file you changed', leadingHtml: avatarHtml('TR'), trailingHtml: chipHtml('Install 1.0.4', 'accent') });
  // A row that opens its record (Muro, pages/projects.ts): the whole row is one button, with its path cut short.
  const link = `<ul class="im-panel im-surface im-stack-list" data-im-surface="sheet"><li class="im-list-link"><button type="button">${avatarHtml('MA')}<span class="im-grow"><strong>Marionette <span class="im-muted">0.4.0</span></strong><small class="im-ellipsis" title="${escapeHtml(PATH)}">${escapeHtml(PATH)}</small></span><small class="im-nowrap">3 inputs · 5 capabilities</small>${chipHtml('Up to date', 'ok')}<small class="im-nowrap">On 3 harnesses</small>${iconHtml('chevron')}</button>${buttonHtml('Remove from list', 'g-remove', { sm: true })}</li></ul>`;
  const decisions = stackListHtml(stackRowHtml({ title: 'Keep the plan step', message: 'Codex and Claude Code both run it first.', leadingHtml: chipHtml('Keep', 'ok') })
    + stackRowHtml({ title: 'Drop the lint hook', message: 'OpenCode has no hook to run it in.', leadingHtml: chipHtml('Drop', 'err') }), 'decisions');
  const activity = stackListHtml(timelineItemHtml({ time: 'Today 08:07', title: 'Checked for updates', message: '1 update, 1 install' })
    + timelineItemHtml({ time: 'Yesterday 07:07', title: 'Applied 2 changes', detail: 'Marionette 0.3.0 → 0.4.0' }), 'timeline');
  // A row of a list that wraps its text, as React's Row writes it for a detail (react/index.js): written by hand here.
  const detailRow = '<div role="listbox" aria-label="Sessions" class="im-list"><div class="im-row im-row--detail" role="option" aria-selected="false"><span class="im-row-text"><span class="im-row-title">billing-service · feature/retry-backoff</span><span class="im-row-sub">Claude Code, started 12 minutes ago, 4 terminals, 268 MiB of memory in use</span></span></div></div>';
  return block('stack-list', 'Stack list', sectionHeadingHtml('Plugins') + '<p class="im-section-description im-muted">Plugins Muro installs as their author ships them.</p>' + stackListHtml(rows) + link)
    + block('decisions', 'Decisions and activity', decisions + activity)
    + block('detail-row', 'A row that wraps', detailRow);
}

/** Tables: records with their states, a log, and a list of inputs. */
function tablesHtml(): string {
  // The record button, the inline cell and the meta under a header are Muro's (pages/sync.ts), written by hand.
  const record = `<button type="button" class="im-btn im-btn--ghost im-record-button">${avatarHtml('MA')}<span><strong>Marionette</strong><small title="github.com/acaprino/marionette">github.com/acaprino/marionette</small></span></button>`;
  const inSync = `<span class="im-inline-cell im-tone-ok">${iconHtml('check')}<span>In sync</span></span>`;
  const head = '<div class="im-inline">Plugin</div><div class="im-cell-meta"><small>5 plugins in your list</small></div>';
  const records = tableHtml(['Plugin', 'Latest version', 'Claude Code'],
    tableRowHtml([record, textStackHtml('0.4.0', 'Latest release · 5e49ee9', { strong: true }), inSync])
    + tableRowHtml([head, textStackHtml('2.1.0', 'Pinned'), chipHtml('Update 0.3.0 → 0.4.0', 'warn')]), { label: 'Plugins' });
  const log = tableHtml(['When', 'Version', 'Changes', 'Result'],
    tableRowHtml([{ html: 'Today 08:07', className: 'im-nowrap' }, '0.4.0', { html: 'Faster start.\nThe folder picker remembers the last folder.', className: 'im-log-note' }, chipHtml('Applied', 'ok')]), { label: 'History', variant: 'log' });
  const inputs = tableHtml(['Input', 'Kind'], tableRowHtml([textStackHtml('marionette', 'C:\\work\\acme\\marionette\\plugins\\marionette'), chipHtml('Plugin')]), { label: 'Inputs', variant: 'inputs' });
  const empty = tableHtml(['Plugin', 'Version'], '', { label: 'Search results', empty: 'No plugin matches "lint".' });
  return block('table', 'Table of records, a log, inputs and an empty table', records + log + inputs + empty);
}

/** Text in a page: a definition list, a bullet list, a quote, code, a file list, a task card and a numbered result. */
function textHtml(): string {
  const definitions = '<dl class="im-definition-list"><dt>Role</dt><dd>Plans the change before it is made</dd>'
    + '<dt>Entry</dt><dd class="im-stack"><span>review</span><small>Every request that asks for a review</small></dd>'
    + `<dt>Comes from</dt><dd class="im-tag-row">${chipHtml('marionette')}${chipHtml('commit-helper')}</dd></dl>`;
  const bullets = bulletListHtml(['The plan step runs first.', 'The lint hook is left out on OpenCode.']);
  const code = codeViewHtml('{\n  "name": "marionette",\n  "version": "0.4.0",\n  "targets": ["claude-code", "codex"]\n}', 'Project file') + codeNoteHtml('sha 5e49ee96e · 1.2 kB');
  const task = taskCardHtml({ id: 'g-task-harmonize', title: 'Harmonize Marionette', leadingHtml: spinnerHtml, actionsHtml: buttonHtml('Cancel', 'g-cancel', { sm: true }), phase: 'Adapting for Codex', elapsed: '1:42', progressLabel: 'Harmonize Marionette', progressText: '2 of 4 harnesses', description: 'The AI rewrites each skill for the harness it runs in.' });
  // The numbered result of a simulation (Muro, pages/project/graph.ts), written by hand.
  const result = '<div class="im-panel im-surface im-numbered-result" data-im-surface="sheet" role="status">'
    + `<div class="im-tag-row">${chipHtml('3 steps', 'ok')}${chipHtml('Documented example')}<small>With commit-helper</small></div>${quoteHtml('Review the change I staged and write its commit message')}`
    + '<ol>' + [['plan', 'read', 'Reads the request'], ['review', 'review', 'Reads the staged diff'], ['commit-message', 'commit', 'Writes the message']].map(([name, intent, why], at) =>
      `<li><b aria-hidden="true">${at + 1}</b><div>${buttonHtml(name, 'g-open-capability', { sm: true, cls: 'im-btn--ghost' })} <code>${intent}</code><br><small>${why}</small></div></li>`).join('') + '</ol>'
    + '<p class="im-wrap-text">The request asks for a review and a message: both branches run, the review first.</p></div>';
  return block('definition-list', 'Definition list, bullet list and quote', definitions + bullets + quoteHtml('Keep the review on the hop branch.'))
    + block('code-view', 'Code view', code)
    + block('task-card', 'Task card', task)
    + block('numbered-result', 'Numbered result', result);
}

/** A page with an aside (Muro, pages/project/graph.ts): a column of steps and a list of choices beside a graph. */
function asideHtml(): string {
  const choices = '<h3>Documented examples <span class="im-count">2</span></h3><ul class="im-panel im-surface im-choice-list" data-im-surface="sheet">'
    + '<li><button type="button" aria-pressed="true"><strong>Review and commit</strong><small>Review the change I staged and write its commit message</small></button></li>'
    + '<li><button type="button" aria-pressed="false"><strong>Release notes</strong><small>Write the notes of the next release</small></button></li></ul>';
  const legend = graphLegendHtml([{ label: 'entry → capability' }, { label: 'needs, on a condition', stroke: 'dashed', tone: 'warn' }, { label: 'never together', stroke: 'dotted', tone: 'err' }, { label: 'activated', tone: 'accent' }], '2 entries · 5 capabilities');
  return block('aside-layout', 'A page with an aside',
    '<div class="im-aside-layout"><div class="im-stack-3"><div><h2>Simulate a request</h2><small>See which branch of the graph a request activates.</small></div>'
    + `<div class="im-stack-2"><textarea class="im-textarea" rows="2" aria-label="Request to simulate" aria-describedby="g-pattern-simulate-error">Review the change I staged</textarea>${fieldErrorHtml('g-pattern-simulate-error')}<div class="im-action-row">${buttonHtml('Simulate', 'g-simulate', { icon: 'play' })}</div></div>`
    + `${choices}</div><div class="im-panel im-surface im-graph-panel" data-im-surface="sheet">${legend}<div class="im-graph-host" data-g-graph-host></div></div></div>`);
}

/** The page of records: everything above in the content region of an app. */
export const recordsPageHtml = (): string => pageHeadHtml() + listsHtml() + tablesHtml() + textHtml() + asideHtml();

// ---- page patterns: an inspection page (as Daodan writes its analysis) ------------------------------------------

/** Sections of an inspection page; the metrics are filled by `fillPatterns`. The classes here are Daodan's, by hand. */
export function inspectionPageHtml(): string {
  const head = '<section class="im-section"><div class="im-split"><div class="im-text-stack"><span class="im-kicker im-text-accent">Analysis</span><h2>acaprino/daodan</h2></div>'
    + `<div class="im-end im-cluster">${chipHtml('main')}${chipHtml('Paused', 'warn')}${buttonHtml('Resume', 'g-resume', { icon: 'play' })}</div></div></section>`;
  const metrics = '<section class="im-section"><h2>Graph</h2><div class="im-metric-grid" data-g-metrics></div></section>';
  const findings = '<section class="im-section"><h2>Findings</h2><ul class="im-detail-list"><li><strong>2 cycles</strong> between the store and its cache</li><li><strong>14 modules</strong> no test reaches</li></ul></section>';
  const timeline = '<section class="im-section"><h2>Timeline</h2><ol class="im-timeline"><li><strong>Scan</strong><small>0:42 · inventory and pre-map</small></li><li><strong>Analyze</strong><small>2:10 · analyzers per technology</small></li></ol></section>';
  const cards = '<section class="im-section"><h2>Sessions</h2><div class="im-auto-grid im-inset im-scroll im-scroll--bounded">'
    + `<div class="im-surface im-inset" data-im-surface="sheet"><div class="im-cluster">${chipHtml('Running', 'ok')}<strong>billing-service</strong></div><p class="im-readout">npm test -- retry\n14 passed in 2.1 s</p></div>`
    + `<div class="im-surface im-inset" data-im-surface="sheet"><div class="im-cluster">${chipHtml('Idle')}<strong>docs-site</strong></div><p class="im-readout">Last run yesterday</p></div></div></section>`;
  // A canvas in a frame of a fixed height, with a message over it; and a smaller preview frame.
  const canvas = '<section class="im-section"><h2>Canvas</h2><div class="im-canvas-frame"><div class="im-canvas-panel"><div class="im-fill im-surface im-inset" data-im-surface="dense"><p class="im-caption">The app draws its canvas here: a graph, a map, a render.</p></div>'
    + `<div class="im-canvas-message im-note" data-im-tone="info" role="status">${iconHtml('info')}<div><b>18 nodes shown</b><span>Zoom in to read their names.</span></div></div></div></div>`
    + '<div class="im-canvas-frame im-canvas-frame--preview"><div class="im-surface" data-im-surface="dense"></div></div></section>';
  // A mark the size of a line of text: a harness's logo before its name.
  const mark = '<p class="im-section"><img class="im-inline-mark" alt="" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Ccircle cx=%228%22 cy=%228%22 r=%227%22 fill=%22%23888%22/%3E%3C/svg%3E"> Claude Code</p>';
  return block('inspection', 'Sections, a split head and a cluster', head)
    + block('metrics', 'Metrics', metrics)
    + block('detail-list', 'Detail list and timeline', findings + timeline)
    + block('aside', 'An aside of items', '<div data-g-aside></div>')
    + block('auto-grid', 'Auto grid, inset and bounded scroll', cards)
    + block('canvas', 'Canvas frame and its message', canvas + mark);
}

// ---- forms ------------------------------------------------------------------------------------------------------

/** A wizard of three steps on its second (wizard-markup.ts). */
export function wizardPageHtml(): string {
  const heading = wizardHeadingHtml('Choose the harnesses', 'Muro installs the plugin on each one you choose.', { id: 'g-wizard-heading', describedBy: ['g-wizard-counter'] });
  const choices = choiceRowsHtml([
    { name: 'g-wizard-targets', value: 'claude', checked: true, label: 'Claude Code', hint: 'C:\\Users\\you\\.claude', leadingHtml: avatarHtml('CC') },
    { name: 'g-wizard-targets', value: 'codex', checked: false, label: 'Codex', hint: 'C:\\Users\\you\\.codex', leadingHtml: avatarHtml('CX') },
    { name: 'g-wizard-targets', value: 'opencode', checked: false, label: 'OpenCode', hint: 'Not installed on this computer', disabled: true, leadingHtml: avatarHtml('OC') },
  ]);
  const actions = wizardActionsHtml(buttonHtml('Back', 'g-wizard-back'), buttonHtml('Continue', 'g-wizard-next', { primary: true }));
  return wizardHtml(heading + choices + actions, { headingId: 'g-wizard-heading', progressLabel: 'Add a plugin', steps: ['Source', 'Harnesses', 'Review'], current: 1, counter: 'Step 2 of 3', counterId: 'g-wizard-counter' });
}

/** A form as an app writes it in a dialog or a sheet: head, fields, groups, a disclosure, the operations and a footer. */
export function formPageHtml(): string {
  const fields = textFieldHtml('Name', 'g-form-name', 'Marionette', { id: 'g-form-name', hint: 'The name the harnesses show.' })
    + selectFieldHtml('Updates', 'g-form-policy', [['stable', 'Latest release'], ['pinned', 'Pinned version'], ['head', 'Latest commit']], 'pinned')
    // A field that only shows for one choice (Muro, forms.ts: im-field-space), and the slot of a message that is empty.
    + `<div class="im-field-space">${textFieldHtml('Pinned version', 'g-form-pinned', '0.4.1', { id: 'g-form-pinned', mono: true, optional: true })}</div><div class="im-hide-empty"></div>`
    + formGroupHtml('Install on', checkboxOptionHtml({ name: 'g-form-targets', value: 'claude', checked: true, label: 'Claude Code', hint: 'C:\\Users\\you\\.claude', top: true })
      + checkboxOptionHtml({ name: 'g-form-targets', value: 'codex', checked: false, label: 'Codex' }), 'Muro installs it on every harness you tick.');
  // The operations of a sync, with their status, its notes and a disclosure of more actions (Muro, sheets.ts), by hand.
  const operations = '<section class="im-form-section" tabindex="-1"><h3>Installed here</h3><ul class="im-operation-list">'
    + `<li><span class="im-operation-status"><span class="im-text-ok">${iconHtml('check')}</span></span>${chipHtml('Update', 'warn')}<div><strong>Marionette</strong><small>0.3.0 → 0.4.0</small></div></li>`
    + `<li><span class="im-operation-status">${spinnerHtml}</span>${chipHtml('Install', 'info')}<div><strong>test-runner</strong><small>1.0.4</small></div></li></ul></section>`;
  const notes = `<section class="im-notes" aria-label="Custom instructions"><p class="im-text-warn">Instructions changed. Adapt again for: Codex.</p><details open><summary>Custom instructions · 2 Markdown files</summary><ul class="im-file-lines"><li><code>review.md</code></li><li><code>commit.md</code></li></ul></details></section>`;
  const more = `<details class="im-disclosure-section" open><summary>More</summary><div class="im-action-row">${buttonHtml('Check for updates', 'g-form-resolve', { icon: 'sync' })}${buttonHtml('Remove from my list', 'g-form-remove', { danger: true })}</div></details>`;
  return block('form', 'A form: head, fields, groups, operations and footer',
    `<form class="im-form" aria-labelledby="g-form-title" data-g-form>${formHeaderHtml('Marionette', 'Installed as its author ships it.', false, 'g-form-title')}${fields}${operations}${notes}${more}${fieldErrorHtml('g-form-error', '', 'div')}${formFooterHtml({ submit: 'Save', leadingHtml: '<small class="im-push-start">1 plugin will be uninstalled.</small>' })}</form>`);
}

/** Settings rows, repeat rows, a grid of fields and a list of choices. */
export function settingsPageHtml(): string {
  const settings = settingsGroupHtml(
    settingsRowHtml({ title: 'Model', hintHtml: 'The model every harness asks first.', field: 'g-set-model', controlHtml: settingInputHtml({ name: 'g-set-model', label: 'Model', value: 'claude-opus' }) })
    // A line of its own in the hint of a row (Muro, pages/settings.ts: im-block).
    + settingsRowHtml({ title: 'API key', hintHtml: '<span class="im-block">Set in MURO_API_KEY.</span><span class="im-block">Muro never stores the key.</span>', field: 'g-set-key', controlHtml: settingInputHtml({ name: 'g-set-key', label: 'API key variable', value: 'MURO_API_KEY' }) })
    + settingsMessageHtml('The key was found.', ['Last checked today 08:07.'], { icon: 'check', tone: 'ok' })
    + settingsMessageHtml('Codex has no configuration folder yet.', [], { icon: 'warning', tone: 'warn' }),
    { title: 'AI engine', description: 'What adapts the plugins for each harness.' });
  const repeat = (name: string, value: string): string => repeatableFieldRowHtml(
    textFieldHtml('Variable', `g-env-${name}`, name, { id: `g-env-${name}`, mono: true, error: false })
    + textFieldHtml('Value', `g-env-${name}-value`, value, { id: `g-env-${name}-value`, error: false })
    + textFieldHtml('Scope', `g-env-${name}-scope`, 'User', { id: `g-env-${name}-scope`, error: false })
    + iconButtonHtml(`Remove ${name}`, 'g-env-remove', 'close'));
  return block('settings', 'Settings rows and status lines', settings + `<p>${statusTextHtml('3 checks passed', 'ok')} · ${statusTextHtml('1 skipped', 'warn')}</p>`)
    + block('repeat-rows', 'Repeat rows', repeat('MURO_API_KEY', '••••••') + repeat('HTTPS_PROXY', 'http://proxy:3128'))
    + block('form-grid', 'A grid of fields and a list of choices', '<div class="im-form-grid" data-g-form-grid></div><div class="im-choice-list" data-g-choice-rows></div>');
}

// ---- feedback ----------------------------------------------------------------------------------------------------

/** Notes in the four tones, the text helpers on the ground and on a sheet, a status in a title bar, a log. */
export function feedbackPageHtml(): string {
  const notes = TONES.map((tone) => noteHtml({ icon: tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'warning', title: `A note in ${tone}`, message: 'It stays in the page until what it says changes.', tone })).join('');
  // The helpers: statusTextHtml writes the four status tones; im-text-accent, im-muted and im-caption are written by hand.
  const helpers = (surface: 'ground' | 'sheet'): string => `<div class="im-surface im-inset" data-im-surface="${surface}" data-g-surface="${surface}">`
    + `<p>${TONES.map((tone) => statusTextHtml(`${tone} text`, tone)).join(' · ')} · <span class="im-text-accent">accent text</span> · <span class="im-muted">muted text</span> · <span class="im-caption">caption text</span> · <span class="im-kicker">kicker</span></p>`
    + '<p class="im-truncate">A line cut short when it does not fit: C:\\work\\acme\\billing-service\\src\\payments\\retry\\backoff.ts</p></div>';
  const status = `<div class="im-inline-row">${(['ok', 'warn', 'err', 'info', 'accent', ''] as const).map((tone) => statusButtonHtml({ label: tone ? `${tone} status` : 'no tone', accessibleLabel: `Status: ${tone || 'none'}`, action: 'g-status', tone })).join('')}</div>`;
  return block('notes', 'Notes in the four tones', notes)
    + block('text-helpers', 'Text helpers on the ground and on a sheet', helpers('ground') + helpers('sheet'))
    + block('titlebar-status', 'Status in the title bar', status)
    + block('thread', 'A summary list and a log that scroll on their own', '<div class="g-thread" data-g-thread></div>')
    + block('viewport', 'A viewport with a banner at its foot', '<div class="g-viewport" data-g-viewport></div>')
    + block('portrait-notice', 'Portrait notice', '<div class="g-portrait" data-g-portrait></div>');
}

// ---- files and workspaces -------------------------------------------------------------------------------------------

export function filesPageHtml(): string {
  return block('file-workspace', 'File workspace: a tree, the location, a document and a render view', '<div class="g-file-workspace" data-g-file-workspace></div>')
    + block('file-dialog', 'File dialog', `<p>${buttonHtml('Open the file dialog', 'g-file-dialog')}</p>`)
    + block('graph-editor', 'Graph editor', '<div class="g-graph-editor" data-g-graph-editor></div>')
    + block('tiling', 'Tiling workspace', '<div class="g-tiling" data-g-tiling></div>');
}

/** The look of the sections round the patterns (the gallery's, not the package's): each window a fixed height. */
export const PATTERNS_CSS = `
.g-fixture { height: 760px; border-radius: 8px; overflow: hidden; box-shadow: 0 0 0 1px var(--im-edge), 0 20px 50px rgba(0, 0, 0, .3); }
.g-fixture[data-g-fixture="wizard"] { height: 520px; }
.g-fixture > .im-root > .im-shell { grid-template-rows: minmax(0, 1fr); }
.g-pattern + .g-pattern { margin-top: var(--im-s-5); }
.g-thread { display: flex; flex-direction: column; height: 240px; border: 1px solid var(--im-line); border-radius: var(--im-r-sheet); }
.g-viewport { display: flex; height: 140px; border: 1px solid var(--im-line); border-radius: var(--im-r-sheet); }
.g-portrait { position: relative; height: 260px; contain: layout paint; border: 1px dashed var(--im-line); border-radius: var(--im-r-sheet); }
.g-file-workspace { display: flex; flex-direction: column; height: 320px; border: 1px solid var(--im-line); border-radius: var(--im-r-sheet); }
.g-graph-editor { height: 460px; border: 1px solid var(--im-line); }
.g-tiling { height: 360px; }
`;

// ---- what the DOM renderers fill --------------------------------------------------------------------------------

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The metrics of the inspection page, from `metric`. */
function fillMetrics(root: ParentNode): void {
  root.querySelector('[data-g-metrics]')?.append(metric(document, '18', 'Nodes', '10 shown'), metric(document, '43', 'Relations', '23 shown'), metric(document, '2', 'Cycles'), metric(document, '64%', 'Done', 'Step 2 of 4'));
}

/** An aside of items, each a definition list of its parts (dom-parts.ts: aside, item, descriptionList, term, definition). */
function fillAside(root: ParentNode): void {
  const host = root.querySelector('[data-g-aside]');
  if (!host) return;
  const aside = uiPart('aside');
  aside.setAttribute('aria-label', 'Selected node');
  const list = uiPart('list');
  for (const [name, kind, path] of [['retry.ts', 'Module', 'src/payments/retry.ts'], ['charge.ts', 'Module', 'src/payments/charge.ts']]) {
    const item = uiPart('item');
    const facts = uiPart('descriptionList');
    facts.append(uiPart('term', 'Name'), uiPart('definition', name), uiPart('term', 'Kind'), uiPart('definition', kind));
    item.append(facts, uiPart('hint', path));
    list.append(item);
  }
  aside.append(uiPart('heading', 'Selected node'), list, uiPart('pre', 'import { charge } from "./charge";'));
  host.append(aside);
}

/** A graph in the host of the aside page, with a group round two of its nodes. */
function fillGraphHost(root: ParentNode): () => void {
  const host = root.querySelector<HTMLElement>('[data-g-graph-host]');
  if (!host) return () => {};
  const view = graphView(host, { label: 'Capabilities of Marionette', controls: { zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit diagram' } });
  const group = el('span', 'im-caption', 'review');
  view.draw({
    groups: [{ id: 'review', x: -12, y: -28, width: 330, height: 84, content: group }],
    nodes: [{ id: 'plan', label: 'plan', x: 0, y: 0, width: 126, height: 42 }, { id: 'review', label: 'review', x: 180, y: 0, width: 126, height: 42 }, { id: 'commit', label: 'commit-message', x: 90, y: 110, width: 150, height: 42 }],
    edges: [{ source: 'plan', target: 'review' }, { source: 'review', target: 'commit', dashed: true, tone: 'warn', label: 'on a condition', showLabel: true }],
  });
  return () => view.dispose();
}

/** The grid of fields and the choice rows of the settings page (dom-parts.ts: uiPart, uiButton). */
function fillFormGrid(root: ParentNode): void {
  const grid = root.querySelector('[data-g-form-grid]');
  if (grid) {
    for (const [label, value] of [['Temperature', '0.2'], ['Max tokens', '4096'], ['Top p', '0.9']]) {
      const field = uiPart('field');
      const input = document.createElement('input');
      input.className = 'im-input';
      input.value = value;
      field.append(uiPart('text', label), input);
      grid.append(field);
    }
  }
  const choices = root.querySelector('[data-g-choice-rows]');
  if (choices) {
    choices.setAttribute('role', 'listbox');
    choices.setAttribute('aria-label', 'Project');
    for (const [name, detail, selected] of [['billing-service', 'C:\\work\\acme\\billing-service', true], ['docs-site', 'C:\\work\\acme\\docs-site', false]] as const) {
      const row = uiButton('', { cls: 'im-choice-row' });
      row.setAttribute('role', 'option');
      row.setAttribute('aria-pressed', String(selected));
      row.replaceChildren(uiPart('strong', name), uiPart('hint', detail));
      choices.append(row);
    }
  }
}

/** A thread's sessions over its conversation (Shinatama, thread-chat.ts), from uiPart. */
function fillThread(root: ParentNode): void {
  const host = root.querySelector('[data-g-thread]');
  if (!host) return;
  const sessions = uiPart('list', undefined, 'im-summary-list');
  sessions.setAttribute('aria-label', 'Sessions of the thread');
  for (const [name, state] of [['claude-a', 'lead · running'], ['codex-b', 'worker · waiting']]) {
    const item = uiPart('item');
    item.append(uiPart('strong', name), uiPart('hint', state));
    sessions.append(item);
  }
  const log = uiPart('orderedList', undefined, 'im-scroll-log');
  log.setAttribute('aria-label', 'Conversation of the thread');
  log.tabIndex = 0;
  for (const [who, text] of [['claude-a', 'Keep the review on the hop branch.'], ['codex-b', 'Three threads still have no title.'], ['claude-a', 'List them, then name each one.']]) {
    const item = uiPart('item');
    const said = uiPart('paragraph', text);
    item.append(uiPart('strong', who), said);
    log.append(item);
  }
  // A word found in the log is marked (uiPart mark), and a rule closes the log.
  log.lastElementChild?.querySelector('p')?.append(' ', uiPart('mark', 'name each one'));
  host.append(sessions, log, uiPart('separator'));
}

/** A viewport with a banner at its foot (Shinatama, main.ts: im-viewport-footer). */
function fillViewport(root: ParentNode): void {
  const host = root.querySelector('[data-g-viewport]');
  if (!host) return;
  const viewport = uiPart('viewport');
  const scroll = uiPart('scroll');
  scroll.append(uiPart('paragraph', 'The session ended. Its terminal output is kept until you close the tab.'));
  const banner = uiPart('row', undefined, 'im-viewport-footer');
  banner.setAttribute('role', 'status');
  banner.append(uiPart('text', 'Session ended with code 0'), uiPart('spacer'), uiButton('Close tab', { sm: true }));
  viewport.append(scroll, banner);
  host.append(viewport);
}

/** The portrait notice of a detached window, shown in a frame of its own: its root is fixed to the window it fills. */
function fillPortrait(root: ParentNode): void {
  const host = root.querySelector('[data-g-portrait]');
  if (!host) return;
  const notice = portraitNotice({ label: 'Session notice', name: 'claude-a', dismiss: 'Dismiss', open: 'Open session' });
  notice.portrait.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 60 80%22%3E%3Crect width=%2260%22 height=%2280%22 rx=%228%22 fill=%22%23778%22/%3E%3C/svg%3E';
  notice.kind.textContent = 'Needs you';
  notice.title.textContent = 'billing-service is waiting for an answer';
  notice.body.textContent = 'Claude Code asks whether to run the migration on the staging database.';
  notice.root.hidden = false;
  host.append(notice.root);
}

/** A file workspace: a tree of files with their sizes, the location, a document pane and a render view. */
function fillFileWorkspace(root: ParentNode): () => void {
  const host = root.querySelector('[data-g-file-workspace]');
  if (!host) return () => {};
  const workspace = fileWorkspace({ resizeLabel: 'Resize the file list', toolbarLabel: 'File actions', initialWidth: 240 });
  const tree = createFileTree(document, [
    { id: 'src', name: 'src', icon: 'folder', children: [{ id: 'retry', name: 'retry.ts', icon: 'file', detail: '2.1 kB' }, { id: 'charge', name: 'charge.ts', icon: 'file', detail: '4.8 kB' }] },
    { id: 'readme', name: 'README.md', icon: 'document', detail: '1.2 kB' },
  ], { label: 'Files of billing-service', expanded: ['src'], selected: 'retry' });
  const list = uiPart('scroll');
  list.append(tree.element);
  workspace.navigation.append(list);
  workspace.location.append(breadcrumbs(document, 'File location', [{ id: 'src', label: 'src' }, { id: 'retry', label: 'retry.ts' }], () => {}));
  workspace.toolbar.append(uiButton('Save', { sm: true }));
  workspace.panes.append(el('pre', 'im-code-view', 'export function backoff(attempt: number): number {\n  return Math.min(30_000, 2 ** attempt * 250);\n}'));
  // A render view (Shinatama, browser-tab.ts): its address bar over a canvas.
  const render = uiPart('stack', undefined, 'im-render-view');
  const bar = uiPart('toolbar');
  const address = document.createElement('input');
  address.className = 'im-input';
  address.setAttribute('aria-label', 'Address');
  address.value = 'http://localhost:5173/';
  bar.append(address, uiButton('Reload', { sm: true, icon: 'reload' }));
  const stage = uiPart('viewport');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Page preview');
  stage.append(canvas);
  render.append(bar, stage);
  workspace.panes.append(render);
  workspace.status.textContent = 'Saved 2 minutes ago';
  host.append(workspace.element);
  return () => { tree.destroy(); workspace.destroy(); };
}

/** The graph editor of a team map (graph-editor.ts), with the parts Shinatama adds to it (team-map.ts), by hand. */
function fillGraphEditor(root: ParentNode): void {
  const host = root.querySelector('[data-g-graph-editor]');
  if (!host) return;
  const { root: workspace, palette, stage, editor } = graphEditorWorkspace('Team map', 'Sessions');
  // The toolbar: the saved teams in a popup, a miniature of the map, and what is wrong with the team.
  const toolbar = uiPart('toolbar');
  const mini = graphMiniature({ width: 48, height: 28, nodeWidth: 12, nodeHeight: 7, nodes: [{ x: 10, y: 8 }, { x: 38, y: 8 }, { x: 24, y: 21 }], edges: [{ a: { x: 10, y: 8 }, b: { x: 38, y: 8 } }, { a: { x: 38, y: 8 }, b: { x: 24, y: 21 }, kind: 'review' }] });
  const templates = uiButton('Templates');
  templates.prepend(mini);
  const summary = uiPart('status', '1 problem', 'im-editor-summary');
  summary.dataset.imTone = 'warn';
  toolbar.append(templates, summary);
  workspace.prepend(toolbar);
  const sources = uiPart('list', undefined, 'im-editor-items');
  sources.setAttribute('aria-label', 'Sessions');
  for (const [name, harness] of [['claude-a', 'Claude Code'], ['codex-b', 'Codex']]) {
    const item = uiPart('item');
    const button = uiButton('', { cls: 'im-editor-source' });
    button.replaceChildren(uiPart('strong', name), uiPart('text', harness));
    button.dataset.imTone = 'info';
    item.append(button);
    sources.append(item);
  }
  const problems = uiPart('list', undefined, 'im-editor-issues');
  problems.setAttribute('aria-label', 'Problems with this team');
  problems.append(uiPart('item', 'codex-b has no one to report to.'));
  palette.append(sources, problems);
  // Two nodes with their title, dot, caption and foot, and the edge between them with its arrow and label.
  const node = (name: string, role: string, x: number, y: number, tone: string): HTMLElement => {
    const card = graphEditorNode({ press() {}, open() {}, nudge() {} });
    card.setAttribute('aria-label', name);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.dataset.imTone = tone;
    const title = uiPart('body', undefined, 'im-editor-node-title');
    const dot = uiPart('text', undefined, 'im-editor-dot');
    dot.setAttribute('aria-hidden', 'true');
    dot.dataset.imTone = 'ok';
    title.append(dot, uiPart('strong', name));
    const foot = uiPart('body', undefined, 'im-editor-node-foot');
    foot.append(uiPart('text', 'told 3'), uiPart('text', 'wakes 1'));
    card.append(title, uiPart('body', role, 'im-editor-caption'), foot, graphEditorPort('→', `Connect ${name}`, () => {}));
    return card;
  };
  editor.nodes.append(node('claude-a', 'lead · plans', 24, 24, 'ok'), node('codex-b', 'worker · writes', 260, 120, 'info'));
  graphArrowMarker(editor.defs, 'g-editor-arrow');
  const edge = graphEditorEdge({ x: 150, y: 50 }, { x: 260, y: 140 }, 'g-editor-arrow', () => {});
  edge.label.textContent = 'reviews';
  edge.title.textContent = 'claude-a reviews codex-b';
  edge.group.dataset.imTone = 'accent';
  editor.edges.append(edge.group);
  // A connection being drawn from a port: the dashed line that follows the pointer.
  graphConnectionPreview(editor.edges, 'g-editor-arrow').update({ x: 150, y: 40 }, { x: 330, y: 40 });
  editor.canvas.style.height = '220px';
  const hint = uiPart('paragraph', 'Drag a session onto the map to add it.', 'im-editor-empty');
  editor.scroll.append(hint);
  // The shelf under the map, with the legend of the kinds of edge.
  const shelf = uiPart('body', undefined, 'im-editor-shelf');
  shelf.innerHTML = graphLegendHtml([{ label: 'reviews', tone: 'accent' }, { label: 'tells', stroke: 'dashed' }]);
  stage.append(shelf);
  // The inspector of the edge: a choice of kinds with their sample stroke, options, and its description.
  const inspector = graphInspector('Edge');
  inspector.style.cssText = 'right: 8px; top: 8px; width: 240px';
  const heading = el('h3', '', 'claude-a → codex-b');
  const kinds = uiPart('stack');
  for (const [kind, label] of [['review', 'Reviews'], ['dotted', 'Tells']] as const) {
    const choice = uiButton('', { cls: 'im-editor-choice' });
    const sample = uiPart('text', undefined, 'im-editor-sample');
    sample.setAttribute('aria-hidden', 'true');
    if (kind === 'dotted') sample.dataset.imStroke = 'dotted';
    choice.replaceChildren(sample, uiPart('strong', label), uiPart('hint', kind === 'review' ? 'Reads what the other wrote' : 'Sends a message'));
    choice.setAttribute('aria-pressed', String(kind === 'review'));
    kinds.append(choice);
  }
  const options = uiPart('body', undefined, 'im-editor-options');
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', 'When');
  options.append(uiButton('Always'), uiButton('On a change'));
  inspector.append(heading, kinds, options, uiPart('paragraph', 'claude-a reads every diff codex-b writes\nbefore it is committed.', 'im-editor-description'));
  // The popup of the saved teams, with a preset and the form that saves one.
  const popup = graphInspector('Templates');
  popup.classList.add('im-editor-popup');
  popup.style.bottom = '56px';
  const presets = uiPart('list', undefined, 'im-editor-items');
  const preset = uiPart('item', undefined, 'im-editor-preset');
  const caption = uiPart('body', undefined, 'im-editor-caption');
  caption.append(uiPart('strong', 'Review pair'), uiPart('text', '2 agents'));
  preset.append(caption, uiButton('Use', { sm: true }));
  presets.append(preset);
  const save = uiPart('body', undefined, 'im-editor-inline-form');
  const name = document.createElement('input');
  name.className = 'im-input';
  name.setAttribute('aria-label', 'Name of the team');
  name.value = 'Review pair';
  save.append(name, uiButton('Save', { sm: true }));
  popup.append(presets, save);
  // The ghost of a session dragged onto the map follows the pointer; here it rests in the corner of the stage.
  const ghost = uiPart('body', 'claude-a', 'im-editor-ghost');
  ghost.style.cssText = 'position: absolute; left: auto; right: 8px; top: auto; bottom: 8px; inset: auto 8px 8px auto';
  stage.style.position = 'relative';
  stage.append(inspector, popup, ghost);
  host.append(workspace);
}

/** Fills what the DOM renderers draw into the sections; the function it returns takes it down. */
export function fillPatterns(root: ParentNode): () => void {
  fillMetrics(root);
  fillAside(root);
  fillFormGrid(root);
  fillThread(root);
  fillViewport(root);
  fillPortrait(root);
  fillGraphEditor(root);
  const undo = [fillGraphHost(root), fillFileWorkspace(root)];
  for (const meter of Array.from(root.querySelectorAll<HTMLElement>('.im-task-card .im-progress'))) setProgress(meter, 50);
  return () => { for (const stop of undo) stop(); };
}
