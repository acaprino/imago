import assert from 'node:assert/strict';

// The section is drawn on a sheet of the package, under the shell's attributes: in the dark themes the text on the page's own
// paper was 1.02:1 to 2.6:1. Every text of the section reads at 4.5:1 on what is under it, in both looks and both themes.
async function readable(page) {
  for (const look of ['smooth', 'oni']) {
    for (const theme of ['dark', 'light']) {
      await page.evaluate((s) => window.__imago.set({ app: 'xiox', glass: false, width: 1160, ...s }), { look, theme });
      const low = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        const flatten = (colours) => {
          g.clearRect(0, 0, 1, 1);
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, 1, 1);
          for (const c of colours) {
            g.fillStyle = c;
            g.fillRect(0, 0, 1, 1);
          }
          const d = g.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        const channel = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
        const luminance = ([r, g2, b]) => 0.2126 * channel(r) + 0.7152 * channel(g2) + 0.0722 * channel(b);
        const section = document.querySelector('section[aria-label="Inspection controls"]');
        const out = [];
        let texts = 0;
        const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const words = node.textContent.trim();
          const holder = node.parentElement;
          // The section's own heading is the gallery's, on the page's paper.
          if (!words || holder.closest('h2') || !holder.getClientRects().length || getComputedStyle(holder).visibility === 'hidden') continue;
          const layers = [];
          for (let el = holder; el; el = el.parentElement) {
            const paint = getComputedStyle(el).backgroundColor;
            if (paint !== 'rgba(0, 0, 0, 0)' && paint !== 'transparent') layers.unshift(paint);
          }
          texts++;
          const [hi, lo] = [luminance(flatten([...layers, getComputedStyle(holder).color])), luminance(flatten(layers))].sort((a, b) => b - a);
          const ratio = (hi + 0.05) / (lo + 0.05);
          if (ratio < 4.5) out.push(`"${words.slice(0, 24)}" ${ratio.toFixed(2)}:1`);
        }
        return { texts, out };
      });
      assert.ok(low.texts >= 8, `${look} ${theme}: the section's texts are read (${low.texts})`);
      assert.deepEqual(low.out, [], `${look} ${theme}: text of the inspection controls under 4.5:1`);
    }
  }
}

export default async function inspection(page) {
  const section = page.getByRole('region', { name: 'Inspection controls' });
  const files = section.getByRole('radio', { name: 'Files' });
  const folders = section.getByRole('radio', { name: 'Folders' });
  await files.focus();
  await files.press('ArrowRight');
  assert.ok(await folders.isChecked());
  assert.equal(await section.locator('.im-metric-value').textContent(), '4');
  await folders.press('ArrowLeft');
  assert.ok(await files.isChecked());
  assert.equal(await section.locator('.im-metric-value').textContent(), '12');
  assert.ok(await section.getByRole('button', { name: 'Publish' }).isDisabled());
  assert.equal(await section.getByRole('progressbar').getAttribute('aria-valuenow'), '50');
  assert.equal(await section.locator('[aria-current="step"]').count(), 1);
  await readable(page);
}
