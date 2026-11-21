// The tones of docs/design-file.md ("Status"): ok, warn, err and info, the status tones. A chip, a dot and a summary may
// also carry the accent, the mark of data (the accent goes on data: "One accent per app"), or no tone. A message (a note,
// a status text) takes a status tone only. A string renderer writes a tone as data-im-tone; a value outside the renderer's
// set, from an app in plain JavaScript, is written as no tone. Internal to the renderers: apps import the types from
// `@acaprino/imago/ui`.

export type Tone = 'ok' | 'warn' | 'err' | 'info';
/** The tone of a chip, a dot or a summary: a status tone, the accent, or none (`''`). */
export type ChipTone = '' | Tone | 'accent';

const TONES: readonly unknown[] = ['ok', 'warn', 'err', 'info'];
const MARKS: readonly unknown[] = [...TONES, 'accent'];

export const isTone = (value: unknown): value is Tone => TONES.includes(value);

/** ` data-im-tone="…"` for one of the four status tones, and nothing for any other value. */
export const toneAttribute = (value: unknown): string => (isTone(value) ? ` data-im-tone="${value}"` : '');

/** ` data-im-tone="…"` for a status tone or the accent, and nothing for any other value. */
export const chipToneAttribute = (value: unknown): string => (MARKS.includes(value) ? ` data-im-tone="${value}"` : '');
