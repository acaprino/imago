// The glass as it is on screen. Opens the demo window (an isolated data folder), puts a dark and then a bright window
// behind it, and photographs the real window from the screen in each look and theme: a webview screenshot draws the
// acrylic as white and cannot judge the glass. Then, in the same run, what only a real window can show: the real
// mouse over the maximize button (Snap Layouts), a real click maximizing and restoring, Ctrl+= twice and the zoom
// kept across a restart. The window is raised above every other for the run and closed at the end.
//
// Usage: npm run demo:fetch   (once, and after a change the Verify workflow has built)   then   npm run capture
// The demo app is never built on this machine: the Verify workflow builds it and keeps it as the artifact
// `imago-demo`, and `npm run demo:fetch` puts the latest one in examples/demo/app/. IMAGO_DEMO_EXE names another file.
// Output: examples/demo/captures/<look>-<theme>-<over-dark|over-bright>.png (eight), snap-layouts-*.png, and the
// title-bar pixel of each on the console. The exit code is 1 when a check fails.
//
// The look and the theme are switched through `window.__imago.set` in the page (the WebView2 debugging port), never
// by reloading. Raising can fail now and then: a capture whose pixels are not the app's is the window in front;
// repeat the run.
//
// The restart check leaves the window in the theme OPPOSITE to Windows' own apps theme before it closes it, and reads
// the page's colour scheme once, at the first contact with the page after the restart (in `launch`, before anything
// waits). Three things can give the page its scheme there: the saved theme (the window's first frame), Windows' own
// theme (when no saved theme reached the window) and the page's own boot call: the gallery always starts on Smooth
// dark and `gallery/mount/desktop.ts` sends `dark` to the window at its first mount, which also rewrites the saved
// file. `judgeSavedTheme` (capture-rules.mjs) says what a read proves; the read says whether the page had mounted yet
// (`window.__imago` exists once its first, synchronous drawing is done, so its boot call has been sent):
//   - Windows' apps light (the saved theme is dark): a light read proves a failure; a dark read proves delivery only
//     when it was taken before the page mounted, else it may be the boot call.
//   - Windows' apps dark (the saved theme is light): a light read proves delivery; a dark read proves a failure only
//     when it was taken before the page mounted, else the boot call may have won the race.
//   - Windows' theme unreadable: a light read may be Windows' own.
// What a read cannot prove is printed as "cannot tell" and is not a failure.
//
// `launch` also records in the page what it was pressed on (pointer, click, key: `demoPressed`, the `pressed` console
// lines) and prints the last of them when the demo ends by itself. It stays on purpose: it is what showed that the
// demo of run 2 was closed by keys typed on the keyboard meanwhile (docs/verification.md, "Notes on the runs").
// A `launch` that fails stops the process it started, so no window is left on the screen.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { judgeSavedTheme, judgeSheetDenser, judgeShowThrough, judgeTitleBar } from './capture-rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const exe = process.env.IMAGO_DEMO_EXE ? resolve(process.env.IMAGO_DEMO_EXE) : resolve(here, 'app/imago-demo.exe');
const out = resolve(here, 'captures');

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
/** The window behind the demo window, as RGB. Shinatama's measurements were over a dark terminal and a white page. */
const BACKDROPS = [['over-dark', '12,12,12'], ['over-bright', '255,255,255']];

const failures = [];
/** What a check could not tell (it is not a failure): printed again at the end, so a pass does not hide it. */
const unproven = [];
/** The demos that the run closes itself, and what each one's page was pressed on. */
const closing = new Set();
const demoPressed = new Map();
const note = (text) => console.log(text);
const fail = (text) => { failures.push(text); console.log(`FAIL ${text}`); };
const check = (what, problems) => { for (const problem of problems) fail(`${what}: ${problem}`); };

// ---- PowerShell: the screen, the mouse and the window behind ---------------------------------------------------------

const powershell = (script, args) => execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(here, script), ...args], { encoding: 'utf8' }).trim();
const screen = (action, args = []) => JSON.parse(powershell('capture.ps1', ['-Action', action, ...args.map(String)]));

/** Stops a process and everything it started (the page's own processes included). */
const killTree = (pid) => { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* it had ended */ } };

function startBackdrop(pid, color, extra = []) {
  const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(here, 'backdrop.ps1'), '-ProcessId', String(pid), '-Color', color, ...extra], { stdio: ['ignore', 'pipe', 'ignore'] });
  const ready = new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('the backdrop window did not open')), 20000);
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('ready')) { clearTimeout(timer); accept(); } });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('the backdrop window closed at once')); });
  });
  return ready.then(() => child);
}

