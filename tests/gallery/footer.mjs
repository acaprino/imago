// The footer's key list, in a real DOM: Shinatama's footer is written by footerKeys (ts/ui/app.ts) from the registry once
// the app is mounted (gallery/main.ts), from a command's id and from an entry of the list's own ({ keys, title }). The other
// apps keep the key list their fixture writes.
import assert from 'node:assert/strict';

const keysOf = (page) =>
  page.evaluate(() => [...document.querySelectorAll('#g-window .im-footer .im-footer-keys > span')].map((item) => ({
    caps: [...item.querySelectorAll(':scope > kbd.im-key')].map((cap) => cap.textContent),
    text: [...item.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim(),
  })));

export default async function (page) {
  for (const look of ['smooth', 'oni']) {
    await page.evaluate((l) => window.__imago.set({ app: 'shinatama', look: l, theme: 'dark', glass: false, width: 1160 }), look);
    // 'action:primary' is the app's primary action, New session on Ctrl+Shift+T, as the registry has it; F6 is the list's own.
    assert.deepEqual(await keysOf(page), [
      { caps: ['Ctrl', '⇧', 'T'], text: 'New session' },
      { caps: ['F6'], text: 'Next region' },
    ], `${look}: Shinatama's footer lists the keys footerKeys writes from the registry and from its own entry`);
    const one = await page.evaluate(() => document.querySelectorAll('#g-window .im-footer .im-footer-keys').length);
    assert.equal(one, 1, `${look}: one key list in the footer, the one footerKeys wrote in place of the fixture's`);
  }
  // An app without footerKeys keeps the key list of its fixture.
  await page.evaluate(() => window.__imago.set({ app: 'xiox', look: 'smooth', theme: 'dark', glass: false, width: 1160 }));
  assert.deepEqual(await keysOf(page), [
    { caps: ['↑↓'], text: 'move' },
    { caps: ['space'], text: 'toggle' },
    { caps: ['↵'], text: 'clean' },
  ], "Xiox's footer is its fixture's key list");
}
