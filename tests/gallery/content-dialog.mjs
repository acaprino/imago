import assert from 'node:assert/strict';

// A dialog sits in the middle of the layer under the title bar, whatever it holds: no side panel is drawn as a dialog.
async function assertCentred(page, locator, text) {
  const offset = await locator.evaluate((el) => {
    const d = el.getBoundingClientRect(), z = el.closest('.im-scrim').getBoundingClientRect();
    return [(d.left + d.right - z.left - z.right) / 2, (d.top + d.bottom - z.top - z.bottom) / 2];
  });
  assert.ok(offset.every((n) => Math.abs(n) <= 1.5), `${text}: the dialog is off the middle of its layer by ${offset.map(Math.round)}`);
}

export default async function(page) {
  for(const look of ['smooth','oni'])for(const theme of ['dark','light']){
    await page.evaluate(({look,theme})=>window.__imago.set({app:'muro',look,theme,glass:false}),{look,theme});
    await page.evaluate(()=>{
      const shell=document.querySelector('.im-shell');
      shell.classList.add('im-native-controls');
      const dialog=document.createElement('dialog');
      dialog.setAttribute('aria-label','Native form');
      dialog.innerHTML='<form class="im-form" method="dialog"><label class="im-field"><span>Name</span><input name="name" value="Original" autofocus></label><div class="im-seg im-seg--native" role="radiogroup" aria-label="Choice"><label><input type="radio" name="choice" value="a" checked><span>A</span></label><label><input type="radio" name="choice" value="b"><span>B</span></label></div><label class="im-input"><input aria-label="Search" value="search"></label><button class="im-btn" type="submit">Save</button></form>';
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
    assert.deepEqual(await page.evaluate(()=>Object.fromEntries(new FormData(window.__native.dialog.querySelector('form')))),{name:'Kept after failure',choice:'b'});
    assert.equal(await dialog.getByRole('textbox',{name:'Search'}).evaluate(el=>getComputedStyle(el).borderTopWidth),'0px','input wrapper has a single border');
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
  }
}

async function controllerContract(page, look, theme) {
  await page.evaluate(() => {
    const api = window.__imagoSurfaces;
    const shell = document.createElement('section');
    shell.id = 'content-controller-fixture';
    shell.className = 'im-shell im-native-controls';
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
