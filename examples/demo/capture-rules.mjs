// What a photograph of the demo window must show, as plain functions: no window, no screen, no process.
// `capture.mjs` takes the pixels from the real window; this file says which pixels are wrong.
//
// A pixel is `[r, g, b]`, 0 to 255, read from the screen.

/** A solid fill is painted exactly; one level of rounding is the most a composite adds. */
const SOLID = 1;

const apart = (a, b) => Math.max(...a.map((value, channel) => Math.abs(value - b[channel])));

/**
 * The problems of one place of the page photographed over a dark and over a bright window; none means it passes. The page
 * is opaque (Sigrid's surfaces are), so what lies behind the window changes nothing.
 * @param {{ overDark: number[], overBright: number[] }} pixels
 * @returns {string[]}
 */
export function judgeOpaque({ overDark, overBright }) {
  // No surface of the theme is pure black: the copy of the screen was of a locked desktop, a display that is off or a
  // protected window.
  if ([overDark, overBright].some((pixel) => pixel.every((value) => value === 0))) return ['the capture is black: the screen cannot be read (a locked desktop or a display that is off)'];
  if (apart(overDark, overBright) <= SOLID) return [];
  return [`it is ${overDark.join(',')} over a dark window and ${overBright.join(',')} over a bright one: what lies behind shows through, or a window was in front`];
}

/**
 * The same place in the two themes: light is brighter than dark.
 * @param {{ dark: number[], light: number[] }} pixels
 * @returns {string[]}
 */
export function judgeThemes({ dark, light }) {
  const sum = (pixel) => pixel.reduce((total, value) => total + value, 0);
  return sum(light) > sum(dark) ? [] : [`it is ${light.join(',')} in the light theme and ${dark.join(',')} in the dark one: the theme did not reach the page`];
}

/**
 * What the page's colour scheme, read once after a restart, proves about the saved window theme. Three things can give
 * the page its scheme: the saved theme (the window's first frame), Windows' own theme (when no saved theme reached the
 * window) and the page's own boot call, which sends the choice the page keeps, the same as the saved one, once the page is
 * mounted. When the scheme that was read is also what Windows' own theme or the boot call could have given, the read says
 * nothing about the saved theme: `unproven`, which is not a failure.
 * @param {{ saved: 'dark' | 'light', windows: 'dark' | 'light' | null, scheme: 'dark' | 'light', mounted: boolean }} read
 *   `windows` is Windows' apps theme (null when it could not be read); `mounted` is whether the page had mounted (its boot call sent) when the scheme was read.
 * @returns {{ verdict: 'delivered' | 'failed' | 'unproven', why: string }}
 */
export function judgeSavedTheme({ saved, windows, scheme, mounted }) {
  if (scheme !== saved) return { verdict: 'failed', why: `the page is ${scheme}, not the saved ${saved}: the saved window theme did not reach the first frame` };
  if (mounted) return { verdict: 'unproven', why: `the page is ${scheme}, the saved theme, but it had mounted and its own boot call sends ${saved}: that may be what made it ${scheme}` };
  if (windows === null || windows === scheme) {
    const known = windows === null ? "Windows' theme could not be read" : `Windows' apps are ${windows}`;
    return { verdict: 'unproven', why: `the page is ${scheme}, the saved theme, but ${scheme} may be Windows' own theme (${known})` };
  }
  return { verdict: 'delivered', why: `the page is ${scheme}, the saved theme, and neither Windows' own theme (${windows}) nor the page's boot call could have given it` };
}
