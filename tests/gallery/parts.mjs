// Every part uiPart offers with a design of its own, drawn in the gallery's row "The text and group parts of uiPart" (the
// Analysis fixture): its size, colour and space are the tokens', under both looks and both themes, in the five apps.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];

export default async function (page) {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      const where = (text) => `${look} ${theme}: ${text}`;
      await page.evaluate((state) => window.__imago.set({ app: 'shinatama', glass: false, width: 1160, ...state }), { look, theme });
      await page.waitForSelector('[data-g-parts] .im-title');
      const seen = await page.evaluate(() => {
        const host = document.querySelector('[data-g-parts]');
        // What a token resolves to, read from a probe in the row, so that a part is compared with the token and not with a number.
        const probe = document.createElement('span');
        host.append(probe);
        const token = (property, value) => {
          probe.style.cssText = `${property}: ${value}`;
          return getComputedStyle(probe)[property.replace(/-(\w)/g, (_, letter) => letter.toUpperCase())];
        };
        const em = (spacing, size) => (spacing === 'normal' ? 0 : parseFloat(spacing) / parseFloat(size));
        const style = (selector) => {
          const node = host.querySelector(selector);
          if (!node) throw new Error(`the row has no ${selector}`);
          return getComputedStyle(node);
        };
        const out = {
          size: { display: token('font-size', 'var(--im-fs-display)'), title: token('font-size', 'var(--im-fs-title)'), body: token('font-size', 'var(--im-fs-body)'), meta: token('font-size', 'var(--im-fs-meta)') },
          color: { text: token('color', 'var(--im-text)'), hi: token('color', 'var(--im-text-hi)'), muted: token('color', 'var(--im-muted)') },
          gap: { s1: token('row-gap', 'var(--im-s-1)'), s2: token('row-gap', 'var(--im-s-2)') },
          kase: token('text-transform', 'var(--im-case)'),
          // The spacing is in em: compared as a share of the size it is set on.
          track: em(token('letter-spacing', 'var(--im-track)'), getComputedStyle(probe).fontSize),
          title: style('h1.im-title'), h2: style('h2.im-heading'), h3: style('h3.im-heading'), h4: style('h4.im-heading'),
          label: style('.im-stack > label.im-label'), strong: style('.im-strong'), term: style('dt.im-term'), time: style('time.im-time'),
          fieldset: style('fieldset.im-fieldset'), legend: style('legend.im-legend'), ordered: style('ol.im-ordered-list'),
          nav: style('nav.im-navigation'), summary: style('summary.im-disclosure-title'), text: style('.im-paragraph .im-text'),
          paragraph: style('.im-paragraph'),
        };
        const pick = (name, properties) => Object.fromEntries(properties.map((property) => [property, out[name][property]]));
        const result = {
          size: out.size, color: out.color, gap: out.gap, kase: out.kase, track: out.track,
          title: pick('title', ['fontSize', 'marginTop', 'color']),
          h2: { ...pick('h2', ['fontSize', 'marginTop', 'color', 'textTransform']), track: em(out.h2.letterSpacing, out.h2.fontSize) },
          h3: pick('h3', ['fontSize', 'textTransform']),
          h4: pick('h4', ['fontSize', 'textTransform']),
          label: pick('label', ['fontSize', 'color']),
          strong: pick('strong', ['color']),
          term: pick('term', ['fontSize', 'color']),
          time: pick('time', ['fontSize', 'color', 'fontVariantNumeric']),
          fieldset: pick('fieldset', ['borderTopWidth', 'paddingTop', 'rowGap', 'display']),
          legend: pick('legend', ['fontSize', 'marginBottom', 'paddingTop']),
          ordered: pick('ordered', ['listStyleType', 'rowGap', 'paddingLeft']),
          nav: pick('nav', ['listStyleType', 'rowGap']),
          summary: pick('summary', ['fontSize', 'color']),
          // A semantics-only part takes the style of the element it is in.
          textInherits: out.text.fontSize === out.paragraph.fontSize && out.text.color === out.paragraph.color,
          steps: [...host.querySelectorAll('ol.im-ordered-list > li')].length,
        };
        probe.remove();
        return result;
      });
      assert.equal(seen.title.fontSize, seen.size.display, where('the title is the display size'));
      assert.equal(seen.title.marginTop, '0px', where('a part has no margin: the container gives the space'));
      assert.equal(seen.h2.fontSize, seen.size.title, where('an h2 heading is the title size'));
      assert.equal(seen.h3.fontSize, seen.size.body, where('an h3 heading is the body size'));
      assert.equal(seen.h4.fontSize, seen.size.body, where('an h4 heading is the body size'));
      assert.equal(seen.h2.color, seen.color.hi, where('a heading is in the heading colour'));
      // The canon: a page's own headings are in sentence case in both looks (design-file.md, Page patterns).
      for (const name of ['h2', 'h3', 'h4']) assert.equal(seen[name].textTransform, 'none', where(`${name} is in sentence case`));
      assert.ok(Math.abs(seen.h2.track) < 0.001, where('a heading has no letter spacing of its own'));
      assert.equal(seen.h2.marginTop, '0px', where('a heading has no margin'));
      assert.equal(seen.label.fontSize, seen.size.body, where('a label is the body size'));
      assert.equal(seen.label.color, seen.color.text, where('in the text colour'));
      assert.equal(seen.strong.color, seen.color.hi, where('strong is the heading colour'));
      assert.equal(seen.term.fontSize, seen.size.meta, where('a term is meta text'));
      assert.equal(seen.term.color, seen.color.muted, where('in the muted colour'));
      assert.equal(seen.time.fontSize, seen.size.meta, where('a time is meta text'));
      assert.equal(seen.time.color, seen.color.muted, where('in the muted colour'));
      assert.equal(seen.time.fontVariantNumeric, 'tabular-nums', where('with tabular figures'));
      assert.equal(seen.fieldset.borderTopWidth, '0px', where('a fieldset has no border'));
      assert.equal(seen.fieldset.paddingTop, '0px', where('and no padding'));
      assert.equal(seen.fieldset.display, 'grid', where('it is a column'));
      assert.equal(seen.fieldset.rowGap, seen.gap.s2, where('with the space of a group between its items'));
      assert.equal(seen.legend.fontSize, seen.size.title, where('a legend is a section title'));
      assert.equal(seen.legend.marginBottom, seen.gap.s2, where('with the space of a group below'));
      assert.equal(seen.legend.paddingTop, '0px', where('and no padding'));
      assert.equal(seen.ordered.listStyleType, 'none', where('an ordered list has no marks'));
      assert.equal(seen.ordered.paddingLeft, '0px', where('and no indent'));
      assert.equal(seen.ordered.rowGap, seen.gap.s1, where('with a small space between its items'));
      assert.equal(seen.nav.rowGap, seen.gap.s1, where('a navigation has the same space between its items'));
      assert.equal(seen.summary.fontSize, seen.size.body, where('a disclosure title is the body size'));
      assert.equal(seen.summary.color, seen.color.hi, where('in the heading colour'));
      assert.ok(seen.textInherits, where('a text part takes the size and colour of its paragraph'));
      assert.equal(seen.steps, 3, where('the ordered list holds its items'));
    }
  }
}
