// The theme of the native window, which on Windows 11 is the theme of the acrylic behind the glass and of the page's
// `prefers-color-scheme`. It follows the look, so light glass never sits on a dark backdrop and dark glass never on a
// light one (docs/design-system/desktop-shell.md of Shinatama, section 1.2). Nothing here touches Tauri: the app passes
// the function that sends the word to the window (the command `set_window_theme` of the imago-shell crate).

import type { Look, ThemeChoice } from './look.ts';

/** What the window is asked for: a theme of its own, or `system` to follow Windows. */
export type WindowTheme = 'light' | 'dark' | 'system';

/**
 * The window theme for a look and a theme choice. The choice stands, except that ONI MODE with the Windows theme is
 * dark: ONI is a dark look and has no light backdrop to follow.
 */
export function windowThemeFor(look: Look, choice: ThemeChoice): WindowTheme {
  return look === 'oni' && choice === 'system' ? 'dark' : choice;
}

const sent = new WeakMap<object, WindowTheme>();

/**
 * Sends `theme` to the window through `send`, once: the same word asked again for the same `owner` is not sent again
 * (it is a call across the process boundary and the window saves it to disk). A send that throws or rejects is
 * forgotten, so the next ask tries again.
 */
export function sendWindowTheme(owner: object, theme: WindowTheme, send: (theme: WindowTheme) => void | Promise<unknown>): void {
  if (sent.get(owner) === theme) return;
  sent.set(owner, theme);
  const forget = (): void => { if (sent.get(owner) === theme) sent.delete(owner); };
  try {
    Promise.resolve(send(theme)).catch(forget);
  } catch {
    forget();
  }
}
