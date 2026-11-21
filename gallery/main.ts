import '../css/imago.css';
import './gallery.css';
import { resolveTheme, windowThemeFor } from '../ts/shell/index.ts';
import { createRegistry, footerKeys, mountApp, type Registry } from '../ts/ui/index.ts';
import { APP_HUES, APP_IDS, APPS, shellMarkup, type AppId } from './apps.ts';

export type Look = 'smooth' | 'oni';
/** The theme the page draws. */
export type Theme = 'dark' | 'light';
/** The theme chosen, as an app keeps it: `system` follows Windows (the browser's colour scheme here). */
export type ThemeChoice = Theme | 'system';
export type GalleryState = { app: AppId; look: Look; theme: ThemeChoice; glass: boolean; width: number };

/** What every module of `gallery/mount/` receives each time the page redraws. */
export type MountContext = {
  /** The `im-shell` element, freshly drawn. */
  shell: HTMLElement;
  /** The element that carries `data-im-app`, `data-im-look`, `data-im-theme` (and `im-glass` when the glass picker is on). */
  root: HTMLElement;
  app: AppId;
  look: Look;
  /** The theme drawn: the choice, or for `system` the one Windows has. */
  theme: Theme;
  /** An empty element under the window where a module may add its own sections of the gallery page. */
  sections: HTMLElement;
  /**
   * The command registry of this shell. A module registers the app's commands in it. The page calls `mountApp` once the
   * modules have run, which attaches the keys, the layers, the regions and the sidebar and adds `Ctrl+K` and `Ctrl+F`:
   * a module calls none of those.
   */
  registry: Registry;
};
export type MountModule = { default?: (ctx: MountContext) => void | (() => void) };

// The window's minimum is 500 physical pixels. At 200% page zoom that is 250 CSS pixels, which is what the shell is given then.
const MIN_WIDTH = 250;
const MAX_WIDTH = 1160;

const state: GalleryState = { app: 'xiox', look: 'smooth', theme: 'dark', glass: false, width: MAX_WIDTH };

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`gallery/index.html has no ${selector}`);
  return el;
};
const root = $<HTMLElement>('#g-window');
const stage = $<HTMLElement>('#g-stage');
const sections = $<HTMLElement>('#g-sections');
const slider = $<HTMLInputElement>('#g-width');
const sliderOut = $<HTMLOutputElement>('#g-width-out');
const rules = $<HTMLElement>('#g-rules');

const PICKERS: { name: 'app' | 'look' | 'theme' | 'glass'; options: { value: string; label: string; hue?: number }[] }[] = [
  { name: 'app', options: APP_IDS.map((id) => ({ value: id, label: APPS[id].name, hue: APP_HUES[id] })) },
  { name: 'look', options: [{ value: 'smooth', label: 'Smooth' }, { value: 'oni', label: 'ONI' }] },
  { name: 'theme', options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Windows' }] },
  { name: 'glass', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'Simulated' }] },
];
const pickValue = (name: string): string => (name === 'glass' ? (state.glass ? 'on' : 'off') : String(state[name as 'app' | 'look' | 'theme']));

for (const { name, options } of PICKERS) {
  const group = $<HTMLElement>(`[data-g-pick="${name}"]`);
  group.innerHTML = options
    .map((o) => `<button type="button" data-v="${o.value}" aria-pressed="false">${o.hue === undefined ? '' : `<i class="g-dot" style="--g-hue:${o.hue}"></i>`}${o.label}</button>`)
    .join('');
  group.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-v]');
    if (!button) return;
    set(name === 'glass' ? { glass: button.dataset.v === 'on' } : ({ [name]: button.dataset.v } as Partial<GalleryState>));
  });
}
slider.min = String(MIN_WIDTH);
slider.max = String(MAX_WIDTH);
slider.addEventListener('input', () => set({ width: Number(slider.value) }));

const mounts = import.meta.glob<MountModule>('./mount/*.ts', { eager: true });
let cleanups: (() => void)[] = [];

// The choice to fold the sidebar into its rail outlives a redraw of the gallery, as an app would store it.
let sidebarCollapsed = false;

// The theme the page draws, as applyLook resolves it: ONI follows Windows in its dark theme, Smooth in the one Windows has.
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
function drawnTheme(): Theme {
  const theme = windowThemeFor(state.look, state.theme);
  return theme === 'system' ? resolveTheme('system', systemTheme.matches) : theme;
}
systemTheme.addEventListener('change', () => {
  if (state.theme === 'system') redraw();
});

