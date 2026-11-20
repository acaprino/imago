// A confirm dialog: a decision about the whole window. It never uses the native modal, which would make
// the HTML title bar inert too and leave a borderless window nobody can move or close. Instead the
// regions under the title bar are made inert, focus starts on Cancel and stays inside, and Escape cancels.

import { inertShell, pushLayer, trapTab, type Layer } from './layers.ts';

export type ConfirmOptions = {
  title: string;
  body: string;
  /** The label of the confirming button: the verb and the object ("Delete 8 items"). */
  confirm: string;
  cancel: string;
  /** The action cannot be undone: the confirming button is the filled danger button. */
  danger?: boolean;
};

let counter = 0;

/** Resolves `true` when the user confirms and `false` on Cancel or Escape. */
export function confirm(shell: HTMLElement, options: ConfirmOptions): Promise<boolean> {
  const doc = shell.ownerDocument;
  const active = doc.activeElement;
  const opener = active instanceof HTMLElement && active !== doc.body ? active : null;
  const id = `im-dialog-${++counter}`;

  const scrim = doc.createElement('div');
  scrim.className = 'im-scrim';
  scrim.dataset.imLayer = 'dialog';

  const dialog = doc.createElement('div');
  dialog.className = 'im-float im-dialog';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.setAttribute('aria-describedby', `${id}-body`);
  dialog.tabIndex = -1;

  const title = doc.createElement('h2');
  title.id = `${id}-title`;
  title.className = 'im-dialog-title';
  title.textContent = options.title;

  const body = doc.createElement('p');
  body.id = `${id}-body`;
  body.className = 'im-dialog-body';
  body.textContent = options.body;

  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.className = 'im-btn';
  cancel.textContent = options.cancel;

  const ok = doc.createElement('button');
  ok.type = 'button';
  ok.className = `im-btn ${options.danger ? 'im-btn--confirm-danger' : 'im-btn--primary'}`;
  ok.textContent = options.confirm;

  const actions = doc.createElement('div');
  actions.className = 'im-dialog-actions';
  actions.append(cancel, ok);
  dialog.append(title, body, actions);
  scrim.append(dialog);

  return new Promise<boolean>((resolve) => {
    let done = false;
    let release = (): void => {};
    let pop = (): void => {};

    // Whatever closes the dialog (a button, Escape, the returned close) ends here: the page is released
    // before focus goes back, because an inert element cannot take it.
    function finish(result: boolean): void {
      if (done) return;
      done = true;
      release();
      pop();
      scrim.remove();
      resolve(result);
    }

    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));
    scrim.addEventListener('keydown', (event) => trapTab(event, dialog));
    // A press on the dimmed page must not pull focus out of the dialog.
    scrim.addEventListener('mousedown', (event) => {
      if (event.target === scrim) event.preventDefault();
    });

    release = inertShell(shell);
    shell.append(scrim);
    const layer: Layer = { el: scrim, kind: 'dialog', close: () => finish(false) };
    pop = pushLayer(layer, opener);
    cancel.focus();
  });
}
