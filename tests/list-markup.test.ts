import assert from 'node:assert/strict';
import test from 'node:test';
import { listGroupHtml, rowActionsHtml } from '../ts/ui/list-markup.ts';
import { sidebarHtml } from '../ts/ui/shell-markup.ts';
import * as ui from '../ts/ui/index.ts';

test('a group head that does not fold is a label: a div with its text, and no button and no aria-expanded', () => {
  const html = listGroupHtml({ label: 'Projects' });
  assert.equal(html, '<div class="im-list-group" title="Projects"><span>Projects</span></div>');
  assert.doesNotMatch(html, /button|aria-expanded/);
});

test('a group head escapes its label and its id, and writes its count (zero too) after the label', () => {
  const html = listGroupHtml({ label: '<b>"A"</b>', id: 'g"<', count: 0 });
  assert.match(html, /^<div class="im-list-group" id="g&quot;&lt;" title="&lt;b&gt;&quot;A&quot;&lt;\/b&gt;"><span>&lt;b&gt;&quot;A&quot;&lt;\/b&gt;<\/span><span class="im-count">0<\/span><\/div>$/);
  assert.doesNotMatch(listGroupHtml({ label: 'A', count: Number.NaN }), /im-count/, 'a count that is not a number is not written');
  assert.doesNotMatch(listGroupHtml({ label: 'A' }), /im-count/, 'no count unless it is given');
});

test('a group head with an icon writes it first, so the rail shows it and nothing else', () => {
  const html = listGroupHtml({ label: 'Projects', icon: 'folder', count: 3 });
  assert.match(html, /^<div class="im-list-group" title="Projects"><svg class="im-icon"[^>]*aria-hidden="true">[^]*<\/svg><span>Projects<\/span><span class="im-count">3<\/span><\/div>$/);
});

test('a group head that folds is a button with aria-expanded, true or false, the app\'s action, and the chevron at its end', () => {
  for (const expanded of [true, false]) {
    const html = listGroupHtml({ label: 'Projects', id: 'g1', icon: 'folder', count: 2, fold: { expanded, action: 'fold-group', id: 'p"1' } });
    assert.match(html, new RegExp(`^<button type="button" class="im-list-group" id="g1" title="Projects" aria-expanded="${expanded}" data-action="fold-group" data-id="p&quot;1">`));
    assert.match(html, /<span>Projects<\/span><span class="im-count">2<\/span><svg class="im-icon"[^>]*aria-hidden="true">[^]*<\/svg><\/button>$/, 'the chevron is the last child');
    assert.equal(html.match(/<svg/g)?.length, 2, 'the group icon and the chevron');
  }
  assert.match(listGroupHtml({ label: 'A', fold: { expanded: true, action: 'x' } }), /^<button type="button" class="im-list-group" title="A" aria-expanded="true" data-action="x"><span>A<\/span>/, 'no data-id unless it is given');
});

test('a group head whose fold is not a boolean writes no aria-expanded: it does not fold', () => {
  const html = listGroupHtml({ label: 'A', fold: { expanded: undefined as unknown as boolean, action: 'x' } });
  assert.doesNotMatch(html, /aria-expanded|<button/);
});

test('row actions are at most two icon buttons in one im-row-actions, each with its name and its tooltip, escaped', () => {
  const html = rowActionsHtml([{ label: 'Rename "a"', action: 'rename', icon: 'sliders', id: 't<1' }, { label: 'Close', action: 'close', icon: 'x' }]);
  assert.match(html, /^<span class="im-row-actions"><button type="button" class="im-icon-btn" data-action="rename" aria-label="Rename &quot;a&quot;" title="Rename &quot;a&quot;" data-id="t&lt;1">/);
  assert.equal(html.match(/<button/g)?.length, 2);
  assert.match(html, /<\/button><\/span>$/);
  assert.equal(rowActionsHtml([]), '', 'no action writes nothing');
});

test('three row actions are refused: a row has room for two', () => {
  const action = { label: 'A', action: 'a', icon: 'x' };
  assert.throws(() => rowActionsHtml([action, action, action]), RangeError);
});

test('a row action takes the attributes of iconButtonHtml and is not a tab stop of the row\'s listbox by itself', () => {
  const html = rowActionsHtml([{ label: 'Close', action: 'close', icon: 'x', disabled: true, attrs: { 'data-thread': '7' } }]);
  assert.match(html, /data-thread="7"/);
  assert.match(html, / disabled>/);
  assert.throws(() => rowActionsHtml([{ label: 'A', action: 'a', icon: 'x', attrs: { onclick: 'x()' } }]), TypeError);
});

test('what sidebarHtml writes by default does not change: no group and no row actions of its own', () => {
  const html = sidebarHtml({ id: 'side', label: 'Threads', rowsHtml: '<div class="im-row" role="option">Row</div>' });
  assert.doesNotMatch(html, /im-list-group|im-row-actions/);
});

test('the two renderers are exported from the ui entry point', () => {
  assert.equal(ui.listGroupHtml, listGroupHtml);
  assert.equal(ui.rowActionsHtml, rowActionsHtml);
});
