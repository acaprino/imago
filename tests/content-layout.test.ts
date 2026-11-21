import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { pageContentHtml, shellFrameHtml } from '../ts/ui/shell-markup.ts';
import { stackListHtml, toolbarHtml } from '../ts/ui/content-markup.ts';

const css = (file: string) => readFileSync(new URL('../css/' + file, import.meta.url), 'utf8');

test('shell content does not opt into the document-inspection layout classes', () => {
  const markup = shellFrameHtml({ skipLabel: 'Skip', titlebarHtml: '', mainHtml: pageContentHtml(toolbarHtml('Filters') + stackListHtml('<li>Event</li>', 'timeline'), 'narrow') });
  const classes = [...markup.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1].split(/\s+/));
  for (const upstream of ['im-page', 'im-document', 'im-master-detail', 'im-toolbar', 'im-timeline', 'im-skip-link']) {
    assert.ok(!classes.includes(upstream), upstream);
    assert.doesNotMatch(css('content.css'), new RegExp('\\.' + upstream + '(?![\\w-])'), upstream + ' remains owned by inspection.css');
  }
  for (const shared of ['im-page-content', 'im-page-content--narrow', 'im-content-toolbar', 'im-activity-list', 'im-shell-skip-link']) assert.ok(classes.includes(shared), shared);
});

test('the shared entrypoint includes both layout APIs and the accent control once', () => {
  const imports = [...css('imago.css').matchAll(/@import "\.\/([^"]+)";/g)].map(match => match[1]);
  assert.equal(new Set(imports).size, imports.length);
  for (const name of ['controls.css', 'forms.css', 'content.css', 'inspection.css']) assert.ok(imports.includes(name), name);
  for (const name of imports) assert.ok(existsSync(new URL('../css/' + name, import.meta.url)), name);
  assert.equal(css('controls.css').match(/\.im-btn--accent\s*\{/g)?.length, 1);
  assert.doesNotMatch(css('controls.css') + css('imago.css'), /^(<<<<<<<|=======|>>>>>>>)/m);
});
