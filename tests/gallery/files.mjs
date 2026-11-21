import assert from 'node:assert/strict';

export default async function files(page) {
  const demo = page.getByRole('region', { name: 'File controls' });
  const tree = demo.getByRole('tree', { name: 'Project files' });
  const folder = tree.getByRole('treeitem', { name: 'src', exact: true });
  await folder.focus();
  await folder.press('ArrowRight');
  assert.equal(await folder.getAttribute('aria-expanded'), 'true');
  await folder.press('ArrowRight');
  const child = tree.getByRole('treeitem', { name: 'index.ts' });
  assert.ok(await child.evaluate(el => el === document.activeElement));
  await child.press('Enter');
  assert.equal(await child.getAttribute('aria-selected'), 'true');
  assert.equal(await demo.locator('output').textContent(), 'index.ts');
  await child.press('ArrowLeft');
  await folder.press('ArrowLeft');
  assert.equal(await child.count(), 0);
  await folder.press('End');
  assert.ok(await tree.getByText('README.md').evaluate(el => el.parentElement === document.activeElement));
  assert.equal(await tree.locator('[tabindex="0"]').count(), 1);

  const upload = demo.getByLabel('Select documents');
  await upload.setInputFiles(['a', 'b'].map(name => ({ name, mimeType: 'text/plain', buffer: Buffer.from(name) })));
  assert.deepEqual(await upload.evaluate(el => Array.from(el.files, f => f.name)), ['a', 'b']);
  await demo.getByRole('button', { name: 'Choose sample path' }).click();
  assert.equal(await demo.getByRole('textbox', { name: 'Document path' }).inputValue(), 'src/index.ts');

  const steps = demo.getByRole('list', { name: 'Import steps' });
  for (const title of ['Select', 'Review', 'Import']) {
    assert.ok((await steps.locator('[aria-current=step]').textContent()).includes(title));
    await demo.getByRole('button', { name: 'Next step' }).click();
  }
  assert.equal(await steps.locator('[data-im-step=done]').count(), 3);
  assert.equal(await steps.locator('[aria-current]').count(), 0);
  assert.equal(await steps.getByRole('status').textContent(), 'All steps complete');
  await demo.getByRole('button', { name: 'Start again' }).click();
  assert.equal(await steps.getByRole('status').textContent(), '');
  assert.equal(await steps.locator('[aria-current]').count(), 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await demo.locator('.im-loader .im-spinner').evaluate(el => getComputedStyle(el).animationName), 'none');

  await page.evaluate(() => window.__imago.set({ app: 'mukade', width: 1160 }));
  const splitter = page.getByRole('separator', { name: 'Sidebar width' });
  await splitter.press('Home');
  assert.equal(await splitter.getAttribute('aria-valuenow'), '168');
  await splitter.press('Shift+ArrowRight');
  assert.equal(await splitter.getAttribute('aria-valuenow'), '200');
  await splitter.scrollIntoViewIfNeeded();
  await splitter.hover();
  const box = await splitter.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 43, y);
  await page.mouse.up();
  assert.equal(await splitter.getAttribute('aria-valuenow'), '240');
  await page.evaluate(() => window.__imago.set({ width: 800 }));
  assert.equal(await splitter.count(), 0);
  await page.evaluate(() => window.__imago.set({ width: 1160 }));
  assert.equal(await splitter.getAttribute('aria-valuenow'), '240');

  // The document panes, under both looks: the editor fills its pane, the rendered document reads in the look's
  // type, panes side by side are divided, a hidden pane takes no room, a picture fits, a visual editor's fields.
  for (const look of ['smooth', 'oni']) {
    await page.evaluate((look) => window.__imago.set({ app: 'shinatama', look, theme: 'dark', width: 1160 }), look);
    const region = page.getByLabel('Document panes');
    await region.scrollIntoViewIfNeeded();
    const seen = await region.evaluate((element) => {
      const px = (node, property) => getComputedStyle(node).getPropertyValue(property);
      const pane = (label) => element.querySelector(`[aria-label="${label}"]`);
      const source = pane('File source'), rendered = pane('Rendered Markdown');
      const result = {
        editor: [source.firstElementChild.getBoundingClientRect().height, source.getBoundingClientRect().height],
        h1: px(rendered.querySelector('h1'), 'font-size'), h2: px(rendered.querySelector('h2'), 'font-size'),
        h2Rule: px(rendered.querySelector('h2'), 'border-bottom-style'), p: px(rendered.querySelector('p'), 'font-size'),
        link: px(rendered.querySelector('a'), 'text-decoration-line'), code: px(rendered.querySelector('pre'), 'font-family'),
        divided: px(rendered, 'border-inline-start-style'), first: px(source, 'border-inline-start-style'),
        selectable: px(rendered, 'user-select'),
        // The type tokens the rendered document reads in, as the look gives them.
        display: px(element, '--im-fs-display').trim(), titleSize: px(element, '--im-fs-title').trim(), bodySize: px(element, '--im-fs-body').trim(),
      };
      const picture = pane('Picture'), form = pane('Visual editor');
      result.hiddenPicture = picture.getClientRects().length;
      source.hidden = true; rendered.hidden = true; picture.hidden = false;
      result.image = [picture.querySelector('img').getBoundingClientRect().width, picture.getBoundingClientRect().width];
      result.pictureDivided = px(picture, 'border-inline-start-style');
      picture.hidden = true; form.hidden = false;
      const [title, code, kept] = form.children;
      result.title = [px(title, 'font-size'), px(title, 'font-weight')];
      result.codeField = px(code, 'font-family');
      result.kept = [px(kept, 'white-space'), px(kept, 'border-left-style')];
      form.hidden = true; source.hidden = false; rendered.hidden = false;
      return result;
    });
    const where = (text) => `${look}: ${text}`;
    assert.ok(Math.abs(seen.editor[0] - seen.editor[1]) <= 1, where(`the editor fills its pane (${seen.editor})`));
    assert.deepEqual([seen.h1, seen.h2, seen.p], [seen.display, seen.titleSize, seen.bodySize], where('the rendered headings and body are the type tokens'));
    assert.equal(seen.h2Rule, 'solid', where('a second-level heading is underlined'));
    assert.equal(seen.link, 'underline', where('a link is underlined'));
    assert.match(seen.code, /mono|code|consol|courier/i, where(`code is monospaced (${seen.code})`));
    assert.equal(seen.selectable, 'text', where('the document text is selectable'));
    assert.equal(seen.divided, 'solid', where('the second pane side by side is divided from the first'));
    assert.equal(seen.first, 'none', where('the first is not'));
    assert.equal(seen.hiddenPicture, 0, where('a hidden pane takes no room'));
    assert.ok(seen.image[0] <= seen.image[1], where(`a picture fits its pane (${seen.image})`));
    assert.equal(seen.pictureDivided, 'none', where('a pane alone is not divided'));
    assert.deepEqual(seen.title, [seen.display, '700'], where('a first-level heading field'));
    assert.match(seen.codeField, /mono|code|consol|courier/i, where('a code field is monospaced'));
    assert.deepEqual(seen.kept, ['pre-wrap', 'solid'], where('kept source wraps and is marked'));
  }
}
