// The look of a window: Smooth (the default) or ONI MODE, in a dark or a light theme, for one app. It is three
// attributes and a class on the root (`data-im-app`, `data-im-look`, `data-im-theme`, `im-glass`): the stylesheets
// read nothing else. Where the choice is kept (the webview's own storage, the app's settings) is the app's business;
// what it reads back goes through `parseLook` and `parseTheme`, which take a stale or corrupt value for the default.

import { sendWindowTheme, windowThemeFor, type WindowTheme, type WindowThemeDetail } from './window-theme.ts';

export type Look = 'smooth' | 'oni';
/** The theme chosen: `system` follows Windows. */
export type ThemeChoice = 'system' | 'dark' | 'light';
export type AppId = 'shinatama' | 'xiox' | 'mukade' | 'muro' | 'daodan';

/** The look a stored value stands for: ONI MODE only when it was chosen, anything else (nothing stored, a stale value) is Smooth. */
export function parseLook(value: unknown): Look {
  return value === 'oni' ? 'oni' : 'smooth';
}

/** The theme a stored value stands for: anything that is not light or dark follows Windows. */
export function parseTheme(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The theme the page draws: the choice, or for `system` what Windows says. Never `system`. */
export function resolveTheme(choice: ThemeChoice, systemIsDark: boolean): 'dark' | 'light' {
  if (choice === 'system') return systemIsDark ? 'dark' : 'light';
  return choice;
}

export type LookState = { app: AppId; look: Look; theme: ThemeChoice; glass: boolean };

export type LookDeps = {
  /** Whether Windows is dark now. Default: the root's own window, `prefers-color-scheme: dark`; dark when there is none. */
  systemIsDark?: () => boolean;
  /**
   * Asks the native window for its theme (see window-theme.ts), with the look and the theme the page draws (`resolved`,
   * never `system`) for the tint of the acrylic. Called only when the word, the look or the drawn theme changed since
   * the last call for this root. A function that takes only the word keeps working.
   */
  setWindowTheme?: (theme: WindowTheme, detail: WindowThemeDetail) => void | Promise<unknown>;
};

const windowIsDark = (root: HTMLElement): boolean =>
  root.ownerDocument?.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? true;

/**
 * Puts the look on the root. Call it again whenever the look, the theme or (with the Windows theme) the system's
 * colours change. `im-glass` belongs to the desktop app only: without it every surface is opaque. The window theme is
 * sent before the first frame by the native side (it saves the last one); here it is kept in step.
 */
export function applyLook(root: HTMLElement, state: LookState, deps: LookDeps = {}): void {
  const look = parseLook(state.look);
  const windowTheme = windowThemeFor(look, parseTheme(state.theme));
  const theme = windowTheme === 'system' ? resolveTheme('system', (deps.systemIsDark ?? (() => windowIsDark(root)))()) : windowTheme;
  root.setAttribute('data-im-app', state.app);
  root.setAttribute('data-im-look', look);
  root.setAttribute('data-im-theme', theme);
  root.classList.toggle('im-glass', state.glass);
  // The engine's own controls and scrollbars follow the theme too.
  if (root.style) root.style.colorScheme = theme;
  if (deps.setWindowTheme) sendWindowTheme(root, windowTheme, { look, resolved: theme }, deps.setWindowTheme);
}
