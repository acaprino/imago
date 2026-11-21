import assert from 'node:assert/strict';

export default async function (page) {
  await page.evaluate(() => {
    const shell = document.createElement('section');
    shell.id = 'dialog-repaint-fixture';
    shell.className = 'im-shell';
    // This fixture sits outside the gallery's themed window. Establish the token
    // scope a real app supplies; otherwise var(--im-font-head) is undefined.
    Object.assign(shell.dataset, { imApp: 'muro', imLook: 'smooth', imTheme: 'light' });
    shell.innerHTML = '<header class="im-titlebar"><button id="repaint-titlebar">Window action</button></header><main class="im-body"><button id="repaint-opener">Delete item</button><ul class="im-file-list"><li>A file</li></ul><div class="im-settings"><h2>Settings</h2></div><div class="im-banner"><ul><li>A warning</li></ul></div></main>';
    document.body.append(shell);
    window.__repaint = {
      shell,
      ask() {
        void window.__imagoSurfaces.confirm(shell, { title: 'Delete item?', body: 'This cannot be undone.', confirm: 'Delete', cancel: 'Cancel', danger: true });
      },
      replace() {
        const previous = shell.querySelector('#repaint-opener');
        const replacement = previous.cloneNode(true);
        previous.replaceWith(replacement);
      },
    };
  });
  try {
    const fixture = page.locator('#dialog-repaint-fixture');
    assert.ok(await fixture.evaluate(el => getComputedStyle(el).getPropertyValue('--im-font-head').trim()), 'the standalone fixture provides Imago font tokens');
    assert.equal(await fixture.locator('.im-file-list').evaluate(el => getComputedStyle(el).paddingTop), '12px', 'document resets leave file-list component padding');
    assert.equal(await fixture.locator('.im-settings h2').evaluate(el => getComputedStyle(el).paddingTop), '14px', 'document resets leave settings heading padding');
    assert.equal(await fixture.locator('.im-banner ul').evaluate(el => getComputedStyle(el).listStyleType), 'disc', 'document resets leave banner bullets');
    assert.equal(await fixture.locator('.im-banner ul').evaluate(el => getComputedStyle(el).paddingLeft), '18px', 'document resets leave banner indentation');

    await page.evaluate(() => {
      document.querySelector('#repaint-opener').focus();
      window.__repaint.ask();
      window.__repaint.replace();
    });
    assert.equal(await fixture.locator('.im-dialog-title').evaluate(el => getComputedStyle(el).fontSize), '18px', 'document heading defaults leave the modal title typography');
    await page.evaluate(() => window.__repaint.shell.querySelector('.im-dialog .im-btn').click());
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'repaint-opener', 'Cancel restores a remounted opener');

    await page.evaluate(() => {
      document.querySelector('#repaint-opener').focus();
      window.__repaint.ask();
      window.__repaint.replace();
      document.querySelector('#repaint-titlebar').focus();
      window.__repaint.shell.querySelector('.im-dialog .im-btn').click();
    });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'repaint-titlebar', 'closing does not steal deliberate titlebar focus');
  } finally {
    await page.evaluate(() => {
      window.__repaint.shell.querySelector('.im-dialog .im-btn')?.click();
      window.__repaint.shell.remove();
      delete window.__repaint;
    });
  }
}
