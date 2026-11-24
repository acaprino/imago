//! The main window, opened and watched for the app, and the Tauri plugin the page speaks to it
//! through. What every app of the suite wired by hand is here once, around the pieces of the other
//! modules:
//!
//! - [`plugin`]: the commands `set_theme`, `caption`, `ready` and `chrome`. As a plugin they have
//!   permissions of their own (`imago-shell:default`), so a page that is not local (one on
//!   `http://127.0.0.1`) gets them by its capability, without an application manifest.
//! - [`open_main`]: the window, with everything a window needs right after it is built; hidden
//!   until the page has drawn, where it was last time, in the theme it had.
//! - A lost page is reloaded, a lost browser process builds the window again, and what neither
//!   mends is asked of the person ([`recovery_action`]).
//! - [`on_run_event`]: what the exit of the application and the end of the window mean for that.
use crate::{
    frame::{install_reload_menu, install_snap_layouts, SnapLayouts},
    guard::{disable_browser_accelerators, guard_window, trim_context_menu},
    message,
    recovery::{recovery_action, watch_process_failures, Recovery, RecoveryAction},
    theme::{drawn_by_page, parse_theme, save_theme, saved_theme},
    window_state::{load_state, measure, restore, save_state, state_to_save, WindowState},
    Material, Origins, ProcessFailure,
};
use std::{
    fmt::Display,
    io,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, MutexGuard, PoisonError,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    plugin::{Builder, TauriPlugin},
    utils::config::{PreventOverflowConfig, WindowConfig},
    window::{ProgressBarState, ProgressBarStatus},
    AppHandle, Emitter, Manager, RunEvent, Runtime, State, Url, UserAttentionType, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

/// The label of the window in `tauri.conf.json`.
const MAIN: &str = "main";

/// The event that tells the page its window came back ([`show_main`]). WebView2 gives the page no
/// focus event for a window that was hidden.
const SHOWN: &str = "window-shown";

/// How long the window waits for the page's first frame before it is shown anyway: a page that
/// never says `ready` must not leave an invisible process behind.
const SHOW_ANYWAY: Duration = Duration::from_secs(3);

/// How long a failure waits before it is acted on. The processes of a window that closes are
/// reported as failed before its end is known here, and an app may prevent a close it was asked
/// for, so only the end itself tells.
const SETTLE: Duration = Duration::from_millis(500);

/// How long the old window may take to go before a new one takes its label.
const DESTROY_WAIT: Duration = Duration::from_secs(5);

/// How the main window is opened. [`Options::for_app`] gives the defaults.
pub struct Options {
    /// The window, from `tauri.conf.json` (`"create": false`): its title, its size, its minimum and
    /// its first page. The material, the decorations and the visibility are the crate's.
    pub window: WindowConfig,
    /// Where the theme and the place of the window are kept. `None`: neither is read or kept.
    pub data_dir: Option<PathBuf>,
    pub material: Material,
    /// What the window may show besides the embedded frontend (and the dev server in development).
    pub origins: Origins,
    /// The window stays hidden until [`show_main`]: the app was started with Windows.
    pub background: bool,
    /// The item of the window menu that reloads the page.
    pub reload_label: String,
    /// The question asked of the person when reloading the page by itself did not help.
    pub stopped_message: String,
    /// What is said, with the cause, when the window cannot be built again; the app then ends.
    pub lost_message: String,
    /// Called before each reload, on a thread that may wait: the app saves what it must and answers
    /// whether to reload. `None`: the person asked, by the window menu. `Some`: what failed, and
    /// the page may not answer.
    pub before_reload: Box<dyn Fn(Option<ProcessFailure>) -> bool + Send + Sync>,
}

impl Options {
    /// The window `main` of `tauri.conf.json` in acrylic, the app's data folder, and words in
    /// English. An error when the app has no such window.
    pub fn for_app<R: Runtime>(app: &impl Manager<R>) -> tauri::Result<Self> {
        let windows = &app.config().app.windows;
        let window = windows
            .iter()
            .find(|window| window.label == MAIN)
            .ok_or(tauri::Error::WindowNotFound)?;
        Ok(Self {
            window: window.clone(),
            data_dir: app.path().app_data_dir().ok(),
            material: Material::Acrylic,
            origins: Origins::default(),
            background: false,
            reload_label: "Reload interface".into(),
            stopped_message: "The interface stopped responding. Reload it?".into(),
            lost_message: "The window could not be restored. The application will close.".into(),
            before_reload: Box::new(|_| true),
        })
    }
}

/// The one main window, kept across a rebuild of it.
#[derive(Default)]
struct Shell {
    /// `None` until [`open_main`].
    options: Mutex<Option<Arc<Options>>>,
    overlay: Mutex<Option<SnapLayouts>>,
    recovery: Mutex<Recovery>,
    /// The last place seen while the window was neither maximized nor minimized.
    normal: Mutex<Option<WindowState>>,
    /// The page the window went to last: a rebuild opens it again.
    page: Mutex<Option<Url>>,
    /// Counts the windows built: what is still reported of an earlier one is stale.
    generation: AtomicU64,
    rebuilding: AtomicBool,
    asking: AtomicBool,
    /// The window is to be shown when its page has drawn.
    undrawn: AtomicBool,
    /// The page last reported a job in progress.
    working: AtomicBool,
}

impl Shell {
    fn options(&self) -> Option<Arc<Options>> {
        lock(&self.options).clone()
    }

    /// The options `window` was opened with; no other window has these commands.
    fn options_of<R: Runtime>(&self, window: &WebviewWindow<R>) -> Result<Arc<Options>, String> {
        self.options()
            .filter(|options| options.window.label == window.label())
            .ok_or_else(|| format!("window \"{}\" is not imago-shell's", window.label()))
    }

    fn is_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) == generation
    }

    fn is_rebuilding(&self) -> bool {
        self.rebuilding.load(Ordering::SeqCst)
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn text(error: impl Display) -> String {
    error.to_string()
}

// ---- the plugin ------------------------------------------------------------------------------
//
// The commands are `async`, off the window's thread, and must stay so. Tauri holds the lock on its
// list of plugins while a plugin's command runs, and takes it again on the window's thread for each
// window event: a command there that shows the window waits for itself, and the window hangs for
// good. It did, on a real window (CI run 45461302594); the mock runtime of the tests has no window
// events, so no test here fails if one is made sync again.

/// The plugin. An app registers it on its builder before anything calls the crate.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("imago-shell")
        .invoke_handler(tauri::generate_handler![
            set_theme, kept_theme, caption, ready, chrome
        ])
        .setup(|app, _| {
            app.manage(Shell::default());
            Ok(())
        })
        .build()
}

