// What the main window does as a desktop application rather than a web page (the native side is the imago-shell
// crate's navigation guard): browser keys (F5, Ctrl+R, Ctrl+P, Alt+Left...) do nothing, the engine's page menu stays
// out of the chrome, the mouse's back and forward buttons do not navigate, and an image or a link is not dragged out
// of the window. The zoom keys are zoom.ts. Nothing here runs until `guardDesktop` is called with a document.

/** What the guard reads of a keyboard event. */
export type KeyLike = {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
};

/** Fields keep the engine's menu: it offers editing there. */
const FIELD = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
/** What the engine drags out of a page by itself. */
const DRAGGABLE_BY_ENGINE = 'img, a';

const BROWSER_FUNCTION_KEYS = ['F5', 'F7', 'F12', 'BrowserBack', 'BrowserForward', 'BrowserRefresh'];
const BROWSER_HISTORY_KEYS = ['ArrowLeft', 'ArrowRight', 'Home'];
/** Ctrl+R reload, P print, U source, F find, G find next, S save, H history, J downloads, D bookmark, O open, N new window. */
const BROWSER_CTRL_LETTERS = ['r', 'p', 'u', 'f', 'g', 's', 'h', 'j', 'd', 'o', 'n'];
/** Ctrl+Shift+R hard reload, G find previous, I and J and C DevTools. */
const BROWSER_CTRL_SHIFT_LETTERS = ['r', 'g', 'i', 'j', 'c'];

/**
 * Keys the engine maps to browser features (reload, print, find, history, source, caret browsing, DevTools). WebView2's
 * browser accelerators are off in a release build; this also covers the engine's handling of keys the page leaves
 * unhandled.
 */
function isBrowserKey(event: KeyLike): boolean {
  const { key, ctrlKey: ctrl, shiftKey: shift, altKey: alt, metaKey: meta } = event;
  if (meta) return false;
  if (BROWSER_FUNCTION_KEYS.includes(key)) return !alt;
  if (alt && !ctrl && BROWSER_HISTORY_KEYS.includes(key)) return true;
  if (!ctrl || alt) return false;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  return (shift ? BROWSER_CTRL_SHIFT_LETTERS : BROWSER_CTRL_LETTERS).includes(lower);
}

/** The element an event was aimed at, when it is one: a duck test, so it holds across documents and without a DOM. */
function elementOf(event: Event): Element | null {
  const target = event.target as Partial<Element> | null;
  return target !== null && typeof target.closest === 'function' ? (target as Element) : null;
}

/**
 * Makes the page behave like a desktop window. Returns the function that takes the guard away.
 *
 * - Browser keys are refused with `preventDefault` in the capture phase and are not stopped: the app's own handler for
 *   the same key (Ctrl+F for its search, Ctrl+S in an editor) still runs, and sees the event as already handled.
 * - `allowReloadIn` is a selector for the places that run their own keys and menus, a terminal or an editor
 *   (`'.xterm, .cm-editor'`): inside them the browser keys and the engine's menu are left alone.
 * - The engine's context menu is refused except in fields, in `allowReloadIn` places and over selected text (Copy).
 * - The mouse's fourth and fifth buttons (Back and Forward to the engine) do nothing.
 * - An image or a link is not dragged out of the window, unless the app made it `draggable="true"`.
 */
export function guardDesktop(doc: Document, options: { allowReloadIn?: string } = {}): () => void {
  const own = options.allowReloadIn;
  const ownInput = own ? `${FIELD}, ${own}` : FIELD;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isBrowserKey(event)) return;
    if (own && elementOf(event)?.closest(own)) return;
    event.preventDefault();
  };

  const onContextMenu = (event: MouseEvent): void => {
    const target = elementOf(event);
    const selection = doc.getSelection?.();
    const selected = !!selection && !selection.isCollapsed && target !== null && selection.containsNode(target, true);
    if (target === null || (target.closest(ownInput) === null && !selected)) event.preventDefault();
  };

  const onMouseUp = (event: MouseEvent): void => {
    if (event.button === 3 || event.button === 4) event.preventDefault();
  };

  const onDragStart = (event: DragEvent): void => {
    const target = elementOf(event);
    if (target?.closest(DRAGGABLE_BY_ENGINE) && !target.closest('[draggable="true"]')) event.preventDefault();
  };

  // Capture: a terminal or a field never gets to keep these keys, as in Windows Terminal.
  doc.addEventListener('keydown', onKeyDown, { capture: true });
  doc.addEventListener('contextmenu', onContextMenu);
  doc.addEventListener('mouseup', onMouseUp);
  doc.addEventListener('dragstart', onDragStart);
  return () => {
    doc.removeEventListener('keydown', onKeyDown, { capture: true });
    doc.removeEventListener('contextmenu', onContextMenu);
    doc.removeEventListener('mouseup', onMouseUp);
    doc.removeEventListener('dragstart', onDragStart);
  };
}
