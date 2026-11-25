// The words the shell says by itself, besides Sigrid's. An app gives its own in `defineApp`; what it leaves out is English.

export interface ShellWords {
  /** The name of the views, and of their group in the palette. */
  views: string;
  /** The command on Ctrl+F, and what is said where the view has no search. */
  search: string;
  noSearch: string;
  /** The key F6, in the foot. */
  nextRegion: string;
  /** A screen that failed while it was drawn, and the button that draws it again. */
  screenFailed: string;
  retry: string;
  /** The button of the title bar that draws the other scheme, in the dark scheme and in the light one. */
  toLight: string;
  toDark: string;
  /** The command of the look that makes the window glass: Windows' acrylic behind the page. */
  glass: string;
  /** A window that did not do what the person asked (`minimize`, `toggleMaximize`, `close`, `setZoom`), and why. */
  windowFailed: (call: string, cause: string) => string;
}

export const SHELL_WORDS: ShellWords = {
  views: 'Views',
  search: 'Search in this view',
  noSearch: 'This view has no search.',
  nextRegion: 'Next region',
  screenFailed: 'This screen could not be shown',
  retry: 'Try again',
  toLight: 'Switch to light',
  toDark: 'Switch to dark',
  glass: 'Glass',
  windowFailed: (call, cause) => `The window did not answer (${call}): ${cause}`,
};
