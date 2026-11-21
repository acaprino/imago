import assert from 'node:assert/strict';

// A dialog sits in the middle of the layer under the title bar, whatever it holds: no side panel is drawn as a dialog.
async function assertCentred(page, locator, text) {
  const offset = await locator.evaluate((el) => {
    const d = el.getBoundingClientRect(), z = el.closest('.im-scrim').getBoundingClientRect();
    return [(d.left + d.right - z.left - z.right) / 2, (d.top + d.bottom - z.top - z.bottom) / 2];
  });
  assert.ok(offset.every((n) => Math.abs(n) <= 1.5), `${text}: the dialog is off the middle of its layer by ${offset.map(Math.round)}`);
}

// A dialog taller than its layer stays inside the layer, under the title bar, and scrolls; at every width of the shell,
// under 620 too, a dialog of each kind (an app's own, a form, a confirmation) stays inside its layer and in its middle.
async function tallAndNarrow(page, look, theme) {
  const where = (text) => `${look} ${theme}: ${text}`;
  // Each kind of dialog, opened on the live shell; `long` fills it with more than its layer can hold.
  const open = (kind, long) => page.evaluate(({ kind, long }) => {
    const api = window.__imagoSurfaces;
    const shell = document.querySelector('#g-window .im-shell');
    const lines = Array.from({ length: long ? 60 : 2 }, (_, n) => `<p>Line ${n + 1} of what the dialog says: a sentence long enough to wrap in a narrow window.</p>`).join('');
    if (kind === 'content') {
      const dialog = document.createElement('dialog');
      dialog.setAttribute('aria-label', 'Long form');
      dialog.innerHTML = `<form class="im-form" method="dialog"><h2>Long form</h2>${lines}<button class="im-btn" type="submit">Close</button></form>`;
      const control = api.openContentDialog(shell, dialog);
      window.__closeDialog = () => control.close();
    } else if (kind === 'form') {
      const form = api.openFormDialog(shell, { title: 'Long form', closeLabel: 'Close' });
      form.body.innerHTML = lines;
      window.__closeDialog = () => form.close();
    } else {
      void api.confirm(shell, { title: 'Delete 8 items permanently?', body: '13.48 GB in 46,999 files will be deleted. This cannot be undone.', confirm: 'Delete 8 items', cancel: 'Cancel', danger: true });
      window.__closeDialog = () => document.querySelector('#g-window .im-dialog .im-btn:not(.im-btn--confirm-danger)').click();
    }
  }, { kind, long });
  // Where the dialog is in its layer, and the part of it that scrolls (the dialog, or the body of a form dialog).
  const measure = () => page.evaluate(() => {
    const dialog = document.querySelector('#g-window .im-scrim .im-dialog');
    const layer = dialog.closest('.im-scrim').getBoundingClientRect();
    const box = dialog.getBoundingClientRect();
    const scroller = [dialog, ...dialog.querySelectorAll('*')].find((el) => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1) ?? null;
    const openedAt = scroller?.scrollTop ?? 0;
    // The wheel is tried from the top, wherever the dialog opened (see openedAtTop).
    if (scroller) scroller.scrollTop = 0;
    return {
      inside: box.left >= layer.left - 0.5 && box.right <= layer.right + 0.5 && box.top >= layer.top - 0.5 && box.bottom <= layer.bottom + 0.5,
      offset: [(box.left + box.right - layer.left - layer.right) / 2, (box.top + box.bottom - layer.top - layer.bottom) / 2],
      box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, layer: { left: layer.left, right: layer.right, top: layer.top, bottom: layer.bottom },
      scrolls: Boolean(scroller), openedAt, wide: dialog.scrollWidth > dialog.clientWidth + 1,
    };
  });
  const tallOpenedAt = [];
  for (const width of [1160, 600, 500, 250]) {
    await page.evaluate((w) => window.__imago.set({ width: w }), width);
    for (const kind of ['content', 'form', 'confirm']) {
      for (const long of kind === 'confirm' ? [false] : [false, true]) {
        const said = (text) => where(`${kind} dialog${long ? ', taller than its layer,' : ''} at ${width}: ${text}`);
        await open(kind, long);
        const seen = await measure();
        assert.ok(seen.inside, said(`stays inside its layer (${JSON.stringify({ box: seen.box, layer: seen.layer })})`));
        assert.ok(seen.offset.every((n) => Math.abs(n) <= 1.5), said(`is in the middle of its layer, off by ${seen.offset.map(Math.round)}`));
        assert.ok(!seen.wide, said('does not scroll sideways'));
        if (long) {
          assert.ok(seen.scrolls, said('scrolls'));
          tallOpenedAt.push({ what: `${kind} at ${width}`, at: seen.openedAt });
          // The wheel over the dialog scrolls what scrolls in it.
          const before = await page.evaluate(() => [...document.querySelectorAll('#g-window .im-scrim .im-dialog, #g-window .im-scrim .im-dialog *')].map((el) => el.scrollTop).join());
          const box = seen.box;
          await page.mouse.move((box.left + box.right) / 2, (box.top + box.bottom) / 2);
          await page.mouse.wheel(0, 400);
          await page.waitForFunction((was) => [...document.querySelectorAll('#g-window .im-scrim .im-dialog, #g-window .im-scrim .im-dialog *')].map((el) => el.scrollTop).join() !== was, before, { timeout: 2000 }).catch(() => {});
          const after = await page.evaluate(() => [...document.querySelectorAll('#g-window .im-scrim .im-dialog, #g-window .im-scrim .im-dialog *')].map((el) => el.scrollTop).join());
          assert.notEqual(after, before, said('the wheel scrolls it'));
        }
        await page.evaluate(() => window.__closeDialog());
        await page.waitForFunction(() => !document.querySelector('#g-window .im-scrim'));
      }
    }
  }
  await page.evaluate(() => window.__imago.set({ width: 1160 }));
  openedAtTop(tallOpenedAt, where);
}

