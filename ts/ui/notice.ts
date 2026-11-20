// A notice: a short result, bottom centre above the footer. It never takes focus. A plain one goes away
// after a few seconds; an error stays until it is dismissed and says "Error" in words, not only in colour.

import { hasModal } from './layers.ts';

export type NoticeOptions = {
  tone?: 'err';
  action?: { label: string; run: () => void };
  /** Default 6000. An `err` notice never times out. */
  timeoutMs?: number;
  /** The word that opens an error notice (default "Error"), for an app that speaks another language. */
  errorWord?: string;
  /** The accessible name of the button that dismisses an error (default "Dismiss"). */
  dismissLabel?: string;
};

type Shown = { el: HTMLElement; err: boolean; close: () => void };

const MAX_ERRORS = 3;
const shown = new WeakMap<HTMLElement, Shown[]>();

const CROSS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function hostOf(shell: HTMLElement): HTMLElement {
  const found = shell.querySelector<HTMLElement>(':scope > [data-im-notices]');
  if (found) return found;
  const host = shell.ownerDocument.createElement('div');
  host.className = 'im-notices';
  host.dataset.imNotices = '';
  host.inert = hasModal(); // a notice that arrives under a pending dialog is shown, but cannot be pressed
  shell.append(host);
  return host;
}

/** Shows a notice. A new plain notice replaces the plain one on screen; errors stay, up to three. Returns the function that closes it. */
export function notify(shell: HTMLElement, text: string, options: NoticeOptions = {}): () => void {
  const doc = shell.ownerDocument;
  const host = hostOf(shell);
  const err = options.tone === 'err';
  const list = shown.get(host) ?? [];
  shown.set(host, list);

  // A result replaces the plain notice on screen. An error neither replaces one (an Undo may still be live)
  // nor is replaced; the oldest error goes when there are too many.
  if (err) {
    const errors = list.filter((other) => other.err);
    for (const old of errors.slice(0, Math.max(0, errors.length - (MAX_ERRORS - 1)))) old.close();
  } else {
    for (const old of list.filter((other) => !other.err)) old.close();
  }

  const el = doc.createElement('div');
  el.className = 'im-float im-notice';
  el.setAttribute('role', err ? 'alert' : 'status');
  if (err) el.dataset.imTone = 'err';

  const message = doc.createElement('span');
  message.className = 'im-notice-text';
  if (err) {
    const word = doc.createElement('b');
    word.className = 'im-notice-word';
    word.textContent = `${options.errorWord || 'Error'}:`;
    message.append(word, ' ');
  }
  message.append(text);
  el.append(message);

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const entry: Shown = {
    el,
    err,
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      const at = list.indexOf(entry);
      if (at !== -1) list.splice(at, 1);
      el.remove();
    },
  };

  const action = options.action;
  if (action) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'im-btn im-btn--sm';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      if (closed) return; // the action runs once
      entry.close();
      action.run();
    });
    el.append(button);
  }
  if (err) {
    const dismiss = doc.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'im-icon-btn';
    dismiss.title = options.dismissLabel || 'Dismiss';
    dismiss.setAttribute('aria-label', dismiss.title);
    dismiss.innerHTML = CROSS;
    dismiss.addEventListener('click', entry.close);
    el.append(dismiss);
  } else {
    timer = setTimeout(entry.close, options.timeoutMs ?? 6000);
  }

  list.push(entry);
  host.append(el);
  return entry.close;
}