// ---- the demo window --------------------------------------------------------------------------------------------------

async function freePort() {
  const reservation = createServer();
  await new Promise((accept) => reservation.listen(0, '127.0.0.1', accept));
  const { port } = reservation.address();
  await new Promise((accept) => reservation.close(accept));
  return port;
}

/** Starts the demo with its data in `fixture` and returns what drives it. The same folder again is a restart. */
async function launch(fixture) {
  const port = await freePort();
  const app = spawn(exe, [], {
    cwd: root, stdio: 'ignore',
    env: {
      ...process.env,
      IMAGO_DEMO_HOME: resolve(fixture, 'data'),
      WEBVIEW2_USER_DATA_FOLDER: resolve(fixture, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
    },
  });
  const exited = new Promise((accept) => app.once('exit', accept));
  app.once('exit', (code) => { if (!closing.has(app)) note(`(the demo ended by itself with exit code ${code}; the page was last pressed on: ${demoPressed.get(app)?.slice(-6).join(' | ') || 'nothing'})`); });
  let browser;
  try {
    for (let attempt = 0; attempt < 80 && !browser; attempt++) {
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); } catch { await delay(500); }
    }
    if (!browser) throw new Error('the demo window did not open its debugging port');
    const page = async () => {
      for (const deadline = Date.now() + 30000; Date.now() < deadline; await delay(250)) {
        const found = browser.contexts()[0]?.pages().find((candidate) => /tauri\.localhost/.test(candidate.url()));
        if (found) return found;
      }
      throw new Error('the demo window shows no page of its own');
    };
    const view = await page();
    // The first contact: the page's colour scheme, before anything else waits (a restart judges it). `mounted` is false
    // when the page's script has not yet drawn the gallery, so its own boot call (the window theme `dark`) is not sent yet.
    const firstRead = await view.evaluate(() => ({ light: matchMedia('(prefers-color-scheme: light)').matches, mounted: Boolean(window.__imago), at: Math.round(performance.now()) }));
    // What the page was pressed on, kept here: when the demo ends by itself this says whether a pointer or a key did it.
    const pressed = [];
    view.on('console', (message) => { if (message.text().startsWith('pressed ')) pressed.push(message.text().slice(8)); });
    await view.evaluate(() => {
      const say = (event) => console.debug(`pressed ${event.type} ${event.target?.closest?.('[data-im-window]')?.getAttribute('data-im-window') ?? event.target?.tagName ?? event.key}`);
      for (const type of ['pointerdown', 'click', 'keydown']) document.addEventListener(type, say, true);
    });
    await view.waitForFunction(() => window.__imago?.ready && document.querySelector('#g-window')?.classList.contains('im-glass'), null, { timeout: 30000 });
    demoPressed.set(app, pressed);
    return { app, pid: app.pid, page: view, exited, pressed, firstRead, close: () => browser.close().catch(() => {}) };
  } catch (error) {
    // The window is already on the screen: a launch that fails (first start or restart) must not leave it there.
    closing.add(app);
    await browser?.close().catch(() => {});
    killTree(app.pid);
    throw error;
  }
}

/** Where the window is kept on the screen for the run: the backdrop lies under this place, and every capture puts the window back. */
const HOME = { x: 120, y: 80 };

/** A call of capture.ps1 about the demo window; it says so when the demo is gone (closed, or ended some other way). */
function onWindow(demo, action, args = []) {
  if (demo.app.exitCode !== null) throw new Error(`the demo ended (exit code ${demo.app.exitCode}) before "${action}"`);
  return screen(action, ['-ProcessId', demo.pid, ...args]);
}

/** Restores the window if it was minimized, puts it at HOME above every other window and makes it the active one. */
function placeWindow(demo) {
  const placed = onWindow(demo, 'place', ['-X', HOME.x, '-Y', HOME.y]);
  if (!placed.active) note('(the demo window could not be made the active window; captures of it are retried)');
  return placed;
}

