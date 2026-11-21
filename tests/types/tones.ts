// The tones, as types. tests/tone.test.ts compiles this file with tsc: every line below a @ts-expect-error must be a type
// error (tsc fails on a directive with nothing to expect), and every other line must compile.
// The status tones (Tone) are ok, warn, err and info; a message (a note, a status text, a notice) takes those only. A chip,
// a dot and a summary (ChipTone) also take the accent, the mark of data, or none ('').
import type { GraphEdge } from '../../ts/graph.ts';
import { actionChipHtml, summaryHtml } from '../../ts/ui/content-markup.ts';
import { settingsMessageHtml, statusTextHtml } from '../../ts/ui/form-markup.ts';
import { chipHtml, type ChipTone, type Tone } from '../../ts/ui/markup.ts';
import { notify } from '../../ts/ui/notice.ts';
import { noteHtml, statusButtonHtml } from '../../ts/ui/shell-markup.ts';

const four: Tone[] = ['ok', 'warn', 'err', 'info'];
const marks: ChipTone[] = ['', ...four, 'accent'];
for (const tone of four) {
  noteHtml({ message: 'Saved', tone });
  statusTextHtml('Ready', tone);
  settingsMessageHtml('Saved', [], { tone });
}
for (const tone of marks) {
  chipHtml('Open', tone);
  actionChipHtml('Open', 'open', { tone });
  summaryHtml({ label: 'State', title: 'Ready', tone });
  statusButtonHtml({ label: 'Ready', accessibleLabel: 'Status', action: 'status', tone });
}
// The edges to a selected node carry the accent, the selection mark.
const edge: GraphEdge = { source: 'a', target: 'b', tone: 'accent' };

// @ts-expect-error the accent is not a status tone
const status: Tone = 'accent';
// @ts-expect-error a note is a status: the accent is not one
noteHtml({ message: 'Saved', tone: 'accent' });
// @ts-expect-error a status text takes a status tone
statusTextHtml('Ready', 'accent');
// @ts-expect-error a settings message takes a status tone
settingsMessageHtml('Saved', [], { tone: 'accent' });
// @ts-expect-error a notice is plain or err
notify(document.body, 'Saved', { tone: 'accent' });
// @ts-expect-error good is not a tone: ok is
chipHtml('Ready', 'good');
// @ts-expect-error bad is not a tone: err is
chipHtml('Failed', 'bad');
// @ts-expect-error danger is not a tone: err is
actionChipHtml('Remove', 'remove', { tone: 'danger' });
// @ts-expect-error a summary takes a chip's tone, not good
summaryHtml({ label: 'State', title: 'Ready', tone: 'good' });
// @ts-expect-error any string is not a tone
summaryHtml({ label: 'State', title: 'Ready', tone: 'custom' as string });
// @ts-expect-error danger is not a tone
statusButtonHtml({ label: 'Ready', accessibleLabel: 'Status', action: 'status', tone: 'danger' });
// @ts-expect-error danger is not a tone
noteHtml({ message: 'Removed', tone: 'danger' });

export { edge, status };
