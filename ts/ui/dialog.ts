// A confirm dialog: a decision about the whole window. It never uses the native modal, which would make
// the HTML title bar inert too and leave a borderless window nobody can move or close. Instead the
// regions under the title bar are made inert, focus starts on Cancel and stays inside, and Escape cancels.

import { inertShell, pushLayer, topLayer, trapTab } from './layers.ts';
import { captureFocus, restoreFocus } from './dom-state.ts';

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


    // Whatever closes the dialog (a button, Escape, the returned close) ends here: the page is released
    // before focus goes back, because an inert element cannot take it.
    function finish(result: boolean): void {
      if (done) return;
      done = true;
      unmount();
      resolve(result);
    }

    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));
    const unmount = mountDialog(shell, scrim, dialog, () => finish(false));
    cancel.focus();
  });
}

function mountDialog(shell: HTMLElement, root: HTMLElement, dialog: HTMLElement, dismiss: () => void, dispose = dismiss): () => void {
  const doc = shell.ownerDocument;
  const active = doc.activeElement;
  const opener = active instanceof HTMLElement && active !== doc.body ? active : null;
  const openerState = captureFocus(shell);
  root.addEventListener('keydown', event => trapTab(event, dialog));
  root.addEventListener('mousedown', event => {
    if (event.target === root) event.preventDefault();
  });
  const release = inertShell(shell);
  shell.append(root);
  const pop = pushLayer({ el: root, kind: 'dialog', close: dismiss, dispose }, opener);
  return () => {
    const focused = doc.activeElement;
    const stranded = !focused || focused === doc.body || root.contains(focused);
    const wasTop = topLayer()?.el === root;
    release();
    pop();
    root.remove();
    // The app may repaint the opener while this modal stays mounted. The layer stack
    // restores a surviving node; its stable identity restores a replacement. A focus
    // deliberately moved to the titlebar or another layer must remain there.
    const now = doc.activeElement;
    if (wasTop && stranded && (!now || now === doc.body || root.contains(now))) restoreFocus(shell, openerState);
  };
}

export interface ContentDialogOptions {
  canDismiss?: () => boolean;
  onClose?: () => void;
}

/** An app-owned form in the shared layer stack. Contents can change without
 * remounting. Non-modal show() keeps the native window controls available. */
export function openContentDialog(shell: HTMLElement, dialog: HTMLDialogElement, options: ContentDialogOptions = {}): { close(): void; dispose(): void } {
  if (dialog.open) throw new Error('The dialog is already open');
  const root = shell.ownerDocument.createElement('div');
  root.className = 'im-scrim';
  root.dataset.imLayer = 'dialog';
  dialog.classList.add('im-float', 'im-dialog', 'im-content-dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;
  root.append(dialog);
  let closed = false;
  function dismiss(): void { if (options.canDismiss?.() !== false) close(); }
  const unmount = mountDialog(shell, root, dialog, dismiss, close);
  function nativeClose(): void { if (!dialog.open) close(); }
  function close(): void {
    if (closed) return;
    closed = true;
    dialog.removeEventListener('close', nativeClose);
    dialog.removeAttribute('open');
    unmount();
    options.onClose?.();
  }
  dialog.addEventListener('close', nativeClose);
  root.addEventListener('pointerdown', event => { if (event.target === root && topLayer()?.el === root) dismiss(); });
  try { dialog.show(); } catch (error) { close(); throw error; }
  (dialog.querySelector<HTMLElement>('[autofocus]:not(:disabled)') ?? dialog).focus();
  return { close, dispose: close };
}

export interface FormDialog {
  root: HTMLElement;
  dialog: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  /** Returns true only when this call dismisses the form. */
  close(): boolean;
  lock(locked: boolean): void;
  setTitle(title: string, subtitle?: string): void;
}

export interface FormDialogOptions {
  title: string;
  subtitle?: string;
  icon?: Node;
  wide?: boolean;
  closeLabel: string;
  onClose?: () => void;
}

/** A form with a scrollable body and persistent actions. Lock it while a write is in progress. */
export function openFormDialog(shell: HTMLElement, options: FormDialogOptions): FormDialog {
  const doc = shell.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'im-scrim';
  root.dataset.imLayer = 'dialog';
  const dialog = doc.createElement('section');
  dialog.className = 'im-float im-dialog im-form-dialog';
  dialog.classList.toggle('im-form-dialog--wide', !!options.wide);
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;
  const head = doc.createElement('header');
  head.className = 'im-form-dialog-head';
  const title = doc.createElement('h2');
  title.className = 'im-dialog-title';
  title.id = `im-dialog-${++counter}-title`;
  dialog.setAttribute('aria-labelledby', title.id);
  const subtitle = doc.createElement('span');
  subtitle.className = 'im-form-dialog-subtitle';
  const dismiss = doc.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'im-btn';
  dismiss.textContent = options.closeLabel;
  if (options.icon) head.append(options.icon);
  head.append(title, subtitle, dismiss);
  const body = doc.createElement('div');
  body.className = 'im-form-dialog-body';
  const foot = doc.createElement('footer');
  foot.className = 'im-dialog-actions im-form-dialog-foot';
  dialog.append(head, body, foot);
  root.append(dialog);
  let locked = false;
  let closed = false;
  const unmount = mountDialog(shell, root, dialog, close, dispose);
  function dispose(): void {
    if (closed) return;
    closed = true;
    unmount();
    options.onClose?.();
  }
  function close(): boolean {
    if (locked || closed) return false;
    dispose();
    return true;
  }
  function setTitle(text: string, sub = ''): void {
    title.textContent = text;
    subtitle.textContent = sub;
    subtitle.hidden = !sub;
  }
  setTitle(options.title, options.subtitle);
  dismiss.addEventListener('click', close);
  root.addEventListener('mousedown', event => { if (event.target === root) close(); });
  dialog.focus();
  queueMicrotask(() => {
    if (closed || locked || topLayer()?.el !== root || doc.activeElement !== dialog) return;
    (dialog.querySelector<HTMLElement>('[autofocus], input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), .im-btn--primary:not(:disabled)') ?? dismiss).focus();
  });
  return {
    root, dialog, body, foot, close, setTitle,
    lock(value) {
      if (closed || locked === value) return;
      locked = value;
      dismiss.disabled = body.inert = foot.inert = value;
      dialog.setAttribute('aria-busy', String(value));
      if (topLayer()?.el === root) (value ? dialog : dismiss).focus();
    },
  };
}
