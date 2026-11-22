// A button's label never clips its own text: the label span keeps an ellipsis for a long label, and its box is as tall as the
// font's lines, so the descenders of "Details", "gypq" and "Options" are inside it (scrollHeight <= clientHeight). The label
// clipped by one pixel was the finding of Xiox's smoke ("clipped span Details (37x14 in 37x12)"). The button's height stays the
// measure of its row (--im-h-control, --im-h-control-sm): the label's line box changes no height.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const APPS = ['xiox', 'shinatama'];

export default async function (page) {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      for (const app of APPS) {
        const where = (text) => `${look} ${theme} ${app}: ${text}`;
        await page.evaluate((s) => window.__imago.set({ app: s.app, glass: false, width: 1160, look: s.look, theme: s.theme }), { app, look, theme });
        await page.waitForSelector('#g-window .im-shell', { state: 'attached' });

        const found = await page.evaluate(() => {
          const host = document.querySelector('#g-window .im-shell');
          const specimen = document.createElement('div');
          specimen.style.cssText = 'position:absolute;left:0;top:0;display:flex;flex-wrap:wrap;gap:8px;width:900px';
          const labels = ['Details', 'gypq Options', 'Jy;,'];
          const variants = ['', ' im-btn--primary', ' im-btn--ghost', ' im-btn--danger', ' im-btn--sm'];
          specimen.innerHTML = variants
            .flatMap((variant) => labels.map((label) => `<button type="button" class="im-btn${variant}"><span>${label}</span></button>`))
            .join('');
          host.append(specimen);
          const tokens = getComputedStyle(host);
          const read = (el) => {
            const sm = el.classList.contains('im-btn--sm');
            return {
              text: el.textContent,
              height: el.getBoundingClientRect().height,
              expected: parseFloat(tokens.getPropertyValue(sm ? '--im-h-control-sm' : '--im-h-control')),
              // A label that is drawn (a visually hidden one is a pixel high and clipped on purpose).
              clipped: [...el.querySelectorAll(':scope > span:not(.im-spinner)')]
                .filter((span) => span.clientHeight > 1 && span.scrollHeight > span.clientHeight)
                .map((span) => `${span.scrollWidth}x${span.scrollHeight} in ${span.clientWidth}x${span.clientHeight}`),
            };
          };
          const own = [...specimen.querySelectorAll('.im-btn')].map(read);
          specimen.remove();
          // Every button of the page that is drawn: a label that clips is found wherever the gallery draws a button. The
          // buttons that grow with their content keep the lines they had (a taller line would make them taller): css/controls.css.
          const GROWS = '.im-record-button, .im-editor-source, .im-editor-choice, .im-editor-inspector .im-btn';
          const drawn = [...document.querySelectorAll('.im-btn')].filter((el) => el.getClientRects().length && !el.matches(GROWS)).map(read);
          return { own, drawn };
        });

        assert.equal(found.own.length, 15, where('the specimen has its buttons'));
        assert.ok(found.drawn.length > 0, where('the page draws buttons'));
        for (const button of [...found.own, ...found.drawn]) {
          assert.deepEqual(button.clipped, [], where(`the label of "${button.text}" clips its text`));
        }
        for (const button of found.own) {
          assert.equal(button.height, button.expected, where(`the button "${button.text}" is as high as its row (${button.height} against ${button.expected})`));
        }
      }
    }
  }
}
