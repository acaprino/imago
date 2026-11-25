// The focus when what held it goes (a pane that hides, a view that gives way to another, the views that move to the foot):
// the content takes it, so the keys keep working and a screen reader is told where it is.
import { useEffect, useLayoutEffect } from 'react';

/** Gives the focus to the content of the frame. */
export function focusContent(): void {
  document.querySelector<HTMLElement>('[data-slot="app-shell-content"]')?.focus({ preventScroll: true });
}

// What had the focus last: once hidden or removed the page no longer says it.
let held: EventTarget | null = null;

/** Follows the focus for `useFocusKept`: once, for the whole page. */
export function useFocusFollowed(): void {
  useEffect(() => {
    const follow = (event: FocusEvent): void => { held = event.target; };
    document.addEventListener('focusin', follow);
    return () => document.removeEventListener('focusin', follow);
  }, []);
}

/** Gives the focus to the content when what had it has gone or is hidden. */
export function keepFocus(): void {
  const at = document.activeElement === document.body ? held : document.activeElement;
  if (at instanceof Element && (!at.isConnected || at.closest('[hidden]'))) focusContent();
}

/** When any of `where` (what is in sight) changes and what had the focus has gone or is hidden, the content takes the focus. */
export function useFocusKept(...where: unknown[]): void {
  useLayoutEffect(keepFocus, where);
}
