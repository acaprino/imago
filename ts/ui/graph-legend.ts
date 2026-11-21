import { escapeHtml } from './markup.ts';
import { toneAttribute, type Tone } from './tone.ts';

export interface GraphLegendItem {
  label: string;
  tone?: Tone;
  stroke?: 'solid' | 'dashed' | 'dotted';
}

/** A graph key made from text, with decorative samples matching graph edge styles. */
export function graphLegendHtml(items: readonly GraphLegendItem[], summary = ''): string {
  return `<div class="im-graph-legend">${items.map(item => `<span><i aria-hidden="true" data-im-stroke="${item.stroke === 'dashed' || item.stroke === 'dotted' ? item.stroke : 'solid'}"${toneAttribute(item.tone)}></i>${escapeHtml(item.label)}</span>`).join('')}${summary ? `<span class="im-graph-summary">${escapeHtml(summary)}</span>` : ''}</div>`;
}
