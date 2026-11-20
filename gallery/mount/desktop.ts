import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { applyLook, guardDesktop, mountWindowControls, mountZoom } from '../../ts/shell/index.ts';
import { tauriWindowApi } from '../../ts/tauri.ts';
import { notify } from '../../ts/ui/notice.ts';
import type { MountContext } from '../main.ts';

// The gallery as a desktop window: the demo app (examples/demo) loads this page in a Tauri window with the glass
// material, and this module is the page side of it. In a browser it does nothing. In the app it
//   - turns the glass on, once: the window has the real acrylic, the surfaces let it through;
//   - lets the shell fill the window, with no gallery page around it (the picker bar and the sample sections stay in
//     the browser; the look and the theme change through `window.__imago.set`);
//   - wires the title bar's buttons, the zoom keys and the guard that keeps the window from behaving as a web page;
//   - tells the window the theme of the look after every change, which on Windows 11 is the theme of the acrylic.

const inDesktopApp = (): boolean => '__TAURI_INTERNALS__' in window || '__TAURI__' in window;

const STYLE = `
html[data-g-desktop], html[data-g-desktop] body { background: transparent !important; overflow: hidden; }
html[data-g-desktop] .g-bar, html[data-g-desktop] .g-block > :not(.g-stage), html[data-g-desktop] #g-sections { display: none !important; }
html[data-g-desktop] .g-stage { background: none !important; padding: 0; overflow: visible; }
html[data-g-desktop] .g-stage::before, html[data-g-desktop] .g-stage::after { display: none; }
html[data-g-desktop] .g-window { position: fixed; inset: 0; width: auto !important; height: auto !important; margin: 0; border-radius: 0; box-shadow: none; }
html[data-g-desktop] .g-window::before { display: none !important; }
`;

/** What belongs to the page, not to one drawing of the shell: set up on the first mount, kept until the window closes. */
let page: { shell: HTMLElement } | undefined;

function wirePage(first: MountContext): void {
  page = { shell: first.shell };
  document.documentElement.dataset.gDesktop = '';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  guardDesktop(document);
  mountZoom(document, {
    apply: (level) => getCurrentWebview().setZoom(level),
    onChange: (level) => { if (page) notify(page.shell, `Zoom ${Math.round(level * 100)} %`); },
  });
  // `window.__imago` exists once the first drawing of the page is done, which is where this runs.
  queueMicrotask(() => window.__imago?.set({ glass: true }));
}

/** The title bar is the window's frame: its empty parts drag the window and a double click maximizes it. */
function markDragRegion(titlebar: HTMLElement): void {
  for (const part of [titlebar, ...titlebar.querySelectorAll<HTMLElement>(':scope > .im-spacer, :scope > .im-brand, :scope > .im-brand *')]) {
    part.setAttribute('data-tauri-drag-region', '');
  }
}

export default function mount(ctx: MountContext): (() => void) | undefined {
  if (!inDesktopApp()) return undefined;
  if (!page) wirePage(ctx);
  else page.shell = ctx.shell;

  const { shell } = ctx;
  const show = (text: string): void => { notify(shell, text, { tone: 'err' }); };
  const fail = (what: string, error: unknown): void => { show(`The window could not ${what}: ${error instanceof Error ? error.message : String(error)}`); };

  // The theme of the look goes to the window each time it changes (once per word: the window saves it for the next start).
  applyLook(ctx.root, { app: ctx.app, look: ctx.look, theme: ctx.theme, glass: true }, {
    setWindowTheme: (theme) => invoke('set_window_theme', { theme }),
  });

  const titlebar = shell.querySelector<HTMLElement>('.im-titlebar');
  if (!titlebar) return undefined;
  markDragRegion(titlebar);
  return mountWindowControls(titlebar, tauriWindowApi(fail), {
    onError: (action, error) => fail(action, error),
  });
}
