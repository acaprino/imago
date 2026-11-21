import { matrixMarkup, MATRIX_CSS } from '../matrix.ts';
import type { MountContext } from '../main.ts';

const CONTAINER_ID = 'im-gallery-matrix';

// Adds the state matrix under the window: one section that holds the table of gallery/matrix.ts. It sits beside the
// shell, not inside it, so it carries the same root attributes (`data-im-app|look|theme`, and `im-glass`) for the
// tokens to apply.
export default function mount(ctx: MountContext): () => void {
  const parent = ctx.sections;
  let section = document.getElementById(CONTAINER_ID);
  if (!section) {
    section = document.createElement('section');
    section.id = CONTAINER_ID;
  }
  if (section.parentElement !== parent) parent.append(section);
  section.className = 'g-block g-mx-section';
  section.setAttribute('aria-labelledby', 'g-h-matrix');
  section.innerHTML = `<style>${MATRIX_CSS}</style>
    <h2 id="g-h-matrix">Controls and their states</h2>
    <p>Every control in every state it can be in. Hover, pressed and focus are forced on the cell; the other states are the real attributes. The look, theme and app are the ones of the pickers above.</p>
    <div class="g-mx-surface">${matrixMarkup()}</div>`;
  // A native checkbox is mixed only from a script: no attribute says it.
  for (const input of Array.from(section.querySelectorAll<HTMLInputElement>('input[data-indeterminate]'))) input.indeterminate = true;
  const surface = section.querySelector<HTMLElement>('.g-mx-surface');
  if (surface) {
    for (const { name, value } of Array.from(ctx.root.attributes)) {
      if (name.startsWith('data-im-')) surface.setAttribute(name, value);
    }
    surface.classList.toggle('im-glass', ctx.root.classList.contains('im-glass'));
  }
  return () => section?.remove();
}
