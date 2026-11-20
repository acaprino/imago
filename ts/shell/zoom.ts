// The page's zoom is the app's job: Tauri leaves the engine's zoom off (`zoomHotkeysEnabled` is false) and the browser
// accelerators are switched off, so Ctrl+= / Ctrl+- / Ctrl+0 and Ctrl+wheel are app commands, from 50 to 200 %
// (WCAG 1.4.4 asks for 200 %), in steps of 10 %. The level is kept in the webview's own storage, which is per machine.
// The webview itself is reached through `apply`, which the app gives (Tauri: `getCurrentWebview().setZoom`), so
// this file needs neither a DOM nor Tauri to be tested.

import type { KeyLike } from './desktop-guard.ts';

const MIN_TENTHS = 5;
const MAX_TENTHS = 20;

/** A zoom level the app offers: 0.5 to 2, rounded to a tenth. Anything that is not a number is 100 %. */
export function clampZoom(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(MAX_TENTHS, Math.max(MIN_TENTHS, Math.round(value * 10))) / 10;
}

/** The level after one step from `current` (which need not be one the app offers): 1 in, -1 out, 0 back to 100 %. */
export function stepZoom(current: number, direction: 1 | -1 | 0): number {
  if (direction === 0) return 1;
  return clampZoom(clampZoom(current) + direction / 10);
}

/** Ctrl+= / Ctrl++ / Ctrl+- / Ctrl+0 (also on the numeric keypad), by character or by physical key, on any layout. */
export function zoomDirection(event: KeyLike): 1 | -1 | 0 | null {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;
  const { key, code } = event;
  if (key === '+' || key === '=' || code === 'NumpadAdd' || (!event.shiftKey && code === 'Equal')) return 1;
  if (event.shiftKey) return null;
  if (key === '-' || code === 'NumpadSubtract' || code === 'Minus') return -1;
  if (key === '0' || code === 'Digit0' || code === 'Numpad0') return 0;
  return null;
}

/**
 * How far the wheel must turn for one step, in unzoomed pixels (`wheelPixels`): one notch of a mouse wheel is about 100,
 * so every notch is a step; a touchpad pinch sends many small deltas that add up instead of jumping a step each.
 */
const WHEEL_NOTCH = 50;

/**
 * A wheel event's `deltaY` in unzoomed pixels. WebView2 reports pixel deltas in CSS pixels, which shrink as the page
 * zooms in (one notch is 100 at 100 %, 50 at 200 %): without this the steps would grow farther apart the larger the
 * page. Line and page deltas (`deltaMode` 1 and 2) are not zoomed.
 */
export function wheelPixels(deltaY: number, deltaMode: number, zoom: number): number {
  if (deltaMode === 1) return deltaY * 40;
  if (deltaMode === 2) return deltaY * 800;
  return deltaY * zoom;
}

export type ZoomOptions = {
  /** Gives the level to the webview. A rejection means the window cannot zoom: the level goes back. */
  apply(level: number): void | Promise<unknown>;
  /** Where the level is kept. Default: the webview's `localStorage`, if it has one. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Default `imago.zoom`; an app gives its own (`xiox.zoom`) to keep the level it already saved. */
  storageKey?: string;
  /** Called with the level every time it changes (a notice, the settings control), not for the first one. */
  onChange?(level: number): void;
};

const defaultStorage = (): Pick<Storage, 'getItem' | 'setItem'> | undefined => {
  try { return globalThis.localStorage; } catch { return undefined; }
};

/** The saved level: nothing, or something that is not a number, is 100 %. */
function savedLevel(storage: ZoomOptions['storage'], key: string): number {
  try {
    const raw = storage?.getItem(key) ?? null;
    return clampZoom(raw === null || raw.trim() === '' ? Number.NaN : Number(raw));
  } catch {
    return 1;
  }
}

/**
 * Applies the saved level and answers the zoom keys and Ctrl+wheel on `doc`. Returns the function that stops it.
 * The level is applied at start even at 100 %: a page reloaded after a crash finds the webview at its last factor.
 */
export function mountZoom(doc: Document, options: ZoomOptions): () => void {
  const key = options.storageKey ?? 'imago.zoom';
  const storage = options.storage ?? defaultStorage();
  let level = savedLevel(storage, key);

  const attempt = (next: number): Promise<unknown> => {
    try { return Promise.resolve(options.apply(next)); } catch (error) { return Promise.reject(error); }
  };
  const initial = level;
  void attempt(initial).catch(() => { if (level === initial) level = 1; });

  // The level moves at once, so presses faster than the engine count every step; a refusal moves it back.
  const move = (next: number): void => {
    const previous = level;
    level = next;
    options.onChange?.(next);
    void attempt(next).then(
      () => {
        try { storage?.setItem(key, String(next)); } catch { /* no storage: the level lasts until the window closes */ }
      },
      () => {
        if (level !== next) return;
        level = previous;
        options.onChange?.(previous);
      },
    );
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const direction = zoomDirection(event);
    if (direction === null) return;
    // Capture: a terminal or a field never sees these keys, as in Windows Terminal.
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat && direction === 0) return;
    const next = stepZoom(level, direction);
    if (next !== level) move(next);
  };

  let travel = 0;
  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey) { travel = 0; return; }
    event.preventDefault();
    travel += wheelPixels(event.deltaY, event.deltaMode, level);
    if (Math.abs(travel) < WHEEL_NOTCH) return;
    const next = stepZoom(level, travel < 0 ? 1 : -1);
    travel = 0;
    if (next !== level) move(next);
  };

  doc.addEventListener('keydown', onKeyDown, { capture: true });
  doc.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    doc.removeEventListener('keydown', onKeyDown, { capture: true });
    doc.removeEventListener('wheel', onWheel);
  };
}
