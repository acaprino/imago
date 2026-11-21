// The four tones, as types. tests/tone.test.ts compiles this file with tsc: every line below a @ts-expect-error must be a
// type error (tsc fails on a directive with nothing to expect), and every other line must compile.
import type { GraphEdge } from '../../ts/graph.ts';
import { actionChipHtml, summaryHtml } from '../../ts/ui/content-markup.ts';
import { settingsMessageHtml, statusTextHtml } from '../../ts/ui/form-markup.ts';
import { graphLegendHtml } from '../../ts/ui/graph-legend.ts';
import { chipHtml, type ChipTone, type Tone } from '../../ts/ui/markup.ts';
import { noteHtml, statusButtonHtml } from '../../ts/ui/shell-markup.ts';

const four: Tone[] = ['ok', 'warn', 'err', 'info'];
const chips: ChipTone[] = ['', ...four];
for (const tone of four) {
  chipHtml('Open', tone);
  actionChipHtml('Open', 'open', { tone });
  summaryHtml({ label: 'State', title: 'Ready', tone });
  statusTextHtml('Ready', tone);
  settingsMessageHtml('Saved', [], { tone });
  statusButtonHtml({ label: 'Ready', accessibleLabel: 'Status', action: 'status', tone });
  noteHtml({ message: 'Saved', tone });
  graphLegendHtml([{ label: 'Calls', tone }]);
}
for (const tone of chips) chipHtml('Open', tone);
const edge: GraphEdge = { source: 'a', target: 'b', tone: 'info' };

// @ts-expect-error accent is not a tone: info is
chipHtml('Demo', 'accent');
// @ts-expect-error good is not a tone: ok is
chipHtml('Ready', 'good');
// @ts-expect-error bad is not a tone: err is
chipHtml('Failed', 'bad');
// @ts-expect-error danger is not a tone: err is
actionChipHtml('Remove', 'remove', { tone: 'danger' });
// @ts-expect-error a summary takes one of the four
summaryHtml({ label: 'State', title: 'Ready', tone: 'good' });
// @ts-expect-error any string is not a tone
summaryHtml({ label: 'State', title: 'Ready', tone: 'custom' as string });
// @ts-expect-error accent is not a tone
statusTextHtml('Ready', 'accent');
// @ts-expect-error accent is not a tone
settingsMessageHtml('Saved', [], { tone: 'accent' });
// @ts-expect-error accent is not a tone
statusButtonHtml({ label: 'Ready', accessibleLabel: 'Status', action: 'status', tone: 'accent' });
// @ts-expect-error danger is not a tone
noteHtml({ message: 'Removed', tone: 'danger' });
// @ts-expect-error accent is not a tone
graphLegendHtml([{ label: 'Selected', tone: 'accent' }]);
// @ts-expect-error accent is not a tone
const accentEdge: GraphEdge = { source: 'a', target: 'b', tone: 'accent' };

export { edge, accentEdge };
