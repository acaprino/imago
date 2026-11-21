import test from 'node:test';
import assert from 'node:assert/strict';
import { graphLegendHtml } from '../ts/ui/graph-legend.ts';

test('graph legend escapes labels and summary and keeps decorative line samples hidden', () => {
  const html = graphLegendHtml([{ label: '<unsafe>', tone: 'err', stroke: 'dotted' }], '3 < 4');
  assert.match(html, /aria-hidden="true" data-im-stroke="dotted" data-im-tone="err"/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.match(html, /3 &lt; 4/);
  assert.doesNotMatch(html, /<unsafe>/);
});
