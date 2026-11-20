import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { WindowApi } from './shell/index.ts';

/** The window as the page sees it. Every call that can fail returns its promise, so the title bar reports it. */
export function tauriWindowApi(fail: (what: string, error: unknown) => void): WindowApi {
  const native = getCurrentWindow();
  const stopOnResolve = (listening: Promise<() => void>): (() => void) => {
    listening.catch((error: unknown) => fail('listen to the window', error));
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      void listening.then(unlisten => unlisten(), () => {}).catch((error: unknown) => fail('stop listening to the window', error));
    };
  };
  return {
    minimize: () => native.minimize(),
    toggleMaximize: () => native.toggleMaximize(),
    close: () => native.close(),
    reportMaximizeRect: (rect) => invoke('window_caption_maximize', rect),
    onOsHover: (callback) => stopOnResolve(listen<{ hover: boolean; pressed: boolean }>('caption-maximize', ({ payload }) => {
      callback(payload.pressed ? 'pressed' : payload.hover ? 'hover' : 'none');
    })),
    onMaximized: (callback) => {
      let revision = 0;
      let live = true;
      // Several answers can be on their way at once (a window resized fast): only the last one asked is shown.
      const sync = (): void => {
        const mine = ++revision;
        native.isMaximized().then((maximized) => { if (live && mine === revision) callback(maximized); }, (error: unknown) => fail('read whether it is maximized', error));
      };
      sync();
      const stop = stopOnResolve(native.onResized(sync));
      return () => { live = false; stop(); };
    },
  };
}
