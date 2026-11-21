import { regions, roving } from '../../ts/ui/keys.ts';

interface MountContext {
  shell: HTMLElement;
  root: HTMLElement;
  app: string;
  look: string;
  theme: string;
}

declare global {
  interface Window {
    /** For tests/gallery/keys.mjs: the two functions, to try them on elements the shell does not have. */
    __imagoKeys?: { roving: typeof roving; regions: typeof regions };
  }
}

window.__imagoKeys = { roving, regions };

// Space and Enter do what a click does, so the keyboard and the mouse share one code path.
const select = (el: HTMLElement) => el.click();

// Wires the keyboard movement on the live shell: arrows in the sidebar list, the title-bar tabs and the
// content table, one tab stop each. F6 between the regions is not here: `mountApp` (gallery/main.ts) makes that call.
export default function mount({ shell }: MountContext): () => void {
  const undo: Array<() => void> = [];

  const list = shell.querySelector<HTMLElement>('.im-sidebar [role="listbox"]');
  if (list) undo.push(roving(list, { item: '.im-row', orientation: 'vertical', onSelect: select }));

  const tabs = shell.querySelector<HTMLElement>('.im-titlebar .im-tabs');
  if (tabs) undo.push(roving(tabs, { item: '.im-tab', orientation: 'horizontal', onSelect: select }));

  const table = shell.querySelector<HTMLElement>('.im-content tbody');
  if (table) undo.push(roving(table, { item: 'tr', orientation: 'vertical', onSelect: select }));

  return () => {
    for (const stop of undo) stop();
  };
}
