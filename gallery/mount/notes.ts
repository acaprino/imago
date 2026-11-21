import { buttonHtml, chipHtml } from '../../ts/ui/markup.ts';
import { noteHtml } from '../../ts/ui/shell-markup.ts';
import type { Tone } from '../../ts/ui/tone.ts';
import type { MountContext } from '../main.ts';

const CONTAINER_ID = 'im-gallery-notes';
const TONES: Tone[] = ['warn', 'err', 'ok', 'info'];

// What the actions of a note hold, from the package's own renderers: a primary and a neutral button, a chip and a key cap.
// The same markup stands outside any note, so the test can tell whether the note restyles its actions.
const ACTIONS = buttonHtml('Apply 3 changes', 'g-note-apply', { primary: true })
  + buttonHtml('Review', 'g-note-review')
  + chipHtml('3 changes', 'warn')
  + '<kbd class="im-key">Ctrl ↵</kbd>';

// A note for each tone with a title, a line, a list and the actions; the approved compact note; and the actions alone.
export default function mount({ root, sections }: MountContext): () => void {
  const parent = sections ?? root.parentElement ?? document.body;
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  // The tokens hang on these attributes, so the notes need the same ones as the shell above.
  for (const { name, value } of Array.from(root.attributes)) {
    if (name.startsWith('data-im-')) container.setAttribute(name, value);
  }
  container.style.cssText = [
    'display: grid',
    'gap: var(--im-s-4)',
    'padding: var(--im-s-4)',
    'color: var(--im-text)',
    'font: 400 13px/1.45 var(--im-font-text)',
    'background: var(--im-sheet)',
    'border: 1px solid var(--im-line)',
    'border-radius: var(--im-r-sheet)',
  ].join('; ');
  container.innerHTML = TONES.map((tone) => `<div data-g-note="block" data-g-tone="${tone}">${noteHtml({
    icon: 'warning',
    title: '3 changes ready to apply',
    message: 'Nothing changes until you apply.',
    items: [{ label: 'Marionette', message: 'update 0.3.0 to 0.4.0' }],
    actionsHtml: ACTIONS,
    tone,
  })}</div>`).join('')
    + `<div data-g-note="compact">${noteHtml({ icon: 'warning', title: '3 changes ready to apply', message: 'Nothing changes until you apply.', tone: 'warn' })}</div>`
    + `<div data-g-note="outside"><div class="im-action-row">${ACTIONS}</div></div>`;
  parent.append(container);
  return () => container.remove();
}