/**
 * A tall dialog opens at its top. An app's own dialog whose first control is at its end (a Close button under a long text)
 * would open scrolled to that end if the focus on its first control scrolled it into view: openContentDialog
 * (ts/ui/dialog.ts) keeps it at its top.
 */
function openedAtTop(seen, where) {
  assert.ok(seen.length >= 4, where(`the opening position of the tall dialogs is measured (${seen.length})`));
  for (const { what, at } of seen) assert.equal(at, 0, where(`a tall ${what} opens at its top, not scrolled by ${at}px`));
}

export default async function(page) {
  for(const look of ['smooth','oni'])for(const theme of ['dark','light']){
    await page.evaluate(({look,theme})=>window.__imago.set({app:'muro',look,theme,glass:false}),{look,theme});
    await page.evaluate(()=>{
      const shell=document.querySelector('.im-shell');
      const dialog=document.createElement('dialog');
      dialog.setAttribute('aria-label','Native form');
      // Native controls, each with the class of its one drawing: no class on the shell opts them in.
      dialog.innerHTML='<form class="im-form" method="dialog"><label class="im-field"><span>Name</span><span class="im-input"><input name="name" value="Original" autofocus></span></label><div class="im-seg" role="radiogroup" aria-label="Choice"><label><input type="radio" name="choice" value="a" checked><span>A</span></label><label><input type="radio" name="choice" value="b"><span>B</span></label></div><label class="im-option"><input type="checkbox" class="im-check" name="keep" checked><span>Keep</span></label><label class="im-input"><input aria-label="Search" value="search"></label><button class="im-btn" type="submit">Save</button></form>';
      window.__native={dialog,locked:true,closes:0};
      window.__native.open=()=>window.__native.control=window.__imagoSurfaces.openContentDialog(shell,dialog,{canDismiss:()=>!window.__native.locked,onClose:()=>window.__native.closes++});
      window.__native.open();
    });
    const dialog=page.getByRole('dialog',{name:'Native form'});
    await assertCentred(page,dialog,`${look} ${theme}: an app-owned content dialog`);
    await dialog.getByRole('textbox',{name:'Name',exact:true}).fill('Kept after failure');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(),true,'locked Escape keeps the form');
    await page.evaluate(()=>document.querySelector('.im-scrim').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
    assert.equal(await dialog.isVisible(),true,'locked backdrop keeps the form');
    assert.equal(await page.evaluate(()=>document.querySelector('.im-body').inert),true);
    await dialog.getByRole('radio',{name:'B',exact:true}).check({force:true});
    assert.deepEqual(await page.evaluate(()=>Object.fromEntries(new FormData(window.__native.dialog.querySelector('form')))),{name:'Kept after failure',choice:'b',keep:'on'});
    assert.equal(await dialog.getByRole('textbox',{name:'Search'}).evaluate(el=>getComputedStyle(el).borderTopWidth),'0px','input wrapper has a single border');
    // The radios and the checkbox are drawn as the segmented control and the checkbox are, not by the browser.
    const drawn=await dialog.evaluate(el=>{
      const box=element=>{const r=element.getBoundingClientRect();return [r.width,r.height];};
      const check=el.querySelector('.im-check');
      return {
        weights:[...el.querySelectorAll('.im-seg > label')].map(label=>getComputedStyle(label).fontWeight),
        radio:box(el.querySelector('.im-seg input')),
        check:[getComputedStyle(check).appearance,...box(check),getComputedStyle(check,'::after').content,getComputedStyle(check).cursor],
        field:getComputedStyle(el.querySelector('.im-field .im-input')).borderTopStyle,
      };
    });
    assert.deepEqual(drawn.weights,['500','700'],'the checked radio is the selected segment');
    assert.deepEqual(drawn.radio,[1,1],'the radio of a segment is hidden under its label');
    assert.deepEqual(drawn.check,['none',16,16,'""','default'],'a native checkbox in the shell is the im-check box with its mark, and the arrow, not the text cursor');
    assert.equal(drawn.field,'solid','the name field has its box');
    await page.evaluate(()=>{window.__native.control.close();window.__native.control.close();});
    assert.equal(await page.evaluate(()=>window.__native.closes),1,'programmatic completion is idempotent');
    assert.equal(await page.evaluate(()=>document.querySelector('.im-body').inert),false);
    await page.evaluate(()=>{window.__native.locked=false;window.__native.open();});
    await dialog.getByRole('button',{name:'Save'}).click();
    await page.waitForFunction(()=>window.__native.closes===2);
    assert.equal(await page.evaluate(()=>document.querySelector('.im-body').inert),false,'native form close releases modality');
    await page.evaluate(()=>{const shell=document.querySelector('.im-shell');window.__imagoSurfaces.notify(shell,'Dispose me');window.__imagoSurfaces.clearNotices(shell);});
    assert.equal(await page.locator('[data-im-notices]').count(),0);
    await controllerContract(page, look, theme);
    await tallAndNarrow(page, look, theme);
  }
}

