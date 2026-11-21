// A key is answered once. A handler of the package that answers a key (Escape that closes a surface, the inspector or
// the sidebar drawer, an arrow that moves a list) claims it beside `preventDefault()`, and the command registry runs no
// command for a claimed key. Preventing alone is not claiming: `guardDesktop` refuses Ctrl+F to the browser, and the
// app's search still runs on it. The claim is kept beside the event, in a WeakSet: nothing is written on the event.
// This module imports nothing and touches nothing when it is imported.

type Listener = (event: KeyLike) => void;
type EventHost = {
  addEventListener(type: 'keydown' | 'keyup', listener: Listener, capture: boolean): void;
  removeEventListener(type: 'keydown' | 'keyup', listener: Listener, capture: boolean): void;
};
type KeyLike = { key?: string; repeat?: boolean; preventDefault?: () => void };
type Dispatched = KeyLike & { currentTarget?: unknown; target?: unknown };
type NodeLike = { nodeType?: number; ownerDocument?: unknown; document?: unknown };

const claimed = new WeakSet<object>();
/** The documents where an Escape is held, each with the function that lets go of it. */
const held = new WeakMap<object, () => void>();

/** The document an event is dispatched in: the listener's own (a document, an element's, a window's), else the target's. */
function documentOf(event: Dispatched): EventHost | null {
  for (const node of [event.currentTarget, event.target]) {
    if (!node || typeof node !== 'object') continue;
    const { nodeType, ownerDocument, document } = node as NodeLike;
    if (nodeType === 9) return node as EventHost;
    const doc = ownerDocument ?? document;
    if (doc && typeof doc === 'object') return doc as EventHost;
  }
  return null;
}

// Escape closes something and focus moves, so the repeats of a held Escape would reach what is behind it (the opener,
// the app's own Escape command) and answer it again and again. An Escape that is claimed stays claimed until its keyup:
// on the document, while capturing, each repeat is claimed and prevented before the handlers it would reach. A new press
// that nothing claims ends the hold too, in case its keyup never came (the window lost focus while the key was down).
function holdEscape(event: Dispatched): void {
  if (event.key !== 'Escape') return;
  const doc = documentOf(event);
  if (!doc || held.has(doc)) return;
  const release = (): void => {
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('keyup', onKeyUp, true);
    held.delete(doc);
  };
  const onKeyDown = (next: KeyLike): void => {
    if (next.key !== 'Escape') return;
    if (!next.repeat) {
      // A new press. Claimed already (by the layers, which listen from the mount on): the hold serves it. Not yet: the
      // hold ends, and the handler that claims it, later, holds it again.
      if (!claimed.has(next)) release();
      return;
    }
    claimed.add(next);
    next.preventDefault?.();
  };
  const onKeyUp = (next: KeyLike): void => {
    if (next.key === 'Escape') release();
  };
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('keyup', onKeyUp, true);
  held.set(doc, release);
}

/** Claims a key a handler answers, beside its `preventDefault()`: no command of the registry runs on it. */
export function claimKey(event: object): void {
  claimed.add(event);
  holdEscape(event as Dispatched);
}

/** Whether a handler claimed this key event. */
export function keyClaimed(event: object): boolean {
  return claimed.has(event);
}