/// The theme the page chose (`light`, `dark` or `system`) and the one it draws (`light` or `dark`):
/// the window takes it, and keeps the choice for the first frame of the next start.
#[tauri::command(async)]
fn set_theme<R: Runtime>(
    window: WebviewWindow<R>,
    shell: State<'_, Shell>,
    theme: String,
    resolved: Option<String>,
) -> Result<(), String> {
    let options = shell.options_of(&window)?;
    let theme = parse_theme(&theme).ok_or_else(|| format!("unknown window theme \"{theme}\""))?;
    let resolved = drawn_by_page(theme, resolved.as_deref());
    options
        .material
        .apply(&window, theme, resolved)
        .map_err(text)?;
    match &options.data_dir {
        Some(dir) => save_theme(dir, theme).map_err(text),
        None => Ok(()),
    }
}

/// What the page chose last, as [`set_theme`] kept it: `light`, `dark`, `system`, or none. The page
/// takes it over its own when it starts: WebView2 writes the page's storage to the disk some seconds
/// late, and loses what it had not written when its process dies.
#[tauri::command(async)]
fn kept_theme<R: Runtime>(
    window: WebviewWindow<R>,
    shell: State<'_, Shell>,
) -> Result<Option<&'static str>, String> {
    let options = shell.options_of(&window)?;
    let kept = options.data_dir.as_deref().and_then(saved_theme);
    Ok(kept.map(|theme| theme.word()))
}

/// Where the page's maximize button is, in physical pixels of the client area.
#[tauri::command(async)]
fn caption<R: Runtime>(
    window: WebviewWindow<R>,
    shell: State<'_, Shell>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    shell.options_of(&window)?;
    let overlay = lock(&shell.overlay);
    // An error makes the page send the rectangle again at its next change.
    let overlay = overlay.as_ref().ok_or("the window is still being built")?;
    overlay.set_rect(x, y, width, height);
    Ok(())
}

