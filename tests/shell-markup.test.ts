import assert from 'node:assert/strict';
import test from 'node:test';
import { bannerHtml, busyIndicatorHtml, pageContentHtml, shellFrameHtml, statusButtonHtml, tabNavigationHtml, titlebarHtml, windowButtonsHtml } from '../ts/ui/shell-markup.ts';

test('tabs expose one initial keyboard stop and announced counts without repeating their visual badge', () => {
  const html = tabNavigationHtml([{ id: 'a', label: 'First', count: 0 }, { id: 'b', label: 'Second', count: 3, countLabel: '3 running' }], 'b', { label: 'Sections', action: 'navigate' });
  assert.equal(html.match(/tabindex="0"/g)?.length, 1);
  assert.match(html, /data-id="b" aria-current="page" aria-selected="true" tabindex="0"/);
  assert.match(html, /aria-label="Second, 3 running"/);
  assert.match(html, /class="im-count" aria-hidden="true">3<\/span>/);
  assert.equal(html.match(/class="im-count"/g)?.length, 1);
  const fallback = tabNavigationHtml([{ id: 'first', label: 'First' }], 'removed', { label: 'Sections', action: 'navigate' });
  assert.match(fallback, /data-id="first" aria-current="page" aria-selected="true" tabindex="0"/);
});

test('shell text and identifiers cannot inject HTML or attributes', () => {
  const html = shellFrameHtml({ mainId: 'm"<', skipLabel: '<skip>', titlebarHtml: titlebarHtml({ brand: { name: '<name>', image: '/image" onerror="x' }, navigationHtml: tabNavigationHtml([{ id: '"x', label: '<tab>', count: 2, countLabel: '"waiting' }], '"x', { label: '<sections>', action: '"click' }), commands: { label: '<commands>', action: '"cmd', shortcut: '<K>' } }), mainHtml: pageContentHtml('<p>Trusted page component</p>', 'narrow'), busy: true });
  assert.doesNotMatch(html, /<skip>|<name>|<tab>|<commands>|<K>| onerror="/);
  assert.match(html, /href="#m&quot;&lt;"/);
  assert.match(html, /src="\/image&quot; onerror=&quot;x"/);
  assert.match(html, /<main id="m&quot;&lt;" class="im-main im-content" tabindex="-1" aria-busy="true"/);
  assert.match(html, /class="im-page-content im-page-content--narrow"><p>Trusted page component<\/p>/);
});

test('window buttons provide the native selectors and both maximize/restore icons', () => {
  const html = windowButtonsHtml({ minimize: 'Hide <window>', maximize: 'Grow', close: 'Close' });
  assert.deepEqual([...html.matchAll(/data-im-window="([^"]+)"/g)].map(match => match[1]), ['minimize', 'maximize', 'close']);
  assert.equal(html.match(/<svg/g)?.length, 4);
  assert.match(html, /aria-label="Hide &lt;window&gt;"/);
  assert.doesNotMatch(titlebarHtml({ brand: { name: 'Example' } }), /im-window-buttons/);
  assert.match(titlebarHtml({ brand: { name: 'Example' }, windowControls: true }), /im-window-buttons/);
});

test('banners announce errors and safely render labeled details and action component slots', () => {
  const html = bannerHtml({ title: '<failure>', message: 'a & b', items: [{ label: '<item>', message: '"reason' }], tone: 'err', actionsHtml: '<button>Retry</button>' });
  assert.match(html, /data-im-tone="err" role="alert"/);
  assert.match(html, /<strong>&lt;failure&gt;<\/strong><p>a &amp; b<\/p>/);
  assert.match(html, /<li><b>&lt;item&gt;<\/b>: &quot;reason<\/li>/);
  assert.match(html, /<button>Retry<\/button>/);
  assert.match(bannerHtml({ title: 'Done', tone: 'ok' }), /role="status"/);
  assert.match(busyIndicatorHtml('<loading>'), /role="status">.*aria-hidden="true".*&lt;loading&gt;/);
  assert.match(statusButtonHtml({ label: '<ready>', accessibleLabel: 'Open "status"', action: 'status', tone: 'ok' }), /aria-label="Open &quot;status&quot;"/);
});
