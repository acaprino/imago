// The literal values that are not findings, each with the reason it is allowed. A value goes here only when it is not
// a measure or a colour of the design: what is a measure or a colour is a token (css/tokens.css). A single place that
// needs a literal takes an exception comment instead, `imago-check: allow <rule> — <reason>`, on its line or the line
// above, and the program prints it.

/** @typedef {{ value: string, reason: string, properties?: string[] }} Allowed */

/**
 * Lengths of padding, margin, gap and border-radius that are not steps of the space scale. A value is compared after
 * its number is read (`1.0px` is `1px`); a zero of any unit is no space at all.
 * @type {Allowed[]}
 */
export const SPACE = [
  { value: '0', reason: 'no space at all; a zero is a zero in any unit' },
  { value: '1px', reason: 'the hairline: the line between regions and the edge of a control are 1px' },
  { value: '2px', reason: 'the ring: the focus ring and the selection mark are 2px, and a gap of their width keeps them clear' },
];

/** Kinds of space value that are never a literal measure, with the reason. */
export const SPACE_KINDS = {
  percentage: 'a share of the box it is in: it follows the box, it is not a step of the scale (50% makes a circle)',
  keyword: '`auto`, `inherit`, `initial`, `unset` and the like take their space from elsewhere',
  token: 'a `var(…)` is a token, and a `calc(…)` whose only lengths are tokens or the values above is built from them',
};

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

/** The colours of the system. Under `@media (forced-colors: active)` borders and outlines take them where fills vanish. */
export const SYSTEM_COLORS = [
  'AccentColor', 'AccentColorText', 'ActiveText', 'ButtonBorder', 'ButtonFace', 'ButtonText', 'Canvas', 'CanvasText',
  'Field', 'FieldText', 'GrayText', 'Highlight', 'HighlightText', 'LinkText', 'Mark', 'MarkText', 'SelectedItem',
  'SelectedItemText', 'VisitedText',
].map((value) => ({ value, reason: 'a colour of the system: forced colours draw with them, and they follow the user\'s contrast theme' }));
