// The start of an app: its look on the page before anything is drawn, then the app inside the shell.
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyDensity, WordsProvider } from '@acaprino/sigrid';
import { applyKeptScheme, CommandsProvider } from '@acaprino/sigrid/assemblies';
import type { App } from './app.js';
import { lookOf, ShellProvider } from './shell.js';

/**
 * Dark until the person chooses: with no choice kept, dark is.
 * shortcut: a browser that gives no storage at all has the system's look, Sigrid's default; until Sigrid takes a default choice.
 */
function keepDark(key: string): void {
  try {
    if (!['light', 'dark', 'system'].includes(localStorage.getItem(key) ?? '')) localStorage.setItem(key, 'dark');
  } catch {
    // No storage here.
  }
}

/** Draws `node`, the app, in `root`, inside the shell. Returns how to take it away. */
export function startApp(app: App, root: HTMLElement, node: ReactNode): () => void {
  document.documentElement.lang = app.lang;
  applyDensity(document.documentElement, 'compact');
  keepDark(app.storage.scheme);
  applyKeptScheme(lookOf(app));
  const react = createRoot(root);
  react.render(
    <WordsProvider words={app.words?.sigrid}>
      <CommandsProvider>
        <ShellProvider app={app}>{node}</ShellProvider>
      </CommandsProvider>
    </WordsProvider>,
  );
  return () => react.unmount();
}
