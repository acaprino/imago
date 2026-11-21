// The literal values that are not findings, each with the reason it is allowed. A value goes here only when it is not
// a measure or a colour of the design: what is a measure or a colour is a token (css/tokens.css). A single place that
// needs a literal takes an exception comment instead, `imago-check: allow <rule> — <reason>`, on its line or the line
// above, and the program prints it. This is the place for the literal values the rules allow. The values that are no
// literal measure by their kind are judged in rules.mjs: a percentage (a share of its box), a keyword (`auto`, `inherit`,
// `initial`, `unset`: the space comes from elsewhere), a `var(…)` (a token) and a `calc(…)` built from tokens and the values above.

/** @typedef {{ value: string, reason: string, properties?: string[] }} Allowed */

/**
 * Lengths of padding, margin, gap and border-radius that are not steps of the space scale. A value is compared after
 * its number is read (`1.0px` is `1px`, and `-1px`, a hairline laid over a neighbour, is judged by its size); a zero of any
 * unit is no space at all.
 * @type {Allowed[]}
 */
export const SPACE = [
  { value: '0', reason: 'no space at all; a zero is a zero in any unit' },
  { value: '1px', reason: 'the hairline: the line between regions and the edge of a control are 1px' },
  { value: '2px', reason: 'the ring: the focus ring and the selection mark are 2px, and a gap of their width keeps them clear' },
];

/**
 * Sizes of text that are not on the type scale and are still not a literal size. Lengths inside `var(--im-fs-…)`
 * are the scale itself.
 * @type {Allowed[]}
 */
export const FONT_SIZE = [
  { value: '0', reason: 'no text: a size of 0 hides the text of an element that shows only an icon' },
  { value: 'inherit', reason: 'the size of the parent, which is on the scale' },
  { value: 'initial', reason: 'the size the browser starts from, which the base sets from the scale' },
  { value: 'unset', reason: 'the size of the parent, as inherit' },
];

/**
 * Colour words that are not a colour of their own: they name no hue, or they name the colour of the system that
 * forced colours (Windows contrast themes) draw with.
 * @type {Allowed[]}
 */
export const COLOR = [
  { value: 'transparent', reason: 'no colour at all' },
  { value: 'currentColor', reason: 'the colour of the text, which is a token' },
  { value: 'inherit', reason: 'the colour of the parent' },
  { value: 'none', reason: 'no colour at all' },
  { value: 'initial', reason: 'the colour the property starts from' },
  { value: 'unset', reason: 'the colour of the parent, or none' },
];

/** Opacities on a disabled state that are not a finding: they dim nothing. A value is compared as a number too (`1.0`). */
export const OPACITY = [
  { value: '1', reason: 'full opacity: it dims nothing' },
  { value: '100%', reason: 'full opacity, as a percentage' },
];

/** The values of text-transform in an app: the case of a label is the look's, never typed. */
export const CASE = [
  { value: 'none', reason: 'the text as it is written' },
  { value: 'var(--im-case)', reason: 'the case of the look: none in smooth, capitals in ONI' },
];

/** The values of letter-spacing in an app. A zero of any unit is no spacing at all. */
export const TRACKING = [
  { value: '0', reason: 'no spacing at all; a zero is a zero in any unit' },
  { value: 'normal', reason: 'the spacing of the font itself' },
  { value: 'var(--im-track)', reason: 'the spacing of the look: 0 in smooth, the spacing of its capitals in ONI' },
];

/** The colours of the system. Under `@media (forced-colors: active)` borders and outlines take them where fills vanish. */
export const SYSTEM_COLORS = [
  'AccentColor', 'AccentColorText', 'ActiveText', 'ButtonBorder', 'ButtonFace', 'ButtonText', 'Canvas', 'CanvasText',
  'Field', 'FieldText', 'GrayText', 'Highlight', 'HighlightText', 'LinkText', 'Mark', 'MarkText', 'SelectedItem',
  'SelectedItemText', 'VisitedText',
].map((value) => ({ value, reason: 'a colour of the system: forced colours draw with them, and they follow the user\'s contrast theme' }));
