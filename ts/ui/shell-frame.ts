/** Repaint shell content while preserving the body that owns modality and all
 * overlay hosts. Validate the complete next frame before changing either region.
 * Markup must come from trusted Imago composition, with external values escaped.
 */
export function renderShellFrame(shell: HTMLElement, markup: string): void {
  const next = shell.ownerDocument.createElement('template');
  next.innerHTML = markup;
  const incomingTitle = next.content.querySelector<HTMLElement>('.im-titlebar');
  const incomingBody = next.content.querySelector<HTMLElement>('.im-body');
  if (!incomingTitle || !incomingBody) throw new Error('An Imago frame needs a titlebar and body');
  const titlebar = shell.querySelector<HTMLElement>(':scope > .im-titlebar');
  const body = shell.querySelector<HTMLElement>(':scope > .im-body');
  if (!titlebar && !body) {
    shell.replaceChildren(next.content);
    return;
  }
  if (!titlebar || !body) throw new Error('The mounted Imago frame is incomplete');
  titlebar.replaceChildren(...incomingTitle.childNodes);
  body.replaceChildren(...incomingBody.childNodes);
}
