import { openContentDialog } from './dialog.ts';
import { captureFocus, restoreFocus, type FocusSnapshot } from './dom-state.ts';
import { isFormOperationPending } from './form-operation.ts';
import { hasModal } from './layers.ts';

export interface ContentDialogControllerOptions {
  label?: string;
  canDismiss?: () => boolean;
  onClose?: () => void;
  fallbackFocus?: () => HTMLElement | null;
}

let serial = 0;
/** A reusable native-form dialog with shared naming, focus and dismissal rules.
 * `show` accepts trusted component markup; escape external values in those components.
 * Close is for completed application actions; dismiss respects pending operations.
 */
export function createContentDialog(shell: HTMLElement, options: ContentDialogControllerOptions = {}) {
  const doc = shell.ownerDocument;
  const element = doc.createElement('dialog');
  element.tabIndex = -1;
  const titleId = `im-content-title-${++serial}`;
  let layer: ReturnType<typeof openContentDialog> | null = null;
  let opener: FocusSnapshot | null = null;
  let disposed = false;
  const canDismiss = () => options.canDismiss?.() !== false
    && element.getAttribute('aria-busy') !== 'true'
    && !element.querySelector('form[aria-busy="true"]')
    && !isFormOperationPending(element);
  function show(markup: string, mode: 'dialog' | 'drawer' = 'dialog') {
    if (disposed) return element;
    const wasOpen = element.open;
    const focus = wasOpen ? captureFocus(element) : null;
    if (!wasOpen) opener = captureFocus(shell);
    element.className = 'im-float im-dialog im-content-dialog' + (mode === 'drawer' ? ' im-content-dialog--drawer' : '');
    element.innerHTML = markup;
    const heading = element.querySelector('h1,h2');
    if (heading) {
      heading.id ||= titleId;
      element.setAttribute('aria-labelledby', heading.id);
      element.removeAttribute('aria-label');
    } else {
      element.removeAttribute('aria-labelledby');
      element.setAttribute('aria-label', options.label ?? 'Dialog');
    }
    if (wasOpen) {
      restoreFocus(element, focus, { fallback: element.querySelector<HTMLElement>('[autofocus]:not(:disabled)') ?? element });
    } else {
      layer = openContentDialog(shell, element, { canDismiss, onClose() {
        layer = null;
        if (disposed) return;
        // The lower layer has already restored the opener or preserved deliberate
        // outside focus. A callback may repaint that target: retain its identity,
        // rather than sending every close back to the original opener.
        const active = doc.activeElement;
        const ownFocus = !active || active === doc.body || shell.contains(active);
        const returnedFocus = captureFocus(shell);
        options.onClose?.();
        const now = doc.activeElement;
        if (!disposed && !layer && !hasModal() && ownFocus
          && (!now || now === doc.body || !now.isConnected)) {
          restoreFocus(shell, returnedFocus ?? opener, { fallback: options.fallbackFocus?.() });
        }
      } });
    }
    return element;
  }
  function close() { layer?.close(); }
  function dismiss() { if (!canDismiss()) return false; close(); return true; }
  function dispose() { disposed = true; layer?.dispose(); element.remove(); }
  return { element, show, close, dismiss, dispose };
}
