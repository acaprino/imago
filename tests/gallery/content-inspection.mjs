import assert from 'node:assert/strict';

// Page content (Muro's pages, Daodan's documents) inside the one frame: the content region of im-shell, its panel body
// scrolling, im-page-content with the padding and the headings of a page, and the helpers it keeps.
export default async function (page) {
  for (const look of ['smooth', 'oni']) {
    await page.evaluate((look) => {
      const fixture = document.createElement('div');
      fixture.id = 'content-inspection-fixture';
      fixture.innerHTML = `
        <section class="im-shell" data-im-sidebar="off" data-im-look="${look}" data-im-theme="light" data-im-app="muro" style="width:1400px;height:600px">
          <header class="im-titlebar">Application</header>
          <div class="im-body"><div class="im-work"><div class="im-columns">
            <main class="im-panel im-content" id="content-main" tabindex="-1" aria-label="Page"><div class="im-panel-body"><div class="im-page-content" id="page">
              <h1 id="content-heading">Compact heading</h1><h2 id="content-h2">Section</h2><h3 id="content-h3">Group</h3>
              <p id="content-paragraph">Text</p>
              <div id="content-toolbar" class="im-content-toolbar">Actions <span class="im-input" id="toolbar-input"><input aria-label="Filter"></span></div>
              <div id="content-columns" class="im-aside-layout"><aside>Controls</aside><section>Canvas</section></div>
              <ul class="im-panel im-surface im-stack-list im-activity-list"><li id="content-event"><time>Today</time><div>Event</div></li></ul>
              <ol id="reading-timeline" class="im-timeline"><li id="reading-event">Event</li></ol>
              <ul id="plain-list"><li>Item</li></ul>
              <fieldset id="plain-fieldset"><legend>Group</legend></fieldset>
            </div></div></main>
            <section class="im-panel im-inspector" aria-label="Details" hidden></section>
          </div></div></div>
        </section>`;
      document.body.append(fixture);
    }, look);
    try {
      const measure = () => page.locator('#content-inspection-fixture').evaluate(fixture => {
        const style = id => getComputedStyle(fixture.querySelector('#' + id));
        const shell = fixture.querySelector('.im-shell');
        const probe = (property, value) => {
          const el = document.createElement('span');
          el.style.setProperty(property, value);
          fixture.querySelector('#page').append(el);
          const result = getComputedStyle(el).getPropertyValue(property);
          el.remove();
          return result;
        };
        const heading = id => ({ size: style(id).fontSize, weight: style(id).fontWeight, transform: style(id).textTransform, color: style(id).color, family: style(id).fontFamily, margin: style(id).marginTop });
        return {
          shellPadding: getComputedStyle(shell).paddingTop,
          shellBodyMargin: getComputedStyle(fixture.querySelector('.im-body')).marginTop,
          scrolls: getComputedStyle(fixture.querySelector('.im-content > .im-panel-body')).overflowY,
          h1: heading('content-heading'), h2: heading('content-h2'), h3: heading('content-h3'),
          hi: probe('color', 'var(--im-text-hi)'), head: probe('font-family', 'var(--im-font-head)'),
          paragraph: style('content-paragraph').marginTop,
          list: [style('plain-list').listStyleType, style('plain-list').paddingLeft],
          fieldset: style('plain-fieldset').borderTopWidth,
          pagePadding: style('page').paddingTop,
          // the column the text gets: the inner width, inside the padding
          pageInner: fixture.querySelector('#page').clientWidth - parseFloat(style('page').paddingLeft) - parseFloat(style('page').paddingRight),
          inlinePadding: style('content-toolbar').paddingTop, toolbarInput: style('toolbar-input').maxWidth,
          asideColumns: style('content-columns').gridTemplateColumns.split(' ').map(parseFloat),
          activityDisplay: style('content-event').display,
          timelineDisplay: style('reading-event').display,
          timelineBorder: style('reading-timeline').borderInlineStartWidth,
        };
      });
      const where = text => `${look}: ${text}`;
      const wide = await measure();
      assert.equal(wide.shellPadding, '0px', where('the shell has no padding'));
      assert.equal(wide.shellBodyMargin, '0px', where('the body has no margin'));
      assert.equal(wide.scrolls, 'auto', where('the content region scrolls in its panel body'));
      for (const [tag, size] of [['h1', '18px'], ['h2', '14px'], ['h3', '13px']]) {
        assert.deepEqual([wide[tag].size, wide[tag].weight, wide[tag].margin], [size, '600', '0px'], where(`${tag} of a page`));
        assert.equal(wide[tag].transform, 'none', where(`${tag} stays in sentence case`));
        assert.equal(wide[tag].color, wide.hi, where(`${tag} is in --im-text-hi`));
        assert.equal(wide[tag].family, wide.head, where(`${tag} is in the head font, not the host page's`));
      }
      assert.equal(wide.paragraph, '0px', where('document margins are reset in the shell'));
      assert.deepEqual(wide.list, ['none', '0px'], where('a bare list has no bullets in the shell'));
      assert.equal(wide.fieldset, '0px', where('a fieldset has no frame in the shell'));
      assert.equal(wide.pagePadding, '24px', where('page content has the padding of the content region'));
      assert.equal(wide.pageInner, 1180, where('page content keeps its measure of 1180 inside its padding'));
      await page.locator('#page').evaluate(el => el.classList.add('im-page-content--narrow'));
      assert.equal((await measure()).pageInner, 860, where('narrow page content keeps its measure of 860 inside its padding'));
      await page.locator('#page').evaluate(el => el.classList.remove('im-page-content--narrow'));
      assert.equal(wide.inlinePadding, '0px', where('the content toolbar is an inline row'));
      assert.equal(wide.toolbarInput, '100%', where('a field in the content toolbar never overflows it'));
      assert.equal(wide.asideColumns[0], 340, where('the aside column'));
      assert.ok(wide.asideColumns[1] > wide.asideColumns[0], where('the content beside the aside column'));
      assert.equal(wide.activityDisplay, 'flex');
      assert.equal(wide.timelineDisplay, 'grid');
      assert.equal(wide.timelineBorder, '2px');

      // The breakpoints are the shell's: under 1000 the aside column goes above, under 620 the padding is 16.
      await page.locator('#content-inspection-fixture .im-shell').evaluate(shell => { shell.style.width = '600px'; });
      const narrow = await measure();
      assert.equal(narrow.pagePadding, '16px', where('page padding under 620'));
      assert.equal(narrow.asideColumns.length, 1, where('one column under 1000'));
    } finally {
      await page.locator('#content-inspection-fixture').evaluate(fixture => fixture.remove());
    }
  }
}