/** Switches the look and the theme in the page and waits for the window theme to reach Windows and the acrylic to repaint. */
async function select(demo, fixture, look, theme) {
  await demo.page.evaluate(([nextLook, nextTheme]) => window.__imago.set({ look: nextLook, theme: nextTheme }), [look, theme]);
  await demo.page.waitForFunction(([nextLook, nextTheme]) => {
    const window_ = document.querySelector('#g-window');
    return window_.dataset.imLook === nextLook && window_.dataset.imTheme === nextTheme && window_.classList.contains('im-glass');
  }, [look, theme]);
  await delay(900);
  // The native side keeps the theme it was told in a file, for the first frame of the next start.
  const kept = (await readFile(resolve(fixture, 'data', 'window-theme'), 'utf8').catch(() => '')).trim();
  if (kept !== theme) fail(`${look} ${theme}: the window theme kept on disk is "${kept}", not "${theme}": set_window_theme did not reach the native side`);
}

/** Where the title bar and the work sheet can be read: empty spots of the real window, in physical pixels of its client area. */
const spots = (demo) => demo.page.evaluate(() => {
  const ratio = window.devicePixelRatio;
  const physical = (value) => Math.round(value * ratio);
  const spacer = document.querySelector('.im-titlebar > .im-spacer').getBoundingClientRect();
  const content = document.querySelector('.im-content').getBoundingClientRect();
  const sheetX = content.left + content.width / 2;
  const sheetY = content.bottom - 14;
  const there = document.elementFromPoint(sheetX, sheetY);
  const maximize = document.querySelector('[data-im-window="maximize"]').getBoundingClientRect();
  return {
    title: [physical(spacer.left + spacer.width / 2), physical(8)],
    sheet: [physical(sheetX), physical(sheetY)],
    sheetOn: there ? `${there.tagName.toLowerCase()}.${String(there.className).split(' ')[0]}` : 'nothing',
    maximize: [physical(maximize.left + maximize.width / 2), physical(maximize.top + maximize.height / 2)],
    ratio,
  };
});

// ---- phase 1: eight photographs of the glass --------------------------------------------------------------------------

/** The copy of the window from the screen. It must be of the active window: it is taken again (up to three times) when Windows gave the foreground away. */
function photograph(demo, name, points) {
  let shot;
  for (let attempt = 1; attempt <= 3; attempt++) {
    shot = onWindow(demo, 'capture', ['-X', HOME.x, '-Y', HOME.y, '-Out', resolve(out, `${name}.png`), '-Points', points]);
    if (shot.active) break;
  }
  return shot;
}

async function photographs(demo, fixture) {
  const taken = {};
  placeWindow(demo);
  for (const [backdrop, color] of BACKDROPS) {
    const behind = await startBackdrop(demo.pid, color);
    try {
      for (const look of LOOKS) {
        for (const theme of THEMES) {
          await select(demo, fixture, look, theme);
          const spot = await spots(demo);
          const name = `${look}-${theme}-${backdrop}`;
          const shot = photograph(demo, name, `title:${spot.title.join(':')};sheet:${spot.sheet.join(':')}`);
          const { title, sheet } = shot.pixels;
          taken[name] = { look, theme, backdrop, title, sheet };
          note(`${name.padEnd(26)} title bar ${title.join(',').padEnd(12)} work sheet ${sheet.join(',').padEnd(12)} (on ${spot.sheetOn}, ${shot.width}x${shot.height}${shot.active ? '' : ', NOT THE ACTIVE WINDOW'})`);
          if (!shot.active) fail(`${name}: the demo window was not the active window, so Windows drew a plain fill instead of the acrylic and nothing here can be judged`);
          check(name, judgeTitleBar({ look, theme, backdrop, pixel: title }));
        }
      }
    } finally {
      killTree(behind.pid);
    }
  }
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      const dark = taken[`${look}-${theme}-over-dark`];
      const bright = taken[`${look}-${theme}-over-bright`];
      if (!dark || !bright) continue;
      check(`${look}-${theme}`, judgeShowThrough({ overDark: dark.title, overBright: bright.title }));
      if (look === 'smooth') {
        check(`${look}-${theme}`, judgeSheetDenser({ frame: { overDark: dark.title, overBright: bright.title }, sheet: { overDark: dark.sheet, overBright: bright.sheet } }));
      }
    }
  }
  const files = (await readdir(out)).filter((file) => /^(smooth|oni)-(dark|light)-over-(dark|bright)\.png$/.test(file));
  if (files.length !== 8) fail(`${files.length} captures in ${out}, not eight`);
}

// ---- phase 2: what the real mouse and keyboard do ----------------------------------------------------------------------

const maximizeState = (demo) => demo.page.evaluate(() => {
  const button = document.querySelector('[data-im-window="maximize"]');
  return { os: button.getAttribute('data-im-os'), maximized: button.getAttribute('data-im-maximized') };
});

