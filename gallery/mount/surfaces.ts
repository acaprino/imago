import { APPS, type AppId } from '../apps.ts';
import {
  confirm,
  hasLayer,
  inspector,
  notify,
  clearNotices,
  openContentDialog,
  createContentDialog,
  runFormOperation,
  renderShellFrame,
  shellFrameHtml,
  sidebarHtml,
  titlebarHtml,
  pageContentHtml,
  openFormDialog,
  openMenu,
  openPalette,
  openSheet,
  type MenuItem,
  type Registry,
} from '../../ts/ui/index.ts';

interface MountContext {
  shell: HTMLElement;
  root: HTMLElement;
  app: string;
  look: string;
  theme: string;
  /** The registry of this shell: the app's commands go in it, and `mountApp` (gallery/main.ts) adds Ctrl+K and Ctrl+F. */
  registry: Registry;
}

declare global {
  interface Window {
    /** The surfaces and the registry of the live shell, for the gallery's test to drive them directly. */
    __imagoSurfaces?: {
      openContentDialog: typeof openContentDialog;
      createContentDialog: typeof createContentDialog;
      runFormOperation: typeof runFormOperation;
      renderShellFrame: typeof renderShellFrame;
      /** The frame's string renderers, for the tests that build a frame beside the gallery's window. */
      shellFrameHtml: typeof shellFrameHtml;
      sidebarHtml: typeof sidebarHtml;
      titlebarHtml: typeof titlebarHtml;
      pageContentHtml: typeof pageContentHtml;
      clearNotices: typeof clearNotices;
      openFormDialog: typeof openFormDialog;
      openMenu: typeof openMenu;
      openSheet: typeof openSheet;
      confirm: typeof confirm;
      notify: typeof notify;
      inspector: ReturnType<typeof inspector>;
      openPalette: typeof openPalette;
      registry: Registry;
    };
  }
}

type Words = { ran: string; cancelled: string; undone: string };
const EN: Words = { ran: 'Ran', cancelled: 'Cancelled', undone: 'Undone' };
const IT: Words = { ran: 'Eseguito', cancelled: 'Annullato', undone: 'Ripristinato' };

// The destructive action of each app, as the preview words it.
type Destroy = { title: string; body: string; verb: string; done: string };
const DESTROY: Record<AppId, Destroy> = {
  xiox: { title: 'Delete 8 items permanently?', body: '13.48 GB in 46,999 files will be deleted. This cannot be undone.', verb: 'Delete 8 items', done: '8 items deleted' },
  mukade: { title: 'Close room hop-review?', body: 'Its 4 members stop receiving messages. Closed rooms cannot be reopened.', verb: 'Close room', done: 'Room hop-review closed' },
  shinatama: { title: 'End this session?', body: 'The running task in billing-service stops and its terminal output is lost.', verb: 'End session', done: 'Session ended' },
  muro: { title: 'Stop managing Claude Code?', body: 'Muro stops syncing its plugins. Nothing already installed is removed.', verb: 'Stop managing', done: 'Claude Code is no longer managed' },
  daodan: { title: "Eliminare l'analisi?", body: "I grafi di acaprino/daodan vanno persi. L'operazione non si può annullare.", verb: 'Elimina analisi', done: 'Analisi eliminata' },
};
const UNDOABLE: Record<AppId, string> = {
  xiox: '8 items moved to the bin',
  mukade: 'Room hop-review closed',
  shinatama: 'Thread archived',
  muro: 'Claude Code is no longer managed',
  daodan: 'Analisi archiviata',
};

// The cap on a button shows "↵" or "space" for keys that belong to the focused control: those are not bound
// to a command here, or Enter would run the primary action while it also presses a button or picks a menu item.
function bindable(display: string | undefined): string | undefined {
  if (!display) return undefined;
  const parts = display.split(' ').map((part) => (part === '⇧' ? 'Shift' : part));
  const last = parts[parts.length - 1];
  return /^(↵|enter|space)$/i.test(last) ? undefined : parts.join('+');
}

