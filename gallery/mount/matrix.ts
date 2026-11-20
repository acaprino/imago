import { matrixMarkup, MATRIX_CSS } from '../matrix.ts';

interface MountContext {
  shell: HTMLElement;
  root: HTMLElement;
  app: string;
  look: string;
  theme: string;
  /** An empty element under the window where a module adds its own sections; older callers may not pass it. */
  sections?: HTMLElement;
}

const CONTAINER_ID = 'im-gallery-matrix';

// Adds the state matrix under the window: one section that holds the table of gallery/matrix.ts. It sits beside the
// shell, not inside it, so it carries the same root attributes (`data-im-app|look|theme`, and `im-glass`) for the
// tokens to apply.
export default function mount(ctx: MountContext): () => void {
  const parent = ctx.sections ?? ctx.root.parentElement ?? document.body;
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
  const surface = section.querySelector<HTMLElement>('.g-mx-surface');
  if (surface) {
    for (const { name, value } of Array.from(ctx.root.attributes)) {
      if (name.startsWith('data-im-')) surface.setAttribute(name, value);
    }
    surface.classList.toggle('im-glass', ctx.root.classList.contains('im-glass'));
  }
  return () => section?.remove();
}
