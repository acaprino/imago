import assert from 'node:assert/strict';

// Regress the merge of the native application content API and the inspection-page API.
export default async function (page) {
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'content-inspection-fixture';
    fixture.innerHTML = `
      <section class="im-shell im-app-layout" data-im-look="smooth" data-im-theme="light" data-im-app="muro" style="width:1200px;height:600px">
        <header class="im-titlebar">Application</header>
        <main class="im-body"><div class="im-main"><div class="im-page-content">
          <h1 id="content-heading">Compact heading</h1>
          <div id="content-toolbar" class="im-content-toolbar">Actions</div>
          <div id="content-columns" class="im-aside-layout"><aside>Controls</aside><section>Canvas</section></div>
          <ul class="im-panel im-surface im-stack-list im-activity-list"><li id="content-event"><time>Today</time><div>Event</div></li></ul>
          <section class="im-page"><div id="reading-surface" class="im-document"><h1 id="reading-heading">Reading heading</h1></div>
            <div id="reading-toolbar" class="im-toolbar">Actions</div>
            <div id="reading-columns" class="im-master-detail"><section>Main</section><aside>Detail</aside></div>
            <ol id="reading-timeline" class="im-timeline"><li id="reading-event">Event</li></ol>
          </section>
        </div></div></main>
      </section>`;
    document.body.append(fixture);
  });
  try {
    const result = await page.locator('#content-inspection-fixture').evaluate(fixture => {
      const style = id => getComputedStyle(fixture.querySelector('#' + id));
      return {
        shellPadding: getComputedStyle(fixture.querySelector('.im-shell')).paddingTop,
        shellBodyMargin: getComputedStyle(fixture.querySelector('.im-body')).marginTop,
        compactHeading: style('content-heading').fontSize,
        readingHeading: style('reading-heading').fontSize,
        readingPadding: parseFloat(style('reading-surface').paddingTop),
        inlinePadding: style('content-toolbar').paddingTop,
        stripPadding: parseFloat(style('reading-toolbar').paddingTop),
        asideColumns: style('content-columns').gridTemplateColumns.split(' ').map(parseFloat),
        detailColumns: style('reading-columns').gridTemplateColumns.split(' ').map(parseFloat),
        activityDisplay: style('content-event').display,
        timelineDisplay: style('reading-event').display,
        timelineBorder: style('reading-timeline').borderInlineStartWidth,
      };
    });
    assert.equal(result.shellPadding, '0px');
    assert.equal(result.shellBodyMargin, '0px');
    assert.equal(result.compactHeading, '22px');
    assert.notEqual(result.readingHeading, result.compactHeading);
    assert.ok(result.readingPadding > 0);
    assert.equal(result.inlinePadding, '0px');
    assert.ok(result.stripPadding > 0);
    assert.equal(result.asideColumns[0], 340);
    assert.ok(result.asideColumns[1] > result.asideColumns[0]);
    assert.ok(result.detailColumns[0] > result.detailColumns[1]);
    assert.equal(result.activityDisplay, 'flex');
    assert.equal(result.timelineDisplay, 'grid');
    assert.equal(result.timelineBorder, '2px');
  } finally {
    await page.locator('#content-inspection-fixture').evaluate(fixture => fixture.remove());
  }
}
