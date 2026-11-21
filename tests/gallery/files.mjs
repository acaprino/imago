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
}
