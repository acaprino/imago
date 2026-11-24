// The look of the suite, after Xiox: a theme for Sigrid's engine, made from the one colour of an app. The surfaces, the
// control border, the corners and the keys are the suite's; the hue is the app's. Sigrid's own defaults are not touched.
import type { ThemeDef, ThemeTone } from '@acaprino/sigrid';

/** The tone as the colours are written: Sigrid's default one would make them more saturated. */
export const SHELL_TONE: ThemeTone = { intensity: 'theme', light: 'theme' };

const gamma = (value: number): number => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);

/**
 * A colour of OKLCH as `#rrggbb`, each channel clipped into sRGB. Not Sigrid's `toHex`, which reduces the chroma instead:
 * the accents of the suite were computed this way, and it would give other colours.
 */
function clipped(l: number, c: number, h: number): string {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const middle = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return `#${[
    4.0767416621 * long - 3.3077115913 * middle + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * middle - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * middle + 1.707614701 * short,
  ].map((channel) => Math.round(gamma(Math.min(1, Math.max(0, channel))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** The accent of a hue in each scheme: the suite's lightness and saturation. */
const darkAccent = (hue: number): string => clipped(0.82, 0.12, hue);
const lightAccent = (hue: number): string => clipped(0.47, 0.13, hue);

const channels = (hex: string): number[] => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
const apart = (one: string, other: string): number => {
  const b = channels(other);
  return channels(one).reduce((sum, value, at) => sum + (value - b[at]!) ** 2, 0);
};

/**
 * The accents of an app from its one colour: the hue, in whole degrees, whose accent in either scheme is nearest to it.
 * A colour that is one of the suite's accents gives its own hue back; any other gives its hue at the suite's lightness.
 */
export function accentsOf(accent: string): { hue: number; dark: string; light: string } {
  const color = accent.toLowerCase();
  let hue = 0;
  let nearest = Infinity;
  for (let h = 0; h < 360; h++) {
    const distance = Math.min(apart(color, darkAccent(h)), apart(color, lightAccent(h)));
    if (distance < nearest) [hue, nearest] = [h, distance];
  }
  return { hue, dark: darkAccent(hue), light: lightAccent(hue) };
}

/** The theme of an app. */
export function shellTheme({ id, name, accent }: { id: string; name: string; accent: string }): ThemeDef {
  const { hue, dark, light } = accentsOf(accent);
  return {
    // The hue of the grays is that of the surfaces below: the engine gives it to a ground that has almost no colour of its own.
    id, label: name, hue: 264, chroma: 0, accent: [0.12, hue], sidebar: 'tenue', palette: 'crisp',
    shape: 'soft', radii: { sm: 4, md: 6, lg: 10, xl: 10, chip: 4 }, keys: 'boxed', controls: 'strong',
    surfaces: {
      // design-check-ignore-next-line color-value: the dark surfaces of the suite, which the theme engine is given
      dark: { paper: '#1a202c', sidebar: '#12161e', raised: '#232834', line: '#2a3240', ink: '#e8ecf3', input: '#8791a6', accent: dark, fill: dark },
      // design-check-ignore-next-line color-value: the light surfaces of the suite, which the theme engine is given
      light: { paper: '#ffffff', sidebar: '#f6f7f9', raised: '#ffffff', line: '#e3e6ea', ink: '#111827', input: '#767e8b', accent: light, fill: light },
    },
  };
}
