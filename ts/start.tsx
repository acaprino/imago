// The start of an app: its look on the page before anything is drawn, then the app inside the shell.
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionProvider, WordsProvider } from '@acaprino/sigrid';
import { applyKeptScheme, CommandsProvider } from '@acaprino/sigrid/assemblies';
import { readHost } from '@acaprino/sigrid/tauri';
import type { App } from './app.js';
import { dress, SHELL_MOTION } from './preset.js';
import { keptGlass, keptTheme, lookOf, ShellProvider, type Kept } from './shell.js';

const CHOICES = ['light', 'dark', 'system'];

/**
 * The page's choice is the one the window keeps (`kept`), or else the browser's; with neither, dark.
 * shortcut: a browser that gives no storage at all has the system's look, Sigrid's default; until Sigrid takes a default choice.
 */
function keepChoice(key: string, kept?: unknown): void {
  try {
    const choice = [kept, localStorage.getItem(key)].map(String).find((word) => CHOICES.includes(word));
    localStorage.setItem(key, choice ?? 'dark');
  } catch {
    // No storage here.
  }
}

/** What `startApp` can be asked besides the app and its root. */
export interface StartOptions {
  /**
   * The page is a small window of its own beside the app's one window (a notice that floats over the desktop), not the window
   * the shell opens (`open_main`). The plugin refuses every other window, so the shell asks it nothing: the theme and the glass
   * the window keeps, the first frame, the title and the job, the glass command and the zoom are not there (the window is shown by
   * the app that built it). The page is drawn with Sigrid's material `clear`, so `html` and `body` paint no ground and the
   * transparent window shows the desktop around the part the page holds. It follows the light or dark that the app's window
   * keeps in the browser's storage, under the same `storage.scheme`, also when the person changes it. It keeps the browser's keys
   * away in a window, as the main one does. Default false.
   */
  secondary?: boolean;
}

/** Draws `node`, the app, in `root`, inside the shell. Returns how to take it away. */
export function startApp(app: App, root: HTMLElement, node: ReactNode, options: StartOptions = {}): () => void {
  const secondary = options.secondary === true;
  document.documentElement.lang = app.lang;
  dress(document.documentElement);
  const react = createRoot(root);
  let gone = false;
  const draw = (kept: Kept): void => {
    if (gone) return;
    applyKeptScheme(lookOf(app, kept.glass === true, secondary));
    react.render(
      <MotionProvider animated {...SHELL_MOTION}>
        <WordsProvider words={app.words?.sigrid}>
          <CommandsProvider ownKeysIn={app.ownKeysIn}>
            <ShellProvider app={app} kept={kept} secondary={secondary}>{node}</ShellProvider>
          </CommandsProvider>
        </WordsProvider>
      </MotionProvider>,
    );
  };
  if (readHost().ownWindow && !secondary) {
    // What the browser keeps, until the window has said what it keeps: a page loaded again is on screen meanwhile.
    applyKeptScheme(lookOf(app));
    void Promise.allSettled([keptTheme(), keptGlass()]).then(([theme, glass]) => {
      if (theme.status === 'fulfilled') keepChoice(app.storage.scheme, theme.value);
      else console.warn('imago: kept_theme:', theme.reason);
      if (glass.status === 'rejected') console.warn('imago: kept_glass:', glass.reason);
      draw({ untold: theme.status === 'rejected', glass: glass.status === 'fulfilled' ? glass.value === true : null });
    });
  } else {
    keepChoice(app.storage.scheme);
    draw({ untold: false, glass: null });
  }
  return () => {
    gone = true;
    react.unmount();
  };
}
