// The theme of the native window, which on Windows 11 is the theme of the acrylic behind the glass and of the page's
// `prefers-color-scheme`. It follows the look, so light glass never sits on a dark backdrop and dark glass never on a
// light one (docs/design-system/desktop-shell.md of Shinatama, section 1.2). Nothing here touches Tauri: the app passes
// the function that sends the word to the window (the command `set_window_theme` of the imago-shell crate). With the
// word go the look and the theme the page draws: on Windows 10 the acrylic takes its colour from a tint, which the
// window chooses from those two (`acrylic_tint` of the crate).

import type { Look, ThemeChoice } from './look.ts';

/** What the window is asked for: a theme of its own, or `system` to follow Windows. */
export type WindowTheme = 'light' | 'dark' | 'system';

/** What the window is told besides its theme: the look the page shows and the theme it draws, never `system`. */
export type WindowThemeDetail = { look: Look; resolved: 'light' | 'dark' };

/**
 * The window theme for a look and a theme choice. The choice stands, except that ONI MODE with the Windows theme is
 * dark: ONI is a dark look and has no light backdrop to follow.
 */
export function windowThemeFor(look: Look, choice: ThemeChoice): WindowTheme {
  return look === 'oni' && choice === 'system' ? 'dark' : choice;
}

/** What was sent last for each owner: the word, the look and the theme drawn, as one key. */
const sent = new WeakMap<object, string>();

/**
 * Sends `theme` and `detail` to the window through `send`, once: the same word, look and drawn theme asked again for
 * the same `owner` are not sent again (it is a call across the process boundary and the window saves the word to
 * disk). A change of any of the three is sent: under `system` a change of Windows' colours changes the theme drawn,
 * and the tint follows it. A send that throws or rejects is forgotten, so the next ask tries again.
 */
export function sendWindowTheme(
  owner: object,
  theme: WindowTheme,
  detail: WindowThemeDetail,
  send: (theme: WindowTheme, detail: WindowThemeDetail) => void | Promise<unknown>,
): void {
  const key = `${theme} ${detail.look} ${detail.resolved}`;
  if (sent.get(owner) === key) return;
  sent.set(owner, key);
  const forget = (): void => { if (sent.get(owner) === key) sent.delete(owner); };
  try {
    Promise.resolve(send(theme, detail)).catch(forget);
  } catch {
    forget();
  }
}