async function interaction(demo, fixture) {
  await select(demo, fixture, 'smooth', 'dark');
  placeWindow(demo);
  // The flyout Snap Layouts opens under the button reaches past the window: the backdrop is laid wide and long.
  const behind = await startBackdrop(demo.pid, '12,12,12', ['-Margin', '320', '-Below', '560']);
  try {
    placeWindow(demo);
    let geometry = onWindow(demo, 'rect');
    let spot = await spots(demo);
    const button = () => [geometry.clientLeft + spot.maximize[0], geometry.clientTop + spot.maximize[1]];
    const region = () => [button()[0] - 330, geometry.top, 660, 520];

    // The pointer rests far from the button first: the picture before is the baseline.
    screen('move', ['-X', geometry.clientLeft + 40, '-Y', geometry.clientTop + geometry.clientHeight - 40]);
    await delay(600);
    const [rx, ry, rw, rh] = region();
    screen('region', ['-X', rx, '-Y', ry, '-Width', rw, '-Height', rh, '-Out', resolve(out, 'snap-layouts-before.png')]);

    screen('move', ['-X', button()[0], '-Y', button()[1]]);
    await delay(2200);
    const hover = await maximizeState(demo);
    const after = screen('region', ['-X', rx, '-Y', ry, '-Width', rw, '-Height', rh, '-Out', resolve(out, 'snap-layouts-hover.png'), '-Compare', resolve(out, 'snap-layouts-before.png')]);
    note(`snap layouts: the pointer on the maximize button, the page reports data-im-os="${hover.os}"; ${after.changed} of ${after.sampled} sampled pixels of the region under the button changed (snap-layouts-hover.png against snap-layouts-before.png)`);
    if (hover.os !== 'hover') fail(`the real pointer on the maximize button did not reach the page: data-im-os is "${hover.os}", not "hover" (the native overlay or the caption-maximize event)`);
    if (!(after.changed > 400)) fail(`no flyout under the maximize button: only ${after.changed} sampled pixels changed (see snap-layouts-hover.png)`);

    // A click on the native overlay maximizes, a second one restores.
    const click = () => {
      const pressed = screen('click', ['-X', button()[0], '-Y', button()[1]]);
      if (!pressed.clicked) fail(`the pointer was not on the maximize button (at ${pressed.at.join(',')}, not ${pressed.x},${pressed.y}): someone moved the mouse, the click was not made`);
      return pressed.clicked;
    };
    const waitFor = (state) => demo.page.waitForFunction((wanted) => document.querySelector('[data-im-window="maximize"]').getAttribute('data-im-maximized') === wanted, state, { timeout: 8000 }).catch(() => {});
    const before = geometry;
    if (click()) await waitFor('true');
    await delay(600);
    const maximized = onWindow(demo, 'rect');
    const state = await maximizeState(demo);
    note(`click on the maximize button: ${before.width}x${before.height} -> ${maximized.width}x${maximized.height}, data-im-maximized="${state.maximized}"`);
    if (state.maximized !== 'true' || (maximized.width <= before.width && maximized.height <= before.height)) fail('a real click on the maximize button did not maximize the window');
    geometry = maximized;
    spot = await spots(demo);
    screen('move', ['-X', button()[0], '-Y', button()[1]]);
    await delay(900);
    if (click()) await waitFor('false');
    await delay(600);
    const restored = onWindow(demo, 'rect');
    const last = await maximizeState(demo);
    note(`second click: ${maximized.width}x${maximized.height} -> ${restored.width}x${restored.height}, data-im-maximized="${last.maximized}"`);
    if (last.maximized !== 'false') fail('a second real click on the maximize button did not restore the window');
  } finally {
    killTree(behind.pid);
  }
}

/** Presses Ctrl+= twice and leaves the window in the theme `saved.theme`, the one the restart must find again. */
async function zoomTwice(demo, fixture, saved) {
  await select(demo, fixture, 'smooth', saved.theme);
  const ratio = () => demo.page.evaluate(() => window.devicePixelRatio);
  const base = await ratio();
  for (let press = 1; press <= 2; press++) {
    await demo.page.keyboard.press('Control+Equal');
    await delay(500);
  }
  const zoomed = await ratio();
  const kept = await demo.page.evaluate(() => localStorage.getItem('imago.zoom'));
  note(`zoom: Ctrl+= twice, devicePixelRatio ${base} -> ${zoomed} (x${(zoomed / base).toFixed(2)}), saved level ${kept}`);
  if (Math.abs(zoomed / base - 1.2) > 0.02) fail(`Ctrl+= twice gave x${(zoomed / base).toFixed(2)}, not x1.2`);
  if (kept !== '1.2') fail(`the saved zoom is ${kept}, not 1.2`);
  return base;
}

