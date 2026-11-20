// The inspector: the details or the form of the selected object, in the shell's right region. It is not
// modal (the rest of the window keeps working, nothing is made inert) and it is not part of the layer stack:
// Escape closes it only when no menu, sheet, dialog or palette is above it. Leaving it with unsaved changes
// asks once.

import { tabbables } from './layers.ts';

export type Inspector = {
  /** Shows `content` in the region. With an `opener`, focus moves into the inspector and `close()` gives it back. */
  open(content: HTMLElement, opener?: HTMLElement): void;
  /** Hides the region. With a dirty guard it asks first and stays open when the answer is no. */
  close(): void;
  isOpen(): boolean;
  /** While the current content is dirty, closing it or replacing it calls `ask` once; `false` keeps it. The guard ends with the content. */
  guard(isDirty: () => boolean, ask: () => Promise<boolean>): void;
};

type Guard = { isDirty: () => boolean; ask: () => Promise<boolean> };

export function inspector(shell: HTMLElement): Inspector {
  const found = shell.querySelector<HTMLElement>('.im-inspector');
  if (!found) throw new Error('inspector(): the shell has no .im-inspector region');
  const region: HTMLElement = found;

  let opener: HTMLElement | null = null;
  let guarded: Guard | null = null;
  let asking = false;

  const isOpen = (): boolean => !region.hidden;
  const isDirty = (): boolean => guarded?.isDirty() === true;

  // Asks whether to leave the current content. One question at a time: a second attempt while the first
  // is unanswered is ignored.
  async function mayLeave(): Promise<boolean> {
    if (!guarded || !isDirty()) return true;
    if (asking) return false;
    asking = true;
    try {
      return await guarded.ask();
    } catch (error) {
      // A question that fails is not a yes: nothing is thrown away, and the inspector stays as it was.
      console.warn('The inspector could not ask whether to leave', error);
      return false;
    } finally {
      asking = false;
    }
  }

  function show(content: HTMLElement, from: HTMLElement | undefined): void {
    guarded = null;
    if (from) opener = from;
    region.replaceChildren(content);
    region.hidden = false;
    if (from) {
      if (!region.hasAttribute('tabindex')) region.tabIndex = -1;
      (tabbables(region)[0] ?? region).focus();
    }
  }

  function hide(): void {
    const doc = region.ownerDocument;
    const active = doc.activeElement;
    // Read before hiding: a hidden element loses focus at once, and then nothing says where it was.
    const stranded = !active || active === doc.body || region.contains(active);
    const back = opener;
    opener = null;
    guarded = null;
    region.hidden = true;
    if (stranded && back?.isConnected && !back.closest('[inert]')) back.focus();
  }

  region.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    close();
  });

  function close(): void {
    if (!isOpen()) return;
    if (!isDirty()) {
      hide();
      return;
    }
    void mayLeave().then((leave) => {
      if (leave) hide();
    });
  }

  return {
    open(content, from) {
      if (isOpen() && isDirty()) {
        void mayLeave().then((leave) => {
          if (leave) show(content, from);
        });
        return;
      }
      show(content, from);
    },
    close,
    isOpen,
    guard(dirty, ask) {
      guarded = { isDirty: dirty, ask };
    },
  };
}