function describeWidth(width: number, hasSidebar: boolean): string[] {
  return [
    width >= 1000 ? 'Inspector docked at the right' : 'Inspector over the content',
    !hasSidebar ? 'This app has no sidebar' : width >= 850 ? 'Full sidebar, 232 px' : width >= 620 ? 'Sidebar as a 56 px rail' : 'Sidebar opens from a title-bar button',
    width >= 620 ? 'View tabs in the title bar' : 'View tabs in the "Views" menu',
  ];
}

/** Everything that follows the state without redrawing the shell: attributes, pickers, width, the explanation line. */
function applyFrame(): void {
  const theme = drawnTheme();
  root.dataset.imApp = state.app;
  root.dataset.imLook = state.look;
  root.dataset.imTheme = theme;
  root.classList.toggle('im-glass', state.glass);
  root.dataset.gGlass = state.glass ? 'on' : 'off';
  stage.dataset.gWall = theme === 'dark' ? 'night' : 'day';
  root.style.width = `${state.width}px`;
  slider.value = String(state.width);
  sliderOut.textContent = `${state.width} px`;
  for (const { name } of PICKERS) {
    document.querySelectorAll<HTMLButtonElement>(`[data-g-pick="${name}"] button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === pickValue(name))));
  }
  rules.innerHTML = describeWidth(state.width, APPS[state.app].side !== null).map((text) => `<li>${text}</li>`).join('');
}

/** Draws the shell again, then hands it to every mount module (the previous cleanups run first). */
function redraw(): void {
  for (const cleanup of cleanups.splice(0)) cleanup();
  applyFrame();
  root.innerHTML = shellMarkup(state.app);
  sections.replaceChildren();
  const shell = root.querySelector<HTMLElement>('.im-shell');
  if (!shell) throw new Error('shellMarkup() drew no .im-shell');
  const registry = createRegistry();
  const ctx: MountContext = { shell, root, app: state.app, look: state.look, theme: drawnTheme(), sections, registry };
  for (const [path, module] of Object.entries(mounts).sort(([a], [b]) => a.localeCompare(b))) {
    try {
      const cleanup = module.default?.(ctx);
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    } catch (error) {
      console.error(`gallery/${path.slice(2)} failed to mount: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // The app is mounted like any app: once its commands are registered, with its words. Mounted last, so undone first.
  // The look and the theme are the gallery's choice, kept in `state`: the five commands and the pickers above both call
  // `set`. A mount that fails is reported as a module that fails is, and the page stays.
  const { strings, footerKeys: entries } = APPS[state.app];
  try {
    cleanups.unshift(
      mountApp(shell, registry, {
        search: () => {
          window.__imago.searches++;
          shell.querySelector<HTMLInputElement>('.im-panel-tools input')?.focus(); // the view's search field, where it has one
        },
        labels: { palette: strings.commands, search: strings.search, palettePlaceholder: strings.palettePlaceholder, paletteEmpty: strings.paletteEmpty },
        sidebar: { collapsed: sidebarCollapsed, onChange: (value) => (sidebarCollapsed = value) },
        appearance: { get: () => ({ look: state.look, theme: state.theme }), set: (next) => set(next), labels: strings.appearance },
      }),
    );
    // One footer's key list comes from the registry, now that every command is in it.
    if (entries) shell.querySelector('.im-footer .im-footer-keys')?.replaceWith(footerKeys(document, registry, entries));
  } catch (error) {
    console.error(`gallery/main.ts could not mount the app: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Changes the state: the pickers, the look and theme commands of the palette and the tests all come here. The width
 * only resizes the window; any other change draws the shell again, because the mount modules read the app, the look
 * and the theme from the context.
 */
function set(partial: Partial<GalleryState>): void {
  const before = { ...state };
  Object.assign(state, partial);
  state.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, state.width));
  const onlyWidth = (Object.keys(state) as (keyof GalleryState)[]).every((k) => k === 'width' || state[k] === before[k]);
  if (onlyWidth) applyFrame();
  else redraw();
}

declare global {
  interface Window {
    /** `searches` counts the calls of the search that `mountApp` was given (Ctrl+F, or the palette's command), for tests/gallery/keys.mjs. */
    __imago: { set(partial: Partial<GalleryState>): void; state: GalleryState; ready: boolean; searches: number };
  }
}
redraw();
window.__imago = { set, state, ready: true, searches: 0 };