/// The page has drawn its first frame. Called again after each reload, which shows nothing.
#[tauri::command(async)]
fn ready<R: Runtime>(window: WebviewWindow<R>, shell: State<'_, Shell>) -> Result<(), String> {
    shell.options_of(&window)?;
    show_drawn(&window);
    Ok(())
}

/// The title of the window and the percent of the job in progress, if there is one, for the taskbar
/// button. A job that ends while the window is not in front asks for attention.
#[tauri::command(async)]
fn chrome<R: Runtime>(
    window: WebviewWindow<R>,
    shell: State<'_, Shell>,
    title: String,
    progress: Option<u8>,
) -> Result<(), String> {
    shell.options_of(&window)?;
    let was_working = shell.working.swap(progress.is_some(), Ordering::SeqCst);
    window.set_title(&title).map_err(text)?;
    window.set_progress_bar(taskbar(progress)).map_err(text)?;
    if asks_for_attention(was_working, progress, window.is_focused().unwrap_or(true)) {
        // Windows ends it when the window is activated.
        window
            .request_user_attention(Some(UserAttentionType::Informational))
            .map_err(text)?;
    }
    Ok(())
}

fn taskbar(progress: Option<u8>) -> ProgressBarState {
    ProgressBarState {
        status: Some(match progress {
            Some(_) => ProgressBarStatus::Normal,
            None => ProgressBarStatus::None,
        }),
        progress: progress.map(|percent| u64::from(percent.min(100))),
    }
}

fn asks_for_attention(was_working: bool, progress: Option<u8>, focused: bool) -> bool {
    was_working && progress.is_none() && !focused
}

// ---- the window ------------------------------------------------------------------------------

/// Opens the main window, hidden until its page has drawn. Call it in the app's `setup`. It is the
/// one window of the plugin: the page's commands and the recovery are for it alone.
pub fn open_main<R: Runtime>(app: &AppHandle<R>, options: Options) -> tauri::Result<()> {
    let shell = app.state::<Shell>();
    if tauri::is_dev() {
        if let Some(dev) = &app.config().build.dev_url {
            options.origins.allow(dev.as_str());
        }
    }
    let place = options.data_dir.as_deref().and_then(load_state);
    let visible = !options.background;
    // A window opened anew counts from nothing; one built again keeps its count.
    *lock(&shell.recovery) = Recovery::new();
    *lock(&shell.page) = None;
    *lock(&shell.options) = Some(Arc::new(options));
    build(app, place, visible)
}

/// Brings the main window to the front: the app was started again, or the person chose it in the
/// notification area. A window that is being built again is shown when its page has drawn.
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    let shell = app.state::<Shell>();
    if shell.is_rebuilding() {
        shell.undrawn.store(true, Ordering::SeqCst);
        return;
    }
    let Some(window) = main_window(app) else {
        return;
    };
    shell.undrawn.store(false, Ordering::SeqCst);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.emit_to(window.label(), SHOWN, ());
}

/// What the run loop of the app passes on (`.run(imago_shell::on_run_event)`). An app with a
/// handler of its own calls this in it, but not for an `ExitRequested` it prevents: from that
/// event on no failure is acted on any more.
pub fn on_run_event<R: Runtime>(app: &AppHandle<R>, event: RunEvent) {
    let shell = app.state::<Shell>();
    match event {
        // The last window went to be built again: the application goes on.
        RunEvent::ExitRequested {
            code: None, api, ..
        } if shell.is_rebuilding() => api.prevent_exit(),
        RunEvent::ExitRequested { .. } => {
            // An exit that closes no window first (Quit in the notification area).
            if let Some(window) = main_window(app) {
                remember(&window);
            }
            lock(&shell.recovery).close();
        }
        RunEvent::Exit => lock(&shell.recovery).close(),
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::Destroyed,
            ..
        } if !shell.is_rebuilding()
            && shell
                .options()
                .is_some_and(|options| options.window.label == label) =>
        {
            lock(&shell.recovery).close();
            *lock(&shell.overlay) = None;
        }
        _ => {}
    }
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    let options = app.state::<Shell>().options()?;
    app.get_webview_window(&options.window.label)
}

