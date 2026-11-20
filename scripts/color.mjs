// Colour maths of the token build and its tests: OKLCH to sRGB hex, WCAG contrast, alpha compositing and the
// colour values of the token file (DTCG 2025.10). Colours travel as upper-case "#RRGGBB" or "#RRGGBBAA".

const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const HEX8 = /^#[0-9A-Fa-f]{8}$/;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const byteHex = (byte) => byte.toString(16).toUpperCase().padStart(2, '0');
const toLinear = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const fromLinear = (channel) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);

function bytesOf(hex) {
  if (!HEX6.test(hex) && !HEX8.test(hex)) throw new Error(`not a #RRGGBB or #RRGGBBAA colour: ${hex}`);
  const bytes = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return { rgb: bytes, alpha: hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1 };
}

/** OKLCH (L 0..1, C, h in degrees) to upper-case #RRGGBB; a colour outside sRGB is clipped channel by channel. */
export function oklchToHex(l, c, h) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return '#' + linear.map((channel) => byteHex(Math.round(fromLinear(clamp01(channel)) * 255))).join('');
}

/** #RRGGBB to OKLab [L, a, b]. */
export function hexToOklab(hex) {
  const [r, g, b] = bytesOf(hex).rgb.map((byte) => toLinear(byte / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const luminance = (hex) => {
  const { rgb, alpha } = bytesOf(hex);
  if (alpha !== 1) throw new Error(`contrast needs an opaque colour, got ${hex}; composite it with over() first`);
  const [r, g, b] = rgb.map((byte) => toLinear(byte / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio of two opaque colours, 1 to 21. */
export function contrast(fg, bg) {
  const [high, low] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** The colour `fg` (#RRGGBBAA, or #RRGGBB) laid over the opaque colour `bg`, composited in sRGB like a browser does. */
export function over(fg, bg) {
  const top = bytesOf(fg);
  const below = bytesOf(bg);
  if (below.alpha !== 1) throw new Error(`over needs an opaque background, got ${bg}`);
  return '#' + top.rgb.map((byte, i) => byteHex(Math.round(byte * top.alpha + below.rgb[i] * (1 - top.alpha)))).join('');
}

const channelBytes = (components) => components.map((component) => Math.round(clamp01(component) * 255));

/**
 * The colour value of a token (DTCG 2025.10) as #RRGGBB, or #RRGGBBAA when it is translucent. An oklch value whose
 * hue is "none" takes `hue`, the hue of the app. An sRGB value that carries a `hex` must agree with its components.
 */
export function colorValueToHex(value, hue) {
  if (value?.colorSpace === 'oklch') {
    const [l, c, h] = value.components;
    if (h === 'none' && hue === undefined) throw new Error('an oklch colour with hue "none" needs the hue of an app');
    return oklchToHex(l, c, h === 'none' ? hue : h);
  }
  if (value?.colorSpace !== 'srgb') throw new Error(`unsupported colour value: ${JSON.stringify(value)}`);
  const hex = '#' + channelBytes(value.components).map(byteHex).join('');
  if (value.hex !== undefined && value.hex.toUpperCase() !== hex) {
    throw new Error(`hex ${value.hex} and components ${JSON.stringify(value.components)} disagree: the components give ${hex}`);
  }
  const alpha = value.alpha ?? 1;
  return alpha === 1 ? hex : hex + byteHex(Math.round(clamp01(alpha) * 255));
}
