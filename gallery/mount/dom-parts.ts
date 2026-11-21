import { uiButton, uiEmphasis, uiPart, uiTone, uiTraits } from '../../ts/ui/index.ts';

declare global {
  interface Window {
    /** The DOM parts and their roles, for tests/gallery/dom-parts.mjs to build inside the live shell. */
    __imagoParts?: {
      uiButton: typeof uiButton;
      uiEmphasis: typeof uiEmphasis;
      uiPart: typeof uiPart;
      uiTone: typeof uiTone;
      uiTraits: typeof uiTraits;
    };
  }
}

export default function mount(): () => void {
  window.__imagoParts = { uiButton, uiEmphasis, uiPart, uiTone, uiTraits };
  return () => {
    delete window.__imagoParts;
  };
}
