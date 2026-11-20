import assert from 'node:assert/strict';

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
}
