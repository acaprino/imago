import { escapeHtml } from './markup.ts';
import { checkboxOptionHtml, type CheckboxMarkupOptions } from './form-markup.ts';
import { stepProgressHtml } from './progress.ts';

export interface WizardMarkupOptions {
  headingId: string;
  progressLabel: string;
  steps: readonly string[];
  /** Zero-based, like stepProgress. */
  current: number;
  counter: string;
  counterId: string;
}
/** The content slot contains the current step's composed fields, error and final actions. */
export function wizardHtml(contentHtml: string, options: WizardMarkupOptions): string {
  return `<div class="im-wizard-wrap"><section class="im-wizard" aria-labelledby="${escapeHtml(options.headingId)}">${stepProgressHtml(options.progressLabel, options.steps, options.current)}<small id="${escapeHtml(options.counterId)}">${escapeHtml(options.counter)}</small>${contentHtml}</section></div>`;
}

export function wizardHeadingHtml(title: string, description: string, options: { id: string; describedBy: readonly string[] }): string {
  return `<h1 id="${escapeHtml(options.id)}" tabindex="-1"${options.describedBy.length ? ` aria-describedby="${escapeHtml(options.describedBy.join(' '))}"` : ''}>${escapeHtml(title)}</h1><p class="im-muted">${escapeHtml(description)}</p>`;
}

/** Sticky final actions. Both slots contain trusted component HTML. */
export function wizardActionsHtml(leadingHtml: string, trailingHtml: string): string {
  return `<div class="im-wizard-actions">${leadingHtml || '<span></span>'}${trailingHtml}</div>`;
}

/** Native checkbox rows for selecting several items, with optional decorative leading content. */
export function choiceRowsHtml(options: readonly CheckboxMarkupOptions[]): string {
  return `<ul class="im-panel im-surface im-stack-list im-choice-rows" data-im-surface="sheet">${options.map(option => `<li>${checkboxOptionHtml(option)}</li>`).join('')}</ul>`;
}

export function enterWizardStep(doc: Document | undefined, headingId: string, scrollId?: string): void {
  if (!doc) return;
  if (scrollId) doc.getElementById(scrollId)?.scrollTo(0, 0);
  doc.getElementById(headingId)?.focus();
}

export interface NavigationStep {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}
export interface StepNavigationOptions {
  label: string;
  action: string;
  tabIdPrefix: string;
  panelId: string;
}
/** Interactive steps are tabs; a progress-only list is stepProgressHtml. */
export function stepNavigationHtml(steps: readonly NavigationStep[], selected: string, options: StepNavigationOptions): string {
  const current = steps.find(step => step.id === selected && !step.disabled)?.id ?? steps.find(step => !step.disabled)?.id;
  return `<div class="im-step-nav" role="tablist" aria-label="${escapeHtml(options.label)}">${steps.map((step, index) => `<button type="button" role="tab" id="${escapeHtml(options.tabIdPrefix + step.id)}" aria-selected="${current === step.id}" aria-controls="${escapeHtml(options.panelId)}" tabindex="${current === step.id ? 0 : -1}" ${current === step.id ? 'aria-current="step" ' : ''}data-action="${escapeHtml(options.action)}" data-id="${escapeHtml(step.id)}"${step.disabled ? ' disabled' : ''}><span class="im-step-index" aria-hidden="true">${index + 1}</span><span class="im-step-text"><strong>${escapeHtml(step.label)}</strong>${step.detail === undefined ? '' : `<small>${escapeHtml(step.detail)}</small>`}</span></button>`).join('')}</div>`;
}

export function stepPanelHtml(contentHtml: string, id: string, labelledBy: string): string {
  return `<div role="tabpanel" id="${escapeHtml(id)}" aria-labelledby="${escapeHtml(labelledBy)}">${contentHtml}</div>`;
}

/** Horizontal tab navigation with wraparound. Unknown keys and stale identifiers do nothing. */
export function nextStepId<T extends string>(ids: readonly T[], current: T, key: string): T | null {
  const index = ids.indexOf(current);
  if (index < 0) return null;
  return key === 'ArrowRight' ? ids[(index + 1) % ids.length] : key === 'ArrowLeft' ? ids[(index + ids.length - 1) % ids.length] : key === 'Home' ? ids[0] : key === 'End' ? ids[ids.length - 1] : null;
}

/** Handles keyboard focus, then delegates the selected identifier to the application's state owner. */
export function stepNavigationKey<T extends string>(event: KeyboardEvent, options: { ids: readonly T[]; action: string; onSelect: (id: T) => void }): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const element = event.target;
  if (!(element instanceof Element)) return false;
  const tab = element.closest<HTMLButtonElement>('button[role="tab"]');
  if (!tab || tab.disabled || tab.dataset.action !== options.action || !tab.parentElement) return false;
  const buttons = [...tab.parentElement.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].filter(button => !button.disabled && button.dataset.action === options.action);
  const ids = options.ids.filter(id => buttons.some(button => button.dataset.id === id));
  const next = nextStepId(ids, tab.dataset.id as T, event.key);
  if (next === null) return false;
  event.preventDefault();
  buttons.find(button => button.dataset.id === next)?.focus();
  options.onSelect(next);
  return true;
}
