// The tones of docs/design-file.md ("Status"): ok, warn, err and info, and no other. A string renderer writes one of them
// as data-im-tone; a tone outside them, from an app in plain JavaScript, is written as no tone. Internal to the renderers:
// apps import the type from `@acaprino/imago/ui`.

export type Tone = 'ok' | 'warn' | 'err' | 'info';

const TONES: readonly unknown[] = ['ok', 'warn', 'err', 'info'];

export const isTone = (value: unknown): value is Tone => TONES.includes(value);

/** ` data-im-tone="…"` for one of the four tones, and nothing for any other value. */
export const toneAttribute = (value: unknown): string => (isTone(value) ? ` data-im-tone="${value}"` : '');
