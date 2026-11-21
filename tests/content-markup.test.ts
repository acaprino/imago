import assert from 'node:assert/strict';
import test from 'node:test';
import { actionChipHtml, bulletListHtml, quoteHtml, codeViewHtml, textStackHtml, stackRowHtml, tableHtml, summaryHtml, taskCardHtml } from '../ts/ui/content-markup.ts';

test('content text and identifiers are escaped, trusted slots compose unchanged', () => {
  assert.match(actionChipHtml('<node>', 'open"', { id: '<id>', accessibleLabel: 'Inspect "node"', icon: 'arrow' }), /data-action="open&quot;" data-id="&lt;id&gt;"/);
  assert.match(bulletListHtml(['<script>']), /<li>&lt;script&gt;<\/li>/);
  assert.equal(bulletListHtml([]), '');
  assert.equal(quoteHtml('<hello>'), '<p class="im-wrap-text">\u201c&lt;hello&gt;\u201d</p>');
  assert.match(stackRowHtml({title:'<entry>',trailingHtml:'<button>Open</button>'}), /&lt;entry&gt;.*<button>Open<\/button>/);
});
test('code views retain keyboard access and accessible labels', () => {
  const result = codeViewHtml('a < b\n& c', 'Text of "source"');
  assert.match(result, /tabindex="0" aria-label="Text of &quot;source&quot;"/);
  assert.match(result, /a &lt; b\n&amp; c/);
  assert.match(textStackHtml('Name','URL',{strong:true,detailTitle:'"'}), /<strong>Name<\/strong><small title="&quot;">URL<\/small>/);
});
test('tables expose a labelled scroll region and a complete empty row', () => {
  const result=tableHtml(['Name','Value'],'',{label:'Records',empty:'<none>',variant:'log'});
  assert.match(result, /role="region" aria-label="Records" tabindex="0"/);
  assert.match(result, /class="im-table im-log-table"/);
  assert.match(result, /colspan="2".*&lt;none&gt;/);
});
test('summaries and running tasks retain status semantics', () => {
  assert.match(summaryHtml({label:'State',title:'Ready',tone:'good',metadata:[{label:'Owner',value:'<Ada>'}]}), /data-im-tone="ok".*Owner <b>&lt;Ada&gt;<\/b>/);
  const task=taskCardHtml({id:'task-1',title:'Index',progressLabel:'Indexing',progressText:'Reading, 2 seconds',phase:'Reading'});
  assert.match(task,/aria-labelledby="task-1"/);
  assert.match(task,/role="progressbar" aria-label="Indexing" aria-valuetext="Reading, 2 seconds"/);
  assert.doesNotMatch(task,/aria-valuenow/);
});
