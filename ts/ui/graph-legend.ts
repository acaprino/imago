import { escapeHtml } from './markup.ts';

export interface GraphLegendItem {
  label: string;
  tone?: 'accent' | 'warn' | 'err';
  stroke?: 'solid' | 'dashed' | 'dotted';
}

/** A graph key made from text, with decorative samples matching graph edge styles. */
export function graphLegendHtml(items: readonly GraphLegendItem[], summary = ''): string {
  return `<div class="im-graph-legend">${items.map(item => `<span><i aria-hidden="true" data-im-stroke="${item.stroke === 'dashed' || item.stroke === 'dotted' ? item.stroke : 'solid'}"${item.tone ? ` data-im-tone="${escapeHtml(item.tone)}"` : ''}></i>${escapeHtml(item.label)}</span>`).join('')}${summary ? `<span class="im-graph-summary">${escapeHtml(summary)}</span>` : ''}</div>`;
}
