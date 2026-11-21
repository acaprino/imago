import { escapeHtml as esc, iconHtml, type ChipTone } from './markup.ts';
import { chipToneAttribute } from './tone.ts';

/** Text is escaped; parameters ending in Html are trusted component output. */
export function actionChipHtml(label: string, action: string, options: { id?: string; accessibleLabel?: string; tone?: ChipTone; icon?: string } = {}): string {
  return `<button type="button" class="im-chip"${chipToneAttribute(options.tone)} data-action="${esc(action)}"${options.id !== undefined ? ` data-id="${esc(options.id)}"` : ''}${options.accessibleLabel ? ` aria-label="${esc(options.accessibleLabel)}"` : ''}>${options.icon ? iconHtml(options.icon) : ''}${esc(label)}</button>`;
}

export const bulletListHtml = (items: readonly string[]): string => items.length ? `<ul class="im-bullet-list">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
export const quoteHtml = (text: string): string => `<p class="im-wrap-text">\u201c${esc(text)}\u201d</p>`;
export const codeViewHtml = (text: string, label: string): string => `<pre class="im-code-view" tabindex="0" aria-label="${esc(label)}">${esc(text)}</pre>`;
export const codeNoteHtml = (text: string): string => text ? `<small class="im-mono im-wrap-text">${esc(text)}</small>` : '';

export function textStackHtml(title: string, detail = '', options: { strong?: boolean; detailTitle?: string } = {}): string {
  const tag = options.strong ? 'strong' : 'span';
  return `<span class="im-text-stack"><${tag}>${esc(title)}</${tag}>${detail ? `<small${options.detailTitle !== undefined ? ` title="${esc(options.detailTitle)}"` : ''}>${esc(detail)}</small>` : ''}</span>`;
}

export const toolbarHtml = (contentHtml: string, actionsHtml = ''): string => `<div class="im-content-toolbar">${contentHtml}${actionsHtml ? `<div class="im-action-row">${actionsHtml}</div>` : ''}</div>`;
export const sectionHeadingHtml = (title: string): string => `<div class="im-section-heading"><h2>${esc(title)}</h2></div>`;

export function stackListHtml(rowsHtml: string, variant: 'default' | 'decisions' | 'timeline' = 'default'): string {
  const classes = variant === 'decisions' ? ' im-decision-list' : variant === 'timeline' ? ' im-activity-list' : '';
  return `<ul class="im-panel im-surface im-stack-list${classes}" data-im-surface="sheet">${rowsHtml}</ul>`;
}

export interface StackRowOptions {
  title: string;
  titleMono?: boolean;
  message?: string;
  detail?: string;
  leadingHtml?: string;
  trailingHtml?: string;
  detailHtml?: string;
  relatedHtml?: string;
}
export function stackRowHtml(options: StackRowOptions): string {
  return `<li>${options.leadingHtml ?? ''}<div class="im-grow"><strong>${options.titleMono ? `<code>${esc(options.title)}</code>` : esc(options.title)}</strong>${options.message ? `<span>${esc(options.message)}</span>` : ''}${options.detail ? `<small>${esc(options.detail)}</small>` : ''}${options.detailHtml ?? ''}${options.relatedHtml ? `<span class="im-related-list">${options.relatedHtml}</span>` : ''}</div>${options.trailingHtml ?? ''}</li>`;
}
export function timelineItemHtml(options: StackRowOptions & { time: string }): string {
  return stackRowHtml({ ...options, leadingHtml: `<time>${esc(options.time)}</time>${options.leadingHtml ?? ''}` });
}

export function tableRowHtml(cellsHtml: readonly (string | { html: string; className?: string })[]): string {
  return `<tr>${cellsHtml.map(cell => typeof cell === 'string' ? `<td>${cell}</td>` : `<td${cell.className ? ` class="${esc(cell.className)}"` : ''}>${cell.html}</td>`).join('')}</tr>`;
}
export function tableHtml(headers: readonly string[], rowsHtml: string, options: { label?: string; variant?: 'default' | 'log' | 'inputs'; empty?: string } = {}): string {
  const variant = options.variant === 'log' ? ' im-log-table' : options.variant === 'inputs' ? ' im-input-list' : '';
  const rows = rowsHtml || `<tr><td colspan="${headers.length}" class="im-muted im-none">${esc(options.empty ?? '')}</td></tr>`;
  return `<div class="im-panel im-surface im-table-scroll" data-im-surface="sheet"${options.label ? ` role="region" aria-label="${esc(options.label)}" tabindex="0"` : ''}><table class="im-table${variant}"><thead><tr>${headers.map(header => `<th scope="col">${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function summaryHtml(options: { label: string; title: string; tone?: ChipTone; icon?: string; metadata?: readonly { label: string; value: string }[] }): string {
  return `<section class="im-summary"${chipToneAttribute(options.tone)} aria-label="${esc(options.label)}">${options.icon ? `<span class="im-summary-icon">${iconHtml(options.icon)}</span>` : ''}<div class="im-grow"><strong>${esc(options.title)}</strong>${options.metadata?.length ? `<small class="im-summary-meta">${options.metadata.map(item => `<span>${esc(item.label)} <b>${esc(item.value)}</b></span>`).join('')}</small>` : ''}</div></section>`;
}

export function taskCardHtml(options: { id: string; title: string; leadingHtml?: string; actionsHtml?: string; phase?: string; elapsed?: string; progressLabel: string; progressText?: string; description?: string; detailHtml?: string }): string {
  return `<article class="im-panel im-surface im-task-card" data-im-surface="sheet" aria-labelledby="${esc(options.id)}"><div class="im-leading">${options.leadingHtml ?? ''}<h2 class="im-grow" id="${esc(options.id)}">${esc(options.title)}</h2>${options.actionsHtml ?? ''}</div><div class="im-task-phase">${options.phase ? `<strong>${esc(options.phase)}</strong>` : ''}${options.elapsed ? `<span class="im-task-elapsed">${esc(options.elapsed)}</span>` : ''}</div><div class="im-progress" role="progressbar" aria-label="${esc(options.progressLabel)}"${options.progressText ? ` aria-valuetext="${esc(options.progressText)}"` : ''}></div>${options.description ? `<small>${esc(options.description)}</small>` : ''}${options.detailHtml ?? ''}</article>`;
}
