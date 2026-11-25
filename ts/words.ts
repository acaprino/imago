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
  /** A window that did not do what the person asked (`minimize`, `toggleMaximize`, `close`, `setZoom`, `setMaterial`), and why. */
  windowFailed: (call: string, cause: string) => string;
  /** The command of the palette that turns the glass window on or off, and what is said when the choice holds only from the next start. */
  glass: string;
  glassRestart: string;
}

export const SHELL_WORDS: ShellWords = {
  views: 'Views',
  search: 'Search in this view',
  noSearch: 'This view has no search.',
  nextRegion: 'Next region',
  screenFailed: 'This screen could not be shown',
  retry: 'Try again',
  windowFailed: (call, cause) => `The window did not answer (${call}): ${cause}`,
  glass: 'Glass window',
  glassRestart: 'Restart needed: the glass window changes the next time the app starts.',
};