// Wires every surface on the live shell: the palette on the title bar's command button (Ctrl+K is `mountApp`'s), the
// Views menu, a destructive action with its dialog, an undoable one with its notice. `data-act` is what the
// shell markup carries (`pal`, `kill`, `undo`); `data-im-act` names the same hooks for any markup that uses them.
export default function mount({ shell, app, registry }: MountContext): () => void {
  const id = app as AppId;
  const words = id === 'daodan' ? IT : EN;
  const data = APPS[id];
  const tabs = Array.from(shell.querySelectorAll<HTMLElement>('.im-titlebar .im-tab'));

  const selectTab = (index: number): void => tabs.forEach((tab, at) => tab.setAttribute('aria-selected', String(at === index)));
  const busy = (): boolean => hasLayer('dialog') || hasLayer('palette') || hasLayer('menu') || hasLayer('sheet');

  const ran = (title: string): void => void notify(shell, `${words.ran}: ${title}`);
  data.tabs.forEach((tab, index) => {
    const title = `${data.strings.views}: ${tab}`;
    registry.register({ id: `view:${index}`, title, run: () => { selectTab(index); ran(title); } });
  });
  for (const [name, action] of [['primary', data.primary], ['secondary', data.secondary]] as const) {
    // A command never runs under an open surface: the key belongs to the surface.
    registry.register({ id: `action:${name}`, title: action.text, keys: bindable(action.keys), run: () => { if (!busy()) ran(action.text); } });
  }
  const openCommandPalette = (): void => void openPalette(shell, registry, { placeholder: data.strings.palettePlaceholder, empty: data.strings.paletteEmpty });

  const viewsMenu = (anchor: HTMLElement): void => {
    openMenu(anchor, data.tabs.map((tab, index): MenuItem => ({ label: tab, run: () => selectTab(index) })));
  };
  const sampleMenu = (anchor: HTMLElement): void => {
    openMenu(anchor, [
      { label: data.secondary.text, keys: bindable(data.secondary.keys), run: () => ran(data.secondary.text) },
      { label: 'Import', keys: 'i', run: () => ran('Import') },
      { label: 'Rename', keys: 'F2', disabled: 'Select one item first', run: () => ran('Rename') },
      'separator',
      { label: DESTROY[id].verb, danger: true, run: () => void destroy() },
    ]);
  };

  async function destroy(): Promise<void> {
    const d = DESTROY[id];
    const yes = await confirm(shell, { title: d.title, body: d.body, confirm: d.verb, cancel: data.strings.cancel, danger: true });
    notify(shell, yes ? d.done : words.cancelled);
  }

  const act = (target: Element, name: string, alias: string): HTMLElement | null =>
    target.closest<HTMLElement>(`[data-act="${name}"], [data-im-act="${alias}"]`);

  const onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const palette = act(event.target, 'pal', 'palette');
    if (palette) return openCommandPalette();
    const destroying = act(event.target, 'kill', 'destroy');
    if (destroying) return void destroy();
    const undoable = act(event.target, 'undo', 'undoable');
    if (undoable) {
      return void notify(shell, UNDOABLE[id], { action: { label: data.strings.undo, run: () => void notify(shell, words.undone) } });
    }
    const menu = event.target.closest<HTMLElement>('[data-im-act="menu"]');
    if (menu) return sampleMenu(menu);
    const views = event.target.closest<HTMLElement>('.im-views-menu');
    if (views) return viewsMenu(views);
  };
  shell.addEventListener('click', onClick);

  window.__imagoSurfaces = { openContentDialog, createContentDialog, runFormOperation, renderShellFrame, shellFrameHtml, sidebarHtml, titlebarHtml, pageContentHtml, clearNotices, openFormDialog, openMenu, openSheet, confirm, notify, inspector: inspector(shell), openPalette, registry };

  return () => {
    shell.removeEventListener('click', onClick);
    clearNotices(shell);
    delete window.__imagoSurfaces;
  };
}
