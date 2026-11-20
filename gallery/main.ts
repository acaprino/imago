import '../css/imago.css';
import './gallery.css';
import { APP_HUES, APP_IDS, APPS, shellMarkup, type AppId } from './apps.ts';

export type Look = 'smooth' | 'oni';
export type Theme = 'dark' | 'light';
export type GalleryState = { app: AppId; look: Look; theme: Theme; glass: boolean; width: number };

/** What every module of `gallery/mount/` receives each time the page redraws. */
export type MountContext = {
  /** The `im-shell` element, freshly drawn. */
  shell: HTMLElement;
  /** The element that carries `data-im-app`, `data-im-look`, `data-im-theme` (and `im-glass` when the glass picker is on). */
  root: HTMLElement;
  app: AppId;
  look: Look;
  theme: Theme;
  /** An empty element under the window where a module may add its own sections of the gallery page. */
  sections: HTMLElement;
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
  { name: 'theme', options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }] },
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

function describeWidth(width: number, hasSidebar: boolean): string[] {
  return [
    width >= 1000 ? 'Inspector docked at the right' : 'Inspector over the content',
    !hasSidebar ? 'This app has no sidebar' : width >= 850 ? 'Full sidebar, 232 px' : width >= 620 ? 'Sidebar as a 56 px rail' : 'Sidebar opens from a title-bar button',
    width >= 620 ? 'View tabs in the title bar' : 'View tabs in the "Views" menu',
  ];
}

/** Everything that follows the state without redrawing the shell: attributes, pickers, width, the explanation line. */
function applyFrame(): void {
  root.dataset.imApp = state.app;
  root.dataset.imLook = state.look;
  root.dataset.imTheme = state.theme;
  root.classList.toggle('im-glass', state.glass);
  root.dataset.gGlass = state.glass ? 'on' : 'off';
  stage.dataset.gWall = state.theme === 'dark' ? 'night' : 'day';
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
  const ctx: MountContext = { shell, root, app: state.app, look: state.look, theme: state.theme, sections };
  for (const [path, module] of Object.entries(mounts).sort(([a], [b]) => a.localeCompare(b))) {
    try {
      const cleanup = module.default?.(ctx);
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    } catch (error) {
      console.error(`gallery/${path.slice(2)} failed to mount: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Changes the state. The width only resizes the window; any other change draws the shell again, because the
 * mount modules read the app, the look and the theme from the context.
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
    __imago: { set(partial: Partial<GalleryState>): void; state: GalleryState; ready: boolean };
  }
}
redraw();
window.__imago = { set, state, ready: true };
