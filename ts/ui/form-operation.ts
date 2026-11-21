import { captureFocus, restoreFocus } from './dom-state.ts';

const pending = new WeakMap<HTMLElement, object>();

export interface FormOperationOptions<T> {
  error?: HTMLElement | null;
  after?: (value: T) => void | Promise<void>;
  /** Additional lifecycle check when a host can be reused without replacing its descendants. */
  current?: () => boolean;
  /** Use after reading the submission payload; disabled fields do not enter FormData. */
  lockFields?: boolean;
  fallbackFocus?: () => HTMLElement | null;
}

/** True for an operation on the host or inside it; a dialog can use this to guard dismissal. */
export function isFormOperationPending(root: HTMLElement): boolean {
  return pending.has(root) || root.querySelector('[data-im-operation]') !== null;
}

/** Serializes a form's writes, locks all actions, and restores their exact previous states.
 * A detached/replaced form never delivers a late result into a newer dialog. */
export async function runFormOperation<T>(host: HTMLElement, work: () => Promise<T>, options: FormOperationOptions<T> = {}): Promise<boolean> {
  if (!host.isConnected || pending.has(host) || host.getAttribute('aria-busy') === 'true') return false;
  const token = {};
  pending.set(host, token);
  const busy = host.getAttribute('aria-busy');
  const operation = host.getAttribute('data-im-operation');
  const document = host.ownerDocument;
  const active = document.activeElement;
  const focus = captureFocus(host);
  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(options.lockFields ? 'button, input, select, textarea' : 'button')).map(button => ({ button, disabled: button.disabled }));
  host.setAttribute('aria-busy', 'true');
  host.setAttribute('data-im-operation', '');
  buttons.forEach(({ button }) => { button.disabled = true; });
  if (options.error) options.error.textContent = '';
  const current = () => pending.get(host) === token && host.isConnected && options.current?.() !== false;
  try {
    const value = await work();
    if (current()) await options.after?.(value);
  } catch (error) {
    if (current()) {
      if (options.error) options.error.textContent = String(error instanceof Error ? error.message : error);
      else throw error;
    }
  } finally {
    if (pending.get(host) === token) {
      pending.delete(host);
      if (busy === null) host.removeAttribute('aria-busy'); else host.setAttribute('aria-busy', busy);
      if (operation === null) host.removeAttribute('data-im-operation'); else host.setAttribute('data-im-operation', operation);
      buttons.forEach(({ button, disabled }) => { button.disabled = disabled; });
      if (focus && host.isConnected && options.current?.() !== false
        && (document.activeElement === document.body || document.activeElement === active && active?.localName === 'button')) restoreFocus(host, focus, { fallback: options.fallbackFocus?.() });
    }
  }
  return true;
}
