// What the parts of the shell share, for the whole page: the app, its words, the one stack of notices and the window.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDesktopGuard, useWords } from '@acaprino/sigrid';
import { useCommand, useSchemeCommands, type SchemeCommandsOptions } from '@acaprino/sigrid/assemblies';
import { Toasts, type ToastItem } from '@acaprino/sigrid/components';
import { Icon } from '@acaprino/sigrid/primitives';
import { readHost, tauriApi, useZoom, type TauriErrorHandler } from '@acaprino/sigrid/tauri';
import type { App } from './app.js';
import { useFocusFollowed } from './focus.js';
import { SHELL_TONE } from './preset.js';
import { SHELL_WORDS, type ShellWords } from './words.js';

/**
 * Says something in a notice. `options` are those of Sigrid's notice: `kind: 'error'` stays until it is closed, `undo` and
 * `actions` are its buttons, and a notice with the `id` of one that is there takes its place: it is read again, and its time
 * starts again, also when the text is the same.
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
  /** The window was built as glass: its own material shows through the ground. Always false in a browser. */
  readonly glass: boolean;
  /** The person may choose glass: the app runs in a window, lets the person choose, and can keep the choice. The switch of the settings is drawn only then. */
  readonly glassOptional: boolean;
  /** The choice kept is not what the window was built with: it holds from the next start («Restart needed»). */
  readonly glassPending: boolean;
  /** Keeps the choice of glass for the next start. The window stays as it is: its material is the one it was built with. Does nothing where `glassOptional` is false. */
  setGlass(on: boolean): void;
}

/** What the window says of its material: what it was built of, what the next start builds, and whether the person may choose. */
export interface WindowMaterial {
  readonly glass: boolean;
  readonly next: boolean;
  readonly optional: boolean;
}

/** A browser, a window that does not say, and an app that fixed its material: opaque, and no choice. */
export const OPAQUE_WINDOW: WindowMaterial = { glass: false, next: false, optional: false };

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
export const lookOf = (app: App, glass = false): SchemeCommandsOptions => ({ theme: glass ? app.glassTheme : app.theme, tone: SHELL_TONE, storageKey: app.storage.scheme });

const PLUGIN = 'plugin:imago-shell|';
const READY_FALLBACK_MS = 250;
const NOTICE_MS = 5000;
/** What the person asks the window for: a failure of these is said. */
const ASKED = new Set(['minimize', 'toggleMaximize', 'close', 'setZoom', 'setMaterial']);
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

const isFlag = (value: unknown): value is boolean => typeof value === 'boolean';
/** What the window was built of, as it says; a window that does not say, or says what is not understood, is opaque. */
export async function windowMaterial(): Promise<WindowMaterial> {
  try {
    const said = (await tauriApi.invoke(`${PLUGIN}material`)) as Partial<Record<keyof WindowMaterial, unknown>> | null;
    if (said && isFlag(said.glass) && isFlag(said.next) && isFlag(said.optional)) return { glass: said.glass, next: said.next, optional: said.optional };
    console.warn('imago: material: not understood:', said);
  } catch (error) {
    console.warn('imago: material:', error);
  }
  return OPAQUE_WINDOW;
}
/** The choice of glass, kept for the next start. */
const keepMaterial = (glass: boolean): Promise<unknown> => tauriApi.invoke(`${PLUGIN}set_material`, { material: glass ? 'glass' : 'opaque' });
let themeTold: Promise<void> = Promise.resolve();

/** A notice in the stack: its `id` is its own, and `said` is the one its caller gave. */
type Notice = ToastItem & { said: string | undefined };

let notices = 0; // not crypto.randomUUID, which a page served over plain http does not have

/**
 * The state of the shell around the app, with the notices drawn once. `untold`: the window did not say which theme it keeps.
 * `material`: what the window said it was built of.
 */
export function ShellProvider({ app, untold, material, children }: { app: App; untold: boolean; material: WindowMaterial; children: ReactNode }) {
  const own = useMemo(() => readHost().ownWindow, []);
  const words = useMemo(() => ({ ...SHELL_WORDS, ...app.words?.shell }), [app]);
  const [items, setItems] = useState<Notice[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const shown = useRef(new Set<() => void>());

  // What the notices and the failures say does not change with the window's state: the app's effects depend on them.
  const notify = useMemo<Notify>(() => (text, options) => {
    // A new id each time: Sigrid keeps the node of one it has, and a screen reader reads only what is added.
    const item: Notice = { ...options, id: `notice-${++notices}`, said: options?.id, text };
    setItems((now) => [...now.filter(({ said }) => said === undefined || said !== item.said), item]);
  }, []);
  const failed = useMemo(() => (call: string, error: unknown): void => {
    if (ASKED.has(call)) notify(words.windowFailed(call, message(error)), { id: `window-${call}`, kind: 'error' });
    else console.warn(`imago: ${call}:`, error);
  }, [notify, words]);

  // The choice of glass that was kept, which may differ from the glass the window was built with. One write at a time, in order.
  const [next, setNext] = useState(material.next);
  const keeping = useRef<Promise<unknown>>(Promise.resolve());
  const window_ = useMemo<WindowHandle>(() => ({
    own, setTitle,
    setProgress: (percent) => setProgress(percent === null ? null : Math.round(Math.min(100, Math.max(0, percent)))),
    onShown: (handler) => {
      shown.current.add(handler);
      return () => { shown.current.delete(handler); };
    },
    glass: material.glass,
    glassOptional: own && material.optional,
    glassPending: own && material.optional && next !== material.glass,
    setGlass: (on) => {
      if (!own || !material.optional) return;
      setNext(on);
      keeping.current = keeping.current.then(() => keepMaterial(on)).catch(async (error: unknown) => {
        failed('setMaterial', error);
        setNext((await windowMaterial()).next);
      });
    },
  }), [own, material, next, failed]);

  const shell = useMemo<Shell>(() => ({ app, words, notify, window: window_, failed }), [app, words, notify, window_, failed]);

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
      <Look app={app} own={own} untold={untold} glass={material.glass} />
      {shell.window.glassOptional ? <GlassCommand /> : null}
      <Toasts items={items} durationMs={NOTICE_MS} onDismiss={(id) => setItems((now) => now.filter((item) => item.id !== id))} />
    </ShellContext>
  );
}

/**
 * Light, dark and the system's look as commands, and the window told of the choice and of the scheme drawn, when either changes;
 * one that did not say what it keeps is told nothing until the person chooses, so that its own is not written over.
 */
function Look({ app, own, untold, glass }: { app: App; own: boolean; untold: boolean; glass: boolean }) {
  const { choice, scheme } = useSchemeCommands(lookOf(app, glass));
  const unchosen = useRef(untold ? choice : null);
  useEffect(() => {
    if (!own || choice === unchosen.current) return;
    unchosen.current = null;
    themeTold = setTheme({ theme: choice, resolved: scheme });
  }, [own, choice, scheme]);
  return null;
}

/** The glass window as a command, next to light, dark and the system's look; drawn only where the person may choose it. */
function GlassCommand() {
  const { words, notify, window: { glass, glassPending, setGlass } } = useShell();
  const group = useWords().scheme.group;
  // What is checked is the choice kept, which holds from the next start: the window itself stays as it was built.
  const kept = glassPending ? !glass : glass;
  useCommand({
    id: 'imago.glass', label: words.glass, group, icon: <Icon name="layers" />, checked: kept,
    run: () => {
      setGlass(!kept);
      // A choice that is the glass the window has holds at once and needs no restart.
      if (!kept !== glass) notify(words.glassRestart, { id: 'imago.glass' });
    },
  });
  return null;
}
