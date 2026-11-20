import assert from 'node:assert/strict';

export default async function graph(page) {
  const pane = page.getByRole('region', { name: 'Build dependencies' });
  const section = pane.locator('xpath=ancestor::section[1]');
  const world = pane.locator('.im-graph-world');
  const client = pane.getByRole('button', { name: 'Client', exact: true });
  const service = pane.getByRole('button', { name: 'Service', exact: true });
  await client.locator('.im-row-title').click();
  assert.equal(await client.getAttribute('aria-pressed'), 'true');
  await client.focus();
  await client.press('ArrowRight');
  assert.ok(await service.evaluate(el => el === document.activeElement));
  assert.equal(await pane.locator('.im-graph-node[tabindex="0"]').count(), 1);
  await service.press('Space');
  assert.equal(await service.getAttribute('aria-pressed'), 'true');
  await service.press('ArrowLeft');
  assert.ok(await client.evaluate(el => el === document.activeElement));
  await pane.getByRole('button', { name: 'Open Store' }).click();
  assert.equal(await section.locator('output').textContent(), 'Opened Store');
  const transform = () => world.evaluate(el => el.style.transform);
  await section.getByRole('button', { name: 'Fit diagram' }).click();
  const initial = await transform();
  await section.getByRole('button', { name: 'Zoom in' }).click();
  assert.notEqual(await transform(), initial);
  await section.getByRole('button', { name: 'Fit diagram' }).click();
  assert.equal(await transform(), initial);
  const box = await pane.boundingBox();
  await page.mouse.move(box.x + 12, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 52, box.y + 30, { steps: 4 });
  await page.mouse.up();
  assert.notEqual(await transform(), initial);
  assert.equal(await pane.locator('.im-graph-edge').count(), 2);
  assert.equal(await pane.locator('.im-graph-edge text').textContent(), 'reads');
}
