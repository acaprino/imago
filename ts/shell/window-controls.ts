// The window has no system frame: the title bar is the page's, and so are its three buttons. This file wires them to
// the window and tells the native side where the maximize button is, so that Windows 11 offers its Snap Layouts over
// it (the imago-shell crate lays a child window that never paints over the button and answers `HTMAXBUTTON`; the
// mouse never reaches the HTML button, so the keyboard is what its click handler serves). Hover and press of that
// button come back from Windows through `onOsHover` and show as `data-im-os` on it. The window itself is reached
// through `WindowApi`, so the page needs no Tauri here.
//
// The title bar holds the buttons, marked `data-im-window="minimize"`, `"maximize"` and `"close"`.

export type WindowRect = { x: number; y: number; width: number; height: number };

export type WindowApi = {
  /** `minimize`, `toggleMaximize` and `close` may be asynchronous: a throw or a rejection goes to the `onError` of `mountWindowControls`. */
  minimize(): void | Promise<unknown>;
  toggleMaximize(): void | Promise<unknown>;
  close(): void | Promise<unknown>;
  /**
   * The maximize button's rectangle in physical pixels. A call that throws or rejects is sent again at the next
   * change (the native overlay may not exist yet at the first one).
   */
  reportMaximizeRect(rect: WindowRect): void | Promise<unknown>;
  /** The state of the maximize button as the native overlay sees the mouse. Returns the function that stops listening. */
  onOsHover(callback: (state: 'none' | 'hover' | 'pressed') => void): () => void;
  /** Optional: whether the window is maximized, called at once with the current state and at every change. */
  onMaximized?(callback: (maximized: boolean) => void): () => void;
};

/**
 * Keeps the native side told where the maximize button is, in physical pixels, once per frame and only when it moved.
 * It is told again on every resize of the window even when the rectangle is the same: maximized, the overlay also
 * covers the resize border and has to be placed again. A button that is hidden (a look without the bar) measures
 * nothing, and the overlay goes away. Returns the function that stops it.
 */
function reportMaximizeRect(maximize: HTMLElement, doc: Document, report: WindowApi['reportMaximizeRect']): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};
  let reported = '';
  let frame = 0;
  const send = (): void => {
    frame = 0;
    const box = maximize.getBoundingClientRect();
    const ratio = win.devicePixelRatio;
    const rect = { x: Math.round(box.left * ratio), y: Math.round(box.top * ratio), width: Math.round(box.width * ratio), height: Math.round(box.height * ratio) };
    const key = JSON.stringify(rect);
    if (key === reported) return;
    reported = key;
    const failed = (): void => { if (reported === key) reported = ''; };
    try { Promise.resolve(report(rect)).catch(failed); } catch { failed(); }
  };
  const schedule = (): void => { if (!frame) frame = win.requestAnimationFrame(send); };
  const resend = (): void => { reported = ''; schedule(); };

  const sizeObserver = new win.ResizeObserver(schedule);
  sizeObserver.observe(maximize);
  // The look switches the bar on and off without resizing the window.
  const lookObserver = new win.MutationObserver(schedule);
  lookObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-im-look'] });
  win.addEventListener('resize', resend);
  // A change of zoom changes the pixel ratio: the query is for the current one and is made again after each change.
  let stopRatio = (): void => {};
  const watchRatio = (): void => {
    const query = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
    const changed = (): void => { schedule(); watchRatio(); };
    query.addEventListener('change', changed, { once: true });
    stopRatio = () => query.removeEventListener('change', changed);
  };
  watchRatio();
  schedule();

  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    sizeObserver.disconnect();
    lookObserver.disconnect();
    win.removeEventListener('resize', resend);
    stopRatio();
  };
}

export type WindowControlsOptions = {
  /**
   * Where a failed window action goes: the action's name and the error, from a throw or a rejection of the api's call.
   * Without it the failure is swallowed, never left as an unhandled rejection; an app passes one that shows it.
   */
  onError?: (action: 'minimize' | 'maximize' | 'close', error: unknown) => void;
  /**
   * The words `onMaximized` writes on the maximize button: its name (`aria-label`) and its tooltip (`title`) when the
   * window is restored (`maximize`, `maximizeTitle`) and when it is maximized (`restore`, `restoreTitle`). An app in
   * another language gives its own; a word it leaves out is the English one.
   */
  labels?: { maximize?: string; restore?: string; maximizeTitle?: string; restoreTitle?: string };
};

const LABELS = { maximize: 'Maximize window', restore: 'Restore window', maximizeTitle: 'Maximize', restoreTitle: 'Restore' };

/** Wires the title bar's buttons to the window. Returns the function that lets go of all of it. */
export function mountWindowControls(titlebar: HTMLElement, api: WindowApi, options: WindowControlsOptions = {}): () => void {
  const cleanups: (() => void)[] = [];
  const fail = (action: 'minimize' | 'maximize' | 'close', error: unknown): void => {
    // A reporter that itself fails must not turn a click into an uncaught error.
    try { options.onError?.(action, error); } catch { /* nothing left to tell */ }
  };
  const button = (name: 'minimize' | 'maximize' | 'close', run: () => void | Promise<unknown>): HTMLElement | null => {
    const element = titlebar.querySelector<HTMLElement>(`[data-im-window="${name}"]`);
    if (!element) return null;
    const action = (): void => {
      try { Promise.resolve(run()).catch((error: unknown) => { fail(name, error); }); } catch (error) { fail(name, error); }
    };
    element.addEventListener('click', action);
    cleanups.push(() => element.removeEventListener('click', action));
    return element;
  };

  button('minimize', () => api.minimize());
  button('close', () => api.close());
  const maximize = button('maximize', () => api.toggleMaximize());
  if (maximize) {
    cleanups.push(api.onOsHover((state) => {
      if (state === 'none') maximize.removeAttribute('data-im-os'); else maximize.setAttribute('data-im-os', state);
    }));
    if (api.onMaximized) {
      const given = options.labels ?? {};
      const labels = {
        maximize: given.maximize ?? LABELS.maximize, restore: given.restore ?? LABELS.restore,
        maximizeTitle: given.maximizeTitle ?? LABELS.maximizeTitle, restoreTitle: given.restoreTitle ?? LABELS.restoreTitle,
      };
      cleanups.push(api.onMaximized((maximized) => {
        maximize.setAttribute('aria-label', maximized ? labels.restore : labels.maximize);
        maximize.title = maximized ? labels.restoreTitle : labels.maximizeTitle;
        maximize.setAttribute('data-im-maximized', String(maximized));
      }));
    }
    cleanups.push(reportMaximizeRect(maximize, titlebar.ownerDocument, (rect) => api.reportMaximizeRect(rect)));
  }

  let mounted = true;
  return () => {
    if (!mounted) return;
    mounted = false;
    for (const cleanup of cleanups) cleanup();
  };
}
