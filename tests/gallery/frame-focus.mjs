import assert from 'node:assert/strict';

// A repaint of the frame replaces the rows of the sidebar and the content: a control that holds the focus and is replaced
// gets it back (a row by its data-action and data-id, a field by its name, with its caret), as one that is kept does.
export default async function (page) {
  await page.evaluate(() => {
    const api = window.__imagoSurfaces;
    const shell = document.createElement('div');
    shell.id = 'frame-focus';
    shell.className = 'im-shell';
    document.body.append(shell);
    const row = (id) => `<button type="button" class="im-row" data-action="open" data-id="${id}">${id}</button>`;
    window.__frameFocus = {
      shell,
      paint(extra = '') {
        api.renderShellFrame(shell, api.shellFrameHtml({
          titlebarHtml: api.titlebarHtml({ brand: { name: 'Frame' } }),
          sidebarHtml: api.sidebarHtml({ id: 'frame-focus-side', label: 'Threads', rowsHtml: row('a') + row('b') }),
          contentHtml: api.pageContentHtml(`<input class="im-input" name="title" value="Hello world"><button type="button" class="im-btn"><span>Plain</span></button>${extra}`),
          contentLabel: 'Page', skipLabel: 'Skip to content', inspectorLabel: 'Details',
        }));
      },
    };
    window.__frameFocus.paint();
  });
  const active = () => page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.localName, id: el?.dataset?.id, name: el?.getAttribute?.('name'), start: el?.selectionStart, end: el?.selectionEnd };
  });
  try {
    await page.evaluate(() => document.querySelector('#frame-focus [data-action="open"][data-id="b"]').focus());
    await page.evaluate(() => window.__frameFocus.paint());
    assert.deepEqual((await active()).id, 'b', 'a sidebar row that holds the focus when the frame is repainted holds it after');

    await page.evaluate(() => {
      const input = document.querySelector('#frame-focus input[name="title"]');
      input.focus();
      input.setSelectionRange(2, 5);
    });
    await page.evaluate(() => window.__frameFocus.paint());
    const field = await active();
    assert.deepEqual([field.tag, field.name, field.start, field.end], ['input', 'title', 2, 5], 'a field in the content keeps the focus and its caret');

    await page.evaluate(() => document.querySelector('#frame-focus .im-content .im-btn').focus());
    await page.evaluate(() => window.__frameFocus.paint());
    assert.equal((await active()).tag, 'body', 'a control with nothing to find it by cannot be given back, and nothing throws');

    await page.evaluate(() => document.querySelector('#frame-focus [data-action="open"][data-id="a"]').focus());
    await page.evaluate(() => window.__frameFocus.paint('<p>More</p>'));
    assert.deepEqual((await active()).id, 'a', 'also when the content changes');
  } finally {
    await page.evaluate(() => {
      window.__frameFocus.shell.remove();
      delete window.__frameFocus;
    });
  }
}