async function controllerContract(page, look, theme) {
  await page.evaluate(() => {
    const api = window.__imagoSurfaces;
    const shell = document.createElement('section');
    shell.id = 'content-controller-fixture';
    shell.className = 'im-shell';
    Object.assign(shell.style, { position: 'fixed', inset: '0', zIndex: '100' });
    document.body.append(shell);
    const frame = () => api.shellFrameHtml({ titlebarHtml: '<header class="im-titlebar"><button id="controller-titlebar">Window action</button></header>', contentHtml: '<button id="controller-opener">Edit record</button>', contentId: 'controller-main', contentLabel: 'Record', skipLabel: 'Skip to content', inspectorLabel: 'Details' });
    api.renderShellFrame(shell, frame());
    const state = { shell, focusOnClose: '', operation: null, resolve: null, controller: null };
    state.controller = api.createContentDialog(shell, {
      onClose() {
        api.renderShellFrame(shell, frame());
        if (state.focusOnClose) shell.querySelector('#' + state.focusOnClose)?.focus();
      },
      fallbackFocus: () => shell.querySelector('#controller-main'),
    });
    // `mode` is what an app written for 0.1.4 still passes to ask for a side panel: there is none, so it changes nothing.
    state.show = (mode) => {
      shell.querySelector('#controller-opener').focus();
      state.controller.show('<form class="im-form"><h2>Controller form</h2><label>Name<input name="name" value="Draft" autofocus></label><button type="button">Save</button></form>', mode);
    };
    window.__contentController = state;
    state.show();
  });
  try {
    const formDialog = page.locator('#content-controller-fixture').getByRole('dialog', { name: 'Controller form' });
    await assertCentred(page, formDialog, `${look} ${theme}: a dialog of createContentDialog`);
    await formDialog.getByRole('textbox', { name: 'Name' }).fill('Kept draft');
    await page.evaluate(() => window.__contentController.controller.element.querySelector('form').setAttribute('aria-busy', 'true'));
    await page.keyboard.press('Escape');
    assert.equal(await formDialog.isVisible(), true, 'legacy native form aria-busy prevents Escape');
    assert.equal(await page.evaluate(() => window.__contentController.controller.dismiss()), false, 'legacy form busy prevents explicit dismissal');
    await page.evaluate(() => {
      const controller = window.__contentController.controller;
      controller.element.querySelector('form').removeAttribute('aria-busy');
      controller.element.setAttribute('aria-busy', 'true');
    });
    assert.equal(await page.evaluate(() => window.__contentController.controller.dismiss()), false, 'busy dialog root prevents dismissal');
    await page.evaluate(() => {
      const state = window.__contentController;
      state.controller.element.removeAttribute('aria-busy');
      state.operation = window.__imagoSurfaces.runFormOperation(state.controller.element.querySelector('form'), () => new Promise(resolve => { state.resolve = resolve; }));
    });
    assert.equal(await page.evaluate(() => window.__contentController.controller.dismiss()), false, 'shared pending operation prevents dismissal');
    await page.keyboard.press('Escape');
    assert.equal(await formDialog.isVisible(), true, 'pending operation keeps the same form');
    assert.equal(await formDialog.getByRole('textbox', { name: 'Name' }).inputValue(), 'Kept draft');
    await page.evaluate(async () => {
      const state = window.__contentController;
      state.resolve();
      await state.operation;
      state.controller.dismiss();
    });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'controller-opener', 'onClose repaint restores the replacement opener');

    await page.evaluate(() => {
      const state = window.__contentController;
      state.show();
      state.shell.querySelector('#controller-titlebar').focus();
      state.controller.dismiss();
    });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'controller-titlebar', 'onClose repaint preserves deliberate titlebar focus');

    await page.evaluate(() => {
      const state = window.__contentController;
      state.show();
      state.focusOnClose = 'controller-main';
      state.controller.dismiss();
    });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'controller-main', 'callback-assigned focus is not replaced by opener restoration');

    // The side panel is the inspector. A dialog asked to be a drawer is the one centred dialog, newly opened and repainted.
    await page.evaluate(() => window.__contentController.show('drawer'));
    assert.equal(await formDialog.evaluate((el) => /drawer/.test(el.className)), false, `${look} ${theme}: no drawer class`);
    await assertCentred(page, formDialog, `${look} ${theme}: a dialog opened with the 'drawer' mode of 0.1.4`);
    await page.evaluate(() => window.__contentController.controller.show('<form class="im-form"><h2>Controller form</h2><button type="button">Save</button></form>', 'drawer'));
    assert.equal(await formDialog.evaluate((el) => /drawer/.test(el.className)), false, `${look} ${theme}: a repaint with the 'drawer' mode adds no drawer class`);
    await assertCentred(page, formDialog, `${look} ${theme}: a repaint with the 'drawer' mode`);
    assert.equal(await formDialog.evaluate((el) => getComputedStyle(el).borderTopLeftRadius === getComputedStyle(el).borderTopRightRadius), true, `${look} ${theme}: the corners are the dialog's, not a panel's with one square edge`);
    await page.evaluate(() => window.__contentController.controller.dismiss());
  } finally {
    await page.evaluate(async () => {
      const state = window.__contentController;
      state.resolve?.();
      await state.operation;
      state.controller.dispose();
      state.shell.remove();
      delete window.__contentController;
    });
  }
}