/// Builds the window, at `place` when there is one and shown when drawn if `visible`, with all it
/// needs right after that.
fn build<R: Runtime>(
    app: &AppHandle<R>,
    place: Option<WindowState>,
    visible: bool,
) -> tauri::Result<()> {
    let shell = app.state::<Shell>();
    let options = shell.options().ok_or(tauri::Error::WindowNotFound)?;
    let saved = options.data_dir.as_deref().and_then(saved_theme);
    let mut config = options
        .material
        .window_config(options.window.clone(), saved);
    config.visible = false;
    config
        .prevent_overflow
        .get_or_insert(PreventOverflowConfig::Enable(true));
    let page = lock(&shell.page).clone();
    if let Some(page) = page {
        config.url = WebviewUrl::External(page);
    }
    if visible {
        shell.undrawn.store(true, Ordering::SeqCst);
    }
    let generation = shell.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let opening = app.clone();
    let window = guard_window(
        WebviewWindowBuilder::from_config(app, &config)?,
        options.origins.clone(),
        config.use_https_scheme,
        move |url| *lock(&opening.state::<Shell>().page) = Some(url.clone()),
    )
    .build()?;

    if let Some(place) = place {
        let minimum = (
            config.min_width.unwrap_or_default(),
            config.min_height.unwrap_or_default(),
        );
        // A window that cannot be placed stays where it was built.
        if let Ok(placed) = restore(&window, place, minimum) {
            *lock(&shell.normal) = Some(WindowState {
                maximized: false,
                ..placed
            });
        }
    }
    options.material.paint_first_frame(&window)?;
    // A development build keeps reload, DevTools and the engine's whole context menu (Inspect).
    if !tauri::is_dev() {
        disable_browser_accelerators(&window)?;
        trim_context_menu(&window)?;
    }
    *lock(&shell.overlay) = Some(install_snap_layouts(&window)?);
    let watched = window.clone();
    watch_process_failures(&window, move |failure| {
        failed(&watched, failure, generation);
    })?;
    let reloaded = window.clone();
    install_reload_menu(&window, &options.reload_label, move || {
        lock(&reloaded.state::<Shell>().recovery).reset();
        reload(&reloaded, None);
    })?;
    let followed = window.clone();
    window.on_window_event(move |event| follow(&followed, event));
    thread::spawn(move || {
        thread::sleep(SHOW_ANYWAY);
        if window.state::<Shell>().is_current(generation) {
            show_drawn(&window);
        }
    });
    Ok(())
}

/// Shows a window that waits for its page to be drawn; any other stays as it is.
fn show_drawn<R: Runtime>(window: &WebviewWindow<R>) {
    let shell = window.state::<Shell>();
    if shell.undrawn.swap(false, Ordering::SeqCst) {
        let _ = window.show();
    }
}

/// Keeps the place of the window as it moves, and saves it when it closes.
fn follow<R: Runtime>(window: &WebviewWindow<R>, event: &WindowEvent) {
    let shell = window.state::<Shell>();
    if shell.is_rebuilding() {
        return;
    }
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_)
            if !window.is_maximized().unwrap_or(true) && !window.is_minimized().unwrap_or(true) =>
        {
            if let Some(state) = measure(window) {
                *lock(&shell.normal) = Some(state);
            }
        }
        WindowEvent::CloseRequested { .. } => remember(window),
        _ => {}
    }
}

/// Where the window is, as its next start wants it.
fn place_now<R: Runtime>(window: &WebviewWindow<R>) -> Option<WindowState> {
    let normal = *lock(&window.state::<Shell>().normal);
    state_to_save(
        window.is_maximized().unwrap_or(false),
        window.is_minimized().unwrap_or(false),
        normal,
        || measure(window),
    )
}

fn remember<R: Runtime>(window: &WebviewWindow<R>) {
    let options = window.state::<Shell>().options();
    let dir = options.and_then(|options| options.data_dir.clone());
    if let (Some(dir), Some(state)) = (dir, place_now(window)) {
        // Failing to keep the place must never keep the window from closing.
        if let Err(error) = save_state(&dir, &state) {
            eprintln!("imago-shell: the window's place was not saved: {error}");
        }
    }
}

// ---- a lost page -----------------------------------------------------------------------------

