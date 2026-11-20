// What a photograph of the demo window must show, as plain functions: no window, no screen, no process.
// `capture.mjs` takes the pixels from the real window; this file says which pixels are wrong.
//
// A pixel is `[r, g, b]`, 0 to 255, read from the screen: the acrylic is drawn by Windows and no webview
// screenshot has it (docs/design-system/desktop-shell.md of Shinatama, 1.5).

/** `--im-ground` without glass (css/tokens.css): the colour the title bar has when the material was not painted. */
export const OPAQUE_GROUND = {
  smooth: { dark: [18, 22, 30], light: [246, 247, 249] },
  oni: { dark: [11, 4, 22], light: [233, 238, 248] },
};

/**
 * The Smooth frame over a dark window as Shinatama measured it on 2026-11-19 (desktop-shell.md 1.5): the glass
 * tint over the dark acrylic is a deep cool slate, not Windows' caption grey (32,32,32); the light frost is white
 * at 88 %. ONI has no fixed number: it is judged by the opaque ground and the backdrop only.
 */
export const SMOOTH_OVER_DARK = { dark: [23, 26, 37], light: [241, 241, 242] };

/** How far a channel may be from the expected pixel, in levels of 0 to 255. */
export const TOLERANCE = 12;

/** A solid ground is painted exactly; one level of rounding is the most a composite adds. */
const SOLID = 1;

/**
 * How much the backdrop must show through the frame: the material is translucent, not a solid fallback. Run 2
 * (docs/verification.md) measured the same frame over a black and over a white window: the dark frames moved 17
 * levels (Smooth, 23,26,35 against 40,43,52) and 13 (ONI, 17,12,27 against 30,25,40), the light frosts 11 (Smooth,
 * 233,234,236 against 244,245,247) and 8 (ONI, 225,229,238 against 233,237,246). A frame that moves by fewer than 3
 * levels is the rounding of the compositor: a solid fill, in a dark theme and in a light one.
 */
export const SHOW_THROUGH = 3;

const apart = (a, b) => Math.max(...a.map((value, channel) => Math.abs(value - b[channel])));

/**
 * The problems of one title-bar pixel; none means it passes.
 * @param {{ look: 'smooth' | 'oni', theme: 'dark' | 'light', backdrop: 'over-dark' | 'over-bright', pixel: number[] }} capture
 * @returns {string[]}
 */
export function judgeTitleBar({ look, theme, backdrop, pixel }) {
  // Nothing the glass can make is pure black: the copy of the screen was of a locked desktop, a display that is off or
  // a protected window. Say so once, not as a wrong colour in every look.
  if (pixel.every((value) => value === 0)) return ['the capture is black: the screen cannot be read (a locked desktop or a display that is off)'];
  const problems = [];
  const ground = OPAQUE_GROUND[look][theme];
  if (apart(pixel, ground) <= SOLID) {
    problems.push(`the title bar is the opaque ground ${ground.join(',')}: the glass was not painted`);
  }
  const expected = look === 'smooth' && backdrop === 'over-dark' ? SMOOTH_OVER_DARK[theme] : null;
  if (expected && apart(pixel, expected) > TOLERANCE) {
    problems.push(`the title bar is ${pixel.join(',')}, more than ${TOLERANCE} levels from ${expected.join(',')}`);
  }
  return problems;
}

/**
 * The glass lets the backdrop through: the same frame photographed over a dark and over a bright window differs.
 * A window that was inactive (Windows drops the material then) or a frame painted solid is the same in both.
 * @returns {string[]}
 */
export function judgeShowThrough({ overDark, overBright }) {
  if (apart(overDark, overBright) >= SHOW_THROUGH) return [];
  return [`the frame is ${overDark.join(',')} over a dark window and ${overBright.join(',')} over a bright one: the backdrop does not show through`];
}

/** The work sheet is denser than the frame: the backdrop shows through it less. */
export function judgeSheetDenser({ frame, sheet }) {
  const frameShift = apart(frame.overDark, frame.overBright);
  const sheetShift = apart(sheet.overDark, sheet.overBright);
  if (sheetShift <= frameShift) return [];
  return [`the work sheet moves ${sheetShift} levels with the backdrop and the frame ${frameShift}: the sheet is not denser`];
}

/**
 * The window theme the page itself sends once it is mounted: the gallery always starts on Smooth dark
 * (gallery/main.ts) and `gallery/mount/desktop.ts` tells the window so at its first mount, which also rewrites the saved file.
 */
export const PAGE_BOOT_THEME = 'dark';

/**
 * What the page's colour scheme, read once after a restart, proves about the saved window theme. Three things can give
 * the page its scheme: the saved theme (the window's first frame), Windows' own theme (when no saved theme reached the
 * window) and the page's own boot call, which sends `PAGE_BOOT_THEME` once the page is mounted. When the scheme that
 * was read is also what Windows' own theme or the boot call could have given, the read says nothing about the saved
 * theme: `unproven`, which is not a failure.
 * @param {{ saved: 'dark' | 'light', windows: 'dark' | 'light' | null, scheme: 'dark' | 'light', mounted: boolean }} read
 *   `windows` is Windows' apps theme (null when it could not be read); `mounted` is whether the page had mounted (its boot call sent) when the scheme was read.
 * @returns {{ verdict: 'delivered' | 'failed' | 'unproven', why: string }}
 */
export function judgeSavedTheme({ saved, windows, scheme, mounted }) {
  const bootCouldHaveGivenIt = mounted && scheme === PAGE_BOOT_THEME;
  const windowsCouldHaveGivenIt = windows === null || windows === scheme;
  const bootSays = `the page had mounted and its own boot call sends ${PAGE_BOOT_THEME}`;
  if (scheme !== saved) {
    if (bootCouldHaveGivenIt) return { verdict: 'unproven', why: `the page is ${scheme}, not the saved ${saved}, but ${bootSays}: the read may have lost the race with it` };
    return { verdict: 'failed', why: `the page is ${scheme}, not the saved ${saved}: the saved window theme did not reach the first frame` };
  }
  if (bootCouldHaveGivenIt) return { verdict: 'unproven', why: `the page is ${scheme}, the saved theme, but ${bootSays}: that may be what made it ${scheme}` };
  if (windowsCouldHaveGivenIt) {
    const known = windows === null ? "Windows' theme could not be read" : `Windows' apps are ${windows}`;
    return { verdict: 'unproven', why: `the page is ${scheme}, the saved theme, but ${scheme} may be Windows' own theme (${known})` };
  }
  return { verdict: 'delivered', why: `the page is ${scheme}, the saved theme, and neither Windows' own theme (${windows}) nor the page's boot call could have given it` };
}
