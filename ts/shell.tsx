// What the parts of the shell share, for the whole page: the app, its words, the one stack of notices and the window.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDesktopGuard } from '@acaprino/sigrid';
import { useSchemeCommands, type SchemeCommandsOptions } from '@acaprino/sigrid/assemblies';
import { Toasts, type ToastItem } from '@acaprino/sigrid/components';
import { readHost, tauriApi, useZoom, type TauriErrorHandler } from '@acaprino/sigrid/tauri';
import type { App } from './app.js';
import { useFocusFollowed } from './focus.js';
import { SHELL_TONE } from './preset.js';
import { SHELL_WORDS, type ShellWords } from './words.js';

/**
 * Says something in a notice. `options` are those of Sigrid's notice: `kind: 'error'` stays until it is closed, `undo` and
 * `actions` are its buttons, and a notice with the `id` of one that is there takes its place.
 */
export type Notify = (text: string, options?: Partial<Omit<ToastItem, 'text'>>) => void;

/** The window the app runs in. In a browser it does nothing but the title of the page. */
export interface WindowHandle {
  /** The app runs in a window of its own, and not in a browser. */
  readonly own: boolean;
  /** The title of the window; null is the app's name. */
  setTitle(title: string | null): void;
  /** The percent of the job in progress, on the taskbar; null is no job. One that ends behind other windows asks for attention. */
  setProgress(percent: number | null): void;
  /** Calls `handler` when the window is shown again (from the notification area, or because the app was started again); returns how to stop. */
  onShown(handler: () => void): () => void;
}

interface Shell {
  app: App;
  words: ShellWords;
  notify: Notify;
  window: WindowHandle;
  /** A call to the window that failed: one the person asked for is said to them, the others are written in the console. */
  failed: TauriErrorHandler;
}

const ShellContext = createContext<Shell | null>(null);

export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('outside startApp');
  return shell;
}

/** Says something to the person, in the one stack of notices of the window. */
export const useNotify = (): Notify => useShell().notify;

/** The window the app runs in. */
export const useWindow = (): WindowHandle => useShell().window;

/** The app's look, and the key its light, dark or system's choice is kept under. */
export const lookOf = (app: App): SchemeCommandsOptions => ({ theme: app.theme, tone: SHELL_TONE, storageKey: app.storage.scheme });

const PLUGIN = 'plugin:imago-shell|';
const READY_FALLBACK_MS = 250;
const NOTICE_MS = 5000;
/** What the person asks the window for: a failure of these is said. */
const ASKED = new Set(['minimize', 'toggleMaximize', 'close', 'setZoom']);
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));
/** Not in development, where reload and the developer tools are needed. */
const released = !(import.meta as { env?: { DEV?: boolean } }).env?.DEV;

/** Tells the window something by itself: a failure is written in the console. */
const tell = (command: string, args?: Record<string, unknown>): Promise<void> =>
  tauriApi.invoke(PLUGIN + command, args).then(() => {}, (error: unknown) => console.warn(`imago: ${command}:`, error));

/**
 * A command that is sent one call at a time, and of the calls that came meanwhile the last: the plugin answers two that are
 * sent together in no fixed order, and an old value would land after the new one.
 */
function inTurn(command: string): (args: Record<string, unknown>) => Promise<void> {
  let next: Record<string, unknown> | undefined;
  let running: Promise<void> | undefined;
  return (args) => {
    next = args;
    running ??= (async () => {
      while (next) {
        const now = next;
        next = undefined;
        await tell(command, now);
      }
      running = undefined;
    })();
    return running;
  };
}
const setTheme = inTurn('set_theme');
/** The choice the window keeps, written as the person makes it: what the browser keeps reaches the disk later. Null is none. */
export const keptTheme = (): Promise<unknown> => tauriApi.invoke(`${PLUGIN}kept_theme`);
const chrome = inTurn('chrome');
let themeTold: Promise<void> = Promise.resolve();

let notices = 0; // not crypto.randomUUID, which a page served over plain http does not have

/** The state of the shell around the app, with the notices drawn once. `untold`: the window did not say which theme it keeps. */
export function ShellProvider({ app, untold, children }: { app: App; untold: boolean; children: ReactNode }) {
  const own = useMemo(() => readHost().ownWindow, []);
  const words = useMemo(() => ({ ...SHELL_WORDS, ...app.words?.shell }), [app]);
  const [items, setItems] = useState<ToastItem[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const shown = useRef(new Set<() => void>());

  const shell = useMemo<Shell>(() => {
    const notify: Notify = (text, options) => {
      const item: ToastItem = { ...options, id: options?.id ?? `notice-${++notices}`, text };
      setItems((now) => [...now.filter(({ id }) => id !== item.id), item]);
    };
    return {
      app, words, notify,
      window: {
        own, setTitle,
        setProgress: (percent) => setProgress(percent === null ? null : Math.round(Math.min(100, Math.max(0, percent)))),
        onShown: (handler) => {
          shown.current.add(handler);
          return () => { shown.current.delete(handler); };
        },
      },
      failed: (call, error) => {
        if (ASKED.has(call)) notify(words.windowFailed(call, message(error)), { id: `window-${call}`, kind: 'error' });
        else console.warn(`imago: ${call}:`, error);
      },
    };
  }, [app, own, words]);

  useFocusFollowed();
  useDesktopGuard(own && released);
  // shortcut: the zoom is in the browser's storage alone, and is lost when every process of the engine is killed; when that
  // matters to an app, the plugin keeps it as it keeps the theme.
  useZoom({ storageKey: app.storage.zoom, onError: shell.failed });

  // The first frame is drawn: the window, which is hidden until then, is shown in its theme. A hidden window may run no
  // animation frame.
  useEffect(() => {
    if (!own) return;
    let sent = false;
    const send = (): void => {
      if (sent) return;
      sent = true;
      void themeTold.then(() => tell('ready'));
    };
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(send); });
    const timer = setTimeout(send, READY_FALLBACK_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [own]);

  // The title and the job: sent from the first change on, always both.
  const told = useRef(false);
  useEffect(() => {
    if (title === null && progress === null && !told.current) return;
    told.current = true;
    document.title = title ?? app.name;
    if (own) void chrome({ title: title ?? app.name, progress });
  }, [app, own, title, progress]);

  useEffect(() => {
    if (!own) return;
    const listening = tauriApi.listen('window-shown', () => { for (const handler of [...shown.current]) handler(); });
    listening.catch((error: unknown) => console.warn('imago: window-shown:', error));
    return () => { listening.then((stop) => stop(), () => {}); };
  }, [own]);

  return (
    <ShellContext value={shell}>
      {children}
      {/* After the app, so that its commands come after the app's in the palette. */}
      <Look app={app} own={own} untold={untold} />
      <Toasts items={items} durationMs={NOTICE_MS} onDismiss={(id) => setItems((now) => now.filter((item) => item.id !== id))} />
    </ShellContext>
  );
}

/**
 * Light, dark and the system's look as commands, and the window told of the choice and of the scheme drawn, when either changes;
 * one that did not say what it keeps is told nothing until the person chooses, so that its own is not written over.
 */
function Look({ app, own, untold }: { app: App; own: boolean; untold: boolean }) {
  const { choice, scheme } = useSchemeCommands(lookOf(app));
  const unchosen = useRef(untold ? choice : null);
  useEffect(() => {
    if (!own || choice === unchosen.current) return;
    unchosen.current = null;
    themeTold = setTheme({ theme: choice, resolved: scheme });
  }, [own, choice, scheme]);
  return null;
}