/// WebView2 lost a process of the window built as `generation`. Runs on a thread of its own.
fn failed<R: Runtime>(window: &WebviewWindow<R>, failure: ProcessFailure, generation: u64) {
    thread::sleep(SETTLE);
    let shell = window.state::<Shell>();
    if !shell.is_current(generation) {
        return;
    }
    let action = recovery_action(
        failure,
        &mut lock(&shell.recovery),
        Instant::now(),
        shell.is_rebuilding(),
    );
    match action {
        RecoveryAction::Reload => {
            thread::sleep(failure.reload_delay());
            reload(window, Some(failure));
        }
        RecoveryAction::GiveUp => ask(window, failure),
        RecoveryAction::Rebuild => rebuild(window),
        RecoveryAction::Ignore => {}
    }
}

/// Reloads the page, unless the app says no. A window that went meanwhile is not reloaded.
fn reload<R: Runtime>(window: &WebviewWindow<R>, failure: Option<ProcessFailure>) {
    let options = window.state::<Shell>().options();
    if options.is_some_and(|options| (options.before_reload)(failure)) {
        let _ = window.reload();
    }
}

/// Asks the person whether to reload, one question at a time. A window the app keeps hidden is not
/// asked about: the reload item of its menu stays.
fn ask<R: Runtime>(window: &WebviewWindow<R>, failure: ProcessFailure) {
    let shell = window.state::<Shell>();
    let Some(options) = shell.options() else {
        return;
    };
    // A page that failed before its first frame left the window hidden.
    show_drawn(window);
    if !window.is_visible().unwrap_or(true) || shell.asking.swap(true, Ordering::SeqCst) {
        return;
    }
    if message::ask(window, &options.window.title, &options.stopped_message) {
        lock(&shell.recovery).reset();
        reload(window, Some(failure));
    }
    shell.asking.store(false, Ordering::SeqCst);
}

/// The browser process is gone: the window is destroyed and built again, where it was, on the page
/// it showed. `rebuilding` keeps the application from ending with its last window meanwhile, and
/// stays on when the window cannot be built: the application then ends by the call below.
fn rebuild<R: Runtime>(window: &WebviewWindow<R>) {
    let app = window.app_handle();
    let shell = app.state::<Shell>();
    let Some(options) = shell.options() else {
        return;
    };
    if shell.rebuilding.swap(true, Ordering::SeqCst) {
        return;
    }
    // From here on what the old window reports is stale.
    shell.generation.fetch_add(1, Ordering::SeqCst);
    let place = place_now(window);
    let visible = window.is_visible().unwrap_or(true) || shell.undrawn.load(Ordering::SeqCst);
    match destroy(window).and_then(|()| build(app, place, visible)) {
        Ok(()) => shell.rebuilding.store(false, Ordering::SeqCst),
        Err(error) => {
            let lost = format!("{}\n\n{error}", options.lost_message);
            message::tell(&options.window.title, &lost);
            app.exit(1);
        }
    }
}

/// Destroys the window and waits until its label is free.
fn destroy<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let destroyed = window.destroy();
    let deadline = Instant::now() + DESTROY_WAIT;
    while window
        .app_handle()
        .get_webview_window(window.label())
        .is_some()
    {
        if Instant::now() >= deadline {
            let late = io::Error::new(io::ErrorKind::TimedOut, "the old window did not close");
            return destroyed.and(Err(late.into()));
        }
        thread::sleep(Duration::from_millis(25));
    }
    // A window already gone may say so as an error: the free label is what counts.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_taskbar_shows_the_job_and_never_past_its_end() {
        let shown = |progress| {
            let state = taskbar(progress);
            (
                matches!(state.status, Some(ProgressBarStatus::Normal)),
                state.progress,
            )
        };
        assert_eq!(shown(Some(0)), (true, Some(0)));
        assert_eq!(shown(Some(40)), (true, Some(40)));
        assert_eq!(shown(Some(250)), (true, Some(100)));
        assert_eq!(shown(None), (false, None));
        assert!(matches!(
            taskbar(None).status,
            Some(ProgressBarStatus::None)
        ));
    }

    #[test]
    fn attention_only_when_a_job_ends_behind_other_windows() {
        assert!(asks_for_attention(true, None, false));
        assert!(
            !asks_for_attention(true, None, true),
            "the person looks at it"
        );
        assert!(!asks_for_attention(false, None, false), "no job ended");
        assert!(!asks_for_attention(true, Some(99), false), "still running");
    }
}
