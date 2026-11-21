import { componentElement, uiButton, uiPart } from './dom-parts.ts';
import { iconButtonHtml } from './markup.ts';

/** A compact notice for a detached window. The consumer controls visibility and when to acknowledge an event. */
export function portraitNotice(options: { label: string; name: string; dismiss: string; open: string }) {
  const root = uiPart('main', undefined, 'im-shell im-portrait-notice');
  root.hidden = true;
  root.setAttribute('aria-label', options.label);
  const figure = uiPart('stack', undefined, 'im-notice-figure');
  figure.setAttribute('aria-hidden', 'true');
  const portrait = document.createElement('img');
  portrait.alt = '';
  portrait.draggable = false;
  figure.append(portrait, uiPart('hint', options.name));
  const bubble = uiPart('panel', undefined, 'im-notice-bubble');
  bubble.setAttribute('aria-live', 'polite');
  bubble.setAttribute('aria-atomic', 'true');
  const header = uiPart('row');
  const kind = uiPart('strong');
  const dismiss = componentElement<HTMLButtonElement>(iconButtonHtml(options.dismiss, 'dismiss', 'x'));
  header.append(kind, uiPart('spacer'), dismiss);
  const title = uiPart('heading', undefined, 'im-truncate');
  const body = uiPart('paragraph');
  const error = uiPart('status');
  error.hidden = true;
  const open = uiButton(options.open, { sm: true });
  const actions = uiPart('actions');
  actions.append(error, uiPart('spacer'), open);
  bubble.append(header, title, body, actions);
  root.append(figure, bubble);
  return { root, portrait, kind, title, body, error, open, dismiss };
}
