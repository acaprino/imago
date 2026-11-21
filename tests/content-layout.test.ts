import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { pageContentHtml, shellFrameHtml } from '../ts/ui/shell-markup.ts';
import { stackListHtml, toolbarHtml } from '../ts/ui/content-markup.ts';

const css = (file: string) => readFileSync(new URL('../css/' + file, import.meta.url), 'utf8');
const ALL_CSS = readdirSync(new URL('../css/', import.meta.url), { recursive: true })
  .map(String).filter((file) => file.endsWith('.css')).map((file) => css(file.replaceAll('\\', '/'))).join('\n');

// The frames that 0.1.2 to 0.1.4 added beside im-shell, and their parts: one frame is left (docs/superpowers/moving-from-0.1.4.md).
const REMOVED = [
  'im-app-layout', 'im-main', 'im-desktop-frame', 'im-desktop-content', 'im-page', 'im-skip-link', 'im-page-frame', 'im-page-view',
  'im-workbench', 'im-work-column', 'im-work-area', 'im-workspace-area', 'im-navigation-panel', 'im-resizable-nav', 'im-nav-rail',
  'im-nav-entry', 'im-nav-line', 'im-nav-mark', 'im-nav-detail', 'im-signal', 'im-docked-inspector', 'im-inspection-rail',
  'im-detail-panel', 'im-document', 'im-toolbar', 'im-panel-strip', 'im-master-detail',
];
const REMOVED_PROPERTIES = ['--im-nav-width', '--im-item-color', '--im-item-ink', '--im-inspector-size'];

test('the stylesheet has one frame: no rule is left for the removed frames or their parts', () => {
  for (const name of REMOVED) assert.doesNotMatch(ALL_CSS, new RegExp('\\.' + name + '(?![\\w-])'), `css/ still styles .${name}`);
  for (const name of REMOVED_PROPERTIES) assert.doesNotMatch(ALL_CSS, new RegExp(name + '(?![\\w-])'), `css/ still reads ${name}`);
  assert.doesNotMatch(ALL_CSS, /\[data-im-badge\]/, 'css/ still draws data-im-badge');
  for (const name of ['im-aside-layout', 'im-page-content', 'im-content-toolbar', 'im-section-heading', 'im-definition-list']) {
    assert.match(ALL_CSS, new RegExp('\\.' + name + '(?![\\w-])'), `.${name} stays: page content keeps its helpers`);
  }
});

test('the breakpoints of the layout files are container queries on the shell at 1000, 850 or 620', () => {
  for (const file of ['primitives.css', 'content.css', 'dom-parts.css', 'inspection.css', 'navigation-panels.css', 'patterns.css', 'file-workspace.css']) {
    const text = css(file);
    assert.doesNotMatch(text, /@media[^{]*\bwidth/, `${file} has a breakpoint on the viewport`);
    for (const [query] of text.matchAll(/@container im-shell \([^)]*\)/g)) {
      const widths = [...query.matchAll(/(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
      for (const width of widths) assert.ok([1000, 850, 620, 450, 340, 1012].includes(width), `${file}: ${query}`);
      assert.doesNotMatch(query, /max-width|min-width/, `${file}: ${query} is written as a range`);
    }
  }
});

test('page content in the frame uses the shared helpers, and no removed class', () => {
  const markup = shellFrameHtml({ skipLabel: 'Skip', titlebarHtml: '<header class="im-titlebar"></header>', contentLabel: 'Page', inspectorLabel: 'Details', contentHtml: pageContentHtml(toolbarHtml('Filters') + stackListHtml('<li>Event</li>', 'timeline'), 'narrow') });
  const classes = [...markup.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1].split(/\s+/));
  for (const name of [...REMOVED, 'im-timeline']) assert.ok(!classes.includes(name), name);
  for (const shared of ['im-page-content', 'im-page-content--narrow', 'im-content-toolbar', 'im-activity-list', 'im-shell-skip-link', 'im-content']) assert.ok(classes.includes(shared), shared);
  assert.match(css('content.css'), /\.im-page-content \{[^}]*padding: var\(--im-s-5\)/, 'page content has the padding the content region needs');
});

test('the shared entrypoint includes both layout APIs and the accent control once', () => {
  const imports = [...css('imago.css').matchAll(/@import "\.\/([^"]+)";/g)].map(match => match[1]);
  assert.equal(new Set(imports).size, imports.length);
  for (const name of ['controls.css', 'forms.css', 'content.css', 'inspection.css']) assert.ok(imports.includes(name), name);
  for (const name of imports) assert.ok(existsSync(new URL('../css/' + name, import.meta.url)), name);
  assert.equal(css('controls.css').match(/\.im-btn--accent\s*\{/g)?.length, 1);
  assert.doesNotMatch(css('controls.css') + css('imago.css'), /^(<<<<<<<|=======|>>>>>>>)/m);
});