/** The real close button of the page ends the window and the application. */
async function closeWindow(demo) {
  closing.add(demo.app);
  await demo.page.click('[data-im-window="close"]');
  const ended = await Promise.race([demo.exited.then(() => true), delay(10000).then(() => false)]);
  if (!ended) fail('the close button did not end the demo');
  await demo.close();
}

// ---- phase 3: the restart ---------------------------------------------------------------------------------------------

/** Whether Windows' apps are dark: true or false, null when the registry cannot be read. */
const systemPrefersDark = () => {
  try { return !/0x1\s*$/.test(execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'], { encoding: 'utf8' }).trim()); } catch { return null; }
};

/**
 * The theme the window is left in before the restart: the opposite of Windows' own, because a page with no saved theme
 * at all shows Windows' theme and would pass the check whether the saved one reached the first frame or not. When
 * Windows' theme cannot be read (`windows` is null) the run ends on light as it used to; `judgeSavedTheme` then
 * cannot tell a saved light from Windows' own.
 */
function themeToSave() {
  const dark = systemPrefersDark();
  if (dark === null) return { theme: 'light', windows: null };
  return { theme: dark ? 'light' : 'dark', windows: dark ? 'dark' : 'light' };
}

async function restart(fixture, base, saved) {
  const demo = await launch(fixture);
  try {
    const first = demo.firstRead;
    const scheme = first.light ? 'light' : 'dark';
    const windows = saved.windows === null ? "Windows' theme could not be read" : `Windows' apps are ${saved.windows}`;
    note(`restart: the window theme saved was ${saved.theme}; the page's colour scheme, read ${first.at} ms after the page started and ${first.mounted ? 'after' : 'before'} its first mount (its own boot call sends dark), was ${scheme}; ${windows}`);
    const { verdict, why } = judgeSavedTheme({ saved: saved.theme, windows: saved.windows, scheme, mounted: first.mounted });
    if (verdict === 'failed') fail(`after a restart ${why}`);
    else if (verdict === 'unproven') { unproven.push('the saved window theme at a restart'); note(`restart: cannot tell whether the saved window theme reached the first frame: ${why}`); }
    else note(`restart: the saved window theme reached the first frame: ${why}`);
    const seen = await demo.page.evaluate(() => ({ ratio: window.devicePixelRatio, level: localStorage.getItem('imago.zoom') }));
    note(`restart: devicePixelRatio ${seen.ratio} (x${(seen.ratio / base).toFixed(2)} of ${base}), saved level ${seen.level}`);
    if (Math.abs(seen.ratio / base - 1.2) > 0.02) fail(`after a restart the zoom is x${(seen.ratio / base).toFixed(2)}, not the x1.2 that was kept`);
  } finally {
    await closeWindow(demo);
  }
}

// ---- run -------------------------------------------------------------------------------------------------------------

if (!existsSync(exe)) {
  console.error(`No demo app at ${exe}. Take the one the Verify workflow built: npm run demo:fetch`);
  process.exit(1);
}
if (screen('state').locked) {
  console.error('The Windows desktop is locked: a copy of the screen shows the lock screen and the mouse never reaches the window. Unlock it and run again.');
  process.exit(2);
}
await mkdir(out, { recursive: true });
for (const file of await readdir(out)) if (file.endsWith('.png')) await rm(resolve(out, file));
const fixture = await mkdtemp(resolve(tmpdir(), 'imago-demo-capture-'));
let demo;
try {
  demo = await launch(fixture);
  await photographs(demo, fixture);
  await interaction(demo, fixture);
  const saved = themeToSave();
  const base = await zoomTwice(demo, fixture, saved);
  await closeWindow(demo);
  demo = undefined;
  await restart(fixture, base, saved);
} catch (error) {
  fail(`the run stopped: ${String(error.stack ?? error).split('\n').slice(0, 3).join(' | ')}`);
} finally {
  if (demo) { await demo.close(); killTree(demo.pid); }
  await rm(fixture, { recursive: true, force: true }).catch(() => {});
}
const cannotTell = unproven.length ? ` (cannot tell: ${unproven.join('; ')})` : '';
console.log(failures.length ? `\n${failures.length} check(s) failed${cannotTell}. Captures in ${out}` : `\nAll checks passed${cannotTell}. Captures in ${out}`);
process.exitCode = failures.length ? 1 : 0;
