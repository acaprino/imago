// The start of an app: its look on the page before anything is drawn, then the app inside the shell.
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionProvider, WordsProvider } from '@acaprino/sigrid';
import { applyKeptScheme, CommandsProvider } from '@acaprino/sigrid/assemblies';
import { readHost } from '@acaprino/sigrid/tauri';
import type { App } from './app.js';
import { dress, SHELL_MOTION } from './preset.js';
import { keptTheme, lookOf, OPAQUE_WINDOW, ShellProvider, windowMaterial, type WindowMaterial } from './shell.js';

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

/** Draws `node`, the app, in `root`, inside the shell. Returns how to take it away. */
export function startApp(app: App, root: HTMLElement, node: ReactNode): () => void {
  document.documentElement.lang = app.lang;
  dress(document.documentElement);
  const react = createRoot(root);
  let gone = false;
  const draw = (untold: boolean, material: WindowMaterial): void => {
    if (gone) return;
    // The ground the window was built with: glass lets its material show through.
    applyKeptScheme(lookOf(app, material.glass));
    react.render(
      <MotionProvider animated {...SHELL_MOTION}>
        <WordsProvider words={app.words?.sigrid}>
          <CommandsProvider>
            <ShellProvider app={app} untold={untold} material={material}>{node}</ShellProvider>
          </CommandsProvider>
        </WordsProvider>
      </MotionProvider>,
    );
  };
  if (readHost().ownWindow) {
    // What the browser keeps, until the window has said what it keeps: a page loaded again is on screen meanwhile.
    applyKeptScheme(lookOf(app));
    // The material is asked first, so that the first frame the page draws is the window's: one that does not say is opaque.
    void windowMaterial().then((material) => keptTheme().then(
      (kept) => {
        keepChoice(app.storage.scheme, kept);
        draw(false, material);
      },
      (error: unknown) => {
        console.warn('imago: kept_theme:', error);
        draw(true, material);
      },
    ));
  } else {
    keepChoice(app.storage.scheme);
    draw(false, OPAQUE_WINDOW);
  }
  return () => {
    gone = true;
    react.unmount();
  };
}
